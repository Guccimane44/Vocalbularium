# Current product scope

## Objective: What is supported now?

This document identifies current capabilities and explicit deferrals. It provides a capability map and links to detailed behavior rather than repeating workflows. [Vision](vision.md) describes the longer-term direction; the [product model](model.md) defines the terminology.

The current baseline is the Chrome extension with its local account backend. It supports collecting and consulting kartes, with an initial set of language-oriented modules. Broader possibilities in the vision are not automatically part of this scope.

## Supported capabilities

| Area | Current capability | Detailed specification |
| --- | --- | --- |
| Account access | Login and logout using one built-in owner-test account; account-owned decks, layouts, default-deck selection, and saved kartes. | [Accounts and synchronization](../history/mvp/MVP-Product-scope.md#2-accounts-login-and-synchronization) |
| Synchronization | Installations connected to the same backend access the same account. Saving and synchronization failures support explicit recovery. | [Accounts and synchronization](../history/mvp/MVP-Product-scope.md#2-accounts-login-and-synchronization), [save recovery](../MVP-Product-spec-select-and-add.md#saving-and-synchronization-failures) |
| Capture | Select a word, phrase, or sentence in Chrome and create a karte in the default deck through the context menu, with brief feedback and accessible capture outcomes. Input consists of the selected text only. | [Select and Add](../MVP-Product-spec-select-and-add.md) |
| Deck management | Browse, create, rename, configure, and delete decks; choose the account's default deck. | [Dashboard](../history/mvp/MVP-Product-scope.md#4-dashboard), [default deck](../history/mvp/MVP-Product-scope.md#6-default-deck) |
| Layout configuration | One to four ordered seites with a required front seite; add, remove, and rearrange module instances, including repeated instances; preview layouts using examples. | [Deck configuration](../history/mvp/MVP-Product-scope.md#5-deck-configuration-page) |
| Modules | Five types: `<The selected>`, `<The selected + original language tag>`, `<German explanation>`, `<German explanation + examples>`, and `<Sentence usage>`. Interpretation chooses one source language where needed. | [Module catalog and applicability](../history/mvp/MVP-Product-spec-modules.md) |
| Generation | Automatically saved capture and generation outcomes, seite-level completion and failure, and explicitly confirmed retry of a captured karte's current seite. | [Completion and failure](../MVP-Product-spec-select-and-add.md#seite-completion-and-failure), [seite retry](../MVP-Product-spec-select-and-add.md#retry-the-current-seite) |
| Kartes | Browse and sort deck kartes, open a karte, navigate its seites, create kartes manually, edit seite text, and delete kartes. Duplicate kartes and empty seites are supported. | [Karte lists](../history/mvp/MVP-Product-scope.md#7-card-view-page), [manual editing](../history/mvp/MVP-Product-scope.md#8-card-content-page-and-manual-editing) |
| Presentation | Plain-text content and previews, Light/Dark appearance, keyboard interactions, and accessible state cues. | [Appearance](../history/mvp/MVP-Product-scope.md#11-appearance-v020), [list states](../history/mvp/MVP-Product-scope.md#71-list-state-presentation) |

The linked scope and module documents currently reside under `history/mvp/` during the taxonomy migration. Their applicable behavior sections supply the detail for this draft; their historical delivery assumptions do not define the current operating environment. Select and Add remains authoritative for completion, failure, interruption, and retry rules.

## Current delivery boundary

The product is an owner-test Chrome extension delivered through manual installation, with a local backend and persistent PostgreSQL storage. Real model generation requires an external provider. The [local development guide](../architecture/local-postgresql.md) describes the current environment and operating constraints.

The earlier hosted MVP is a separate historical environment. Current scope does not establish public-release readiness or claim that every platform and recovery scenario has been verified. Acceptance and verification evidence belong in release records.

## Explicit deferrals

- Registration, multiple user accounts, public onboarding, and public account-management features.
- Dedicated web, iOS, or Android clients and capture through mobile sharing or new hotkey workflows.
- Surrounding webpage context and multiple source-language interpretations for one capture.
- Dedicated passage-oriented generation and modules beyond the current five types.
- User-created modules, module customization APIs, and a general module marketplace.
- Rich-text rendering, editing separate module-output blocks, audio, images, and other media modules.
- Moving or copying kartes between decks.
- Memorization settings, spaced repetition, and study workflows.
- Automatically opening generated kartes, whole-karte retry, and individual-module retry.
- Automatic restart of interrupted generation or automatic resubmission of failed saves.
- Systematic generation-quality evaluation and expanded user-facing generation-limit controls.
- Public hosting and Chrome Web Store distribution.

Deferrals remain outside implementation scope until the owner explicitly changes it. Frontend improvements, stronger logging, behavior fixes, and backend inspection can be planned against this baseline; that direction alone does not specify new supported capabilities.
