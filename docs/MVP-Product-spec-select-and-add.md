# Select and Add

This specification defines capture and generation for the [MVP scope](history/mvp/MVP-Product-scope.md). The supported modules and their applicability are defined in the [Modules specification](history/mvp/MVP-Product-spec-modules.md).

This document is the authoritative source for detailed seite-completion, failure, interruption, and retry behavior. The scope, module specification, and general product description summarize and link to these rules.

## Availability and default deck

When the Chrome extension is installed, enabled, initialized, and the user is logged in, its browser context-menu action **Create a karte in “{default deck name}”** is available for selected text. Capture is unavailable before login. The label names the last successfully synchronized default deck. It updates after successful initialization, login, default changes, renames, replacement/deletion, and account refreshes. Other installations' changes appear on the next successful synchronization, including background recovery while Chrome is running. Offline use retains the last synchronized name; unsaved drafts do not change the label. Logout, expired access, or missing default/session readiness make capture unavailable. Label updates do not replace the generation session. The MVP uses the built-in `admin` account described in the scope document; it does not implement registration.

The account initially has one default deck, **My Deck**. The user can configure this deck or set another deck as the default from the dashboard. There is exactly one default deck per account, and its choice synchronizes with the account.

The default deck defines the seites and modules used by Select and Add. Supported inputs are words, phrases, and sentences.

## Capture scenario

1. A logged-in user is reading a webpage and selects an unfamiliar word, phrase, or sentence, such as `幸福`.
2. The user right-clicks the selection and chooses **Create a karte in “{default deck name}”**.
3. Vocabularium takes the selected text exactly as selected. It does not include surrounding webpage text or other webpage context.
4. It automatically saves a karte record containing the original selected text and the configured seites to the destination deck. This record remains accessible if generation later fails; its existence does not mean generation succeeded.
5. Where required by the configured modules, it determines the input type and one source language from the selected text. It evaluates the modules in the default deck's configuration.
6. For each seite, it publishes content in module order only if every applicable module on that seite completes. Inapplicable modules produce no content; their seites still exist. If any applicable module fails, the seite attempt fails and none of that attempt's output is published.
7. It automatically saves and synchronizes seite content and generation outcomes with the account. The user does not need to select **Save**. A karte with any failed seite has a failed generation outcome, not partial success.

The destination is the default deck at the time the capture action is invoked. Changing the default deck while generation is running does not redirect that capture. Each karte belongs to exactly one deck.

Each separate **Create a karte in “{default deck name}”** action creates a new karte, even if the same selected text or resulting content already exists in that deck or another deck. Duplicate kartes are allowed without a warning, automatic merging, or content-based deduplication. They remain independently editable and deletable.

Initial generation starts with the seite and module configuration at capture time. Changes to modules apply to subsequent captures and explicitly requested seite retries, not to an attempt already running. If seites are added while a capture is running, those additional seites remain empty on its resulting karte. If seites are removed, output for those removed seites is discarded; output for retained seites follows those seites into their current order. Deleting a karte or its destination deck cancels its pending generation and retries; they must not recreate deleted kartes, decks, or seites.

The saved karte record appears in the destination deck's karte view page, including while generation is loading or after it fails. Clicking its row opens the **karte content page**, where a horizontal bar navigates its seites and **Retry** applies to the current seite. Seite content is plain text, including literal markup, following the [Modules specification](history/mvp/MVP-Product-spec-modules.md). The MVP does not automatically open the newly generated karte or move the user away from the webpage they are reading.

Clicking the extension button opens the dashboard in a Chrome tab. The dashboard provides access to recent capture outcomes and their destination decks, including requests that have not yet produced a saved karte. A new capture remains visible while its local pending receipt hands off to the saved account karte; a delayed account refresh must not briefly remove the row.

## Capture-feedback popup

When Select and Add accepts the selected text, immediately show a brief popup confirming receipt, such as **Capture received**. This confirms that the request was received, not that generation or account saving has completed. If the capture cannot be accepted, show a failure message instead.

The same popup appears on ordinary webpages and the originating Vocabularium dashboard, with identical wording, page-relative top-right placement, dimensions, styling, close control, and Light/Dark behavior. Dashboard capture creates no additional Chrome window and does not change focus or route. Other open dashboards do not receive its feedback. Account rerenders preserve the popup; theme changes update its appearance without restarting its timer. If the originating dashboard closes or navigates away, capture continues without redirecting feedback or opening a window. Chrome-restricted external pages retain the separate feedback-window fallback.

