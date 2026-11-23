# Facet window

The facet window chooses which facets a parent card has and in what order. It opens beside the card on a page, or beside a module in deck settings, and lists the facets the module's catalog offers.

## Getting there

- **Facet** among a parent card's actions on a [page](page.md) (click its tab, or Enter on it).
- **Facet** among a parent module's actions, from its tab, in [deck settings](deck-settings.md).
- It has no route of its own; it opens over the screen it belongs to.

## What it shows and what the user can do

### The window

A parent's facets are chosen in its **facet window**, opened by **Facet** among the card's actions. It unfolds from just below **Facet**, which stays lit while it is open, the card's other actions still out beside it: a panel on the surface colour, every corner rounded alike, opening downward while its rows drop in one after another with the spring the actions eject with. While it is open the card's content steps back to 30%, as it does under the card's dropdowns. It holds a heading naming the parent by its tag, such as "Facets of [German 2]", with a close (**×**) at its end, then two groups, each in the module's order, the core excepted. **On this card** lists the facets the parent has, each row in a pale tint of the family colour with its filled abbreviation mark, its name in bold, its **›** and its **Remove** (**×**). **Add** lists the others, each with its outlined mark, its name, and an **Add** (**+**) in the family colour; its **›** shows while the row is pointed at or holds the focus. A group with no facet is left out. A parent holds at most 12 facets: once it holds 12, the **Add** group's **+** buttons are unavailable and the line "A card holds at most 12 facets. Remove one to add another." stands beneath the group's name; removing a facet makes them available again. Facets that do not apply to the page's main key, such as Article on a sentence, are listed too; their page says what they apply to.

- **Adding** a facet with its **+** adds it at once: its tag flies from its row to the card, its row moves to **On this card**, and it waits for **Retry** like any added facet ([shaping](page.md#shaping-a-page)).
- **Removing** a facet without content with its **×**, such as one waiting for **Retry**, removes it at once and its row moves to **Add**. Removing one with content asks first, on a line beneath its row, as a facet's **Delete** does beside its label: "Are you sure?", the final **Delete** and **Cancel** under the pointer. A removed facet's tag pops.
- **Facet page.** Each row's **›** opens the facet's [page](module-pages.md#the-pages) in the pages' sheet; the window stays open beneath it.
- **Closing.** The window stays open for more choices until Escape, its close, a click outside, or another of the card's actions; Escape and the close return the focus to **Facet**, the card's actions still out; a second Escape puts them back. **Facet** itself also opens and closes the window.
- **From the keyboard.** Opening the window moves the focus to its first row's **×** or **+**. They are buttons named "Remove Article" and "Add Synonyms", in lists named by their group, in a group named by the heading, such as "Facets of German 2"; each **›** is a button such as "About Article". After a facet moves, the focus follows it to its new button.

A parent that is generating takes no facet and loses none until its attempt finishes, so its **Facet** is disabled meanwhile. Deck settings use the same window ([the configuration](deck-settings.md#the-configuration)). The module window lists no facets. Under reduced motion the window and the pages' sheet appear without sliding, and tags without flying.

## Source

| Part | Source |
| --- | --- |
| The window, its ticks and its question | `FacetWindow`, `FacetQuestion` in [`facet-window.tsx`](../../extension/facet-window.tsx) |
| The flight of a tag to the card | `launchFacet` in [`facet-tags.tsx`](../../extension/facet-tags.tsx) |
| The limit | [`facet-limit.ts`](../../extension/facet-limit.ts) |
| Which facets a module offers | the module's facets in the [module catalog](../subsystems/module-catalog.md) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/facets.test.mjs`](../../tests/browser/facets.test.mjs) | The window on a parent, its question, waiting and deleted facets, and the window from the keyboard |
| [`tests/browser/module-pages.test.mjs`](../../tests/browser/module-pages.test.mjs) | Facet pages opened from the window |
| `npm run screens -- --only '^facet-window$'` | German's facet window, in both themes and six languages |
