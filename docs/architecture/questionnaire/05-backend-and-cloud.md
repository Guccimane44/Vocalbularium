# 05 — Backend and cloud (Q22–Q28)

This is the section you flagged as missing. The current backend assumes a long-lived process on loopback with local disk. Container vs serverless is not a hosting detail — it decides whether the lock, the journal, and inline generation survive at all.

## Q22. What is the compute model: container, serverless, or VM?

**Decision:** Long-lived containers (Fly/Render/Railway/K8s), serverless functions (Cloud Run/Lambda/Vercel), or plain VMs? Scale-to-zero allowed?

**Context:** Today: one Fastify process, at most 5 pool connections, one advisory-lock connection enforcing single-process ownership, bounded waits, provider calls outside transactions ([local-postgresql](local-postgresql.md)). The old `render.yaml` describes the historical SQLite deployment and cannot run the current backend (no `DATABASE_URL`, binds `0.0.0.0` which startup rejects). Serverless breaks three assumptions simultaneously: no durable local disk for `DATA_DIR`, no single advisory-lock holder, and 60-second provider calls exceeding typical function timeouts.

**Options:**
- Long-lived container — preserves the executor, lock, and journal with minimal redesign; pay for idle. Needs health/readiness, restarts, and deploy ordering.
- Serverless — scales to zero and removes server care; forces journal into PG/object storage, lock into PG advisory or a queue, and generation into background jobs.
- Plain VM (user-run) — matches today's dev-mac story extended to a server; cheapest for one owner, weakest operability story for others.

**Answer prompt:** Pick the model and state whether scale-to-zero is allowed. Research task: time a cold start on your candidate platform and compare against the 60s generation timeout.

## Q23. Where does PostgreSQL live and who operates it?

**Decision:** Managed Postgres (Supabase/Neon/RDS/Render PG), self-hosted on a VM, or per-user embedded (SQLite seen only as history)?

**Context:** PostgreSQL 18 is the only runtime database; schema via Drizzle, reviewed SQL in `migrations/`, separate app/migrator/test roles, startup performs no DDL ([local-postgresql](local-postgresql.md)). Render Free's ephemeral disk is an explicit non-durability constraint. Backup/restore today targets whole-DB custom dumps into separate `vocabularium_restore_*` databases.

**Options:**
- Managed PG — automated backups, PITR, and failover; cost per project and a network-security story (TLS, IP allowlists, credential rotation).
- Self-hosted PG — full control, you own backups, upgrades (stay on major 18, deliberate 18.x updates), and disk monitoring.
- Per-user SQLite — true local-first; abandons the current PG semantics (advisory locks, repeatable-read executor, roles) and needs a new persistence design.

**Answer prompt:** Pick the host and the backup story (frequency, PITR yes/no, tested-restore cadence). Research task: run `db:backup` + `db:restore` into a review database and record wall time for your largest realistic dataset.

## Q24. Can the API run on ephemeral disk (stateless)?

**Decision:** Is durable local disk guaranteed, or must the process survive with nothing but PG + object storage?

**Context:** Completed provider results that cannot reach PG are staged in memory and in `DATA_DIR/generation-outbox`; startup replays staged results without recalling the provider, while unfinished attempts without staged results fail. If journal + DB writes both fail before exit, output is unrecoverable and retry is required ([local-postgresql](local-postgresql.md)). PG does not make the filesystem journal durable by itself.

**Options:**
- Durable disk guaranteed — keep the journal as-is; backups must cover PG + `DATA_DIR` together with a documented pairing.
- Ephemeral disk — move the journal into PG (table) or object storage (S3/R2) with the same staged-replay semantics; more work, true statelessness.
- Hybrid (disk as cache, PG as truth) — fastest path to stateless-ish; needs a reconciliation rule for disk/PG divergence after crash.

**Answer prompt:** Pick one and write the crash rule: after a kill -9 mid-generation, what is replayed, what fails, and who retries? Research task: kill the API mid-generation in dev and record what the dashboard shows after restart.

## Q25. Inline generation or queue + workers?

