# Select and Add

This specification defines capture and generation. The supported modules and their applicability are defined in the [Modules specification](specs/modules.md) and its [detailed catalog](history/mvp/MVP-Product-spec-modules.md).

This document is the authoritative source for detailed component completion, failure, interruption, and retry behavior. The scope, module specification, and general product description summarize and link to these rules.

## Status

These rules describe the owner-approved deck → page → component model ([Q72](architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72)) and are implemented in release 0.4.0, except capture with Context, which [current scope](product/scope.md#accepted-change-pending-implementation) lists as pending. Builds up to v0.3.0+ followed the [seite-level baseline](history/v0.3.0-select-and-add.md). [Pages and editing](specs/pages-and-editing.md) owns main key, Context, and component editing; [Deck configuration](specs/decks-and-configuration.md) owns content module instances.

## Availability and default deck

When the Chrome extension is installed, enabled, initialized, and the user is logged in, its browser context-menu action **Create a page in “{default deck name}”** is available for selected text. Capture is unavailable before login. The label names the last successfully synchronized default deck. It updates after successful initialization, login, default changes, renames, replacement/deletion, and account refreshes. Other installations' changes appear on the next successful synchronization, including background recovery while Chrome is running. Offline use retains the last synchronized name; unsaved drafts do not change the label. Logout, expired access, or missing default/session readiness make capture unavailable. Label updates do not replace the generation session. The MVP uses the built-in `admin` account described in the scope document; it does not implement registration.

The account initially has one default deck, **My Deck**. The user can configure this deck or set another deck as the default from the dashboard. There is exactly one default deck per account, and its choice synchronizes with the account.

The default deck's current configuration defines the content module instances used by Select and Add. Supported inputs are words, phrases, and sentences.

## Capture scenario

1. A logged-in user is reading a webpage and selects an unfamiliar word, phrase, or sentence, such as `幸福`.
2. The user right-clicks the selection and chooses **Create a page in “{default deck name}”**.
3. Vocabularium takes the selected text exactly as selected. When capture with Context is on, it also takes the surrounding block (capped at around 500 characters) plus the web page URL/title and timestamp; when off, no surrounding text or page context is taken. The Context and its on/off toggle are defined in [Pages and editing](specs/pages-and-editing.md#context).
4. It automatically saves a page in the destination deck with the selected text as its main key and the captured Context when present. This page remains accessible if generation later fails; its existence does not mean generation succeeded.
5. It starts one generation run for the page: one attempt per content module instance in the deck's current configuration. Where required by those instances, it determines the input type and one source language from the main key and Context, once for the whole run.
6. Each attempt publishes its own component when it completes. Inapplicable instances complete with an empty component. A failed attempt leaves its component empty with a failure indicator; it does not affect the other components.
7. It automatically saves and synchronizes components and generation outcomes with the account. The user does not need to select **Save**.

The destination is the default deck at the time the capture action is invoked. Changing the default deck while generation is running does not redirect that capture. Each page belongs to exactly one deck.

Each separate **Create a page in “{default deck name}”** action creates a new page, even if the same selected text or resulting content already exists in that deck or another deck. Duplicate pages are allowed without a warning, automatic merging, or content-based deduplication. They remain independently editable and deletable.

A generation run uses the configuration current when it starts. Configuration changes while it runs apply to later generation, not to that run. If an instance is removed while its attempt runs, the finished component stays on the page marked as no longer configured. Deleting a page or its destination deck cancels its pending generation; it must not recreate deleted pages, decks, or components.

The saved page appears in the destination deck's page list, including while generation is loading or after it fails. Page lists show each page's main key. Opening a page shows it in the default view, with **Retry** available per component and for the whole page. Component content is shown as plain text, including literal markup, following the [Modules specification](history/mvp/MVP-Product-spec-modules.md). The extension does not automatically open the new page or move the user away from the web page they are reading.

Clicking the extension button opens the dashboard in a Chrome tab. The dashboard provides access to recent capture outcomes and their destination decks, including requests that have not yet produced a saved page. A new capture remains visible while its local pending receipt hands off to the saved account page; a delayed account refresh must not briefly remove the row.

## Capture-feedback popup

When Select and Add accepts the selected text, immediately show a brief popup confirming receipt, such as **Capture received**. This confirms that the request was received, not that generation or account saving has completed. If the capture cannot be accepted, show a failure message instead.

The same popup appears on ordinary web pages and the originating Vocabularium dashboard, with identical wording, top-right placement relative to the web page, dimensions, styling, close control, and Light/Dark behavior. Dashboard capture creates no additional Chrome window and does not change focus or route. Other open dashboards do not receive its feedback. Account rerenders preserve the popup; theme changes update its appearance without restarting its timer. If the originating dashboard closes or navigates away, capture continues without redirecting feedback or opening a window. Chrome-restricted external pages retain the separate feedback-window fallback.

The popup closes automatically three seconds after it appears. This duration is fixed at three seconds. It also includes a close control so the user can dismiss it sooner. Each new capture receives its own feedback with the same three-second duration.

Closing the popup manually or waiting for it to disappear does not cancel the capture, end generation, or open the generated page. Generation may take longer than the popup's lifetime; progress and final outcomes remain available in the dashboard and the page editor.

This transient popup is separate from the dashboard and from confirmation dialogs. Retry warnings, deletion warnings, and unsaved-edit choices do not close automatically after three seconds.

## Input interpretation

The main key and the saved Context are used to determine whether the input is a word/phrase or a sentence and which source language applies. For ambiguous text, Vocabularium chooses one language automatically and uses it consistently across every attempt in the run. It does not generate separate interpretations for multiple source languages. Target languages are defined by the modules, not by a fixed language-pair setting for the deck.

If required interpretation fails, every attempt in the run that needs it fails. Attempts that do not need interpretation, such as `<The selected>`, still complete.

The shared interpretation rules are defined in the [Modules specification](history/mvp/MVP-Product-spec-modules.md).

## Generation actions

All generation actions use the page's current main key and saved Context and the deck's current configuration. Finish manual editing with **Save** or **Cancel** before starting one.

| Action | Targets | Confirmation |
| --- | --- | --- |
| Capture | Every configured content module instance | None; runs automatically |
| **Generate** / **Generate missing** | Configured instances that have no component on the page yet. On a new manual page this is every instance. | None; nothing is replaced |
| **Retry** (component) | One configured content component | Always |
| **Retry** (page) | Every configured content component, including missing ones | Always |

No action touches the main key, the Context, manual components, or components of instances no longer configured. Manual creation and manual edits never start generation.

## Component completion and failure

Generation-status labels describe actual generation attempts. A component that has never had a generation attempt shows no status label. A page with no generation attempts shows no overall status label. Missing components (configured instances with no component on the page yet) are shown as missing, not as failed.

Each component attempt has one of these states:

- **Loading:** required interpretation or the component's generation is in progress.
- **Completed:** the instance completed. Publish its output as the component's content. An inapplicable instance completes with an empty component and does not count as a failure.
- **Failed:** required interpretation or the instance failed. Discard any partial output from that attempt and show a failure indicator on the empty component. There is no partial success within a component.

Components fail and complete independently. For example, if a deck has two `<Sentence usage>` instances and only one succeeds, the successful example is published and the other component fails. A later retry of the failed component generates only that example.

A page's overall generation outcome is derived from its components that have had attempts: **Failed** if any such component's current state is **Failed**, otherwise **Loading** while any attempt is running, otherwise **Completed**. Confirming a retry moves each target component to **Loading**, then to **Completed** or **Failed** by its own attempt's outcome. Saving a page or manually adding content does not turn a failed attempt into a successful one; outside an active retry, a component's failure indicator describes its last attempt.

The main key is always shown, regardless of empty or failed components. A manual page that has not generated still shows its main key without a status label. Editing the main key or Context alone does not change any attempt's outcome.

### Generation capacity

The local API admits only a bounded number of active and waiting component attempts. When a capture is saved while generation capacity is full, the page remains saved and accessible. Each attempt that cannot be admitted becomes **Failed** without a provider call. The user can explicitly retry failed components later. A successful page save or capture feedback does not imply that generation was admitted or completed.

If capacity cannot admit every attempt of a confirmed **Retry**, **Generate**, or **Generate missing**, report that generation is busy and leave the page's components and states unchanged. The user may start the action again later. The rejected request is not kept as an automatic or **Try saving again** generation request. An admitted retry follows the replacement rules below.

## Chrome closing during generation

If Chrome closes on the installation that started a generation run, its unfinished attempts are considered failed. Completed and saved components remain intact. A retried component whose attempt was interrupted remains empty and failed under the replacement rule. Closing Chrome on another installation does not fail work initiated elsewhere.

On reopening Chrome, reconcile interrupted attempts as **Failed** and make the page accessible for explicit **Retry**. Do not automatically resume or restart those attempts. Late results from an interrupted attempt must not replace the failed state or the component's content.

Closing only the capture popup or dashboard tab does not count as closing Chrome. The three-second popup duration has no effect on generation lifetime.

## Retry

**Retry** is available in the page editor for one content component, or for the whole page. Completed, failed, empty, missing, or manually edited components can be targets. Capture origin does not matter: a manually created page has a main key and can retry like a captured one.

Before starting, always show a confirmation warning. For one component:

> Retry will replace this component's content, including your edits to it. The main key, Context, and other components will not change.

For the whole page:

> Retry will replace the content of every generated component on this page, including your edits to them. The main key, Context, and your own components will not change.

- **Cancel** leaves the page unchanged.
- **Confirm** discards the targeted components' current content and starts a fresh attempt for each. Previous edits and generated output are not preserved or merged into the replacement. If an attempt fails, its component stays empty with a failure indicator; the discarded content is not restored.

Retry uses the page's current saved main key and Context and the deck's current configuration at confirmation time. Required input classification and source language must correspond to that main key and Context; each retry starts a new run with a fresh interpretation. Changes to configuration after the run starts do not change it.

Retry updates the same components of the same page and saves the new outcomes automatically. It does not create another page or change any component it did not target. The page's identity and creation time stay the same. The targets stay the same even if the user navigates elsewhere while generation runs.

While an attempt is running on a component, another retry targeting it and manual editing of it are unavailable. Other components remain editable.

The generation lock applies across installations. Another installation may already have an unsaved draft when a component's generation starts. If a manual save arrives that changes any component that is generating, reject that save immediately rather than queueing it. For a save containing several changed components, reject the whole save without updating any of them. Preserve all the user's drafts and explain that a component is still generating. After the attempt finishes, the user can explicitly select **Save** or **Try saving again**; the new save follows the normal server-arrival order. Do not automatically apply the previously rejected save when generation ends.

## Saving and synchronization failures

Generation outcomes and persistence are distinct. Persisting a page with failed components makes it accessible for retry; it does not label incomplete generation as successful. Never report unsaved content as saved or synchronized.

Ordinary in-flight saves retain their recovery record internally without showing a recovery panel or **Try saving again**. A successful save must not briefly insert such a panel in Recent captures or the deck's page list. If the extension worker stops before a save is acknowledged, make its retained operation available for explicit recovery when the worker starts again; do not silently resubmit it. The existing browser-session interruption rules still apply to generation and publication from an ended session.

If saving or synchronization fails, retain the pending change and offer **Try saving again**. This action only resubmits the same pending save for that page; it does not start another capture, generate content, discard manual edits, or require the retry warning. This is distinct from **Retry**, which starts fresh generation after confirmation.

Account synchronization follows the [MVP scope](history/mvp/MVP-Product-scope.md). Saved changes from different installations are applied in server-arrival order (FIFO); a later save to the same component replaces the earlier saved content. The generation lock still applies while an attempt is active, and late results from a canceled or interrupted attempt must not overwrite a subsequent save or retry.

## Initial default-deck example

The initial **My Deck** has one content module instance: `<German explanation + examples>`. It has no `<The selected>` instance, because every page already shows its main key.

For the selected input `幸福`, interpreted as Chinese in this example, the page shows its main key `幸福`, then a German-language explanation component for the Chinese word, with Chinese examples and their German translations, following the format in the [Modules specification](history/mvp/MVP-Product-spec-modules.md). The exact generated wording may vary.

For a selected sentence such as `我真的很幸福`, the `<German explanation + examples>` component completes empty because that module does not apply to sentences. This is an intentional, successfully completed page. A user can add `<Sentence usage>` to the deck configuration and use **Generate missing** on this page, rely on it for future captures, or add their own component to this page.

## Editing after capture

Generated content remains editable. The user opens the page editor to change any component, edit the main key or its Context, add their own text component, or delete the page. Manual edits require an explicit **Save**. Select and Add and confirmed retries save their outcomes automatically. A later confirmed **Retry** discards the edits on the components it targets along with their previous generation; edits on other components remain unchanged.
