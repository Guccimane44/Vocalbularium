# Current product scope

## Objective: What is supported now?

This document identifies current capabilities and explicit deferrals. It provides a capability map and links to detailed behavior rather than repeating workflows. [Vision](vision.md) describes the longer-term direction; the [product model](model.md) defines the terminology.

The current baseline is the Chrome extension with its local account backend. It supports collecting and consulting pages, with an initial set of language-oriented content modules. Broader possibilities in the vision are not automatically part of this scope.

The supported capabilities below describe release 0.4.0, which implements the deck → page → component model approved in [Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72) through the [refactor plan](../plans/page-component-refactor.md) and [tracker #81](https://github.com/Guccimane44/Vocalbularium/issues/81). Builds up to v0.3.0+ used kartes and seites; [earlier terms](model.md#earlier-terms) maps the two.

## Supported capabilities

| Area | Current capability | Detailed specification |
| --- | --- | --- |
| Account access | Login and logout using one built-in owner-test account; account-owned decks, configurations, default-deck selection, and saved pages. | [Accounts and synchronization](../history/mvp/MVP-Product-scope.md#2-accounts-login-and-synchronization) |
| Synchronization | Installations connected to the same backend access the same account. Saving and synchronization failures support explicit recovery. | [Accounts and synchronization](../history/mvp/MVP-Product-scope.md#2-accounts-login-and-synchronization), [save recovery](../MVP-Product-spec-select-and-add.md#saving-and-synchronization-failures) |
| Capture | Select a word, phrase, or sentence in Chrome and create a page in the default deck through the context menu, with brief feedback and accessible capture outcomes. The selection becomes the page's main key; the page then generates every content component automatically. | [Select and Add](../MVP-Product-spec-select-and-add.md) |
| Deck management | Browse, create, rename, configure, and delete decks; choose the account's default deck. | [Deck configuration](../specs/decks-and-configuration.md) |
| Deck configuration | An ordered list of up to 12 content module instances, including repeated instances, with example previews. Configuration changes never rewrite existing pages; components of removed instances stay on their pages. | [Deck configuration](../specs/decks-and-configuration.md) |
| Modules | Five content module types: `<The selected>`, `<The selected + original language tag>`, `<German explanation>`, `<German explanation + examples>`, and `<Sentence usage>`. Interpretation chooses one source language where needed. A new account's My Deck has one `<German explanation + examples>` instance. | [Module catalog and applicability](../specs/modules.md) |
| Generation | Per-component generation from the main key, the Context and the deck's current configuration. Explicitly confirmed **Retry** of one component or the whole page replaces the targeted content, including edits. **Generate missing** fills components without content, such as those of newly added instances. | [Pages and editing](../specs/pages-and-editing.md), [Select and Add](../MVP-Product-spec-select-and-add.md) |
| Pages | Browse and sort deck pages, open a page, create pages manually from a required main key and optional Context (generation starts only on **Generate**), edit the main key, Context and component text, add text components that generation never touches, and delete pages. | [Pages and editing](../specs/pages-and-editing.md) |
| Presentation | Pages are shown in the default view: the ordered component list with the main key always visible. Plain-text content and previews, Light/Dark appearance, keyboard interactions, and accessible state cues. | [Pages and editing](../specs/pages-and-editing.md), [Appearance](../history/mvp/MVP-Product-scope.md#11-appearance-v020) |

Some linked scope documents still reside under `history/mvp/`. Their applicable behavior sections supply the detail; their historical delivery assumptions do not define the current operating environment.

## Accepted change pending implementation

- **Capture with Context.** Capture does not yet take the surrounding block of the selection, and there is no on/off toggle. A page's Context is entered or edited by the user in the page editor and is then used as generation input. [Pages and editing](../specs/pages-and-editing.md#context) and [Select and Add](../MVP-Product-spec-select-and-add.md#capture-scenario) own the requirement.

## Upgrade from earlier builds

Upgrading to 0.4.0 discards every deck and karte created by earlier builds. Accounts and sign-in stay, and the account starts again with one fresh My Deck. Extensions older than 0.4.0 do not work with the 0.4.0 backend.

## Current delivery boundary

### Diagnostic logging increment

The [approved logging specification](../architecture/observability.md) adds correlated local diagnostics, full generation evidence, durable extension collection, explicit cleanup, configurable storage budgets, and degradation reporting. [Issue #70](https://github.com/Guccimane44/Vocalbularium/issues/70) tracks implementation and verification. Availability in the owner's installed backend/extension requires a separately authorized upgrade; the existing main-key implementation deferral remains unchanged.

The product is an owner-test Chrome extension delivered through manual installation, with a local backend and persistent PostgreSQL storage. Real model generation requires an external provider. The [local development guide](../architecture/local-postgresql.md) describes the current environment and operating constraints.

The earlier hosted MVP is a separate historical environment. Current scope does not establish public-release readiness or claim that every platform and recovery scenario has been verified. Acceptance and verification evidence belong in release records.

## Explicit deferrals

- Registration, multiple user accounts, public onboarding, and public account-management features.
- Dedicated web, iOS, or Android clients and capture through mobile sharing or new hotkey workflows.
- Multiple source-language interpretations for one capture.
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
