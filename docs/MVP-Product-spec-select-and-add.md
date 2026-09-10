# Select and Add

This specification defines capture and generation for the [MVP scope](MVP-Product-scope.md). The supported modules and their applicability are defined in the [Modules specification](MVP-Product-spec-modules.md).

This document is the authoritative source for detailed page-completion, failure, interruption, and retry behavior. The scope, module specification, and general product description summarize and link to these rules.

## Availability and default deck

When the Chrome extension is installed, enabled, initialized, and the user is logged in, its browser context-menu action **Add to default deck** is available for selected text. Capture is unavailable before login. The MVP uses the built-in `admin` account described in the scope document; it does not implement registration.

The account initially has one default deck, **My Deck**. The user can configure this deck or set another deck as the default from the dashboard. There is exactly one default deck per account, and its choice synchronizes with the account.

The default deck defines the pages and modules used by Select and Add. Supported inputs are words, phrases, and sentences.

## Capture scenario

1. A logged-in user is reading a webpage and selects an unfamiliar word, phrase, or sentence, such as `幸福`.
2. The user right-clicks the selection and chooses **Add to default deck**.
3. Vocabularium takes the selected text exactly as selected. It does not include surrounding webpage text or other webpage context.
4. It automatically saves a card record containing the original selected text and the configured pages to the destination deck. This record remains accessible if generation later fails; its existence does not mean generation succeeded.
5. Where required by the configured modules, it determines the input type and one source language from the selected text. It evaluates the modules in the default deck's configuration.
6. For each page, it publishes content in module order only if every applicable module on that page completes. Inapplicable modules produce no content; their pages still exist. If any applicable module fails, the page attempt fails and none of that attempt's output is published.
7. It automatically saves and synchronizes page content and generation outcomes with the account. The user does not need to select **Save**. A card with any failed page has a failed generation outcome, not partial success.

The destination is the default deck at the time the capture action is invoked. Changing the default deck while generation is running does not redirect that capture. Each card belongs to exactly one deck.

Each separate **Add to default deck** action creates a new card, even if the same selected text or resulting content already exists in that deck or another deck. Duplicate cards are allowed without a warning, automatic merging, or content-based deduplication. They remain independently editable and deletable.

Initial generation starts with the page and module configuration at capture time. Changes to modules apply to subsequent captures and explicitly requested page retries, not to an attempt already running. If pages are added while a capture is running, those additional pages remain empty on its resulting card. If pages are removed, output for those removed pages is discarded; output for retained pages follows those pages into their current order. Deleting a card or its destination deck cancels its pending generation and retries; they must not recreate deleted cards, decks, or pages.

The saved card record appears in the destination deck's card view page, including while generation is loading or after it fails. Clicking its entry opens the **card content page**, where a horizontal bar navigates its pages and **Retry** applies to the current page. Page content is plain text, including literal markup, following the [Modules specification](MVP-Product-spec-modules.md). The MVP does not automatically open the newly generated card or move the user away from the webpage they are reading.

Clicking the extension button opens the dashboard in a Chrome tab. The dashboard provides access to recent capture outcomes and their destination decks, including requests that have not yet produced a saved card.

## Capture-feedback popup

When Select and Add accepts the selected text, immediately show a brief popup confirming receipt, such as **Capture received**. This confirms that the request was received, not that generation or account saving has completed. If the capture cannot be accepted, show a failure message instead.

The popup closes automatically three seconds after it appears. This duration is fixed at three seconds for the MVP. It also includes a close control so the user can dismiss it sooner. Each new capture receives its own feedback with the same three-second duration.

Closing the popup manually or waiting for it to disappear does not cancel the capture, end generation, or open the generated card. Generation may take longer than the popup's lifetime; progress and final outcomes remain available in the dashboard and card content page.

This transient popup is separate from the dashboard and from confirmation dialogs. Retry warnings, deletion warnings, and unsaved-edit choices do not close automatically after three seconds.

## Input interpretation

Only the selected text is used to determine whether the input is a word/phrase or a sentence and which source language applies. For ambiguous text, the MVP chooses one language automatically and uses it consistently across the card's modules. It does not generate separate interpretations for multiple source languages. Target languages are defined by the modules, not by a fixed language-pair setting for the deck.

The shared interpretation rules are defined in the [Modules specification](MVP-Product-spec-modules.md).

## Page completion and failure

Generation-status labels describe actual generation attempts. A page that has never had a generation attempt shows no generation-status label. This includes pages of manually created cards and newly appended pages on existing cards. They remain normally viewable and editable. A card with no generation attempts on any page also shows no overall generation-status label.

When generation has been attempted, the user sees the card's overall generation outcome and the status of the current page where applicable, not individual module statuses. Each page attempt has one of these generation states:

- **Loading:** required interpretation or page generation is in progress.
- **Completed:** every applicable module on the page has completed. Publish the page's complete output together. Modules that do not apply are skipped and do not count as failures.
- **Failed:** any required interpretation or applicable module on the page failed, including when some other modules succeeded. Discard all output from this page attempt and show a failure indicator on the empty page. Partial generation is failure; there is no partial-success state or partially generated page to accept.

For example, if a page contains two `<Sentence usage>` instances and only one succeeds, discard that successful example as well. The page has failed, and a subsequent page retry generates both examples again.

