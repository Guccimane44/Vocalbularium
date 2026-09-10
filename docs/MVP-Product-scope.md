# Vocabularium MVP Product Specification

## 1. MVP goal

The first MVP iteration is a Google Chrome extension for the owner's testing on a Windows PC. It is a working prototype to improve through later iterations, with convenient manual delivery rather than a full public release. It must support the following end-to-end experience after login:

1. The user selects a word, phrase, or sentence on a webpage.
2. The user opens the context menu and chooses **Add to default deck**.
3. Vocabularium creates a card from the selected text using the default deck’s configuration.
4. The card is saved automatically to the default deck and becomes available through the dashboard and the deck's card view page.

The MVP includes account-based storage and synchronization, deck and page configuration, generated and manual card creation, manual editing, and card and deck deletion. Automatically opening a newly generated card is deferred beyond the MVP. Empty card pages are valid.

Card content and previews use plain text in this first iteration. Richer rendering and editing interactions, dedicated generation-quality evaluation, and detailed generation limits are deferred to later iterations. The existing module applicability, page-completion, saving, and failure rules still apply.

Duplicate cards are allowed, within a deck or across decks. Repeating Select and Add with the same text creates a separate card, and manually created cards may also contain identical content. The MVP does not block, merge, or warn about matching card content. Each card can be edited or deleted independently.

This document defines MVP scope and shared interaction rules. The [Modules specification](MVP-Product-spec-modules.md) defines the supported modules. The [Select and Add specification](MVP-Product-spec-select-and-add.md) defines capture and generation behavior. These specifications narrow the [general product description](../vocabularium-product-description.md) to the first release.

## 2. Accounts, login, and synchronization

Vocabularium is an account-based product. In the full product, new users register and then log in before using it.

The MVP requires login but does not implement registration. It provides one built-in account:

- Username: `admin`
- Password: `admin`

This is one account with one shared set of decks and cards, not a separate account for each installation. Signing in with this account on another supported Chrome installation gives access to the same data.

Decks, their configurations, the default-deck choice, and saved cards belong to the signed-in account and persist across closing and reopening Chrome. Changes synchronize between installations signed into that account. A save must not be reported as synchronized before it is persisted to the account. Synchronization failures must be visible and offer **Try saving again**, and must not silently discard unsynchronized changes. This action resubmits a pending save without generating content; it is distinct from the destructive **Retry** action on a card page.

Saved changes from multiple installations are applied FIFO: in the order they reach the server, not the order editing began or the times on the devices. If two installations save different text for the same page, the server applies the first save and then the second; the later save becomes that page's final content. The MVP does not merge competing text edits or show a conflict-resolution dialog. Saves to different pages preserve both changes. A save for a page, card, or deck already deleted by an earlier operation fails rather than recreating it.

