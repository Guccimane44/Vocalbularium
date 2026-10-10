# 05 — Backend and cloud (Q22–Q28)

Redesigned after Q01–Q22. Q22 is answered and locked; Q23–Q28 are reframed as "how"
questions under that decision. Locked baseline: strangers (~500, easy to scale, no
anonymous, Q02), hosted hub (Q18), Vercel serverless with scale-to-zero (Q22),
managed Postgres, session + installation ID (Q10), long-lived multi-device sessions
(Q21), version gate + online-required + no legacy fallback (Q14; the legacy dialects were already retired in 0.4.0). The old
long-lived loopback + `DATA_DIR` journal + single-process executor assumptions are
retired and kept only as history ([local-postgresql](../local-postgresql.md)).

## Q22. What is the compute model — ANSWERED AND LOCKED

**Decision (locked):** Serverless on Vercel, scale-to-zero allowed. Many concurrent
copies may run; no durable local disk; per-user ordering is the long-term target
(details in Q26); the 60s generation timeout must still be verified against the
Vercel plan, moving to background jobs if functions are stopped too early
(see `answers/answers-05-backend-and-cloud.md`).

**What this forces below:** Q23 must pick a serverless-compatible managed Postgres;
Q24 must be stateless (no filesystem journal); Q25 cannot stay inline per-process;
Q26 cannot stay single-process; Q28 cannot stay loopback-only.

## Q23. How is managed Postgres configured for Vercel serverless?

**Decision:** Which managed Postgres and how it is wired for many short-lived
functions: host, pooling, roles, backup/PITR, and migration discipline.

**Context:** PostgreSQL 18 stays the only runtime database; schema via Drizzle with
reviewed SQL in `migrations/`; startup runs no DDL ([local-postgresql](../local-postgresql.md)).
Q22 forces serverless-compatible hosting: pooled connections, TLS, credential
rotation, and no reliance on local disk. Self-hosted PG and per-user SQLite are out
— the former reintroduces the server care Q22 removed, the latter abandons PG
semantics (advisory locks, roles) the rest of this section depends on.

**Options:**
- Neon (pooled PG + branching + PITR) — closest fit for Vercel scale-to-zero;
  uses the pooled connection string from functions, direct string for migrator.
- Supabase / RDS / Render PG with an external pooler — same shape, more
  operating surface; pick only with a concrete reason (region, compliance, cost).
- Rejected: self-hosted PG on a VM; per-user SQLite (history only).

