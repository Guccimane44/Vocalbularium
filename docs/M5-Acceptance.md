# M5 reliability acceptance record

This records evidence against the eleven [MVP completion criteria](MVP-Product-scope.md#9-mvp-completion-criteria). It is not a release sign-off. The owner requested continued local implementation while arranging credentials, hosting, and Windows testing.

## Acceptance matrix

| Criterion | Passing evidence | Remaining acceptance |
| --- | --- | --- |
| 1. Login/dashboard | Product browser login/logout, two profiles, persisted account, reopening | Packaged Windows extension-button entry |
| 2. Decks/previews/default | Four-page UI, all modules, repeated instances, preview isolation, create/cancel/delete, default replacement | Owner walkthrough |
| 3. Capture/modules | Exact text, duplicates, shared interpretation, all five runtime rules; live provider samples and hosted word/phrase/sentence generation | Native packaged capture |
| 4. Generation/retry | Atomic page failure, empty success, exact retry warning, original input/current modules, cross-installation locks; live model and hosted page retry | Native Windows walkthrough |
| 5. Browse/sort/pages | Plain-text pages, all four sort orders, stable ties, calculated indices, empty-front placeholder | Owner walkthrough |
| 6. Manual workflows | Multi-page drafts, Save/Cancel/all leave choices, failed-save recovery, card/deck deletion | Owner walkthrough |
| 7. Layout migration | Stable retained pages, empty appends, content-loss digest revalidation, stale layout rejection | Hosted concurrent configuration pass |
| 8. Persistence/sync | Two isolated profiles, local backend restart, failed saves before commit and lost acknowledgments after commit; two real extensions reading/writing Render | Windows extension update and actual host reset/fresh sign-in; durable hosted persistence deferred by the free-test exception |
| 9. Feedback | Independent three-second receipts, dismissal, unaffected reading activity; M0 native selection checks | Native product/Windows restricted surfaces |
| 10. Browser interruption | Product worker Stop/restart, normal origin closure, abrupt owned-browser termination, other-profile continuation, late-result rejection | Windows background mode and final publication/exit boundary |
| 11. Save ordering | Same/different-page FIFO, atomic multi-page generation lock, explicit resubmission, deletion races; hosted ordered edits and replay without overwriting newer text | Native owner walkthrough |

## Checks performed

43 store/server/module/card tests and nine browser scenarios pass locally with Node.js 24 and Chromium 151.0.7922.34 on macOS, including the OpenCode/Render Free update on 12 September 2026. Seven browser scenarios exercise the actual product extension; two retain the M0 laboratory lifecycle checks. The new provider checks cover request format, output validation, rate/authentication failures without model fallback, and cancellation. The free-host browser scenario simulates a startup HTML response and an erased backend account, then verifies the explanatory message and fresh sign-in. These controlled checks do not establish actual Render behavior. Go requests additionally verify a stable conversation ID across each card's interpretation, modules, and page retry. GitHub also runs the store/server suite on Windows and Linux and the browser suite on Linux.

The assembled reliability scenario discards responses only after the actual server request completes. It verifies that replaying a capture does not make another card or generate again, and that replaying an edit or generated-page publication does not overwrite a later saved edit. It stops the real extension worker, then terminates only its disposable browser PID. The second installation continues and the originating installation rejects its late result on reopening. Deleting a card through the authenticated API aborts its active provider work.

A separate controlled result-write failure verifies that completed generation is not relabeled as provider failure. The server journals the complete result before the account write, retains it for explicit save retry, and recovers it after a server restart without calling the provider again. The journal lives beside the account database in `DATA_DIR`. A controlled database-write failure followed by a server restart passes when that directory survives. Render Free erases both the database and journal on sleep, restart, or redeploy; it cannot pass this durability check. See the [test-phase exception](MVP-Product-scope.md#10-first-iteration-delivery-and-deferred-work).

## Live verification

With `OPENCODE_API_KEY` configured in the ignored `.env` file, run:

```sh
npm run smoke:generation
```

This makes a small set of real provider requests for a word and sentence and writes `.data/live-smoke.json`. Inspect the chosen language, module applicability, literal Wiktionary formatting, German translations, and distinct examples. The command does not assert exact model wording or replace the real-page extension walkthrough. On 12 September 2026, six live OpenCode Go requests using `deepseek-v4.1-flash` completed for the two inputs. The reviewed outputs have consistent Chinese interpretation, exact selection/tag output, German word explanations and translations, literal Wiktionary headings, inapplicable empty outputs, and two distinct sentence examples. [Recorded model output](evidence/deepseek-v4.1-flash-smoke-2026-09-12.json) contains only these synthetic test selections and their generated text. This is a small integration check, not systematic quality evaluation.

On 12 September 2026, the Render Free deployment at [vocabularium.onrender.com](https://vocabularium.onrender.com/health), running backend revision `de86975bb4183d4ef3300af7b23a497087fe2bad`, passed the explicit hosted API smoke. It verifies authentication, completed word/phrase/sentence cards, the initial layout's valid empty sentence page, capture replay, current-page retry, two-client visibility, ordered edits, replay protection, preservation of other pages, and deletion. [Hosted output](evidence/render-smoke-2026-09-12.json) contains only synthetic sample vocabulary and generated text.

An additional [hosted browser check](evidence/render-browser-smoke-2026-09-12.json) passes in two isolated Chromium profiles using the unmodified extension built for that origin. Both display a generated card. A manual card created in the first installation appears in the second; a page edit in the second refreshes in the first, and the card is deleted through the UI. The first test attempt watched the new card's front page while expecting a page-2 edit; correcting that test navigation produced a passing run without product changes. These checks do not cover hosted concurrent deck configuration, native selection, or an actual Render sleep/redeploy reset. Reproduction commands are in [M6 delivery](M6-Delivery.md#hosted-verification).

## Release gates still open

- Live provider and hosted generation/synchronization pass. Native extension capture, hosted concurrent deck configuration, and an actual Render reset/fresh sign-in remain to be verified.
- Owner Windows installation, native feedback, background-mode behavior, and update acceptance are pending.
- The strict boundary where Chrome exits while its final publication request is already in flight remains unverified. Existing tests prove that server generation alone cannot publish after browser exit, and that reopening fences old sessions; they do not prove the final in-flight request race.
- Capture preparation resolves the shared default/configuration once on server arrival and preserves it through resubmission. A remote default change before capture passes. Exact click-time ordering across an offline interval remains unverified; browser clocks are not used to reorder account operations.

These remain visible in #11 and #12. Passing local checks does not close the complete MVP gate.
