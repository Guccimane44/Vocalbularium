# Current product scope

## Objective: What is supported now?

This document identifies current capabilities and explicit deferrals. It provides a capability map and links to detailed behavior rather than repeating workflows. [Vision](vision.md) describes the longer-term direction; the [product model](model.md) defines the terminology.

The current baseline is the Chrome extension with its local account backend. It supports collecting and consulting kartes, with an initial set of language-oriented modules. Broader possibilities in the vision are not automatically part of this scope.

The supported capabilities below describe the running v0.3.0+ build in its own terms (karte, seite). The [product model](model.md) now uses deck → page → component; [earlier terms](model.md#earlier-terms) maps the two.

## Supported capabilities

| Area | Current capability | Detailed specification |
| --- | --- | --- |
| Account access | Login and logout using one built-in owner-test account; account-owned decks, layouts, default-deck selection, and saved kartes. | [Accounts and synchronization](../history/mvp/MVP-Product-scope.md#2-accounts-login-and-synchronization) |
| Synchronization | Installations connected to the same backend access the same account. Saving and synchronization failures support explicit recovery. | [Accounts and synchronization](../history/mvp/MVP-Product-scope.md#2-accounts-login-and-synchronization), [save recovery](../history/v0.3.0-select-and-add.md#saving-and-synchronization-failures) |
| Capture | Select a word, phrase, or sentence in Chrome and create a karte in the default deck through the context menu, with brief feedback and accessible capture outcomes. Input consists of the selected text only. | [Select and Add baseline](../history/v0.3.0-select-and-add.md) |
| Deck management | Browse, create, rename, configure, and delete decks; choose the account's default deck. | [Dashboard](../history/mvp/MVP-Product-scope.md#4-dashboard), [default deck](../history/mvp/MVP-Product-scope.md#6-default-deck) |
| Layout configuration | One to four ordered seites with a required front seite; add, remove, and rearrange module instances, including repeated instances; preview layouts using examples. Edits apply to every karte in the deck (conform-always). | [Deck configuration](../history/mvp/MVP-Product-scope.md#5-deck-configuration-page) |
| Modules | Five types: `<The selected>`, `<The selected + original language tag>`, `<German explanation>`, `<German explanation + examples>`, and `<Sentence usage>`. Interpretation chooses one source language where needed. | [Module catalog and applicability](../specs/modules.md) |
| Generation | Automatically saved capture and generation outcomes, seite-level completion and failure, and explicitly confirmed retry of a captured karte's current seite. | [Completion and failure](../history/v0.3.0-select-and-add.md#seite-completion-and-failure), [seite retry](../history/v0.3.0-select-and-add.md#retry-the-current-seite) |
| Kartes | Browse and sort deck kartes, open a karte, navigate its seites, create kartes manually, edit seite text, and delete kartes. Duplicate kartes and empty seites are supported. | [Karte lists](../history/mvp/MVP-Product-scope.md#7-card-view-page), [manual editing](../history/mvp/MVP-Product-scope.md#8-card-content-page-and-manual-editing) |
| Presentation | Plain-text content and previews, Light/Dark appearance, keyboard interactions, and accessible state cues. | [Appearance](../history/mvp/MVP-Product-scope.md#11-appearance-v020), [list states](../history/mvp/MVP-Product-scope.md#71-list-state-presentation) |

The linked scope and module documents currently reside under `history/mvp/` during the taxonomy migration. Their applicable behavior sections supply the detail for this draft; their historical delivery assumptions do not define the current operating environment. The [Select and Add baseline](../history/v0.3.0-select-and-add.md) records the completion, failure, interruption, and retry rules of the running build.

## Accepted change pending implementation

The owner has approved the deck → page → component model ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72)), which includes the earlier accepted main-key and Context requirements. It is an accepted product requirement, not yet a supported capability. The [refactor plan](../plans/page-component-refactor.md) and [tracker #81](https://github.com/Guccimane44/Vocalbularium/issues/81) implement it:

- A deck contains pages. A page is an ordered list of components: a required editable main key, an optional editable Context, and one component per content module instance in the deck's configuration. Users can add their own text components.
- Capture creates a page from the selected text (and Context when capture with Context is on) and generates every content component automatically. Manual creation requires a main key and generates only when the user clicks **Generate**.
- Generation runs per component. **Retry** works on one component or the whole page, always after confirmation, and replaces the targeted content including the user's edits. **Generate missing** fills components for newly added instances.
- Generation always uses the deck's current configuration. Configuration changes never rewrite existing pages; there is no pinned layout revision.
- Editing the main key or Context changes only subsequent generation input.
- Pages are shown in the default view: the ordered component list, with the main key always visible.
- A deck has at most 12 content module instances.
- Installing the refactor discards existing decks and kartes. Accounts and sign-in stay; each account starts again with one fresh default deck.

[Pages and editing](../specs/pages-and-editing.md), [Deck configuration](../specs/decks-and-configuration.md), the [module contracts](../specs/modules.md#content-module-contract), and [Select and Add](../MVP-Product-spec-select-and-add.md) own these requirements. The implemented baseline still creates blank manual kartes without generation input, restricts retry to one seite of a captured karte, and joins module outputs per seite.

## Current delivery boundary

### Diagnostic logging increment

The [approved logging specification](../architecture/observability.md) adds correlated local diagnostics, full generation evidence, durable extension collection, explicit cleanup, configurable storage budgets, and degradation reporting. [Issue #70](https://github.com/Guccimane44/Vocalbularium/issues/70) tracks implementation and verification. Availability in the owner's installed backend/extension requires a separately authorized upgrade; the existing main-key implementation deferral remains unchanged.

The product is an owner-test Chrome extension delivered through manual installation, with a local backend and persistent PostgreSQL storage. Real model generation requires an external provider. The [local development guide](../architecture/local-postgresql.md) describes the current environment and operating constraints.

The earlier hosted MVP is a separate historical environment. Current scope does not establish public-release readiness or claim that every platform and recovery scenario has been verified. Acceptance and verification evidence belong in release records.

## Explicit deferrals

- Registration, multiple user accounts, public onboarding, and public account-management features.
- Dedicated web, iOS, or Android clients and capture through mobile sharing or new hotkey workflows.
- Multiple source-language interpretations for one capture (surrounding webpage context as capture Context is accepted-pending above, not deferred).
- Dedicated passage-oriented generation and modules beyond the current five types.
- User-created modules, module customization APIs, and a general module marketplace.
- Rich-text rendering, audio, images, and other media modules.
- View modules other than the default view, including the card view module; several views per deck and switching views.
- Hiding or deleting individual components on a page.
- Moving or copying pages between decks.
- Memorization settings, spaced repetition, and study workflows.
- Automatically opening generated pages.
- Automatic restart of interrupted generation or automatic resubmission of failed saves.
- Systematic generation-quality evaluation and expanded user-facing generation-limit controls.
- Public hosting and Chrome Web Store distribution.

Deferrals remain outside implementation scope until the owner explicitly changes it. Frontend improvements, stronger logging, behavior fixes, and backend inspection can be planned against this baseline; that direction alone does not specify new supported capabilities.
