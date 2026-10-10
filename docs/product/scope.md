# Current product scope

## Objective: What is supported now, and what is decided?

This document is the status ledger for product capabilities. It marks each capability with its status and links to the detailed behavior instead of repeating workflows. A requirement in a specification is never evidence that the capability exists; this ledger says whether it does. [Vision](vision.md) describes the longer-term direction; the [product model](model.md) defines the terminology. The [project workflow](../guides/project-workflow.md#from-decisions-to-iterations) describes how capabilities move through the statuses.

The current baseline is the Chrome extension with its local account backend. It supports collecting and consulting pages, with an initial set of language-oriented content modules. Broader possibilities in the vision are not automatically part of this scope.

The implemented capabilities below describe release 0.4.1. Release 0.4.0 implements the deck → page → component model approved in [Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72) through the [refactor plan](../history/plans/page-component-refactor.md) and [tracker #81](https://github.com/Guccimane44/Vocalbularium/issues/81). 0.4.1 adds capture with Context. Builds up to v0.3.0+ used kartes and seites; [earlier terms](model.md#earlier-terms) maps the two.

## Status values

- `implemented`: shipped in the release named in *Since / target*, as the linked specification describes.
- `accepted for 1.0`: the owner accepted the decision record; the capability is specified but not built.
- `post-1.0`: accepted for a later version than 1.0.
- `out at maturity`: accepted as never part of the product.
- `deferred`: not yet classified. The *Decision* column names the record that is still `Proposed` or `Deferred`, or the plan that put the capability out of scope; "—" means no record covers it. The row moves to one of the statuses above when its record is accepted.

Only [D02](../architecture/traceability-map.md#entries)'s page-owned modules are `accepted for 1.0` so far. No capability is `post-1.0` or `out at maturity` yet: the questionnaire's decision records, including [Q04](../architecture/questionnaire/answers/answers-01-maturity-and-scope.md#q04)'s list of features excluded at maturity, are still `Proposed`. The [traceability map](../architecture/traceability-map.md) tracks how each answer reaches the specifications.

## Capability ledger

| Area | Capability | Status | Since / target | Specification | Decision |
| --- | --- | --- | --- | --- | --- |
| Account access | Login and logout using one built-in owner-test account; account-owned decks, configurations, default-deck selection, and saved pages. | implemented | 0.4.0 | [Accounts and synchronization](../specs/accounts-and-sync.md) | — |
| Synchronization | Installations connected to the same backend access the same account. Saving and synchronization failures support explicit recovery. | implemented | 0.4.0 | [Accounts and synchronization](../specs/accounts-and-sync.md), [save recovery](../specs/capture-and-generation.md#saving-and-synchronization-failures) | — |
| Capture | Select a word, phrase, or sentence in Chrome and create a page in the default deck through the context menu, with brief feedback and accessible capture outcomes. The selection becomes the page's main key; with the deck's **Capture with Context** on (the default), the surrounding block, capped near 500 characters, becomes its Context. The page then generates every content component automatically. | implemented | 0.4.1 | [Capture and generation](../specs/capture-and-generation.md) | [Q72][r-q72]; Context: [Q07](../architecture/questionnaire/answers/answers-02-clients-and-capture.md#q07) ([Proposed][r-02]) |
| Deck management | Browse, create, rename, configure, and delete decks; choose the account's default deck. | implemented | 0.4.0 | [Deck configuration](../specs/decks-and-configuration.md) | [Q72][r-q72] |
| Deck configuration | An ordered list of up to 12 content module instances, including repeated instances, with example previews, and the Capture with Context toggle. Configuration changes never rewrite existing pages; components of removed instances stay on their pages. | implemented | 0.4.1 | [Deck configuration](../specs/decks-and-configuration.md) | [Q72][r-q72] |
| Modules | Three content module types: `<German explanation>`, `<German explanation + examples>`, and `<Sentence usage>`. Interpretation chooses one source language. A new account's My Deck has one `<German explanation + examples>` instance. `<The selected>` and `<The selected + original language tag>` are retired. | implemented | 0.4.0; retirement after 0.4.1, unreleased | [Module catalog and applicability](../specs/modules.md) | [Q72][r-q72], [D03](../architecture/traceability-map.md#entries) |
| Generation | Per-component generation from the main key, the Context and the deck's current configuration. Explicitly confirmed **Retry** of one component or the whole page replaces the targeted content, including edits. **Generate missing** fills components without content, such as those of newly added instances. | implemented | 0.4.0 | [Pages and editing](../specs/pages-and-editing.md), [capture and generation](../specs/capture-and-generation.md) | [Q72][r-q72] |
| Pages | Browse and sort deck pages, open a page, create pages manually from a required main key and optional Context (generation starts only on **Generate**), edit the main key, Context and component text, add text components that generation never touches, and delete pages. | implemented | 0.4.0 | [Pages and editing](../specs/pages-and-editing.md) | [Q72][r-q72] |
| Presentation | Pages are shown in the default view: the ordered component list with the main key always visible. Plain-text content and previews, Light/Dark appearance, keyboard interactions, and accessible state cues. | implemented | 0.4.0 | [Pages and editing](../specs/pages-and-editing.md), [shared UI](../specs/shared-ui.md) | [Q72][r-q72] |
| Diagnostics | Correlated local diagnostics, full generation evidence, durable extension collection, explicit cleanup, configurable storage budgets, and degradation reporting. Full-content diagnostics are a development mode; hosted redaction rules ([Q63](../architecture/questionnaire/answers/answers-12-operations.md#63)) are `Proposed`. | implemented | 0.4.0 | [Observability](../architecture/observability.md) | [Local diagnostics][r-logs]; [issue #70](https://github.com/Guccimane44/Vocalbularium/issues/70) |
| Pages | Page-owned modules: a new page copies the deck's module instances, and later deck changes never affect it. The main key and Context become input modules: the main key is compulsory and always first, the Context is an optional module (at most one) that replaces the **Capture with Context** setting, the user's own text becomes a repeatable Text module, and the limit of 12 counts every module. The user deletes any component except the main key (immediately, after a warning), rearranges every component below the main key, and drags modules onto one page, where they wait as "Not generated yet". A deleted component stays gone. | accepted for 1.0 | 0.5.0 ([plan](../plans/page-owned-modules.md)) | [Pages and editing](../specs/pages-and-editing.md#shaping-a-page), [decks and configuration](../specs/decks-and-configuration.md#configuration-and-pages) | [D02](../architecture/traceability-map.md#entries) |
| Presentation | Module window on the right of the page view and deck settings, for dragging modules onto a page or into a deck; part of a redesign of both views. | accepted for 1.0 | 0.5.0 ([plan](../plans/page-owned-modules.md)) | [Shared UI](../specs/shared-ui.md#module-window) | [D02](../architecture/traceability-map.md#entries) |
| Accounts | Registration, multiple user accounts, public onboarding, and public account-management features. | deferred | — | — | [Q02](../architecture/questionnaire/answers/answers-01-maturity-and-scope.md#q02) ([Proposed][r-01]), [Q17](../architecture/questionnaire/answers/answers-04-identity-sync.md#q17) ([Proposed][r-04]) |
| Clients | Dedicated web, iOS, or Android clients and capture through mobile sharing or new hotkey workflows. | deferred | — | — | [Q06](../architecture/questionnaire/answers/answers-02-clients-and-capture.md#q06) ([Proposed][r-02]) |
| Modules | Multiple source-language interpretations for one capture. | deferred | — | — | [Q43](../architecture/questionnaire/answers/answers-08-modules.md#q43) ([Deferred][r-08]) |
| Modules | Dedicated passage-oriented generation and modules beyond the current five types. | deferred | — | — | [Q40](../architecture/questionnaire/answers/answers-08-modules.md#q40), [Q42](../architecture/questionnaire/answers/answers-08-modules.md#q42) ([Deferred][r-08]) |
| Modules | User-created modules, module customization APIs, and a general module marketplace. | deferred | — | — | [Q44](../architecture/questionnaire/answers/answers-08-modules.md#q44) ([Deferred][r-08]) |
| Presentation | Rich-text rendering, audio, images, and other media modules. | deferred | — | — | Rich text: [Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13) ([Proposed][r-03]); media: [Q40](../architecture/questionnaire/answers/answers-08-modules.md#q40) ([Deferred][r-08]) |
| Presentation | View modules other than the default view, including the card view module; several views per deck and switching views. | deferred | — | — | [Refactor plan](../history/plans/page-component-refactor.md), out of scope until the owner starts it |
| Pages | Moving or copying pages between decks. | deferred | — | — | [Q32](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q32) ([Proposed][r-06]) |
| Review | Memorization settings, spaced repetition, and study workflows. | deferred | — | — | [Q52](../architecture/questionnaire/answers/answers-10-review-and-scale.md#q52), [Q53](../architecture/questionnaire/answers/answers-10-review-and-scale.md#53) ([Proposed][r-10]) |
| Capture | Automatically opening generated pages. | deferred | — | — | — |
| Generation | Automatic restart of interrupted generation or automatic resubmission of failed saves. | deferred | — | — | [Q09](../architecture/questionnaire/answers/answers-02-clients-and-capture.md#q09) ([Proposed][r-02]), [Q50](../architecture/questionnaire/answers/answers-09-generation-and-llm.md#q50) ([Proposed][r-09]) |
| Generation | Systematic generation-quality evaluation and expanded user-facing generation-limit controls. | deferred | — | — | [Q48](../architecture/questionnaire/answers/answers-09-generation-and-llm.md#q48), [Q49](../architecture/questionnaire/answers/answers-09-generation-and-llm.md#q49) ([Proposed][r-09]), [Q65](../architecture/questionnaire/answers/answers-12-operations.md#65) ([Proposed][r-12]) |
| Delivery | Public hosting and Chrome Web Store distribution. | deferred | — | — | [Q01](../architecture/questionnaire/answers/answers-01-maturity-and-scope.md#q01) ([Proposed][r-01]), [Q15](../architecture/questionnaire/answers/answers-03-frontend.md#q15) ([Proposed][r-03]), [Q18](../architecture/questionnaire/answers/answers-04-identity-sync.md#q18) ([Proposed][r-04]) |

[r-q72]: https://app.notion.com/p/3f4bb1350208812e8085ffd751302842
[r-logs]: https://app.notion.com/p/3ecbb1350208818b8156f754e52d4e4a
[r-01]: https://app.notion.com/p/3f4bb1350208815fafb8f856f1a185d1
[r-02]: https://app.notion.com/p/3f4bb13502088120a994cb6ab8fe6d5c
[r-03]: https://app.notion.com/p/3f4bb13502088117b4cbf12e01f915ff
[r-04]: https://app.notion.com/p/3f4bb135020881ec85beca3cd7941578
[r-06]: https://app.notion.com/p/3f4bb13502088159bf3fef8135989e73
[r-08]: https://app.notion.com/p/3f4bb1350208813ab814f53fd24d5021
[r-09]: https://app.notion.com/p/3f4bb135020881acb220c5a11218f727
[r-10]: https://app.notion.com/p/3f4bb1350208815d9354dc184a658a37
[r-12]: https://app.notion.com/p/3f4bb13502088125bf60fffb37849daa

The detailed output formats of the three modules still reside in the [MVP module specification](../history/mvp/MVP-Product-spec-modules.md), linked from [modules](../specs/modules.md); its other historical assumptions do not define current behavior.

<a id="explicit-deferrals"></a>`deferred` rows remain outside implementation scope until the owner explicitly changes it. Frontend improvements, stronger logging, behavior fixes, and backend inspection can be planned against this baseline; that direction alone does not specify new capabilities.

## Upgrade from earlier builds

Upgrading to 0.4.0 discards every deck and karte created by earlier builds. Accounts and sign-in stay, and the account starts again with one fresh My Deck. Extensions older than 0.4.0 do not work with the 0.4.0 backend.

Upgrading from 0.4.0 to 0.4.1 keeps all decks and pages. Migration `0005` adds the deck setting **Capture with Context**, on for every existing deck. Upgrade the backend and the extension together: a 0.4.1 extension saving deck settings needs the 0.4.1 backend.

The next release retires `<The selected>` and `<The selected + original language tag>` (D03). Migration `0006` removes their instances from every deck and deletes the components they produced, including components of instances already removed from a deck; all other decks, pages and components stay. Upgrade the backend and the extension together: an older extension still offers the retired modules, and the backend rejects a deck that contains them. A capture receipt saved before the upgrade with a retired module in its configuration is rejected when resubmitted.

Upgrading to 0.5.0 (planned, [D02](../architecture/traceability-map.md#entries)) will discard every deck and page again, as 0.4.0 did, because the earlier data was for testing. Accounts and sign-in stay, and the account starts again with one fresh My Deck holding the main key, Context, and `<German explanation + examples>` modules.

## Current delivery boundary

The product is an owner-test Chrome extension delivered through manual installation, with a local backend and persistent PostgreSQL storage. Real model generation requires an external provider. The [local development guide](../architecture/local-postgresql.md) describes the current environment and operating constraints.

The earlier hosted MVP is a separate historical environment. Current scope does not establish public-release readiness or claim that every platform and recovery scenario has been verified. Acceptance and verification evidence belong in release records.
