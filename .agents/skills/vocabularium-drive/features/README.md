# Feature map

What a user can do in Vocabularium, one file per feature, each written from the user's side: what it is, how a user reaches it, how a journey drives it with `npm run drive`, and what end state proves it works. The product's own terms are in the [product model](../../../../docs/product/model.md); the full behavior is in the [specifications](../../../../docs/specs/).

| Feature | File | Journey |
| --- | --- | --- |
| Capture a word or sentence from a web page | [capture.md](capture.md) | [capture-a-word.mjs](../journeys/capture-a-word.mjs) |
| Read a page and its cards; shape a card | [page-and-cards.md](page-and-cards.md) | — |
| Retry a card | [retry.md](retry.md) | [retry-a-failed-card.mjs](../journeys/retry-a-failed-card.mjs) |
| Decks: Home, a deck's pages, deck settings | [decks.md](decks.md) | — |
| The account menu: appearance, language, logs, Report a problem, log out | [account.md](account.md) | [report-a-problem.mjs](../journeys/report-a-problem.mjs) |

A feature with no journey yet is driven by hand from its file; when you write one, add it here. A change to what a user sees or does updates its feature file in the same PR.
