# Behavior and evidence ledger

Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a`, 2026-09-05.
Test names below refer to `apps/web/tests/`. Line references in the audit are
baseline anchors; prefer symbols/test names when source moves.

## Contracts to preserve

| ID | Current contract | Source and existing evidence | Missing evidence / plan |
| --- | --- | --- | --- |
| B01 | No automatic answer-language choice; explicit sample onboarding. Explanation always enabled; Examples optional; Optional pages appear after reveal or stay hidden. | `page.tsx` configuration flow; `domain.ts` `pageSpecSchema`/`presetSchema`; preset validation test. | Browser selectors, defaults, no answer leakage; 003. |
| B02 | One lexical card, shared ordered meaning IDs, separate pages per language, exactly one example per enabled meaning with original/translated/both policy. | `validateBackside`; tests “strict page validation…” and “all three example policies…”. | Rendered multilingual alignment/RTL/keyboard checks; 003. |
| B03 | Capture preserves spelling/context/source and snapshots its preset. Dedup uses NFC spelling in the same list with source-hint logic, not case folding or semantic similarity. | `applyMutation` capture; “ordinary duplicate capture…” test. | Explicit NFC/case/source-hint fixtures and client request fixtures; 003. |
| B04 | One-time 100 successful-page grant; all requested pages reserved atomically; success costs one unit per language page, independent of meaning count. Unknown/exhausted captures stay saved; failure/deletion releases unused reservations. | `available`, queue, `runGeneration`; reservation/concurrency/partial-failure/exhaustion tests. | Actual HTTP settlement, timeout/repair response sequences; 003. |
| B05 | List edits apply to future captures. Explicit regeneration adopts the current preset. Existing valid pages survive pending/failed replacement; successful publication replaces the current page. Schedule and frozen attempt/history snapshots survive; there is no general page-version archive. | `applyMutation` updateList/regenerate, generation publication; regeneration and stale-settings tests. | UI save/regeneration flow and API stale-write fixtures; 003. |
| B06 | One FSRS state per card, `ts-fsrs@5.4.2`, retention 0.9, fuzz off. All Essential pages required. Due reviews precede new cards; defaults are ten new/day, UTC, empty interests. | `eligible`, `dueCards`, `scheduler`, `initialState`; pinned initial-rating test. | Full rating-sequence fixture, due ordering, zero limit, local day/DST boundary tests; 003. |
| B07 | Attempt freezes Essential language/content/preset/base revision. Reveal required. First server-accepted observation advances schedule/rotation once; concurrent observations retained with `applied:false`. Future device time over five minutes rejected. | prepareReview/reveal/rate; attempt/concurrency/rotation/clock tests. | HTTP lost acknowledgements and independent browser replay; 003. |
| B08 | Stable mutation ID/device ID and payload; exact replay returns receipt, changed request rejects. | `mutationSchema`, `applyMutation`; duplicate/concurrent review tests. | Semantic property-order replay is defective (D02); no blanket cross-client idempotency claim. |
| B09 | Owner resolved server-side; preview/email/Apple identities separate. Hashed sessions, bounded single-use email challenges. Account deletion tombstones aggregate and revokes sessions; late jobs/stale writes cannot resurrect it. | `auth.ts`, `Store.delete`, deletion/auth tests. | Actual routes, cookie/origin rules, account-switch races, native runtime; 003. |
| B10 | Browser snapshots/outbox scoped to account; authenticated owner checked before upload. Expired/deleted sessions hide library. Production service worker excludes API/RSC/auth requests and caches shell/static assets. | `client.ts`, `public/sw.js`; earlier manual evidence in implementation status only. | Production reload/offline/restart/account-switch tests; D01; 003. |
| B11 | Chrome saves before confirming; stable IDs survive restart/lost acknowledgement; unassigned captures need explicit assignment; another account cannot upload them. | `background.js`, three `extension.test.ts` simulations. | Real install and transient HTTP response retries (D03); 003. |
| B12 | iOS shares plain text to atomic per-mutation App Group files; tokens in Keychain. Foreground upload; offline review only for already-prepared cached attempts. | `Shared/Models.swift`, `LibraryModel.swift`, share controller; parser check. | Full SDK build, real share sheet, replay, account switching; external acceptance. |
| B13 | Preview uses documented fixtures (`bank`, `serendipity`, `apprendre`, `光`, `كتاب`, `Gift`; EN/DE/FR pages). Unsupported words remain honestly unsupported. Live generation requires configured key/model. | fixtures, generation adapter, domain/provider tests. | Live linguistic quality/cost is outside deterministic repository gates. |
| B14 | Aggregate storage and full changed-revision snapshots; 20 lists, six pages/preset, 1,000 active cards, 1.8 MB aggregate. Jobs recover on further invocations, not a guaranteed autonomous schedule. | domain limits, `Store.mutate`, `runGeneration`, route `waitUntil`. | Real Worker interruption and storage-limit API tests; no schema redesign in foundation plans. |

## Known discrepancies: reproduce, then decide separately

These are not desired behavior to enshrine. Foundation work records current
outcomes with named assertions; later defect plans change the outcome and add
regression coverage. Do not add anonymous skipped tests or accept any failure as
“the known bug.” Each record below is owned by the implementer of plan 003 until
it is resolved or transferred to a named follow-up plan.

| ID / priority | Evidence and impact | Required reproducer and disposition |
| --- | --- | --- |
| D01 / high | Browser outbox `getAll()` from UUID primary keys is uploaded without causal sequencing (`client.ts:12,89–112,184–188`). Independent domain probe with reversed UUID order produced capture 404 before list creation. Actual IndexedDB failure not yet run. | Browser offline createList→capture, and prepare→reveal→rate, restart, reconnect with chosen reverse-sorting UUIDs. Assert precise retained error and surviving data. Plan 003 characterizes; a separate narrow fix must preserve existing queued records and IDs. |
| D02 / high | `domain.ts:321` fingerprints `JSON.stringify({type,payload,deviceId})`. Independent in-memory probe: same ID/logical createList payload with reordered object keys yields 409. iOS dictionary re-encoding impact is inferred, not device-tested. | Replay reordered nested keys across JSON persistence and actual client encoders; distinguish legitimate changed payload. Before canonicalization, design compatibility with stored legacy receipts. Characterize in 003; repair separately. |
| D03 / high | Chrome `background.js:97,123–125` retains every non-401 upload HTTP failure as permanent `item.error`, including 429/500, then skips it on later alarms. This is source evidence, not a new installed-browser observation. | Simulate 429/500 followed by success, network throw, 401 and invalid data separately; install/restart check later. Characterize 003; separate retry-policy fix including recovery of already-retained items. |

## Not yet verified

No new browser interaction/visual test, production offline reload, real extension
installation, independent-device convergence, iOS SDK build/device run, live
email/Apple/OpenAI check, speaker quality review, or accessibility evaluation was
performed in this audit. Earlier manual checks remain historical evidence in
[implementation status](../implementation-status.md), not fresh results here.

Identity linking/Apple lifecycle, autonomous job scheduling, production access for
external clients, and larger-library storage remain product/release work. Do not
enable live services or expose the private preview to satisfy repository checks.
