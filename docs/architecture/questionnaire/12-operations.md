# 12 — Operations (Q62–Q66)

Operations is how the system behaves when nobody is watching: what you can see, what it costs, how it ships, and what you promise when it breaks.

## Q62. What is observable?

**Decision:** Logs, metrics, traces: per-request and per-generation-attempt IDs, capture/generation success per module, latency histograms, queue depth, token/cost counters — and where do they go?

**Context:** `observability.md` and `overview.md` are empty; the local guide defines `LOG_LEVEL` and liveness/readiness splits but no metrics or tracing ([local-postgresql](local-postgresql.md)). The Verify skill requires reporting what was exercised, what was mocked, and what remains unverified — which presupposes attempt-level identifiers exist.

**Options:**
- Logs + health only (current) — enough for single-owner debugging; blind to trends, cost, and per-module quality drift.
- Logs + metrics (Prometheus-style counters/histograms) — trend-visible; needs a metrics endpoint, dashboards, and alert thresholds.
- Full tracing (request → attempts → provider calls with redacted payloads) — best diagnosis; most instrumentation and PII-redaction work.

**Answer prompt:** List the emitted signals and their retention. Research task: take one failed generation and time how long it takes to find the attempt ID, prompt version, and provider response today.

## Q63. How is a failing karte diagnosed without seeing user text?

**Decision:** Redacted logs vs full-text debug mode with consent? Is there an operator/admin view, and who may open it?

**Context:** Support today is owner-debugging with direct DB access; no admin view or redaction policy exists. The handoff guidance forbids bundling secrets and requires preserving evidence without leaking keys (Deliver skill). Any hosted or shared story needs support without granting support staff full reading rights over private captures.

**Options:**
- Owner-only direct access — fine for single-user; state that it does not scale to any support role.
- Redacted-by-default logs (IDs, timings, outcome codes; text only with explicit per-karte consent + expiry) — supportable; needs a consent flow and redaction tests.
- Full-text operator view — fastest debugging; highest privacy risk and audit burden.

**Answer prompt:** Pick the policy and the consent mechanism. Research task: write the redaction rule for one log line containing a capture and verify no text survives.

## Q64. How is the extension distributed and updated?

**Decision:** Manual unpacked install, Chrome Web Store auto-update, or both — with the backend-before-extension ordering enforced how?

**Context:** Manual flow is documented (extract, Load unpacked, pin, sign in `admin`/`admin`); updates replace files in place and Reload, ending that installation's generation session; backend migrations run with the API stopped before the new extension connects ([windows-install](../guides/windows-install.md), [terminology compatibility](terminology-compatibility.md)). CI produces localhost artifacts that must not be handed to hosted-origin users (Deliver skill).

**Options:**
- Manual only — full control per install; every user repeats the ordering dance.
- Web Store auto-update — smooth clients; needs a compat window so auto-updated clients degrade gracefully against older backends (Q14).
- Staged rollout (canary → full) — safest at scale; needs channels, version telemetry, and rollback procedure.

**Answer prompt:** Write the 5-step user update procedure and the rollback procedure. Research task: perform an in-place update with an in-flight generation and record what the user is told.

## Q65. Who pays for the LLM and the database?

**Decision:** Cost model: included in price, usage quota, or bring-your-own-key? And the hosting budget at 100 / 1k / 10k users (Postgres, backups, bandwidth, logs)?

**Context:** Generation rides a subscription key with a console **Use balance** toggle the app must not flip; automated checks spend nothing; live smokes spend real usage (README). No metering, quota UI, or price exists. Scope defers expanded generation-limit controls and public hosting ([scope](../product/scope.md)).

**Options:**
- Owner-absorbs (subscription key pays for all) — simplest; needs abuse caps or one user can spend the budget.
- Quota-included (X generations/user/month, then degrade/block) — predictable; needs metering before enforcement (Q48).
- BYOK — users bring keys; server becomes an orchestrator and the keyless UX must still be coherent (Q46).

**Answer prompt:** Pick the model and project monthly cost at the three user tiers using Q48's per-karte numbers. Research task: add up one month of smoke + dev usage from console figures as the first data point.

## Q66. What durability and availability are promised?

**Decision:** RPO (max data loss) and RTO (max downtime) for captures, kartes, and generation outcomes — plus the Render Free caveat if it still applies.

**Context:** Stopping the API never stops Postgres or removes data, but the manual cluster-start does not survive machine reboot; Render Free explicitly may erase test decks, sessions, and pending results on sleep/restart/redeploy ([local-postgresql](local-postgresql.md), [windows-install](../guides/windows-install.md)). No SLA exists.

**Options:**
- Best-effort local (backups when remembered) — honest for owner-test; unacceptable the moment anyone else depends on it.
- Documented RPO/RTO with tested restores (e.g. RPO 24h, RTO 4h) — needs scheduled backups, restore rehearsals (Stage 4/7 pattern), and status communication.
- High durability (PITR + multi-AZ + practiced failover) — for paid/hosted promises; real operational cost.

**Answer prompt:** State RPO/RTO per data class and the status page/communication channel. Research task: restore the latest backup into a review database and time full recovery end-to-end.
