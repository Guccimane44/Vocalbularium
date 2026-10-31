# Shared UI

## Purpose and status

This specification defines interface rules shared across the extension's views, including the **Vocabularium Sage** visual identity ([D05](../architecture/decisions/d05.md)). [Current scope](../product/scope.md) records which parts are implemented.

## Visual identity

The [Vocabularium Sage design system](https://claude.ai/artifact/6gmEs5nUHAzKCC4do39u9E) holds the identity's values and references: colour tokens for both themes, type, spacing, radius, motion durations and easings, the brand book, and CSS references for the main components. The extension keeps a copy of its tokens in the repository, so the build never depends on the design system. Where the design system and a specification disagree, the specification wins and the difference is reported.

These rules hold everywhere:

- **Content first.** Main keys and generated content are the largest, darkest things on screen; buttons, status, and settings recede.
- **Colour means module family.** Each module belongs to one family ([modules](modules.md#module-families)), which sets the colour of its index tab and its icon. Apart from status, nothing else uses saturated colour. A family colour always appears with the module's name, or with a text alternative where only the small family mark is shown.
- **Success is quiet.** Completed work shows no status. Only saving, generating, and failed states appear ([list state presentation](#list-state-presentation)).
- **Type.** Main keys, titles, and generated reading text use Fraunces; the interface, translations, and captions use Instrument Sans. Both are bundled with the extension. Chinese and Japanese text uses the system's serif or sans-serif fonts; no font is loaded from the network. Reading text is never smaller than 16 px.
- **Long text.** Every layout handles text of any length without overflow: main keys from one word to a passage ([pages and editing](pages-and-editing.md#required-main-key)), long module names, and right-to-left text, which sets its direction on the component content, never on the card.

## Module window

The **module window** is a panel on the right side of both the page view and deck settings. A **?** beside its heading explains how to drag modules in and out, with the pointer and from the keyboard; the explanation shows on hover, or stays open after a click or Enter until Escape, another click, or a click elsewhere. It lists the Context module, the Text module, and the content modules, grouped by module family, under the family names of the [module catalog](modules.md#module-families). The main key module is always present and is not in the window.

- **Groups.** Each family group shows the family mark, its name, and how many modules it holds; it can be collapsed, and the families of modules already on the page start open. The family's mark and name in the group's heading open the family's [page](modules.md#explanations) in the pages' sheet, and the rest of the heading folds the group. A family with no modules yet is not listed; while the search has text, every matching group is open.
- **Search and scrolling.** A search field above the groups filters every module by name and description as the user types. The window stays beside the page as it scrolls and never grows taller than the browser window: its heading and search stay in place, and the groups below the search scroll on their own, fading out at the top and bottom edges, without scrolling the page. In a narrow window, where the module window sits below the page, it is shown at full length.
- **Each module** shows its label and a one-line description of what it contributes. **About** with the module's name, such as **About German**, a text link below the description, opens its module page in the pages' sheet ([modules](modules.md#explanations)); the sheet never adds the module, and closing it returns the focus to the link. A round **+** in the module's bottom-right corner adds it as the last entry, without dragging; it waits at the end like a dropped module and is scrolled into view.
- **No facets.** The window lists no facets, and marks no module as already on the page: a parent's facets are chosen in its [facet window](pages-and-editing.md#facet-window).

Dragging a module from the window:

- into deck settings adds an instance to the deck configuration, the template for new pages ([decks and configuration](decks-and-configuration.md#module-window));
- onto a page adds an instance to that page only ([pages and editing](pages-and-editing.md#shaping-a-page)).

A parent is added with its core only ([modules](modules.md#choosing-and-changing-facets)).

A module dragged from the window moves the way an entry being reordered does: over the list it is the entry it will become (an empty card's tab, on a page and in deck settings), lifted and tilted, keeping to the list's column and moving only up and down, while the entries open a gap where it would land; outside the list it follows the pointer in the same form. Dropped, it glides into its gap and stays there as the entry while it is saved. Dragged back onto the window, the module is put back and nothing is added; the window is highlighted while it would take the module back. While a module is dragged, it stays marked in the window, tinted and outlined in its family colour, and the dragged entry carries a focus ring until it is dropped, so it is never confused with entries like it. A module is disabled when the deck or page already holds 12 modules, and the Context module when one is already present; the window says why. On a narrow window the panel moves below the content.

A list entry drags by its label: a card by its tab's family icon and label, a deck-settings module by its icon and name. The six dots before the label open the entry's menu instead. Every drag also works from the keyboard: a window module or an entry's label is focusable; Space picks it up, the arrow keys move it through the landing places, Space drops it, and Escape cancels, putting a window module back. A drag is announced to screen readers when it starts, moves, and ends. There are no separate move buttons.

## Appearance

The extension has two themes, **Sage** (light) and **Moss night** (dark). By default it follows the operating system's light or dark setting and changes with it. The account menu offers **System**, **Sage**, and **Moss night** as three icons side by side, a screen, a sun and a moon, the current one raised, each named in its tooltip and to screen readers, and choosing one leaves the menu open; the sign-in view offers the same control in its header. The choice is stored per Chrome installation, separately from account data, and survives logout, closing views, restarting the browser, and updating the extension in place. Other installations can choose differently.

Changing the theme, or the system setting while **System** is chosen, updates every open extension view, dialog, and active capture feedback immediately, without losing drafts, selection, navigation, or dialog state, and without restarting the feedback popup's timer. Browser-owned menus and frames follow Chrome's own appearance.

Both themes keep readable hover and focus states, non-color status cues, and usability in forced-colors mode. Normal text targets 4.5:1 contrast; large text and necessary control, status, and focus cues target 3:1 against adjacent colors. Focus is always a visible 2 px ring.

## Interface language

Every interface text is English, in sentence case, and English is the default **language preference** ([D14](../architecture/decisions/d14.md); [Q69](../architecture/questionnaire/13-ux-and-migration.md#q69-which-languages-does-the-ui-speak)). 1.0 ships with the interface localised into the major languages:

- **The languages** for 1.0 are English and the other official UN languages: Arabic, Chinese (Simplified), French, Russian and Spanish. Arabic is written right to left, so every surface mirrors its layout in Arabic, while generated content keeps the direction of its own language. After 1.0 the list grows release by release; a new language is a catalogue of strings and explanations, not a code change.

- **Choosing it.** The account menu has a **Language** row below **Appearance**, showing the current language; it opens the list of languages in the menu's place, each named in itself, the current one ticked, with a way back to the menu. Picking one saves it and closes the menu. A language whose catalogue is not complete and reviewed is listed with "Coming soon" and cannot be picked. A failed save keeps the previous language and says so in the list.
- **The preference** belongs to the account, so every installation shows the same language. It starts as English and does not follow the browser's language unless the user chooses.
- **What it sets:** the interface text, the names and one-line descriptions of modules and facets, the [pages](modules.md#explanations) of families, modules and facets with their samples' key language starting at it, and the language the Expertise modules write in, with that language's writing guide ([modules](modules.md#writing-in-the-interface-language)). The Languages modules keep writing in their own language, and a captured key is never translated by the preference; otherwise the interface language is independent of the language of generated content. A facet's abbreviation, on its [tags](pages-and-editing.md#components-as-cards), its tab and its facet-window row, stays as the catalog gives it in every language.
- **Strings.** Every interface text is an entry of the English catalogue (`extension/locales/en/messages.json`), the source of every other language; no interface text is written into the code, and the localisation test fails on one that is. Two pseudo-languages, never offered, test this in the browser: an accented, lengthened English and a right-to-left one. A language is offered only when its catalogue and pages are complete and reviewed, and its Expertise writing guide and generation have passed review ([modules](modules.md#writing-in-the-interface-language)); until then it is listed as coming soon. Strings are drafted and reviewed by the [string process](../history/plans/localisation.md#string-process).

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

The main key holds plain text, shown with line breaks preserved and never interpreted as HTML; editing it edits that text. The Context and the Text module hold the same markdown as a parent's core, edited with the same toolbar editor. A parent module's content is markdown per facet, drawn into fixed containers ([modules](modules.md#render-contracts)): the core, then one container per facet with content. The editor shows formatting without markdown characters ([pages and editing](pages-and-editing.md#editing-generated-components)). A facet's content can also hold a table, display math in LaTeX rendered with KaTeX, or a fenced code block with syntax highlighting; tables keep their rows and columns on a narrow card by scrolling within their container, a formula that fails to render shows its LaTeX source, and a facet's own Edit edits them as their source text.