Fully completed pages elsewhere on the card remain intact. Pages with no generation attempt are excluded from the card's overall generation outcome. If any page's current generation state is **Failed**, the card's overall generation outcome is **Failed**. Otherwise it is **Loading** while an attempt is running, and **Completed** when the requested page generation has completed. Confirming a retry moves its target page to **Loading**, then to **Completed** or **Failed** according to that attempt's outcome, including when that page previously had no status label. Saving a card record or manually adding content does not turn a failed generation attempt into a successful one; outside an active retry, the page's failure indicator describes its last generation attempt.

When a generation attempt evaluates a page with no modules or only inapplicable modules, it completes successfully with no content. A page containing only `<The selected>` completes without generative output. The same module's output does not rescue a page on which another applicable module failed. A card still has all its configured pages even when they are empty.

## Chrome closing during generation

If Chrome closes on the installation that started a capture or page retry, its unfinished generation is considered failed. For an initial capture, mark unfinished page attempts failed; fully completed and saved pages remain intact. For a page retry, the affected page remains empty and failed under the existing replacement rule. Closing Chrome on another installation does not fail work initiated elsewhere.

On reopening Chrome, reconcile interrupted attempts as **Failed** and make the saved card accessible for explicit page-level **Retry**. Do not automatically resume or restart those attempts. Late results from an interrupted attempt must not replace the failed state or its page content.

Closing only the capture popup or dashboard tab does not count as closing Chrome. The three-second popup duration has no effect on generation lifetime.

## Retry the current page

**Retry** is available on the card content page for the page currently selected in the horizontal navigation bar. It can be used on a completed, failed, empty, or manually edited page of a card created through Select and Add. There is no whole-card or individual-module retry action in the MVP.

Before starting, always show this confirmation warning:

> Retry will delete all content on this page, including manual edits and previous generated content, and generate it again. Other pages will not change.

- **Cancel** leaves the current page and its content unchanged.
- **Confirm** discards all current content on that page and starts a fresh generation attempt. Previous manual edits, additions, removals, and generated output are not preserved or merged into the replacement. If the new attempt fails, the page remains empty with a failure indicator; the discarded content is not restored.

Retry evaluates every module configured for that page and generates fresh output for every applicable module, including instances that succeeded previously. It uses the original selected text, the card's established input classification and single source language, and the page's current saved deck configuration at confirmation time. If required interpretation has not yet succeeded, establish it first. Changes to configuration after the attempt starts do not change that attempt. Manual edits to displayed card content do not change the original selected text used for generation.

Retry updates the same page of the same card and saves the new outcome automatically. It does not create another card, regenerate other pages, or change their content or manual edits. If the retry targets page 1, the displayed list entry and alphabetical position follow the changed first-page text; the card's identity and creation time stay the same. The selected page stays the target even if the user navigates to another page while generation runs.

Finish manual edit mode with **Save** or **Cancel** before using **Retry**. While an attempt is running on a page, another retry and manual editing on that page are unavailable. A manually created card has no captured generation input, so it has no **Retry** action in the MVP.

The generation lock applies across installations. Another installation may already have an unsaved draft when a page's generation starts. If a manual save arrives while any page it changes is generating, reject that save immediately rather than queueing it. For a save containing several changed pages, reject the whole save without updating any of them. Preserve all the user's drafts and explain that a page is still generating. After the attempt finishes, the user can explicitly select **Save** or **Try saving again**; the new save follows the normal server-arrival order. Do not automatically apply the previously rejected save when generation ends.

## Saving and synchronization failures

Page generation outcomes and persistence are distinct. Persisting a failed card record makes it accessible for page-level retry; it does not label incomplete generation as successful. Never report unsaved content as saved or synchronized.

If saving or synchronization fails, retain the pending change and offer **Try saving again**. This action only resubmits the same pending save for that card; it does not start another capture, generate content, discard manual edits, or require the destructive page-retry warning. This is distinct from **Retry** on the current card page, which starts fresh generation after confirmation.

Account synchronization follows the [MVP scope](MVP-Product-scope.md). Saved changes from different installations are applied in server-arrival order (FIFO); a later save to the same page replaces the earlier saved text. The current page's generation lock still applies while an attempt is active, and late results from a canceled or interrupted attempt must not overwrite a subsequent save or retry.

## Initial default-deck example

The initial **My Deck** has two pages:

- Page 1: `<The selected>`
- Page 2: `<German explanation + examples>`

For the selected input `幸福`, interpreted as Chinese in this example, page 1 renders:

```text
幸福
```

Page 2 renders German-language explanation content for the Chinese word, with Chinese examples and their German translations, following the format in the [Modules specification](MVP-Product-spec-modules.md). The exact generated wording may vary.

For a selected sentence such as `我真的很幸福`, page 1 renders that sentence and page 2 remains empty: `<German explanation + examples>` does not apply to sentences. This is an intentional, successfully completed card. A user can add `<Sentence usage>` to the deck configuration and retry page 2, use that configuration for future captures, or manually edit this saved card.

## Editing after capture

Generated content remains editable. The user opens the card content page and selects **Edit card manually** to add, change, or remove content, or to delete the card. Manual edits require an explicit **Save**. Select and Add and confirmed page retries save their outcomes automatically. A later confirmed **Retry** discards all saved manual edits on its target page along with the previous generation; manual edits on other pages remain unchanged.
