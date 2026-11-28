# Feature map

How to drive each feature with `npm run drive`: its routes, seeds, helpers, the end state that proves it, and its gotchas. What a user sees and can do is in the [screen references](../../../../docs/screens/README.md); the product's own terms are in the [product model](../../../../docs/product/model.md).

| Feature | File | Screens | Journey | Seed |
| --- | --- | --- | --- | --- |
| Capture a word or sentence from a web page | [capture.md](capture.md) | [capture](../../../../docs/screens/capture.md) | [capture-a-word.mjs](../journeys/capture-a-word.mjs) | any |
| Read a page and its cards; shape a card | [page-and-cards.md](page-and-cards.md) | [page](../../../../docs/screens/page.md), [facet window](../../../../docs/screens/facet-window.md), [module window](../../../../docs/screens/module-window.md), [module pages](../../../../docs/screens/module-pages.md) | [shape-a-card.mjs](../journeys/shape-a-card.mjs) | `full` |
| Retry a card | [retry.md](retry.md) | [page](../../../../docs/screens/page.md) | [retry-a-failed-card.mjs](../journeys/retry-a-failed-card.mjs) | `full` |
| Decks: Home, a deck's pages, deck settings | [decks.md](decks.md) | [Home](../../../../docs/screens/home.md), [deck](../../../../docs/screens/deck.md), [deck settings](../../../../docs/screens/deck-settings.md) | [deck-settings.mjs](../journeys/deck-settings.mjs) | `full` |
| The account menu and sign-in: appearance, language, logs, Report a problem, log out | [account.md](account.md) | [account menu](../../../../docs/screens/account-menu.md), [sign-in](../../../../docs/screens/sign-in.md) | [report-a-problem.mjs](../journeys/report-a-problem.mjs) | `full` |

All five journeys pass one after another on one `launch --seed full` session. A feature with no journey yet is driven by hand from its file; when you write one, add it here. A change to what a user sees or does updates its screen reference; a change to how it is driven updates its file here.
