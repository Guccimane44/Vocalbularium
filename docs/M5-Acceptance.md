# M5 reliability acceptance record

This records evidence against the eleven [MVP completion criteria](MVP-Product-scope.md#9-mvp-completion-criteria). On 13 September 2026, the owner accepted the current MVP baseline and reported the remaining M5 checks passed, explicitly deferring the Render stale-client reset scenario. The [Windows acceptance record](evidence/windows-owner-acceptance-2026-09-13.md) links the original comments and records the tested environment.

## Acceptance matrix

| Criterion | Automated and hosted evidence | Owner acceptance / deferred work |
| --- | --- | --- |
| 1. Login/dashboard | Product browser login/logout, two profiles, persisted account, reopening | Accepted in owner M5 summary |
| 2. Decks/previews/default | Four-page UI, all modules, repeated instances, preview isolation, create/cancel/delete, default replacement | Accepted in owner M5 summary |
| 3. Capture/modules | Exact text, duplicates, shared interpretation, all five runtime rules; live provider samples and hosted word/phrase/sentence generation | Owner reports word/phrase/sentence and native context-menu capture passed |
| 4. Generation/retry | Atomic page failure, empty success, exact retry warning, original input/current modules, cross-installation locks; live model and hosted page retry | Owner reports retry passed; other checks accepted in M5 summary |
| 5. Browse/sort/pages | Plain-text pages, all four sort orders, stable ties, calculated indices, empty-front placeholder | Accepted in owner M5 summary |
| 6. Manual workflows | Multi-page drafts, Save/Cancel/all leave choices, failed-save recovery, card/deck deletion | Owner reports editing and deletion passed; other checks accepted in M5 summary |
| 7. Layout migration | Stable retained pages, empty appends, content-loss digest revalidation, stale layout rejection; also verified with two clients on Render | Accepted in owner M5 summary |
| 8. Persistence/sync | Two isolated profiles, local backend restart, failed saves before commit and lost acknowledgments after commit; two real extensions reading/writing Render | Owner reports installation/reload and synchronization passed; actual Render reset/stale-client check deferred to #24; durable hosted storage remains deferred |
| 9. Feedback | Independent three-second receipts, dismissal, unaffected reading activity; M0 native selection checks | Owner reports native feedback passed; other checks accepted in M5 summary |
| 10. Browser interruption | Product worker Stop/restart, normal origin closure, abrupt owned-browser termination, other-profile continuation, late-result rejection | Owner reports background behavior and final publication/exit boundary passed |
| 11. Save ordering | Same/different-page FIFO, atomic multi-page generation lock, explicit resubmission, deletion races; hosted ordered edits and replay without overwriting newer text | Accepted in owner M5 summary; offline-ordering checklist marked complete by owner |

## Checks performed

43 store/server/module/card tests and nine browser scenarios pass locally with Node.js 24 and Chromium 151.0.7922.34 on macOS, including the OpenCode/Render Free update on 12 September 2026. Seven browser scenarios exercise the actual product extension; two retain the M0 laboratory lifecycle checks. The new provider checks cover request format, output validation, rate/authentication failures without model fallback, and cancellation. The free-host browser scenario simulates a startup HTML response and an erased backend account, then verifies the explanatory message and fresh sign-in. These controlled checks do not establish actual Render behavior. Go requests additionally verify a stable conversation ID across each card's interpretation, modules, and page retry. GitHub also runs the store/server suite on Windows and Linux and the browser suite on Linux.

The assembled reliability scenario discards responses only after the actual server request completes. It verifies that replaying a capture does not make another card or generate again, and that replaying an edit or generated-page publication does not overwrite a later saved edit. It stops the real extension worker, then terminates only its disposable browser PID. The second installation continues and the originating installation rejects its late result on reopening. Deleting a card through the authenticated API aborts its active provider work.

A Linux CI run exposed a timing race in the test's observation of worker shutdown: a refresh or alarm can restart the worker before a polled internals label is observed as stopped. The assembled test now closes its dashboard tab and clears its test profile's recovery alarm before stopping the worker, while Chrome stays open. Reopening the card explicitly wakes it and restores the alarm. The test still requires observed shutdown, discarded worker memory, preserved browser-session identity, and completed recovery. Lost-publication checks also wait for successful receipts to clear before identifying the deliberately failed receipt. All nine browser scenarios pass locally after these test-only changes.

A separate controlled result-write failure verifies that completed generation is not relabeled as provider failure. The server journals the complete result before the account write, retains it for explicit save retry, and recovers it after a server restart without calling the provider again. The journal lives beside the account database in `DATA_DIR`. A controlled database-write failure followed by a server restart passes when that directory survives. Render Free erases both the database and journal on sleep, restart, or redeploy; it cannot pass this durability check. See the [test-phase exception](MVP-Product-scope.md#10-first-iteration-delivery-and-deferred-work).

## Live verification

With `OPENCODE_API_KEY` configured in the ignored `.env` file, run:

```sh
npm run smoke:generation
```

This makes a small set of real provider requests for a word and sentence and writes `.data/live-smoke.json`. Inspect the chosen language, module applicability, literal Wiktionary formatting, German translations, and distinct examples. The command does not assert exact model wording or replace the real-page extension walkthrough. On 12 September 2026, six live OpenCode Go requests using `deepseek-v4.1-flash` completed for the two inputs. The reviewed outputs have consistent Chinese interpretation, exact selection/tag output, German word explanations and translations, literal Wiktionary headings, inapplicable empty outputs, and two distinct sentence examples. [Recorded model output](evidence/deepseek-v4.1-flash-smoke-2026-09-12.json) contains only these synthetic test selections and their generated text. This is a small integration check, not systematic quality evaluation.

On 12 September 2026, the Render Free deployment at [vocabularium.onrender.com](https://vocabularium.onrender.com/health), running backend revision `de86975bb4183d4ef3300af7b23a497087fe2bad`, passed the explicit hosted API smoke. It verifies authentication, completed word/phrase/sentence cards, the initial layout's valid empty sentence page, capture replay, current-page retry, two-client visibility, ordered edits, replay protection, preservation of other pages, and deletion. [Hosted output](evidence/render-smoke-2026-09-12.json) contains only synthetic sample vocabulary and generated text.

An additional [hosted browser check](evidence/render-browser-smoke-2026-09-12.json) passes in two isolated Chromium profiles using the unmodified extension built for that origin. Both display a generated card. A manual card created in the first installation appears in the second; a page edit in the second refreshes in the first, and the card is deleted through the UI. The first test attempt watched the new card's front page while expecting a page-2 edit; correcting that test navigation produced a passing run without product changes. Reproduction commands are in [M6 delivery](M6-Delivery.md#hosted-verification).

The extended hosted API check also passes concurrent deck configuration: appended pages start empty, retained pages keep their identity and content, a content-loss confirmation becomes invalid after another client's edit, and a stale draft cannot restore a deleted page. Its disposable deck is removed afterwards. A later fresh sign-in after an idle interval found an empty My Deck, consistent with Free-host resets; fresh live generation then passed again. This observation does not replace a controlled reset with stale extension credentials and pending saves.

## Deferred verification and evidence boundaries

- The controlled Render reset with stale extension credentials and pending saves is explicitly deferred by the owner in [issue #24](https://github.com/Guccimane44/Vocalbularium/issues/24). It has not been tested and is not recorded as passed. Durable hosted storage remains outside the accepted Free-host testing constraints.
- The owner reports Windows installation/reload, native feedback, background behavior, and the final publication/exit boundary passed. The existing automated suite still does not independently establish the final in-flight publication race; its earlier coverage remains recorded above.
- The owner marked offline ordering complete and accepted the other M5 checks. The implementation still resolves capture configuration on server arrival and preserves it through resubmission; browser clocks are not used to reorder account operations. No implementation or automated-test change is implied by the owner result.

The accepted MVP baseline and the explicit deferral are recorded in [issue #5](https://github.com/Guccimane44/Vocalbularium/issues/5). The linked owner evidence completes the former Windows gates; it does not claim production durability or an observed Render reset.
