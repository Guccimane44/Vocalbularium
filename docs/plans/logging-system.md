# Logging execution plan

Approved specification and storage policy: 2 October 2026; implementation authorized in the same chat. [Observability](../architecture/observability.md) owns behavior. [Issue #70](https://github.com/Guccimane44/Vocalbularium/issues/70) tracks evidence.

Base: `codex/modular-product-direction` at `84f15d9`, following PR #69. Main-key implementation remains separate. Use an isolated checkout and preserve the main chat's working tree and running API.

| Increment | Deliverable | Gate |
| --- | --- | --- |
| 1 | Approved specification and versioned event/content contract | Contract/document checks |
| 2 | Segmented storage, budgets, restart, deduplication and deletion boundaries | Filesystem and failure-path tests |
| 3 | Correlated API/database/generation/provider events | Real API/PostgreSQL, controlled provider |
| 4 | Durable extension buffer and automatic collection | IndexedDB, disconnection, restart and redelivery |
| 5 | Settings and Codex management commands | Command/browser management journeys |
| 6 | Combined regression, clean candidate and evidence | Current-head checks, backend/browser suites and extracted package |

Keep increments as ordered commits and focused PRs. Evidence names revision, environment, real/mocked dependencies and remaining checks. Completion does not imply merge, deployment, publication or owner installation.
