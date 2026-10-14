# Shared UI

## Purpose and status

This specification defines interface rules shared across the extension's views. Release 0.5.2 implements the module window of [D02](../architecture/traceability-map.md#entries) as revised by [D04](../architecture/traceability-map.md#entries). [D05](../architecture/traceability-map.md#entries), accepted on 12 October 2026, gives the extension its visual identity, **Vocabularium Sage**; release 0.6.0 implements it ([plan](../plans/visual-identity.md), [scope](../product/scope.md)).

## Visual identity

The [Vocabularium Sage design system](https://claude.ai/artifact/6gmEs5nUHAzKCC4do39u9E) holds the identity's values and references: colour tokens for both themes, type, spacing, radius, motion durations and easings, the brand book, and CSS references for the main components. The extension keeps a copy of its tokens in the repository, so the build never depends on the design system. Where the design system and a specification disagree, the specification wins and the difference is reported.

These rules hold everywhere:

- **Content first.** Main keys and generated content are the largest, darkest things on screen; buttons, status, and settings recede.
- **Colour means module family.** Each module belongs to one family ([modules](modules.md#module-families)), which sets the colour of its index tab and its icon. Apart from status, nothing else uses saturated colour. A family colour always appears with the module's name, or with a text alternative where only the small family mark is shown.
- **Success is quiet.** Completed work shows no status. Only saving, generating, and failed states appear ([list state presentation](#list-state-presentation)).
- **Type.** Main keys, titles, and generated reading text use Fraunces; the interface, translations, and captions use Instrument Sans. Both are bundled with the extension. Chinese and Japanese text uses the system's serif or sans-serif fonts; no font is loaded from the network. Reading text is never smaller than 16 px.
- **Long text.** Every layout handles text of any length without overflow: main keys from one word to a passage ([pages and editing](pages-and-editing.md#required-main-key)), long module names, and right-to-left text, which sets its direction on the component content, never on the card.

## Module window

The **module window** is a panel on the right side of both the page view and deck settings. A **?** beside its heading explains how to drag modules in and out, with the pointer and from the keyboard; the explanation shows on hover, or stays open after a click or Enter until Escape, another click, or a click elsewhere (since 0.6.3). It lists the Context module, the Text module, and the content modules, grouped by module family. Each family group shows the family mark, its name, and how many modules it holds; it can be collapsed, and the families of modules already on the page start open. A family with no modules yet is not listed; while the search has text, every matching group is open. A search field above the groups filters every module by name and description as the user types. Each module shows its label (without angle brackets since 0.5.1) and a one-line description of what it contributes; a module already on the page says so. A parent module lists its facets beneath it, in the parent's order, each with its name ([modules](modules.md#parent-modules-and-facets); [D08](../architecture/traceability-map.md#entries)). The main key module is always present and is not in the window. Dragging a module from it:

- into deck settings adds an instance to the deck configuration, the template for new pages ([decks and configuration](decks-and-configuration.md#module-window));
- onto a page adds an instance to that page only ([pages and editing](pages-and-editing.md#shaping-a-page)).

A parent is added with its core only. Its **facets** are listed beneath it, drawn differently from modules so they read as parts of it, and otherwise work like modules: they are dragged, have a **+**, are searched, and work from the keyboard. Unlike a module, a facet cannot land anywhere: it can only be added to a parent of its own type, on a page or in deck settings ([pages and editing](pages-and-editing.md#shaping-a-page)).

- **Dragging a facet**, the parents that would take it are marked, and it lands only on one of them; dropped anywhere else, it goes back to the window.
- **The facet's +** adds it to the one parent that would take it. When several would, the **+** offers them by label and position to choose from; when none would, because the list has no parent of its type or every such parent already has the facet, the facet is disabled and the window says why.

A module dragged from the window moves the way an entry being reordered does (since 0.6.3): over the list it is the entry it will become (an empty card's tab on a page, a module row in deck settings), lifted and tilted, keeping to the list's column and moving only up and down, while the entries open a gap where it would land; outside the list it follows the pointer in the same form. Dropped, it glides into its gap and stays there as the entry while it is saved. Dragged back onto the window, the module is put back and nothing is added; the window is highlighted while it would take the module back (since 0.5.2). Each module in the window also has a round **+** in its bottom-right corner that adds it as the last entry, without dragging; it waits at the end like a dropped module and is scrolled into view (since 0.6.3; [D04](../architecture/traceability-map.md#entries) had no Add buttons, [D07](../architecture/traceability-map.md#entries) adds them). While a module is dragged, it stays marked in the window, tinted and outlined in its family colour, and the dragged entry carries a focus ring until it is dropped, so it is never confused with entries like it. A module is disabled when the deck or page already holds 12 modules, and the Context module when one is already present; the window says why. On a narrow window the panel moves below the content.

A list entry drags by its label: a card by its tab's family icon and label, a deck-settings module by its icon and name. The six dots before the label open the entry's menu instead ([D07](../architecture/traceability-map.md#entries)). Every drag also works from the keyboard: a window module or an entry's label is focusable; Space picks it up, the arrow keys move it through the landing places, Space drops it, and Escape cancels, putting a window module back. A drag is announced to screen readers when it starts, moves, and ends. There are no separate move buttons ([D04](../architecture/traceability-map.md#entries)).

## Appearance

The extension has two themes, **Sage** (light) and **Moss night** (dark). By default it follows the operating system's light or dark setting and changes with it. The account menu in the shared header offers **System**, **Sage**, and **Moss night**; the sign-in view offers the same choice. The choice is stored per Chrome installation, separately from account data, and survives logout, closing views, restarting the browser, and updating the extension in place. Other installations can choose differently.

Changing the theme, or the system setting while **System** is chosen, updates every open extension view, dialog, and active capture feedback immediately, without losing drafts, selection, navigation, or dialog state, and without restarting the feedback popup's timer. Browser-owned menus and frames follow Chrome's own appearance.

Both themes keep readable hover and focus states, non-color status cues, and usability in forced-colors mode. Normal text targets 4.5:1 contrast; large text and necessary control, status, and focus cues target 3:1 against adjacent colors. Focus is always a visible 2 px ring.

## List state presentation

Lists show status only when something is in progress or needs attention. A completed page or capture shows no status. The status takes the place of the page's meaning line ([page list](pages-and-editing.md#page-list)), so the row keeps its shape:

- **Saving:** a capture receipt still being saved to the account shows a clock and "Saving to your account".
- **Generating:** a page with a component attempt in progress shows three moving dots and "Generating", with the count of finished components when there are several ("Generating 1 of 2").
- **Generation failed:** a page whose current outcome is failed ([capture and generation](capture-and-generation.md#component-completion-and-failure)) shows "Generation failed" on a tinted row, with a visible **Retry…** button. It opens the page at its first failed component, whose card offers **Retry** under the usual rules ([capture and generation](capture-and-generation.md#generation-actions)); the list itself starts no generation.
- **Not saved:** a receipt waiting to be saved again shows "Not saved" and the error on a tinted row, with **Try saving again** as a visible button. That is a save problem, not a generation failure, and nothing implies that the capture was saved.

A row that holds a button is not itself one link: its text links to the page, and the button sits beside it, so each works from the pointer and the keyboard. Status is always a word, never colour alone.

## Motion

Motion is quick and physical: what the user touches responds with a small spring and settles. Nothing moves on its own except work in progress. Durations and easings come from the design system: colour changes 120 ms, revealing hover actions 150 ms, moving things 350 ms with a slight overshoot, larger objects 450 ms, and one cycle of the generating dots 1 s. Elements move by transform and opacity only, a few pixels at a time.

The named moments are: the capture flight ([capture and generation](capture-and-generation.md#capture-feedback-popup)); a new page sliding into a list and its family marks appearing as components finish; status changes cross-fading; generated content rising into its card line by line while the card grows to fit; a module card's tab lifting on hover; a card's actions ejecting from its tab with a spring, one after the other; and a dragged module tilting slightly while the landing line and the other cards make room.

When the system asks for reduced motion, nothing moves: every state change still happens, without transitions, and the generating dots stand still beside their word.

## Dialogs, menus, and feedback

Confirmation dialogs for retry, deletion, and unsaved changes stay open until the user chooses; they never close on a timer. Menus close after an action, on Escape, on navigation, and on a click outside, and return focus to their trigger. The capture feedback popup is defined in [capture and generation](capture-and-generation.md#capture-feedback-popup).

## Text content

Component content is stored as text and rendered for reading. Each content module type has a render contract ([modules](modules.md#render-contracts)): the extension recognizes the module's text format and shows its structure, such as headings, numbered meanings, and examples beside their translations. Text it does not recognize, the user's own text, and edited content that no longer matches the format are shown as plain text with line breaks preserved. Rendering never interprets text as HTML; markup that is not part of a render contract is shown literally. Editing a component shows and saves its stored text, never the rendered form.

Rich block content follows [Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13) and [Q59](../architecture/questionnaire/answers/answers-11-security-privacy.md#q59), which are still `Proposed`; D05 does not change storage ([C17](../architecture/traceability-map.md#conflicts)).
