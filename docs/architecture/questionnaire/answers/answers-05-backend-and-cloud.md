### Q22
Q22 Answer: Serverless on Vercel, scale-to-zero allowed.
We run the API as Vercel Functions. When no one uses it, it goes to zero. When requests come, Vercel starts as many copies as needed.
What we accept with this:
1. No saved files on the computer. If the backend dies mid-generation, the result is lost. This is okay because generation is cheap — the user just clicks generate again. No replay from disk.
2. Many copies can run at once. We do NOT stay with one writer for the whole database. Long-term we want one ordered line per user, so users don't block each other. Details in Q26.
3. We still need to check the timeout. Generation can take up to 60 seconds. We will test cold start + full generation time on our Vercel plan and move to background jobs if the plan stops functions too early.

### Q23
Neon (pooled PG + branching + PITR) — closest fit for Vercel scale-to-zero;

### Q24
option 1, with option 2's idempotency key added when the provider call costs money

### Q25
Topology: PG-backed queue + Vercel background workers. No new stateful service.
Why: per-process GENERATION_MAX_ACTIVE=4 / MAX_QUEUED=16 (config.mjs:39-40, generation.mjs:89-98) is meaningless across many Vercel copies. Replace with one shared PG queue. External queue (Redis/SQS/Temporal) deferred — no throughput/scheduling need at ~500 users to justify the ops cost.
Enforcement point — all at dequeue/worker (src/server/worker.mjs, new), not in request memory:
- Retry: max 3, backoff+jitter on transient (provider_transport/timeout), then poison/failed. No infinite loop. Transport/timeout only; content-level failures are never auto-retried (Q50, resolves C6).
- 60s timeout: opencode.mjs:structured() AbortSignal.timeout(60000) in worker.
- Token budget: max_tokens 4096 per provider call (per component attempt or interpretation) in worker.
- Per-user rate limit: 1 active + 5 queued generation runs per account (a run is one capture, Generate, Generate missing or Retry; its component attempts go through the active slot one by one, so a full page never trips the limit by itself; amended 10 October 2026 after Q72), checked on enqueue via PG count + on claim via SKIP LOCKED + lease (lease_expires_at, visibility timeout). Users never block each other.
At-limit UX: degrade to saved-input-only (not 429 refuse-fast). Input text preserved, dashboard shows position + Retry, failed attempts show the failed component + Retry per Q08. generation_busy → 429 retained only for local-dev path.
Crash ties to Q24: worker death before COMMIT → lease expires → re-driven; completed provider response claimable once via (account, installation ID, attempt ID) idempotency key. No partial-stream resume, no DATA_DIR journal on hosted.
Research to record: saturate with slow provider stub → confirm position/ETA/cancel behavior; kill worker mid-run → confirm failed + Retry, no silent success, no double-charge on reclaim.

### Q26
Per-account PG serialization (baseline)

### Q27
Versioned /v1/ + N−1 client window via minCompatibleExtension (baseline) — OpenAPI generated per release, extensions below minCompatibleExtension are told to update from their browser store. The hosted backend always deploys before the extension that depends on it.

### Q28
Vercel-managed TLS + small per-function pool against the pooled PG endpoint (baseline) — e.g. max 1–2 connections per function, statement-level pooling, request timeout below the plan's function limit, provider timeout 60s enforced in the worker, /health/live + /health/ready retained for the worker/deploy checks.