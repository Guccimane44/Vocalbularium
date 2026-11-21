# Module window

The module window is the panel on the right of a page and of deck settings that lists every module the user can add, grouped by family. Dragging a module from it, or its **+**, adds it.

## Getting there

- It is always open beside a [page](page.md) and [deck settings](deck-settings.md). In a narrow window it sits below the content.

## What it shows and what the user can do

### The window

The **module window** is a panel on the right side of both the page view and deck settings. A **?** beside its heading explains how to drag modules in and out, with the pointer and from the keyboard; the explanation shows on hover, or stays open after a click or Enter until Escape, another click, or a click elsewhere. It lists the Context module, the Text module, and the content modules, grouped by module family, under the family names of the [module catalog](../subsystems/module-catalog.md#module-families). The main key module is always present and is not in the window.

- **Groups.** Each family group shows the family mark, its name, and how many modules it holds; it can be collapsed, and the families of modules already on the page start open. The family's mark and name in the group's heading open the family's [page](module-pages.md#the-pages) in the pages' sheet, and the rest of the heading folds the group. A family with no modules yet is not listed; while the search has text, every matching group is open.
- **Search and scrolling.** A search field above the groups filters every module by name and description as the user types. The window stays beside the page as it scrolls and never grows taller than the browser window: its heading and search stay in place, and the groups below the search scroll on their own, fading out at the top and bottom edges, without scrolling the page. In a narrow window, where the module window sits below the page, it is shown at full length.
- **Each module** shows its label and a one-line description of what it contributes. **About** with the module's name, such as **About German**, a text link below the description, opens its module page in the pages' sheet ([modules](module-pages.md#the-pages)); the sheet never adds the module, and closing it returns the focus to the link. A round **+** in the module's bottom-right corner adds it as the last entry, without dragging; it waits at the end like a dropped module and is scrolled into view.
- **No facets.** The window lists no facets, and marks no module as already on the page: a parent's facets are chosen in its [facet window](facet-window.md#the-window).

Dragging a module from the window:

- into deck settings adds an instance to the deck configuration, the template for new pages ([decks and configuration](deck-settings.md#module-window));
- onto a page adds an instance to that page only ([pages and editing](page.md#shaping-a-page)).

A parent is added with its core only ([modules](../subsystems/module-catalog.md#choosing-and-changing-facets)).

A module dragged from the window moves the way an entry being reordered does: over the list it is the entry it will become (an empty card's tab, on a page and in deck settings), lifted and tilted, keeping to the list's column and moving only up and down, while the entries open a gap where it would land; outside the list it follows the pointer in the same form. Dropped, it glides into its gap and stays there as the entry while it is saved. Dragged back onto the window, the module is put back and nothing is added; the window is highlighted while it would take the module back. While a module is dragged, it stays marked in the window, tinted and outlined in its family colour, and the dragged entry carries a focus ring until it is dropped, so it is never confused with entries like it. A module is disabled when the deck or page already holds 12 modules, and the Context module when one is already present; the window says why. On a narrow window the panel moves below the content.

A list entry drags by its label: a card by its tab's family icon and label, a deck-settings module by its icon and name. The six dots before the label open the entry's menu instead. Every drag also works from the keyboard: a window module or an entry's label is focusable; Space picks it up, the arrow keys move it through the landing places, Space drops it, and Escape cancels, putting a window module back. A drag is announced to screen readers when it starts, moves, and ends. There are no separate move buttons.

## Source

| Part | Source |
| --- | --- |
| The window, its groups, search and help | `ModuleWindow`, `WindowModule`, `HelpTip` in [`shaping.tsx`](../../extension/shaping.tsx) |
| Dragging into a list and reordering | `ShapingArea`, `SortableRow`, `LandingRow`, `DropEnd` in [`shaping.tsx`](../../extension/shaping.tsx); `numbered` for German 1 and German 2 |
| Families and their order | the [module catalog](../subsystems/module-catalog.md#module-families) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/module-window.test.mjs`](../../tests/browser/module-window.test.mjs) | Dragging modules onto a page and into deck settings, reordering by drag and keyboard |
| [`tests/browser/page-view.test.mjs`](../../tests/browser/page-view.test.mjs) | The window's search |
| [`tests/browser/motion.test.mjs`](../../tests/browser/motion.test.mjs) | Adding from the window, frame by frame |
| `npm run screens -- --only '^module-window$'` | Every family of the window open, in both themes and six languages |
