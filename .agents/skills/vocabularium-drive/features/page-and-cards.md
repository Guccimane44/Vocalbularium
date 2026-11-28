# A page and its cards

How to drive this feature with `npm run drive`. What the user sees is in the [page](../../../../docs/screens/page.md), [facet window](../../../../docs/screens/facet-window.md) and [module window](../../../../docs/screens/module-window.md) screen references.

## Driving it with drive

- Open `${app}#page/<id>`; the page is ready when the button **Page actions** is there (`pageReady(page)`).
- The title is `h1.main-key`, its size tier in `data-tier`. **Page actions** (`…`, top right) holds **Delete page**.
- A card: `componentArticle(page, '<Module>')`, an `article.component` headed by the module's name; its tab is the `.tab-button` inside it. Clicking the tab ejects the card's actions: **Actions for <Module>**, a submenu holding **Edit**, **Retry**, **Fold** (**Unfold** on a folded card) and **Delete**; **Facets of <Module>** on a parent module; **About** on a module from the window; and **Settings for <Module>**, whose entries are placeholders marked "coming soon". A closed failed card keeps only its **Retry** beside the tab.
- `cardButton(page, 'Delete German')` opens the tab and **Actions** as needed and returns the button. A card with content asks first (**Yes, delete <Module>**, **Yes, retry <Module>**); an empty or failed one acts at once.
- A card drags by its tab. `drag(page, source, target)` moves it; `addFromWindow(page, '<type>')` drags a module from the module window to the end. An added card starts empty and waits for **Retry** (`cardButton(page, 'Retry <Module>')`); it does not generate by itself.
- Facets: `facetWindow(page, '<Module>')` opens the window, and `tick(window, '<Facet label>')` is the facet's **Add** or **Remove** button.
- The helpers are in `tests/browser/helpers.mjs`; import them in a journey with a path relative to it.
- Prove a change with `query` on `components` (`module_type`, `position`, `status`, `facets`) as well as on screen. A component that has never generated has `status` null.
- `launch --seed full` gives a completed, a loading and a failed page for each of six module groups (German, Chinese, English, Expertise, Pronunciation, Creativity), each page holding only that group's modules, and a hand-made page, **Ufer**, whose cards wait for **Retry**.
- Journey: [shape-a-card.mjs](../journeys/shape-a-card.mjs) adds or removes a facet, folds or unfolds the card, adds a Joke card, retries it and deletes it. It toggles, so it runs again on its own leftovers.

## Gotchas

- `addFromWindow` reads `page.viewportSize()`, which is null in a drive session because the browser is attached over CDP. Call `page.setViewportSize({ width: 1280, height: 1400 })` first.
- A fold outlives a reload. A journey that folds should toggle, not assume the card starts unfolded.
- `LIMIT 1` without an order picks any page, including one an earlier journey captured. Order by `pages.created_at` to get the seed's page.
- **Delete** is unavailable while a card is generating.
- Motion (a drag, an add, a delete) cannot be judged from screenshots: use `tests/browser/motion.test.mjs`, which records every frame.
- The capture popup can sit over the top-right corner; tests open menus from the keyboard for that reason.
