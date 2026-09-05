# 002 — Isolate local work and mutable state

Version: 1 | Status: Planned | Owner: Assign at execution
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (record new start SHA)
Depends on: 001

## Purpose and preservation contract

Two agents or test runs must not share accounts, outboxes, caches, database
mutation, or cleanup effects by accident. Preserve B08–B14 and application storage
identifiers/wire contracts. Separate processes/profiles and local resources before
considering namespace changes in application code.

## Allowed scope and prerequisites

Local launcher/reset scripts, `.gitignore`, development/test-only configuration,
isolation docs and focused tool tests. A minimal pinned browser/profile harness
and its locked test dependencies are allowed here for resource-isolation smoke
only; 003 extends that same harness with product journeys. No edits to registered Site identity,
production auth, entitlements, real user caches, or application schemas. Native
runtime verification may be explicitly blocked by full Xcode availability.

## Execution steps

1. Add `.dev.vars` and `.dev.vars.*` ignore patterns; prove root and nested paths
   are covered while `.env.example` remains tracked. Never inspect secret values.
2. Add **proposed** `npm run dev:isolated -- --run-id <id>` and
   **proposed** `npm run test:reset -- --run-id <id>`. Reserve a unique port and
   owned run directory, constrain local D1/logs/registry/artifacts there, and print
   the exact origin and non-secret resource paths. Persist an ownership marker.
3. Reject path traversal, empty/root paths, unowned directories, occupied ports,
   duplicate run IDs and symlink escapes. Verify process ownership beyond a saved
   PID, including stale/PID-reuse cases. Reset stops only its own processes and removes only its
   marked state. Never implement cleanup as broad `git clean` or kill-by-port.
4. Ensure test launchers explicitly set local state paths instead of inheriting
   an unrelated `WRANGLER_LOG_PATH`/`MINIFLARE_REGISTRY_PATH`. Verify actual paths
   with the pinned runtime; do not assume config flags isolate all processes.
   Construct an allowlisted test environment and prevent loading personal `.env`
   or `.dev.vars` files. Exclude inherited provider/auth credentials and enforce
   fixture-only network destinations. Prove an ambient dummy provider key and
   local env file cannot activate a live adapter or leak into logs/artifacts.
5. Implement the isolation matrix below. Keep normal development usable; fixture
   identities are test/local-only and must not become a production auth bypass.
6. Document branches/worktrees and one-writer ownership for files. Remote Site
   operations are serialized separately by explicit release scope; no default
   verification command may deploy, migrate remotely or invoke live providers.

## Isolation matrix and acceptance

| Surface | Mechanism | Required proof |
| --- | --- | --- |
| Source/dependencies/build | Dedicated checkout/worktree per writer; local install/output | Build A cannot replace B's artifacts or dependencies. |
| D1, Wrangler registry/logs | Per-run local directory and verified binding configuration | Seed distinguishable data in A/B; neither sees the other's data; reset A leaves B unchanged. |
| Ports/processes | Explicit reserved origin; owned child-process record | Port collision fails clearly; stop/reset does not kill B or an unrelated listener. |
| Browser | Disposable profile/context AND distinct local origins | No shared cookies, IndexedDB, localStorage, service-worker cache or pending mutations. |
| Chrome | Dedicated test profile/unpacked instance connected to its run origin | Profile/storage smoke with synthetic markers proves A/B separation. This does not certify actual capture, sign-in or hosted connectivity. |
| iOS | Separate disposable simulator/data container; same existing App Group within each simulator | App/share extension communicate within A but not B; Keychain/outbox do not bleed. Record SDK-dependent proof as blocked if unavailable. |
| Hosted Site/D1/secrets | Shared external authority, excluded from default local workflow | Manifests unchanged; no credentials or remote-write commands in local checks/CI. |

- Launch two local runs concurrently, seed accounts with distinct markers, submit
  captures, restart A, then reset A and verify B's state/process remains intact.
- Negative reset/port/path/duplicate-ID/stale-PID tests fail closed in temporary fixtures.
- `git check-ignore -v --no-index` checks root/nested `.dev.vars*`; no tracked
  secret/state paths appear. Path ignores are not a substitute for the 005 scan.
- Record command lines, resolved paths/origins and redacted results. Native
  isolation recipe may close as documented/provisional while its runtime evidence
  remains an explicit external gate; automated web/Chrome profile isolation must
  pass before dependent test lanes run. Independent review checks these labels.

## Risks and rollback

Launcher cleanup has destructive power: ownership and canonical-path checks are
mandatory. A worktree does not isolate hosted state. Revert tooling changes to
roll back; remove only known-owned disposable data. Existing user databases,
browser profiles and native Keychain/App Group identifiers stay untouched.

## Decisions and independent review

Accepted F05/F06: isolate every mutable surface, add secret-name ignore coverage,
and treat inherited local-tool environment as a contamination risk. Avoid a
generic container/platform migration. Independent execution review: pending.

## Execution record

- Starting commit/environment: pending.
- Commands/results/evidence: pending.
- Deviations and open issues: native runtime gate requires full Xcode.
- Completion/remaining work: not started.
