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
