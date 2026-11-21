# A page and its cards

How to drive this feature with `npm run drive`. What the user sees is in the [page](../../../../docs/screens/page.md), [facet window](../../../../docs/screens/facet-window.md) and [module window](../../../../docs/screens/module-window.md) screen references.

## Driving it with drive

- Open `${app}#page/<id>`; the page is ready when the button **Page actions** is there.
- The title is `h1.main-key`, its size tier in `data-tier`. A card's actions (**Edit**, **Retry**, **Facet**, **About**, **Fold**, **Delete**) show when its tab is clicked; **Page actions** (`…`, top right) holds **Delete page**; a card drags by its handle (`⋮⋮`).
- A card: `page.locator('article.component').filter({ has: page.getByRole('heading', { name: '<Module>', exact: true }) })`; its tab is `.tab-button` inside it.
- The helpers in `tests/browser/helpers.mjs` already drive most of this: `cardButton`, `facetWindow`, `tick`, `addFromWindow`, `drag`, `removeFromDeck`. Import them in a journey.
- Prove a change with `query` on `components` (`module_type`, `position`, `status`, `facets`) as well as on screen.
- `launch --seed full` gives completed, loading and failed pages for every module group, and a hand-made page whose cards wait for **Generate**.

## Gotchas

- Motion (a drag, an add, a delete) cannot be judged from screenshots: use `tests/browser/motion.test.mjs`, which records every frame.
- The account menu's capture popup can sit over the top-right corner; tests open menus from the keyboard for that reason.