The popup closes automatically three seconds after it appears. This duration is fixed at three seconds for the MVP. It also includes a close control so the user can dismiss it sooner. Each new capture receives its own feedback with the same three-second duration.

Closing the popup manually or waiting for it to disappear does not cancel the capture, end generation, or open the generated karte. Generation may take longer than the popup's lifetime; progress and final outcomes remain available in the dashboard and karte content page.

This transient popup is separate from the dashboard and from confirmation dialogs. Retry warnings, deletion warnings, and unsaved-edit choices do not close automatically after three seconds.

## Input interpretation

Only the selected text is used to determine whether the input is a word/phrase or a sentence and which source language applies. For ambiguous text, the MVP chooses one language automatically and uses it consistently across the karte's modules. It does not generate separate interpretations for multiple source languages. Target languages are defined by the modules, not by a fixed language-pair setting for the deck.

The shared interpretation rules are defined in the [Modules specification](history/mvp/MVP-Product-spec-modules.md).

## Seite completion and failure

Generation-status labels describe actual generation attempts. A seite that has never had a generation attempt shows no generation-status label. This includes seites of manually created kartes and newly appended seites on existing kartes. They remain normally viewable and editable. A karte with no generation attempts on any seite also shows no overall generation-status label.

When generation has been attempted, the user sees the karte's overall generation outcome and the status of the current seite where applicable, not individual module statuses. Each seite attempt has one of these generation states:

- **Loading:** required interpretation or seite generation is in progress.
- **Completed:** every applicable module on the seite has completed. Publish the seite's complete output together. Modules that do not apply are skipped and do not count as failures.
- **Failed:** any required interpretation or applicable module on the seite failed, including when some other modules succeeded. Discard all output from this seite attempt and show a failure indicator on the empty seite. Partial generation is failure; there is no partial-success state or partially generated seite to accept.

For example, if a seite contains two `<Sentence usage>` instances and only one succeeds, discard that successful example as well. The seite has failed, and a subsequent seite retry generates both examples again.

Fully completed seites elsewhere on the karte remain intact. Seites with no generation attempt are excluded from the karte's overall generation outcome. If any seite's current generation state is **Failed**, the karte's overall generation outcome is **Failed**. Otherwise it is **Loading** while an attempt is running, and **Completed** when the requested seite generation has completed. Confirming a retry moves its target seite to **Loading**, then to **Completed** or **Failed** according to that attempt's outcome, including when that seite previously had no status label. Saving a karte record or manually adding content does not turn a failed generation attempt into a successful one; outside an active retry, the seite's failure indicator describes its last generation attempt.

When a generation attempt evaluates a seite with no modules or only inapplicable modules, it completes successfully with no content. A seite containing only `<The selected>` completes without generative output. The same module's output does not rescue a seite on which another applicable module failed. A karte still has all its configured seites even when they are empty.

### Generation capacity

The local API admits only a bounded number of active and waiting seite attempts. When a capture is saved while generation capacity is full, its karte remains saved and accessible. Each seite attempt that cannot be admitted becomes **Failed** without a provider call. The user can explicitly **Retry** a failed seite later. A successful karte save or capture feedback does not imply that generation was admitted or completed.

If capacity is full when the user confirms **Retry** for a seite, report that generation is busy and leave that seite's existing content and generation state unchanged. The user may confirm a fresh **Retry** later. The rejected confirmation is not kept as an automatic or **Try saving again** generation request. An admitted retry follows the replacement rules below.

## Chrome closing during generation

If Chrome closes on the installation that started a capture or seite retry, its unfinished generation is considered failed. For an initial capture, mark unfinished seite attempts failed; fully completed and saved seites remain intact. For a seite retry, the affected seite remains empty and failed under the existing replacement rule. Closing Chrome on another installation does not fail work initiated elsewhere.

On reopening Chrome, reconcile interrupted attempts as **Failed** and make the saved karte accessible for explicit seite-level **Retry**. Do not automatically resume or restart those attempts. Late results from an interrupted attempt must not replace the failed state or its seite content.

Closing only the capture popup or dashboard tab does not count as closing Chrome. The three-second popup duration has no effect on generation lifetime.

## Retry the current seite

