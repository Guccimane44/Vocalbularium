# Deck settings

Deck settings name a deck, choose its colour, and set the modules (and their facets) that new pages in it start with. A change never reaches existing pages ([configuration and pages](../subsystems/store.md#configuration-and-pages)). The same screen makes a new deck.

## Getting there

- **Configure deck** (the gear) on a deck's card on Home or in the [deck](deck.md)'s head. Route: `app.html#configure/<deck id>`. Trail: *Home › the deck › Deck settings*.
- **+ New deck** on Home or in the sidebar. Route: `app.html#configure/new`. Trail: *Home › New deck*.
- Leaving by a crumb discards the draft, as **Cancel** does.

## What it shows and what the user can do

### The configuration

A deck's configuration has:

- its **name**;
- its **colour** ([deck colour](#deck-colour));
- an ordered list of **module instances**, at most 12 in total:
  - the **main key module**: compulsory and always first; it cannot be removed or moved;
  - the **Context module**: optional, at most one. When the deck has it, capture into the deck also takes the selection's surrounding block ([context](page.md#context));
  - **Text module instances**: optional and repeatable; each gives new pages an empty Text component for the user's own writing;
  - **content module instances**, each a [parent module](../subsystems/module-catalog.md#parent-modules-and-facets) with the facets chosen for it: the same type may appear more than once, and facets do not count toward the 12;
- its **view**: the default view, which shows each page as its ordered component list.

The user edits the configuration in **deck settings**: name the deck, choose its colour from six swatches, add, remove, and reorder the Context, Text, and content module instances, and add or remove a parent's facets as on a page ([shaping a page](page.md#shaping-a-page)); the main key stays first. Configuration edits are a draft until **Save**; **Cancel** discards them. A failed save keeps the draft and offers **Try saving again**. Deck settings keep the page view's layout: the module list beside the module window. A module's samples are on its own [page](module-pages.md#the-pages).

Deck settings hold modules without content, so each module is drawn as a folded card is on a page and never unfolds: a slim band under its index tab, ruled in its family colour, which offers no **Fold** or **Unfold** ([D22](../decisions/d22.md)).

- **The main key** is shown first in the list like the other modules: its tab is outlined, on a band ruled in the line colour, with no six-dot menu, drag, actions or **Remove**.
- **Each other module's tab** is numbered like a page's when the same module appears more than once, drags it and, clicked, ejects **About** first, which opens its [module page](module-pages.md#the-pages) in the pages' sheet, the same page as from the module window or a card; then, on a parent, **Facet**, which opens its [facet window](facet-window.md#the-window) on the draft; then **Remove**.
- **Facets.** A parent's facets hang from the end of its band's bottom edge as [facet tags](page.md#facet-tags), as on a folded card, fly there from the facet window when added, and pop when removed. Deck settings hold no content, so removing a facet there never asks.
- **Menus over tags.** An open six-dot menu or facet window stands over the tags.

A configuration with only the main key module is valid. Its new pages hold only the main key and whatever the user adds.

#### Module window

Deck settings show the module list on the left and the **module window** on the right ([the window](module-window.md#the-window)). The user adds an instance by dragging a module from the window into the configuration and reorders instances by dragging their icon and name, which fill the module's row from the six dots to **Remove**, with the pointer or from the keyboard (Space, the arrow keys, Space). The six dots before the name open the instance's menu, whose entries, **Duplicate** and **Copy to another deck…**, are placeholders marked *Coming soon*. **Remove** stays on each instance. The page view shows the same window ([shaping a page](page.md#shaping-a-page)), so shaping a deck and shaping a page use the same gesture.

### Deck colour

A deck's colour is one of the six family colours ([module families](../subsystems/module-catalog.md#module-families)), chosen above and the same in every view and installation. A new deck starts with one of them at random; a deck whose colour has never been chosen shows a colour derived from its identity. It identifies the deck only and says nothing about its modules, so deck settings name the colours by hue (Blue, Green, Amber, Violet, Rose, Sage), not by family.

## States

- **A draft.** Every edit is a draft until **Save**; **Cancel** discards it. A new deck starts with the configuration a new account's **My Deck** has ([initial default deck](../subsystems/store.md#initial-default-deck-example)), and **Save** creates it without changing the default deck.
- **A failed save** keeps the draft and offers **Try saving again**.
- **The module limit.** At 12 modules the module window's modules are disabled and it says why; the Context module is disabled when one is already there.
- **An account refresh** never redraws the screen while it is open, so a draft is never lost to it.

## Source

| Part | Source |
| --- | --- |
| The screen, the module list and Save | `ConfigurationView`, `DeckModule` in [`configuration.tsx`](../../extension/configuration.tsx); [`deck-settings.css`](../../extension/deck-settings.css) |
| The draft and its route | the `#configure/` branch of `render` in [`app.js`](../../extension/app.js) |
| Dragging, the module window and facet tags | `ShapingArea` in [`shaping.tsx`](../../extension/shaping.tsx); [`facet-tags.tsx`](../../extension/facet-tags.tsx); the [module window](module-window.md) and [facet window](facet-window.md) |
| Deck colours | [`deck-colour.ts`](../../extension/deck-colour.ts) |
| Saving | `POST /api/deck/save` → `saveDeck` in [`store-decks.mjs`](../../src/core/store-decks.mjs) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/decks.test.mjs`](../../tests/browser/decks.test.mjs) | Draft previews, every module, the module limit, removing without losing content |
| [`tests/browser/module-window.test.mjs`](../../tests/browser/module-window.test.mjs) | Dragging modules into deck settings and reordering by pointer and keyboard |
| [`tests/browser/buttons.test.mjs`](../../tests/browser/buttons.test.mjs) | **Cancel** and **Save** as keycap buttons |
| [`tests/decks.test.mjs`](../../tests/decks.test.mjs) | Saving a configuration, its colour, and it reaching only new pages |
| `npm run screens -- --only '^deck-(settings\|new)$'` | `deck-settings` and `deck-new`, in both themes and six languages |