**Answer prompt:** Name the host, pooled vs direct connection strings, app/migrator
role separation, backup frequency + PITR window + tested-restore cadence, and the
Postgres 18 upgrade rule. Research task: run `db:backup` + `db:restore` into a
review database (or the host's branch/restore flow) and record wall time for the
largest realistic dataset.

## Q24. How does the stateless API preserve outcomes without disk?

**Decision:** Crash rule for a function killed mid-generation, given Q22's
acceptance: committed PG rows survive; in-flight provider results are lost; the
user retries explicitly. No filesystem journal.

**Context:** The old `DATA_DIR/generation-outbox` staged-replay path assumed durable
local disk and a single process that restarts ([local-postgresql](../local-postgresql.md)).
On Vercel neither holds: disk is ephemeral and the next request may land on a
different copy. PG is the only truth. "Replay without recalling the provider"
survives only for rows already committed to PG — everything else fails visibly.

**Options:**
- PG as truth, no replay of in-flight work (default from Q22) — attempt row in PG
  moves to failed on function death/timeout; dashboard keeps the Retry action per
  Q08; user clicks generate again; no cross-function result adoption.
- PG journal table for *completed* provider responses only — a worker that finished
  the provider call but died before commit may have its response claimed once via
  idempotency key; still no resume of partial provider streams.
- Rejected: durable-disk journal; hybrid disk-as-cache (divergence rules cost more
  than the cheap retry they would save).

**Answer prompt:** Write the crash rule (what is committed vs failed vs retried by
whom) and the idempotency-key scope for the PG-journal variant if chosen.
Research task: kill a function mid-generation in preview and record what the
dashboard shows (failed component + Retry, no silent success).

## Q25. How are the generation queue and workers built for serverless?

**Decision:** Queue topology that replaces the per-process `GENERATION_MAX_ACTIVE=4` /
`MAX_QUEUED=16` bounds, which are meaningless across many Vercel copies.

**Context:** Provider calls run outside transactions with 60s timeouts and
4096-token budgets; a save rejected during generation needs explicit resubmission
([local-postgresql](../local-postgresql.md), [Select and Add](../../MVP-Product-spec-select-and-add.md)).
Inline execution inside the requesting function inherits the Vercel timeout Q22
flagged for verification. Durable queuing moves long provider work out of the
request path with visibility timeouts, bounded auto-retry of transient failures,
poison-message handling, and per-user rate limits.

**Options:**
- PG-backed queue + background workers (baseline) — durable, multi-copy-safe,
  no new stateful service; workers run as Vercel background functions or a small
  always-on worker pool; retry/timeout/quota enforced at dequeue.
- External queue (Redis/SQS/Temporal/trigger.dev-style) — better tooling and
  scheduling; adds a dependency to operate, secure, and back up; needs a reason
  PG cannot meet (throughput, delayed retries, scheduling).
- Rejected: inline-only generation (fails the Vercel timeout check and
  double-issues work across copies without a shared claim).

**Answer prompt:** Pick the topology, state where retry, 60s timeout, per-attempt
token budget, and per-user rate limits are enforced, and define the at-limit UX
(degrade to saved-input-only vs refuse-fast — see Q48/Q56). Research task:
saturate the queue with a slow provider stub and record user-visible behavior at
the bound (position, ETA, cancel if promised).

## Q26. How is per-account ordering achieved across many copies?

**Decision:** Locking and idempotency that deliver Q22's "one ordered line per
user" without a single global writer. Users must not block each other.

**Context:** The old single-process advisory ownership lock (second API refuses to
start) is retired — it contradicts Q22's many-copies decision
([local-postgresql](../local-postgresql.md)). What survives: receipt idempotency by
SHA-256 fingerprint with same-ID-different-payload rejected, and the Q19
serialized-plus-explicit-resubmission semantics, now scoped per account instead of
per database. Generation claims stay bound to the originating installation ID
(Q08/Q10) so results publish only where they were requested.

**Options:**
- Per-account PG serialization (baseline) — short `pg_advisory_xact_lock` per
  account (or `SELECT ... FOR UPDATE` on the account row) for write paths +
  idempotency table for receipts; generation claims keyed by
  (account, installation ID, attempt ID) with single-claim semantics.
- Partitioned workers by account hash — scales dequeue with user count; needs a
  router/rebalancing story; still needs the same per-account lock for direct
  write paths.
- Rejected: stay-single-process; global one-writer lock (reintroduces the
  cross-user blocking Q22 explicitly refused).

**Answer prompt:** Name the lock per operation type (page writes, deck configuration saves,
generation claims, receipt replay) and the contention rule (wait with bounded
timeout vs refuse-fast). Research task: run two concurrent saves on one account
plus one on another account and record that the first serializes while the second
proceeds.

## Q27. How is the v1 API versioned and retired?

**Decision:** Versioning mechanics given Q14 already locked the policy: page/component
names under `/v1/` (or equivalent), major.minor gate enforced via `GET /api/meta`
(`version`, `minCompatibleExtension`, `incarnationId`), backend-before-extension
update order, and no compatibility guarantee for clients older than the window.

**Context:** Release 0.4.0 already removed the legacy `/api/cards` aliases, the
karte/seite routes and fields, and `X-Vocabularium-Terminology` negotiation as a
breaking contract version ([Q72](06-data-and-semantics.md#q72-what-is-a-karte-made-of-and-how-is-it-shown));
current routes are unversioned (`/api/page/*`, `/api/decks/{deckId}/pages`) and
there is no `GET /api/meta` yet ([openapi](../../api/openapi.json)). This question
must not re-litigate whether the window exists, only how the clean contract is held.

**Options:**
- Versioned `/v1/` + N−1 client window via `minCompatibleExtension` (baseline) —
  OpenAPI generated per release, gate message tells the user to update backend
  first, then reload the extension.
- Unversioned stable — only if the `/v1/` prefix cost is proven; still keeps the
  Q14 gate.
- Rejected: aliases-forever; compatibility shims for pre-window clients.

**Answer prompt:** State the versioned route prefix, the OpenAPI publishing point,
and how a contract break moves `minCompatibleExtension`. Research task: list the
0.4.x routes and decide which move under `/v1/` unchanged.

## Q28. How are networking, pooling, and timeouts set for hosted serverless?

**Decision:** Public HTTPS topology, serverless-safe pool sizing, request timeouts,
and health surface — replacing the loopback-only dev posture.

**Context:** The API binds `127.0.0.1:4318` today with startup rejecting
non-loopback binding; liveness vs readiness are split (`/health/live` vs
`/health/ready`) ([local-postgresql](../local-postgresql.md)). Hosted hub (Q18) with
extension + web clients (Q06/Q11) needs public HTTPS, CORS/extension-origin
policy, trusted proxy headers, and managed certs. Per-function pools must stay
small against the managed-PG connection ceiling; the 60s generation budget must
fit inside the Vercel plan limit or move to the Q25 background path.

**Options:**
- Vercel-managed TLS + small per-function pool against the pooled PG endpoint
  (baseline) — e.g. max 1–2 connections per function, statement-level pooling,
  request timeout below the plan's function limit, provider timeout 60s enforced
  in the worker, `/health/live` + `/health/ready` retained for the worker/deploy
  checks.
- Private-network/Tailscale variant — only for pre-public staging; never the 1.0
  story for strangers (Q02).
- Rejected: loopback-only; large per-process pools (exhausts managed-PG limits
  under burst).

**Answer prompt:** Give the bind/TLS story, CORS/allowed-origin rule, pool numbers
with arithmetic against the PG connection ceiling at burst, and the three timeout
values (request, function, provider) with reasons. Research task: burst to 2× the
pooled connection limit with concurrent saves and record lock-wait/timeout
behavior.