**Retry** is available on the karte content page for the seite currently selected in the horizontal navigation bar. It can be used on a completed, failed, empty, or manually edited seite of a karte created through Select and Add. There is no whole-karte or individual-module retry action in the MVP.

Before starting, always show this confirmation warning:

> Retry will delete all content on this seite, including manual edits and previous generated content, and generate it again. Other seites will not change.

- **Cancel** leaves the current seite and its content unchanged.
- **Confirm** discards all current content on that seite and starts a fresh generation attempt. Previous manual edits, additions, removals, and generated output are not preserved or merged into the replacement. If the new attempt fails, the seite remains empty with a failure indicator; the discarded content is not restored.

Retry evaluates every module configured for that seite and generates fresh output for every applicable module, including instances that succeeded previously. It uses the original selected text, the karte's established input classification and single source language, and the seite's current saved deck configuration at confirmation time. If required interpretation has not yet succeeded, establish it first. Changes to configuration after the attempt starts do not change that attempt. Manual edits to displayed karte content do not change the original selected text used for generation.

Retry updates the same seite of the same karte and saves the new outcome automatically. It does not create another karte, regenerate other seites, or change their content or manual edits. If the retry targets seite 1, the displayed list entry and alphabetical position follow the changed first-seite text; the karte's identity and creation time stay the same. The selected seite stays the target even if the user navigates to another seite while generation runs.

Finish manual edit mode with **Save** or **Cancel** before using **Retry**. While an attempt is running on a seite, another retry and manual editing on that seite are unavailable. A manually created karte has no captured generation input, so it has no **Retry** action in the MVP.

The generation lock applies across installations. Another installation may already have an unsaved draft when a seite's generation starts. If a manual save arrives while any seite it changes is generating, reject that save immediately rather than queueing it. For a save containing several changed seites, reject the whole save without updating any of them. Preserve all the user's drafts and explain that a seite is still generating. After the attempt finishes, the user can explicitly select **Save** or **Try saving again**; the new save follows the normal server-arrival order. Do not automatically apply the previously rejected save when generation ends.

## Saving and synchronization failures

Seite generation outcomes and persistence are distinct. Persisting a failed karte record makes it accessible for seite-level retry; it does not label incomplete generation as successful. Never report unsaved content as saved or synchronized.

Ordinary in-flight saves retain their recovery record internally without showing a recovery panel or **Try saving again**. A successful save must not briefly insert such a panel in Recent captures or the deck karte list. If the extension worker stops before a save is acknowledged, make its retained operation available for explicit recovery when the worker starts again; do not silently resubmit it. The existing browser-session interruption rules still apply to generation and publication from an ended session.

If saving or synchronization fails, retain the pending change and offer **Try saving again**. This action only resubmits the same pending save for that karte; it does not start another capture, generate content, discard manual edits, or require the destructive seite-retry warning. This is distinct from **Retry** on the current karte seite, which starts fresh generation after confirmation.

Account synchronization follows the [MVP scope](history/mvp/MVP-Product-scope.md). Saved changes from different installations are applied in server-arrival order (FIFO); a later save to the same seite replaces the earlier saved text. The current seite's generation lock still applies while an attempt is active, and late results from a canceled or interrupted attempt must not overwrite a subsequent save or retry.

## Initial default-deck example

The initial **My Deck** has two seites:

- Seite 1: `<The selected>`
- Seite 2: `<German explanation + examples>`

For the selected input `幸福`, interpreted as Chinese in this example, seite 1 renders:

```text
幸福
```

Seite 2 renders German-language explanation content for the Chinese word, with Chinese examples and their German translations, following the format in the [Modules specification](history/mvp/MVP-Product-spec-modules.md). The exact generated wording may vary.

For a selected sentence such as `我真的很幸福`, seite 1 renders that sentence and seite 2 remains empty: `<German explanation + examples>` does not apply to sentences. This is an intentional, successfully completed karte. A user can add `<Sentence usage>` to the deck configuration and retry seite 2, use that configuration for future captures, or manually edit this saved karte.

## Editing after capture

Generated content remains editable. The user opens the karte content page and selects **Edit karte manually** to add, change, or remove content, or to delete the karte. Manual edits require an explicit **Save**. Select and Add and confirmed seite retries save their outcomes automatically. A later confirmed **Retry** discards all saved manual edits on its target seite along with the previous generation; manual edits on other seites remain unchanged.
