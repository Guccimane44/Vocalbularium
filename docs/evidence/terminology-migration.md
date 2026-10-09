# Terminology migration verification

Date: 30 September 2026 (Europe/Berlin). Tracker: [#63](https://github.com/Guccimane44/Vocalbularium/issues/63). Baseline: specification refactor `26f02ae` on `codex/v0.3.1-specs-refactor`.

## Increment 1: language

Canonical model, active prose, visible copy and accessibility labels use deck → karte → seite. Historical evidence and applied migrations remain intact. Existing request fields, navigation and storage names remain for later increments.

- Node 24.21.0; `npm run check` passed.
- `npm test`: 80 passed, zero failures.
- `npm run openapi`: generated reference updated.
- Browser suite in a temporary copy on ports 44317/44318, because an unrelated user server occupied 4318: 17/18 passed. The remaining row scenario passed after restoring the legacy CSS selector and rebuilding; all 18 scenarios verified. The first isolated run also exposed two stale wording/selector assertions, corrected before verification.
- Active documentation file links checked; links moved by the existing taxonomy refactor repaired.

No hosted/provider calls, deployment, release publication, package handoff or owner acceptance performed.

## Increment 2: implementation names

Rename editor, row, draft and record types, store/query helpers, generation renderer, maintained prototype/smoke consumers, DOM/CSS names and test filenames. Dashboard query batches are explicitly `KarteBatch`/`DeckBatch`; Playwright pages and pagination are unchanged. HTTP fields, persisted fields, route/message strings, receipt operation kinds and schema SQL retain legacy names pending increment 3.

- `npm run check`: passed.
- `npm test`: 80 passed, zero failures.
- Isolated `npm run test:browser`: 18 passed, zero failures on ports 44317/44318, including actual worker stop/restart and browser close/reopen.

## Increment 3: contracts, persistence and upgrade

Current fields/routes/messages use karte and seite. Migration 0002 renames physical tables, columns, indexes and constraints without changing data. Legacy API, navigation, cache, draft and pending-operation adapters preserve previous builds. Historical receipt fingerprints and content-loss confirmation digests keep their original representation; original result JSON is decoded only on replay. The [boundary record](../architecture/terminology-compatibility.md) documents retained terms and retirement conditions.

- `npm run check`: passed on Node 24.21.0.
- `npm test`: 83 passed, zero failures. Includes original-schema and bounded-read-schema populated upgrades, fresh databases, retained content/IDs/timestamps, old receipts and fingerprint rejection, pending captures/creates, staged output, journal recovery, legacy API response shapes, preparation receipts, old list cursors and content-loss confirmation.
- Isolated `npm run test:browser`: 19 passed, zero failures on ports 44317/44318. Includes a previous-build cache, pending save, draft and navigation fixture; replay leaves a later remote edit intact. The last count-copy change was verified by rebuilding and rerunning that upgrade scenario (1 passed).
- An earlier browser run completed the manual-editor assertions but failed during disposable-database cleanup with a PostgreSQL process-termination permission error. The final complete suite passed without changing privileges or weakening the assertions.
- `npm run openapi`: current reference regenerated; remaining “page” summaries describe pagination.
- `npm run db:generate`: no schema drift after the custom rename migration/snapshot.
- Terminology and active documentation links audited. Historical migrations, snapshots, screenshots, quotations, evidence and release artifacts retained. The packaging guide path moved by the existing specification refactor was repaired in increment 1 after CI exposed it.

Final CI runs and clean-source package validation/checksum are recorded in [#63](https://github.com/Guccimane44/Vocalbularium/issues/63) and the third review PR. A package is local verification output; neither deployment nor native Windows owner acceptance is inferred. The owner's running backend/database was not migrated or restarted.