**Decision:** Keep generation inside the API process with `GENERATION_MAX_ACTIVE=4`/`MAX_QUEUED=16`, or move to a durable queue (pg-boss/BullMQ/Temporal) with separate workers?

**Context:** Provider calls run outside the executor and transactions; a save rejected while a seite generates is not queued — the user resubmits explicitly ([local-postgresql](local-postgresql.md), [Select and Add](../MVP-Product-spec-select-and-add.md)). Queue bounds, 60s timeouts, and 4096-token budgets are per-process today.

**Options:**
- Inline (current) — simplest; backpressure is per-process memory + queue counters. Fails horizontally: two processes double-issue generation without a shared lock.
- PG-backed queue — durable, multi-process-safe, retryable with visibility timeouts; needs worker deployment, poison-message handling, and cost accounting per attempt.
- External queue (Redis/SQS) — best tooling; another stateful dependency to operate and back up.

**Answer prompt:** Pick the topology and state where retry, timeout, and per-user rate limits are enforced. Research task: saturate the queue (16 queued + slow provider) and record the user-visible behavior at the bound.

## Q26. How is multi-process safety achieved (if ever more than one process)?

**Decision:** If the backend ever runs 2+ processes, how are per-account ordering, generation locks, and operation idempotency preserved?

**Context:** One pool connection holds the advisory ownership lock; a second API or migration against a live API fails — this enforces the one-process limit, with cross-process arrival ordering explicitly not claimed via DB locks alone ([local-postgresql](local-postgresql.md)). Receipt replay returns the original result and sequence; same-ID-different-payload is rejected.

**Options:**
- Stay single-process forever — state it as a constraint (simplest, caps throughput and availability).
- PG-serialized multi-process (advisory locks + `SELECT ... FOR UPDATE` account row + idempotency table) — keeps exactly-once semantics; every mutation path must take the lock correctly.
- Partition by account (sticky routing, one owner process per account) — scales with user count; needs a router and rebalancing story.

**Answer prompt:** Pick one and name the lock per operation type. Research task: start a second API against the dev DB and confirm it refuses ownership; record the exact failure.

## Q27. What is the public API contract and versioning policy?

**Decision:** Are `/api/kartes/...` + `karteId`/`seiteId`/`seites` the v1 contract, versioned under `/v1/`, and how long do legacy `/api/cards` aliases and old fields survive?

**Context:** Current routes use karte/seite names with legacy card/page aliases, dual-field acceptance with ambiguity rejection, and dialect negotiation via `X-Vocabularium-Terminology`; receipt fingerprints pin original operation kinds and field spellings so old and new requests replay identically ([terminology compatibility](terminology-compatibility.md)). Retirement requires an explicit later decision.

**Options:**
- Unversioned stable + aliases forever — least breakage; compat shims accumulate permanently.
- Versioned (`/v1/`) with N−1 support — clean evolution; every breaking change ships a migration window and client gate (see Q14).
- Aggressive deprecation (dated removal) — cleanest code; forces coordinated backend-then-extension upgrades every release.

**Answer prompt:** Pick the policy and write the retirement condition (date, version, or "when no supported client sends legacy fields"). Research task: grep the codebase for every legacy alias and count the compat surface that must be maintained.

## Q28. What are the backend resource and networking policies?

**Decision:** Bind address (loopback-only vs LAN/TLS), port allocation, connection-pool sizing, request timeouts, and log/health surface.

**Context:** The API binds `127.0.0.1:4318` by default and startup rejects non-loopback binding for this milestone; liveness vs readiness are split (`/health/live` vs `/health/ready` + compatible `/health`), OpenAPI is generated without a DB connection ([README](../../README.md), [local-postgresql](local-postgresql.md)).

**Options:**
- Loopback-only (current) — minimal attack surface; remote clients and hosted frontends impossible without a tunnel.
- TLS-terminated hosted (reverse proxy + managed certs) — needed for any hosted or multi-device story; adds proxy config, header trust, and cert renewal.
- Tailscale/private-network — middle ground for owner-only remote access without public exposure.

**Answer prompt:** Pick the bind/TLS story and the pool/timeout numbers with reasons. Research task: load the API with 2× pool connections of concurrent saves and record lock-wait and timeout behavior.