Saves must also satisfy the [generation-lock rules in Select and Add](MVP-Product-spec-select-and-add.md#retry-the-current-page); FIFO does not override a page's active generation lock.

Clicking the Vocabularium extension button opens the user's dashboard in a Chrome tab when logged in, or the login view otherwise. Successful login opens the dashboard. The user can log out from the dashboard; account data and capture actions are unavailable until login succeeds again. The dashboard is separate from the brief capture-feedback popup.

## 3. Select and Add

When the extension is installed, enabled, initialized, and the user is logged in, the browser context menu must include **Add to default deck** whenever the user has selected text. The action must be unavailable when these conditions are not met.

Select and Add supports words, phrases, and sentences. It uses only the selected text, without additional webpage context, and generates content using the current default deck's pages and modules. Where language interpretation is needed, the MVP automatically chooses one source language per capture and uses it consistently across modules.

Capture creates an automatically saved card record with its original selected text and configured pages. The user can open it from the deck's card view page, including when generation fails; capture does not automatically open the card content page in the MVP. Saving this record does not mean generation succeeded. The [Select and Add specification](MVP-Product-spec-select-and-add.md#page-completion-and-failure) defines generation outcomes and page-level retry.

A popup provides immediate capture feedback. It closes automatically three seconds after appearing and has a manual close control. Closing the popup does not cancel capture or generation. This fixed three-second duration applies only to capture feedback, not to confirmation warnings or editing dialogs. The detailed behavior is in the [Select and Add specification](MVP-Product-spec-select-and-add.md).

Closing Chrome during generation is handled as failure under the [interruption rules in Select and Add](MVP-Product-spec-select-and-add.md#chrome-closing-during-generation).

## 4. Dashboard

The dashboard is the main view for the user's decks.

The dashboard must:

- display all decks created by the user;
- initially include one default deck named **My Deck**;
- provide an **Add new deck** button.

Each deck displayed on the dashboard must support the following interactions:

1. Clicking the deck opens its card view page.
2. Opening the deck’s three-dot menu displays:
   - **Set as default**
   - **Configure deck**
   - **Delete deck**

Selecting **Set as default** makes that deck the user’s default deck. Only one deck can be the default at a time.

Selecting **Configure deck** opens the deck configuration page.

Selecting **Add new deck** opens the configuration page for a new deck. It starts with the same two-page layout as the initial **My Deck**. **Save** creates the deck; **Cancel** discards the new-deck draft. Creating a deck does not change the current default deck.

Selecting **Delete deck** asks for confirmation that the deck and all its cards will be deleted. Canceling leaves both unchanged. Deleting the default deck requires choosing another existing deck as the default in the same action. If it is the only deck, confirmed deletion replaces it with a new, empty **My Deck** using the initial configuration. The account always has exactly one default deck.

## 5. Deck configuration page

The deck configuration page contains two panels:

- the configuration panel;
- the showcase panel.

The showcase panel previews how the deck's cards will appear based on the current configuration. It must display a plain-text preview for each page, including empty pages. Previews use illustrative sample content and are labeled as examples; changing a preview does not create or modify saved cards.

Configuration edits remain a draft until the user selects **Save**. **Cancel** discards unsaved changes. The showcase reflects the draft configuration.

The configuration panel has two layers:

- the general layer;
- the page layer.

### 5.1 General layer

The general layer allows the user to:

- set the deck name;
- choose the number of pages.

For the MVP, a deck may contain between one and four pages. Every card in the deck has the same number and order of pages as its deck. The first page is the mandatory front page and cannot be removed; its content may be empty.

### 5.2 Page layer

The page layer allows the user to configure the contents of each page.

Each page is displayed as a box containing module blocks. The user must be able to:

- add modules to a page;
- remove modules from a page;
- rearrange modules within a page;
- arrange modules in any order;
- switch between pages while configuring the deck.

The page layer must display a module library containing all modules supported by the MVP.

When a user adds a module to a page, the module remains available in the library. The library therefore behaves as if it contains an unlimited number of each module, allowing the same module to be used multiple times on one page or across multiple pages.

The available MVP modules are defined in the [Modules specification](MVP-Product-spec-modules.md). A page may contain no modules, and modules that do not apply to an input contribute no content.

### 5.3 Changes to existing cards

Increasing the page count appends pages. Increasing a deck from two pages to three adds a new third page after the second page on every existing card. These new pages start empty; changing configuration does not automatically generate content for existing cards.

The user can remove a page other than the front page. Reducing the page count through the count control removes pages from the end. Removing a particular page closes the gap: later pages shift forward, preserving their content and relative order. For example, deleting page 2 of a three-page deck makes the old page 3 the new page 2.

Before saving a removal, if any affected page contains content on any card in the deck, show a warning explaining that this content, including manual edits, will be deleted. The user must confirm to proceed. Canceling leaves the saved configuration and card content unchanged. Removing an empty page does not require this content-loss warning. The one-to-four-page limit always applies.

Adding, removing, or rearranging modules changes the generation instructions for future captures and explicitly requested page retries. Saving configuration does not automatically regenerate, remove, or reorder content already saved on existing card pages. Existing page content changes through manual editing, a confirmed **Retry** on that page, or deletion of the whole page as described above.

## 6. Default deck

The MVP creates one default deck named **My Deck** when the built-in account is first initialized, not on every login or installation.

Its initial configuration is:

- Page 1: `<The selected>`
- Page 2: `<German explanation + examples>`

If the user sets another deck as the default, **My Deck** is no longer the default deck. There can be only one default deck at a time.

A sentence captured with this initial configuration has the selected sentence on page 1 and an empty page 2, because `<German explanation + examples>` does not apply to sentences. This is a valid completed card, not a generation failure. The user may configure a `<Sentence usage>` module and retry page 2, use the updated layout for future captures, or manually add content to the saved card.

## 7. Card view page

Clicking a deck on the dashboard opens its card view page.

The card view page displays all cards in the selected deck as a list with two columns:

1. **Index** — a presentation-only sequential number.
2. **Entry** — the text shown on the card’s first page.

Clicking an entry opens that card's **card content page**. If the first page has multiple pieces of text, the entry presents them in their displayed order. If it contains no text, show **Empty front page** as a clickable placeholder; this label is not saved into the card.

The page also provides **Add card manually**, which opens a new draft card on the card content page in manual edit mode. The draft has the deck's current pages, initially empty, and generation is not required.

The index is not created when the card is saved and is not stored as part of the card’s persistent data. It is calculated from the current ordering of the list and recalculated whenever that ordering changes.

For the MVP, the card view supports these ordering options:

- **Creation time, newest to oldest**
- **Creation time, oldest to newest**
- **Alphabetical, A to Z**
- **Alphabetical, Z to A**

When the order is set to **Creation time, newest to oldest**, the newest card is assigned index `001`, the next card `002`, and so on.

When the order is set to **Alphabetical, A to Z**, the first entry alphabetically is assigned index `001`, regardless of when the card was created.

The index identifies a card’s current position in the displayed list. It is not a permanent card identifier and may change when the user selects a different ordering or when cards are added or removed.

Cards with equal sort values must use a consistent secondary order so that the displayed list remains stable.

## 8. Card content page and manual editing

The card content page displays one card, or a new draft card in manual edit mode. Page content is rendered as plain text, preserving line breaks and displaying any markup literally. A horizontal page-navigation bar lets the user select its pages in deck order. Every page has a navigation item, including pages with no content. Empty pages remain accessible and editable.

The card content page includes an **Edit card manually** button. In the first iteration, it opens a simple multiline plain-text editor for the selected page. The user can add, correct, supplement, rearrange, or remove text directly. This applies to generated cards and manually created cards alike. Manual content is not restricted by module applicability; a user may add content to a page for which no module produced output. Adding or deleting whole pages remains a deck-configuration action affecting all cards in that deck. Rich-text formatting and editing separate module-output blocks are deferred; the deck configuration still uses module blocks to define generation.

Switching pages through the horizontal navigation bar while editing retains each page's unsaved draft. Navigating between pages does not save or discard their edits and does not leave manual edit mode. Returning to a page restores its current draft text.

Manual edit mode provides:

- **Save** — persists the new card or all changed pages of the existing card, including drafts on pages other than the currently selected page, and returns to its content view.
- **Cancel** — discards all unsaved page drafts in the editing session. Canceling a new card returns to the deck's card view; canceling edits returns to the unchanged saved card.
- **Delete card** — for an existing saved card, asks for confirmation and then deletes it and returns to the deck's card view.

Leaving manual edit mode with unsaved changes must offer the user a choice to save, discard, or continue editing. Manual changes are not saved automatically. A failed save must preserve the draft and offer **Try saving again**, without invoking page generation.

Saving a manual card or edit also synchronizes it with the account. Editing a card's first-page text updates its entry and its position under alphabetical ordering. Editing does not change the card's original creation time.

Saving edits to an existing card updates only the pages the user changed, so an unchanged page in one installation does not overwrite an edit from another installation. Competing saves to the same page follow the FIFO rule in section 2.

### 8.1 Retry the current page

Captured cards support **Retry** for the current page, replacing its content after confirmation. The [Retry section in Select and Add](MVP-Product-spec-select-and-add.md#retry-the-current-page) is the authoritative source for availability, warnings, input and configuration choices, replacement behavior, and saving. Its [page-completion section](MVP-Product-spec-select-and-add.md#page-completion-and-failure) defines success and failure.

## 9. MVP completion criteria

The MVP must allow a user to:

1. Log in with the built-in account and open the dashboard through the extension button.
2. Create and configure decks, preview every page, and change the single default deck.
3. Capture words, phrases, and sentences into automatically saved cards using the five supported module types, including creating separate cards by capturing the same text again.
4. Handle failed generation and retry the current page according to the [Select and Add rules](MVP-Product-spec-select-and-add.md#retry-the-current-page).
5. Browse and sort a deck's card list, open a card, and navigate all of its pages with the horizontal bar.
6. Create cards manually, explicitly save edits, and delete cards and decks.
7. Add pages to existing cards and confirm any page removal that would delete saved content.
8. Reopen Chrome or log into the same account from another installation and access synchronized decks, configurations, and cards.
9. See capture feedback in a popup that closes after three seconds or when closed manually, without canceling generation.
10. Handle closing and reopening Chrome during generation according to the [interruption rules](MVP-Product-spec-select-and-add.md#chrome-closing-during-generation).
11. Save changes from two installations in server-arrival order: later saves to the same page replace earlier ones, while changes to different pages are both retained.

Registration and automatic opening of a generated card are outside the MVP. These specifications do not add a separate iOS client or a memorization/review workflow to the MVP.

## 10. First-iteration delivery and deferred work

The owner will use the built-in account to test the MVP in Chrome on a Windows PC. Deliver the extension files through a convenient manual installation method, with brief Windows installation and update instructions. The exact packaging method can be chosen during implementation. A Chrome Web Store listing, public onboarding, a full release process, and broad platform certification are not required for this iteration.

Later iterations will address richer card rendering and manual-editing design, systematic generation-quality evaluation, and detailed generation limits. These are follow-up areas, not prerequisites for planning the first working MVP. Implementation may choose basic runtime defaults for the initial test version and record them with its setup instructions.
