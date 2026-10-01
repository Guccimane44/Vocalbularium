# Logging implementation verification

Checked 2 October 2026 (Europe/Berlin). [Issue #70](https://github.com/Guccimane44/Vocalbularium/issues/70) records the exact PR heads, CI runs and package checksums. The [specification](../../architecture/observability.md) and [execution plan](../../plans/logging-system.md) define this increment's scope.

## Local verification

- `npm run check`: syntax, JSON, whitespace and strict TypeScript checks passed.
- `npm test`: 94 checks passed against disposable PostgreSQL 18, including 11 diagnostic contract/storage/API checks. No owner account database was used.
- Existing browser regression: all 19 scenarios passed. The new logging scenario initially observed the capture before its separately batched request acknowledgment; it now explicitly waits for both records and passed on the focused repeat.
- Logging E2E uses the actual Chromium extension, IndexedDB, API, PostgreSQL and NDJSON collector. It follows selection through actual provider messages, staging and publication; disconnects the API; terminates the actual worker; restarts against the same diagnostic directory; checks original event identity/time and one collected copy; exercises the settings budget and cleanup; preserves product data and a pending save receipt.
- API failure checks retain invalid provider output, exclude runtime keys/tokens and manual change text, and preserve generation/manual saving under exhausted budgets and an injected filesystem failure. Storage checks cover restart acknowledgments, deletion periods, delayed uploads, damaged segments, a second collector and bounded inspection.

The provider is controlled: real OpenCode request/response handling runs with synthetic responses. Extension unit checks use mocked Chrome/network interfaces; those alone do not establish the integrated journey. No live provider usage was requested.

## Candidate and CI evidence

Candidate metadata identifies its committed source and configured origin. Archive verification and extracted-extension browser results, including repeated failed scenarios, are recorded in issue #70. A regression candidate uses loopback port 44318. The first extracted-package pass exposed six older fixture copy paths that ignored the extraction override; rebuilding the default-port extension during that run caused three fixture failures and may have submitted two synthetic captures to the existing API. Inspection and narrowly scoped cleanup require separate owner approval; their outcome is tracked in issue #70. All fixture paths now honor the extraction override and reject an origin mismatch before launching Chrome.

The owner candidate targets the default local origin on 4318; changing the generated origin/permission does not upgrade that running backend.

The Linux PostgreSQL/browser job and Linux/Windows foundation jobs run on the actual PR head. Their current results live in the tracker; this record does not assert a future run passed.

## Completion boundary

Implementation, controlled regression and candidate preparation are separate from merge, deployment, owner installation and owner acceptance. Native Windows PostgreSQL/browser behavior and live model quality are not established by these local checks or Windows packaging. The owner's main checkout, existing API, Chrome profile and generation outbox were not upgraded. The potential synthetic-account side effect above remains distinct from that deployment boundary. Use the [operating guide](../../guides/diagnostics.md) with the matching updated backend and extension after an authorized upgrade.
