# A page and its cards

A page shows its main key as the title and one card per module, in the page's own order. A content module's card holds its core and its facets. The user can reorder, fold, edit, retry or delete a card, add a facet, and add a module from the Modules panel. Rules: [pages and editing](../../../../docs/specs/pages-and-editing.md).

## Sub-features

- The title (`h1.main-key`), whose size follows its length (`data-tier`).
- A card's tab: clicking it shows the card's actions, **Edit**, **Retry**, **Facet**, **About**, **Fold**, **Delete**; a click elsewhere hides them.
- The facet window (**Facet**): ticks to add or remove a facet, and the facets' order.
- Editing the core or a facet in place, with **Save**.
- The Modules panel on the right: a family opens its modules; **+** or a drag adds one to the page.
- Dragging a card by its handle (`⋮⋮`) to reorder.
- **Page actions** (`…` at the top right), which holds Delete page.

## How to get to it (user POV)

From Home or a deck, click a page in the list. Directly: `#page/<page id>` after the app's address.

## Driving it with drive

- Open `${app}#page/<id>`; the page is ready when the button **Page actions** is there.
- A card: `page.locator('article.component').filter({ has: page.getByRole('heading', { name: '<Module>', exact: true }) })`; its tab is `.tab-button` inside it.
- The helpers in `tests/browser/helpers.mjs` already drive most of this: `cardButton`, `facetWindow`, `tick`, `addFromWindow`, `drag`, `removeFromDeck`. Import them in a journey.
- Prove a change with `query` on `components` (`module_type`, `position`, `status`, `facets`) as well as on screen.
- `launch --seed full` gives completed, loading and failed pages for every module group, and a hand-made page whose cards wait for **Generate**.

## Gotchas

- Motion (a drag, an add, a delete) cannot be judged from screenshots: use `tests/browser/motion.test.mjs`, which records every frame.
- The account menu's capture popup can sit over the top-right corner; tests open menus from the keyboard for that reason.
