# Capture and generation (Select and Add)

This specification defines capture and generation. The supported modules and their applicability are defined in the [Modules specification](modules.md) and its [catalog](modules.md#catalog).

This document is the authoritative source for detailed component completion, failure, interruption, and retry behavior. The scope, module specification, and general product description summarize and link to these rules.

## Status

These rules describe the owner-approved deck → page → component model ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72)) with page-owned modules ([D02](../architecture/traceability-map.md#entries)). Release 0.4.0 implements the model, 0.4.1 adds capture with Context, and 0.5.0 implements D02 ([current scope](../product/scope.md)). Release 0.6.0 adds the capture flight, toolbar badge, and rendered content of [D05](../architecture/traceability-map.md#entries). Release 0.7.0 adds parent modules with facets and the word-or-sentence interpretation ([D08](../architecture/traceability-map.md#entries)); earlier releases also chose one source language per run, and an inapplicable module completed empty. Builds up to v0.3.0+ followed the [seite-level baseline](../history/v0.3.0-select-and-add.md). [Pages and editing](pages-and-editing.md) owns main key, Context, and component editing; [decks and configuration](decks-and-configuration.md) owns the template new pages start from.

## Availability and default deck

When the Chrome extension is installed, enabled, initialized, and the user is logged in, its browser context-menu action **Create a page in “{default deck name}”** is available for selected text. Capture is unavailable before login. The label names the last successfully synchronized default deck. It updates after successful initialization, login, default changes, renames, replacement/deletion, and account refreshes. Other installations' changes appear on the next successful synchronization, including background recovery while Chrome is running. Offline use retains the last synchronized name; unsaved drafts do not change the label. Logout, expired access, or missing default/session readiness make capture unavailable. Label updates do not replace the generation session. The product uses one built-in owner-test account ([accounts and synchronization](accounts-and-sync.md)); there is no registration.

The account initially has one default deck, **My Deck**. The user can configure this deck or set another deck as the default from the dashboard. There is exactly one default deck per account, and its choice synchronizes with the account.

A captured page receives a copy of the default deck's content module instances ([decks and configuration](decks-and-configuration.md#configuration-and-pages)). Supported inputs are words, phrases, and sentences.

## Capture scenario

1. A logged-in user is reading a webpage and selects an unfamiliar word, phrase, or sentence, such as `幸福`.
2. The user right-clicks the selection and chooses **Create a page in “{default deck name}”**.
3. Vocabularium takes the selected text exactly as selected. When the destination deck has the Context module, it also takes the surrounding block (capped at around 500 characters); otherwise no surrounding text is taken. The web page URL and title are never taken. The Context is defined in [Pages and editing](pages-and-editing.md#context).
4. It automatically saves a page in the destination deck with the selected text as its main key and the captured Context when present. This page remains accessible if generation later fails; its existence does not mean generation succeeded.
5. It starts one generation run for the page: one attempt per content module instance the page received from the deck. Each attempt is one request in which its module decides how to read the key and writes its card ([input interpretation](#input-interpretation)).
6. Each attempt publishes its own component when it completes: the parent's core and its facets that apply. A failed attempt leaves its component empty with a failure indicator; it does not affect the other components.
7. It automatically saves and synchronizes components and generation outcomes with the account. The user does not need to select **Save**.

The destination is the default deck at the time the capture action is invoked. Changing the default deck while generation is running does not redirect that capture. Each page belongs to exactly one deck.

Each separate **Create a page in “{default deck name}”** action creates a new page, even if the same selected text or resulting content already exists in that deck or another deck. Duplicate pages are allowed without a warning, automatic merging, or content-based deduplication. They remain independently editable and deletable.

A generation run keeps the module instances it started with. Later changes to the deck or the page do not change that run. Deleting a page, its destination deck, or a targeted component cancels the affected pending generation; it must not recreate deleted pages, decks, or components.

The saved page appears in the destination deck's page list, including while generation is loading or after it fails. Page lists show each page's main key. Opening a page shows it in the default view, with **Generate** or **Retry** in each content card ([generation actions](#generation-actions)). Component content is rendered as its module's render contract describes ([shared UI](shared-ui.md#text-content)). The extension does not automatically open the new page or move the user away from the web page they are reading.

Clicking the extension button opens the dashboard in a Chrome tab. The dashboard provides access to recent capture outcomes and their destination decks, including requests that have not yet produced a saved page. A new capture remains visible while its local pending receipt hands off to the saved account page; a delayed account refresh must not briefly remove the row.

## Capture-feedback popup

When Select and Add accepts the selected text, immediately show a brief popup confirming receipt, such as **Capture received**. This confirms that the request was received, not that generation or account saving has completed. If the capture cannot be accepted, show a failure message instead.

**Capture flight** ([D05](../architecture/traceability-map.md#entries)): on a web page where the selection can be read, the selected text lifts off the page as a small label and flies along a short arc into the popup's position in about half a second; the popup then appears as described here. A label longer than about 44 characters is shortened with an ellipsis; the capture always takes the full selection. The flight never delays the capture, never moves the page or the selection, and is skipped when the system asks for reduced motion, on Chrome-restricted pages, and when the capture fails. It needs no permission beyond those capture already uses.

After each accepted capture, the toolbar icon shows a badge with the number of captures since the user last opened the dashboard; opening the dashboard clears it ([K21](../architecture/traceability-map.md#clarifications)).

The same popup appears on ordinary web pages and the originating Vocabularium dashboard, with identical wording, top-right placement relative to the web page, dimensions, styling, close control, and appearance ([shared UI](shared-ui.md#appearance)). It uses the Vocabularium Sage styling and the destination deck's colour. Dashboard capture creates no additional Chrome window and does not change focus or route. Other open dashboards do not receive its feedback. Account rerenders preserve the popup; theme changes update its appearance without restarting its timer. If the originating dashboard closes or navigates away, capture continues without redirecting feedback or opening a window. Chrome-restricted external pages retain the separate feedback-window fallback.

The popup closes automatically three seconds after it appears. This duration is fixed at three seconds. It also includes a close control so the user can dismiss it sooner. Each new capture receives its own feedback with the same three-second duration.

Closing the popup manually or waiting for it to disappear does not cancel the capture, end generation, or open the generated page. Generation may take longer than the popup's lifetime; progress and final outcomes remain available in the dashboard and the page editor.

This transient popup is separate from the dashboard and from confirmation dialogs. Retry warnings, deletion warnings, and unsaved-edit choices do not close automatically after three seconds.

## Input interpretation

Since 0.12.0 ([D17](../architecture/traceability-map.md#entries)) there is no interpretation shared by the run. Each attempt reads the main key and Context in its own request and records its reading as the core's flags, such as word or sentence for a Languages parent, which its card's header shows ([pages and editing](pages-and-editing.md#required-main-key)). No reading chooses a source language for the page: each parent reads the language from the key and Context. Target languages are defined by the parent modules, not by a fixed language-pair setting for the deck. A failed attempt fails only its own component.

Until 0.12.0 the main key and the saved Context were classified as a word or phrase, or a sentence, once per run, shown under the main key, and a failed classification failed every attempt in the run ([D08](../architecture/traceability-map.md#entries)).

The interpretation and applicability rules are defined in the [Modules specification](modules.md#input-and-applicability).

## Generation actions

All generation actions use the page's current main key and saved Context and the page's own content module instances. Finish manual editing with **Save** or **Cancel** before starting one.

| Action | Targets | Confirmation |
| --- | --- | --- |
| Capture | Every content module instance on the new page | None; runs automatically |
| **Retry** (in a card), empty component | One content component with nothing in it: one that never generated, failed, or generated nothing | None; nothing is replaced |
| **Retry** (in a card), with content | One content component that has generated, or that the user wrote into | Always |

Since 0.5.1 ([D04](../architecture/traceability-map.md#entries)) the extension offers generation per card only. The API still accepts generating every not-yet-generated component of a page and retrying a whole page, with the same confirmation rule.

No action touches an input module's component (main key, Context, Text), and none recreates a component the user deleted. Manual creation and manual edits never start generation.

## Component completion and failure

Generation-status labels describe actual generation attempts. A component that has never had a generation attempt shows no status label. A page with no generation attempts shows no overall status label. Components not generated yet are shown as empty, with only their index tab ([pages and editing](pages-and-editing.md#components-as-cards)), not as failed.

Each component attempt has one of these states:

- **Loading:** the component's generation is in progress.
- **Completed:** the instance completed. Publish its output, the core and its applicable facets, as the component's content. A facet that does not apply is left out and does not count as a failure.
- **Failed:** the instance failed. Discard any partial output from that attempt and show a failure indicator on the empty component. There is no partial success within a component.

Components fail and complete independently. For example, if a page has two `German` instances and only one succeeds, the successful one is published and the other component fails. A later retry of the failed component generates only that one.

A page's overall generation outcome is derived from its components that have had attempts: **Failed** if any such component's current state is **Failed**, otherwise **Loading** while any attempt is running, otherwise **Completed**. Confirming a retry moves each target component to **Loading**, then to **Completed** or **Failed** by its own attempt's outcome. Saving a page or manually adding content does not turn a failed attempt into a successful one; outside an active retry, a component's failure indicator describes its last attempt.

The main key is always shown, regardless of empty or failed components. A manual page that has not generated still shows its main key without a status label. Editing the main key or Context alone does not change any attempt's outcome.

### Generation capacity

The local API admits only a bounded number of active and waiting component attempts. When a capture is saved while generation capacity is full, the page remains saved and accessible. Each attempt that cannot be admitted becomes **Failed** without a provider call. The user can explicitly retry failed components later. A successful page save or capture feedback does not imply that generation was admitted or completed.

If capacity cannot admit every attempt of a **Retry**, report that generation is busy and leave the page's components and states unchanged. The user may start the action again later. The rejected request is not kept as an automatic or **Try saving again** generation request. An admitted retry follows the replacement rules below.

## Chrome closing during generation

If Chrome closes on the installation that started a generation run, its unfinished attempts are considered failed. Completed and saved components remain intact. A retried component whose attempt was interrupted remains empty and failed under the replacement rule. Closing Chrome on another installation does not fail work initiated elsewhere.

On reopening Chrome, reconcile interrupted attempts as **Failed** and make the page accessible for explicit **Retry**. Do not automatically resume or restart those attempts. Late results from an interrupted attempt must not replace the failed state or the component's content.

Closing only the capture popup or dashboard tab does not count as closing Chrome. The three-second popup duration has no effect on generation lifetime.

## Retry

**Retry** is available in the page editor for one content component, for one facet of a parent component ([below](#retrying-one-facet)) or for the whole page. Completed, failed, empty, missing, or manually edited components can be targets. Capture origin does not matter: a manually created page has a main key and can retry like a captured one.

Before replacing content, always ask. For one component the question is asked beside the card's tab, as for **Delete** ([pages and editing](pages-and-editing.md#components-as-cards)): "Are you sure?" with a final **Retry** and **Cancel** (since 0.6.3). If the content changed after the user answered, for example in another browser, the warning below is shown before anything is replaced:

> Retry will replace this component's content, including your edits to it. The main key, Context, and other components will not change.

For the whole page:

> Retry will replace the content of every generated component on this page, including your edits to them. The main key, Context, and your Text components will not change.

- **Cancel** leaves the page unchanged.
- **Confirm** discards the targeted components' current content and starts a fresh attempt for each. Previous edits and generated output are not preserved or merged into the replacement. If an attempt fails, its component stays empty with a failure indicator; the discarded content is not restored.

Retry uses the page's current saved main key and Context and its content module instances at confirmation time. Each retry generates anew from them: nothing from an earlier attempt is reused, and generated content is never cached ([D17](../architecture/traceability-map.md#entries)). A retry generates the parent's core and every facet it currently has, including facets added since its last attempt, and never a facet the user deleted.

### Retrying one facet

Since 0.7.3 each facet of a parent component has its own **Retry** beside its **Delete** ([pages and editing](pages-and-editing.md#components-as-cards)); since 0.7.4 its tag, pulled out of an open card's edge, holds one too ([facet tags](pages-and-editing.md#facet-tags)). It regenerates that facet alone: the facet's markdown is replaced with its new JSON formatted as markdown, or added when the facet had none (since 0.7.4), and the core and the other facets stay exactly as they are, edits included. A facet waiting for **Retry** can be generated this way without regenerating the rest.

- **Asking.** Beside its label, a facet with content asks "Are you sure?", with a final **Retry** and **Cancel**; one with nothing in it starts at once. The tag's **Retry** never asks (since 0.7.4). If the facet's content changed after the user answered, the dialog warns: "Retry will replace this facet's content, including your edits to it. The rest of the component will not change."
- **Input.** The attempt uses the page's saved main key and Context and the component's current core, with its flags, so the facet follows the core it joins. The provider writes only that facet for the core; anything else it returns is discarded. A facet that does not apply to the core's flags is left out, as in a whole attempt.
- **While it runs.** The component keeps its content and stays open; the spark runs round the facet's tab (since 0.7.4); a facet without content shows its heading, as it always does since D10's sixth amendment, and gains its text if it comes back with content; the component is locked as during any attempt.
- **Failure.** A failed or interrupted facet attempt leaves the content and the component's state as they were before it, and the facet says its Retry failed until the component's next attempt (a facet without a section, through its tag). A facet that was waiting still waits.
- **Availability.** Since 0.7.4 every parent's content is structured, so every facet of a parent with a core can be retried alone ([render contracts](modules.md#render-contracts)).

The warning describes the content shown when it opened. If a targeted component changes before the user confirms, for example through a save from another installation, Retry warns again with the current content instead of replacing content the user has not seen.

Retry updates the same components of the same page and saves the new outcomes automatically. It does not create another page or change any component it did not target. The page's identity and creation time stay the same. The targets stay the same even if the user navigates elsewhere while generation runs.

While an attempt is running on a component, another retry targeting it and manual editing of it are unavailable. Other components remain editable.

The generation lock applies across installations. Another installation may already have an unsaved draft when a component's generation starts. If a manual save arrives that changes any component that is generating, reject that save immediately rather than queueing it. For a save containing several changed components, reject the whole save without updating any of them. Preserve all the user's drafts and explain that a component is still generating. After the attempt finishes, the user can explicitly select **Save** or **Try saving again**; the new save follows the normal server-arrival order. Do not automatically apply the previously rejected save when generation ends.

## Generation record

From 0.8.0 each generated facet of a parent, the core included, records with its component the model and the version of the prompt that produced it ([D11](../architecture/traceability-map.md#entries); [generation architecture](../architecture/generation.md#generation-record)). A whole attempt records them for the core and every facet it generated; a facet's own Retry records them for that facet only, and the other facets keep theirs. A user's edit does not change the record. Components generated before 0.8.0 have none. The interface does not show the record.

## Saving and synchronization failures

Generation outcomes and persistence are distinct. Persisting a page with failed components makes it accessible for retry; it does not label incomplete generation as successful. Never report unsaved content as saved or synchronized.

Ordinary in-flight saves retain their recovery record internally without showing a recovery panel or **Try saving again**. A successful save must not briefly insert such a panel in Recent captures or the deck's page list. If the extension worker stops before a save is acknowledged, make its retained operation available for explicit recovery when the worker starts again; do not silently resubmit it. The existing browser-session interruption rules still apply to generation and publication from an ended session.

If saving or synchronization fails, retain the pending change and offer **Try saving again**. This action only resubmits the same pending save for that page; it does not start another capture, generate content, discard manual edits, or require the retry warning. This is distinct from **Retry**, which starts fresh generation after confirmation.

Account synchronization follows [accounts and synchronization](accounts-and-sync.md). Saved changes from different installations are applied in server-arrival order (FIFO); a later save to the same component replaces the earlier saved content. The generation lock still applies while an attempt is active, and late results from a canceled or interrupted attempt must not overwrite a subsequent save or retry.

## Initial default-deck example

The initial **My Deck** has the main key module, the Context module, and one content module instance: `German`, with Article, Examples, Synonyms and Antonyms ([D08](../architecture/traceability-map.md#entries)). A new deck starts with the same configuration, and so does every account after the D17 upgrade, which discards every deck and page ([scope](../product/scope.md#upgrade-from-earlier-builds)). D17's new German facets are not in it ([K56](../architecture/traceability-map.md#clarifications)).

For the selected input `幸福`, read as a word, the page shows its main key `幸福`, then a `German` component, whose header names the key's language and that it is a word, with its grammatical role since D17: an explanation in German of the word, then the article of its German translation (`das Glück`), examples with their translations, synonyms, and antonyms, following the [modules specification](modules.md#catalog). The exact generated wording may vary.

For a selected sentence such as `我真的很幸福`, the `German` component shows the German translation and, from Examples, one similar sentence with its translation; Article, Synonyms, and Antonyms do not apply to a sentence and are not shown. This is an intentional, successfully completed page.

## Editing after capture

Generated content remains editable. The user opens the page editor to change any component, edit the main key or its Context, write in Text components, or delete the page. Adding, deleting, and moving components is described in [pages and editing](pages-and-editing.md#shaping-a-page). Manual edits require an explicit **Save**. Select and Add and confirmed retries save their outcomes automatically. A later confirmed **Retry** discards the edits on the components it targets along with their previous generation; edits on other components remain unchanged.
