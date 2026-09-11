# Vocabularium MVP implementation plan

Status: approved execution plan, 11 September 2026. M0 is in progress. Track milestone issues, implementation PRs, and verification evidence in the [GitHub MVP delivery tracker](https://github.com/Guccimane44/Vocalbularium/issues/5).

## Outcome and boundaries

Deliver a manually installable Chrome extension for the owner's Windows PC. The first useful milestone is the complete capture loop: log in, select text on a webpage, add it to the default deck, and find the automatically saved card in the dashboard. Subsequent milestones complete configuration, editing, recovery, and synchronization.

The planning baseline contained the product documents and no application implementation. Build the new implementation from these documents.

The requirements remain in the [product description](../vocabularium-product-description.md), [MVP scope](MVP-Product-scope.md), [module specification](MVP-Product-spec-modules.md), and [Select and Add specification](MVP-Product-spec-select-and-add.md). This plan defines work order and verification; it does not replace those specifications. Detailed generation, failure, interruption, and retry behavior remains authoritative in Select and Add.

Keep registration, automatic opening of captured cards, rich-text rendering and editing, additional clients, memorization, extra module types, systematic generation-quality evaluation, detailed generation-limit design, and Chrome Web Store publishing outside this iteration.

## Implementation direction

Use one extension, one backend, one persistent account database, and one generation provider. Keep the dashboard and editing screens inside extension tabs. A separate public website is unnecessary for this iteration.

| Part | Responsibility |
| --- | --- |
| Chrome extension | Login, context-menu capture, brief feedback, dashboard, deck configuration, card list, card content, and manual drafts. |
| Account backend | Authentication, shared account data, ordered mutations, page generation locks, and validated generation-result commits. |
| Persistent database | Decks, layouts, cards, page text, interpretation, attempt records, and operation receipts. |
| Module runtime and generation adapter | Produce deterministic output without model calls; use one provider for required interpretation and generation. Validate responses before publishing content and keep provider credentials on the backend. |
| Extension recovery storage | Retain capture receipts, pending saves, and recoverable drafts independently of open UI tabs; identify the installation and browser session that initiated an attempt. |

Select concrete libraries, the database, hosting, and the provider in M0. Prefer a small, maintainable stack; do not introduce separate services for each module or a general workflow platform.

Build these foundations before adding the complete UI:

- **Stable identity:** give decks, layout pages, module instances, cards, and attempts stable identifiers. A page's identity must survive a change in its displayed position. Keep the card-list index derived from sorting.
- **Separate content and instructions:** store saved page text independently of deck module configuration. Keep captured input and established interpretation separate from editable text.
- **Explicit attempts:** retain the initiating installation/session and configuration snapshot for each attempt. Validate attempt identity and object existence when committing results.
- **Ordered, atomic writes:** explicitly serialize account mutations in server-arrival order. Use changed-page updates and atomic multi-page saves. Do not assume database transactions alone establish arrival order. Generation runs outside the mutation transaction.
- **Safe resubmission:** assign an operation ID to each user action so resending an acknowledged or uncertain save cannot create another card or reapply an old edit. Separate capture actions receive separate IDs, even for identical text.
- **Visible persistence:** track pending account saves separately from generation outcomes. Start with a simple account refresh mechanism on view opening and while a view is active; preserve local drafts when remote data changes.

The main technical uncertainty is browser lifetime. Chrome may stop an extension service worker independently of browser closure, so an in-memory background task is insufficient. M0 must demonstrate a working lifecycle design before it becomes the capture foundation. See [Chrome's service worker lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). Chrome offers persistent local storage and session storage with different lifetimes; validate their use for recovery and session identity in the prototype. See [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Milestone sequence

Each milestone ends with a working demonstration and its relevant checks. Build the checks alongside the behavior; M5 combines them into a release acceptance pass.

| Milestone | Reviewable result | Depends on |
| --- | --- | --- |
| M0 — Validate the foundation | Stack decisions and a demonstrated browser-lifetime, feedback, and persistence approach. | Current specifications |
| M1 — Account and application shell | Login opens the account's dashboard; a second installation sees the same initial deck. | M0 |
| M2 — First working capture | Selected text becomes a saved, viewable card using the initial My Deck layout. | M1 |
| M3 — Decks and all modules | Create and configure decks, preview pages, and capture through all five modules. | M2 |
| M4 — Full card workflows | Browse and sort cards, create and edit them manually, delete them, and retry a page. | M3 |
| M5 — Reliability acceptance | Interruption, failed saves, deletion races, and simultaneous installations meet the specifications. | M4; checks begin in M0 |
| M6 — Windows delivery | Installable extension, reachable backend, instructions, and recorded owner acceptance. | M5 |

These are completion gates, not calendar commitments. Estimate delivery after M0 establishes the runtime approach, service access, and available implementation time. Do not trade away specified behavior to meet an unverified date.

Execution update, 11 September 2026: the owner will arrange Windows testing later and requested continued implementation. Locally validated foundation work may proceed into M1 while M0's Windows acceptance remains open and tracked. This does not waive any product requirement or the final Windows delivery gate.

Execution update, 11 September 2026: for MVP testing, use OpenCode's free model access with `mimo-v2.5-free` and deploy the backend as a Render Free web service. This keeps the single-owner test phase at zero hosting and model subscription cost. The generation adapter must use OpenCode's Chat Completions endpoint and validate model output before publishing it. Render Free's sleeping service and ephemeral filesystem are accepted test-phase constraints; persistent storage and always-on responsiveness remain open requirements for hosted production use.

### M0 — Validate the foundation

**Work**

- Choose and record the extension/UI tooling, backend runtime, database, hosting, provider/model, and minimum supported Chrome version. Confirm how the Windows installation will reach the same backend as a second installation.
- Prototype selected-text capture and the transient feedback surface. Verify ordinary webpages, frame selections, repeated captures, manual dismissal, and any browser-restricted surfaces relevant to owner testing. Record platform constraints and resolve them before committing to the UI mechanism.
- Prototype a deliberately slow generation attempt. Exercise worker suspension, closing the feedback surface, closing the dashboard, exiting Chrome, and restarting it. Use the [interruption rules](MVP-Product-spec-select-and-add.md#chrome-closing-during-generation) as the acceptance contract.
- Prove how originating-session identity, durable pending operations, cancellation, and result validation work together. A server job continuing after the originating browser exits must not publish a result that violates that contract.
- Exercise an initial two-client persistence prototype: server-arrival ordering, operation resubmission, and capture-time destination/configuration snapshots.

**Exit gate:** a short implementation decision record and reproducible prototype evidence. Browser shutdown detection, stale results, and popup delivery must have demonstrated approaches. If a platform constraint requires a product decision, record the exact gap rather than silently relaxing a requirement.

### M1 — Account and application shell

**Work**

- Scaffold the extension, backend, database setup, and verification harness. Document actual setup commands as they become available.
- Implement the built-in `admin` / `admin` account, login/logout, authenticated account access, and one-time initialization of **My Deck** with its specified layout.
- Add the extension-button entry point, login view, dashboard, and routes for deck configuration, card list, and card content.
- Implement account reads and the shared mutation foundation: operation receipts, arrival ordering, page-specific writes, and persistence acknowledgments. Add local pending-save storage and its visible recovery action.
- Connect two Chrome installations or isolated profiles to the same backend. Establish the refresh mechanism for account changes and login-dependent context-menu availability.

**Exit gate:** both installations see the same account and default deck, reopening Chrome preserves saved data, and repeated logins do not seed additional decks. Logout removes access to account views and capture. A failed account write is visibly pending and recoverable.

### M2 — First working capture

**Work**

- Wire **Add to default deck** to exact selected-text capture, a durable request receipt, and the initial saved card record. Include recent capture outcomes and destination links on the dashboard, including requests awaiting a saved card.
- Implement the feedback surface against the [capture-feedback contract](MVP-Product-spec-select-and-add.md#capture-feedback-popup).
- Implement shared input interpretation plus `<The selected>` and `<German explanation + examples>` for the initial layout, using a live generation provider.
- Add page-level attempt storage and atomic result publication, with the statuses defined by the [page-completion rules](MVP-Product-spec-select-and-add.md#page-completion-and-failure). Use the lifecycle mechanism validated in M0.
- Add a basic deck card list and card content view with plain-text rendering and navigation to every page. Connect automatic saving to the [saving and synchronization contract](MVP-Product-spec-select-and-add.md#saving-and-synchronization-failures).

**Exit gate:** demonstrate a word/phrase and a sentence through the initial deck on real webpages, then open the saved cards from another installation. Demonstrate a controlled generation failure and a capture whose first account save fails. Verify the results against the [initial default-deck example](MVP-Product-spec-select-and-add.md#initial-default-deck-example) and linked failure rules.

This is the first usable product checkpoint; the remaining workflows are still required for MVP completion.

### M3 — Decks, configuration, and all five modules

**Work**

- Implement new-deck drafts, naming, Save/Cancel, default-deck selection, and confirmed deck deletion, including the required replacement of the sole deck.
- Build the two-panel configuration screen: page controls, module library, module blocks, and clearly labeled sample previews for every page. Previews use illustrative content and do not call generation or mutate cards.
- Support one to four pages, the permanent front page, empty pages, repeated module instances, removal, and rearrangement within a page. Use simple add/remove/reorder controls where they satisfy the MVP interactions.
- Complete `<The selected + original language tag>`, `<German explanation>`, and `<Sentence usage>`. Verify all five module types and repeated instances against the [module specification](MVP-Product-spec-modules.md).
- Apply layout changes to existing cards using stable page IDs and transactional updates. Implement content-loss confirmation against current saved data under [changes to existing cards](MVP-Product-scope.md#53-changes-to-existing-cards).
- Exercise configuration changes and deletion during active captures against the [capture scenario](MVP-Product-spec-select-and-add.md#capture-scenario).

**Exit gate:** configure a four-page deck containing empty pages and repeated modules, make it the default, and capture word/phrase and sentence inputs. Save module changes and page additions/removals against existing cards; verify both stored content and preview behavior. Confirm default-deck invariants from both installations.

### M4 — Full card workflows

**Work**

- Finish the two-column card list, all four sort orders, stable tie-breaking, derived indices, and the empty-front-page placeholder. Record the chosen deterministic text-sorting convention.
- Implement manual card creation and editing, per-page drafts retained during navigation, Save/Cancel, unsaved-change choices, and confirmed card deletion under the [manual-editing specification](MVP-Product-scope.md#8-card-content-page-and-manual-editing).
- Connect multi-page editing to atomic changed-page saves, pending-save recovery, and remote updates without overwriting drafts.
- Implement current-page **Retry** against the [authoritative retry contract](MVP-Product-spec-select-and-add.md#retry-the-current-page), including the cross-installation lock. Reuse the generation and save foundation rather than a separate retry pipeline.
- Keep generation outcomes and save feedback consistent across the dashboard, list, and card content view.

**Exit gate:** create a card manually; edit several pages; navigate away and exercise each unsaved-change choice; recover a failed save; and verify list updates. Demonstrate confirmed and canceled retries on captured cards and test an existing draft in a second installation against an active generation lock. Verify all outcomes against the linked specifications.

### M5 — Reliability acceptance

**Work**

- Run the acceptance matrix below against the assembled product, using deterministic provider responses and controlled network failures where needed.
- Test response loss after a committed save separately from failure before persistence. Verify resubmission does not duplicate a card, rerun generation, or overwrite a later committed change.
- Combine layout changes, deletion, generation, manual drafts, and saves from two installations. Verify operation ordering and attempt validation under those races.
- Exercise normal browser exit and abrupt termination with development tools closed. Test closing the originating installation and a different installation separately.
- Run a small live-provider smoke pass for module applicability, format, source-language consistency, and distinct repeated examples. This checks integration; it does not introduce the deferred evaluation program.

**Exit gate:** every MVP completion criterion has recorded passing evidence. Any remaining limitation states its affected requirement; a missing required behavior blocks completion.

### M6 — Windows delivery and owner acceptance

**Work**

- Produce a versioned extension folder/ZIP for manual loading into Chrome. Include the production backend address and keep service credentials out of the extension package.
- Make the account backend and persistent storage reachable from the owner's PC and the second test installation. Verify that redeploying the backend preserves account data.
- Write brief Windows installation, login, update, and troubleshooting instructions. Add the actual development, build, and verification commands; document the chosen initial runtime defaults.
- Install the packaged build on Windows and perform the owner acceptance walkthrough. Verify updating the extension preserves access to existing account data.
- Record the tested Windows/Chrome versions, delivered version, checks performed, known limitations, and any deferred feedback for the next iteration.

**Exit gate:** the owner can install or update the extension from the instructions and complete the [MVP completion criteria](MVP-Product-scope.md#9-mvp-completion-criteria). Passing development checks on another platform does not substitute for this Windows check.

## Acceptance coverage

The numbers below map directly to the eleven completion criteria in the scope document. Detailed expected results come from the linked specifications; the scenarios below define what to exercise.

| Scope criterion | Milestones | Required verification |
| --- | --- | --- |
| 1. Login and dashboard | M1, M6 | Fresh account initialization; valid/invalid login; extension-button routing; logout; reopening Chrome. |
| 2. Decks, previews, default | M3, M5 | New-deck Save/Cancel; sample preview isolation; one-to-four-page controls; all five modules; repeated instances; changing/deleting the default and sole deck. |
| 3. Capture and modules | M2, M3, M5 | Words, phrases, sentences, ambiguous source language, preserved whitespace, module ordering and separators; two identical captures produce independently editable cards. |
| 4. Generation and retry | M2, M4, M5 | Controlled interpretation failure and module failure; mixed applicable/inapplicable modules; empty pages; repeated modules; manual content; retry cases from the [completion](MVP-Product-spec-select-and-add.md#page-completion-and-failure) and [retry](MVP-Product-spec-select-and-add.md#retry-the-current-page) contracts. |
| 5. Browse, sort, navigate | M2, M4 | Four sort orders, equal sort values, derived indices, first-page edits/retries, empty front pages, and navigation across all pages. |
| 6. Manual cards, edits, deletion | M3, M4, M5 | Multi-page drafts, all Save/Cancel/leave choices, failed saves, changed-page updates, and canceled/confirmed card and deck deletion. |
| 7. Change existing layouts | M3, M5 | Append pages, remove middle/end pages, content-loss warning, remote content changes before confirmation, and layout changes during generation. |
| 8. Persistent account data | M1, M5, M6 | Two installations, browser reopening, failed saves before/after server commit, backend restart, and extension update. Follow the [saving contract](MVP-Product-spec-select-and-add.md#saving-and-synchronization-failures). |
| 9. Capture feedback | M0, M2, M6 | Three-second duration, manual close, repeated captures, acceptance/failure feedback, unchanged reading activity, and longer-running generation. |
| 10. Browser interruption | M0, M2, M5, M6 | Slow capture/retry, worker suspension, UI closure, originating/other installation exit, restart reconciliation, and late responses under the [interruption contract](MVP-Product-spec-select-and-add.md#chrome-closing-during-generation). |
| 11. Save ordering | M1, M4, M5 | Simultaneous same-page and different-page saves; a multi-page save during generation; explicit resubmission; deletion before delayed saves/results. Follow [account ordering](MVP-Product-scope.md#2-accounts-login-and-synchronization) and [generation locks](MVP-Product-spec-select-and-add.md#retry-the-current-page). |

Use focused automated tests for state transitions, mutation ordering, atomic writes, layout migrations, and operation resubmission. Use extension integration checks for browser events and UI flows, plus the packaged Windows walkthrough. Do not assert exact wording from live generation.

## Decisions and dependencies to settle during execution

| Decision or dependency | Needed by | Completion evidence |
| --- | --- | --- |
| Runtime stack and browser lifecycle mechanism | End of M0 | Decision record and passing lifecycle prototype. |
| Backend host and persistent database access | M1 | Both installations read/write the same account. |
| Generation provider, model, and server credentials | M2 | Live capture through the initial layout; recorded runtime defaults. The MVP test default is OpenCode `mimo-v2.5-free`; keep the adapter configurable for a later provider switch. |
| Popup mechanism and browser surface constraints | End of M0 | Demonstrated capture feedback and documented platform findings. |
| Refresh cadence and deterministic sorting convention | M1 / M4 | Documented choices and consistent two-installation/list behavior. |
| Windows PC and second Chrome installation for verification | M0 prototype; required again in M5–M6 | Recorded lifecycle findings and packaged-build acceptance. |

Local implementation has progressed through M5, with M6 packaging and handoff preparation available. Current PRs and open exit gates are tracked in [GitHub issue #5](https://github.com/Guccimane44/Vocalbularium/issues/5); [the acceptance record](M5-Acceptance.md) maps the available evidence to all eleven completion criteria. Hosted, live-provider, and owner Windows acceptance remain open.
