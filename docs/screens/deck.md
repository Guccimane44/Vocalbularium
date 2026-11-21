# Deck

A deck's screen lists its pages. It is where the user finds a page again after capturing it, chooses how the list is ordered and laid out, and reaches the deck's settings and **Add page manually**.

## Getting there

- From a deck's card on Home, or its row in the sidebar.
- From a page or deck settings, through the deck's crumb in the trail.
- Route: `app.html#deck/<deck id>`.
- Trail: *Home › the deck*. A deck name longer than 32 characters is cut with an ellipsis and keeps its whole text as a tooltip ([navigation](../specs/decks-and-configuration.md#navigation)).

The sidebar marks the deck as current, and keeps it marked while the account refreshes.

## What it shows

1. **The head.** The deck's name with its colour mark, and its page count beneath. On the right, the deck's actions as quiet symbols: a star for **Set as default** (a filled star and **Default** on the default deck), a gear for **Configure deck**, a trash for **Delete deck**; then **Add page manually** as the one primary symbol. Every symbol is named and keeps its name as a tooltip.
2. **The toolbar.** **Sort pages** with its four orders, and the layout switch: **List**, **Table**, **Gallery**.
3. **The page list**, in the chosen layout:
   - **List** (the default) shows each page as its main key above one line of meaning, so words, phrases, sentences and passages share one shape. The main key wraps to at most two lines and is cut with an ellipsis after that. The meaning line is the first numbered meaning in the core of the page's first content component that has one; for a sentence it is the first translation, starting with "Sentence ·"; for a passage it reads "Passage · *n* words". On the right, one small family mark per filled component, in page order, with a text alternative such as "3 modules filled", and **Open** on hover and keyboard focus.
   - **Table** shows one row per page, with the columns *Main key* (up to two lines), *Meaning*, *Modules* (the family marks) and *Date*.
   - **Gallery** shows one card per page: the family marks along its top edge, the main key (larger for a word, up to four lines for longer text), the meaning, and the capture date.
   - In the two creation-time orders, pages are grouped under their capture date: Today, Yesterday, then month and day. The alphabetical orders are not grouped.
4. **Load more pages**, under the list, when the deck has more pages than are shown.

The main key is always the whole text when it is searched or read aloud; only its display is cut. The list gets these fields with each page summary, never the page's content ([views and layouts](../subsystems/store.md#page-summaries-and-layouts)).

## What the user can do

- **Open a page.** The main key links to the page, and a click anywhere else on a row or card opens it too, except while the user is selecting text in it or presses one of its own buttons. Each row or card is one keyboard target, named by its main key.
- **Sort pages.** Creation time newest first (the default), creation time oldest first, A to Z, and Z to A. Alphabetical order compares main keys after Unicode NFKC normalisation and lowercasing, in code-unit order. Pages with equal sort values are ordered by page ID, so the list is stable. The order is remembered per deck on this installation.
- **Change the layout.** The layout is remembered per deck on this installation. It is not part of the deck's configuration.
- **Load more pages.** The list loads 30 pages at a time.
- **Add page manually** opens a new page draft in this deck, *Home › the deck › New page* ([creation](../specs/pages-and-editing.md#creation-and-optional-generation)).
- **Configure deck** opens deck settings, *Home › the deck › Deck settings* ([configuration](../specs/decks-and-configuration.md#configuration)).
- **Set as default** makes this the deck that capture saves into ([default deck](../subsystems/store.md#default-deck)).
- **Delete deck** asks first, then returns to Home ([deleting a deck](../specs/decks-and-configuration.md#deleting-a-deck)).

After an action in the head, the focus returns to the symbol that took it.

## States

- **Loading.** Until the deck's first batch arrives, the list's place stays blank. If that takes longer than 300 ms, it says the pages are loading. A reload, for another order or an account refresh, keeps the current list on screen until the new batch replaces it, so the way back from a page or a re-sort never shows an empty or loading box over the list.
- **Empty.** A deck without pages shows "No pages in this deck yet."
- **Saving, generating, failed.** A page in one of these states shows it in place of its meaning line, and a failed page offers **Retry…**, which opens the page ([list states](../subsystems/interface.md#list-state-presentation)). A completed page shows no status.
- **A new page arriving.** A page captured while the list is open slides into it ([motion](../subsystems/interface.md#motion)).
- **The list changed under Load more.** If the deck changed since the first batch, the store answers `stale_cursor` and the list starts again from its first batch.

## Source

| Part | Source |
| --- | --- |
| The screen, its head, toolbar, loading and empty states, and Load more | `DeckList` in [`dashboard.tsx`](../../extension/dashboard.tsx) |
| The head's symbols | `DeckActions` in [`dashboard.tsx`](../../extension/dashboard.tsx) |
| The three layouts, meaning line, family marks, date groups and arrivals | `PageList`, `LayoutSwitch`, `MeaningLine`, `useArrivals` in [`page-list.tsx`](../../extension/page-list.tsx); [`page-list.css`](../../extension/page-list.css) |
| Sort orders and their comparison | `SORT_ORDERS`, `sortPages` in [`sorting.ts`](../../extension/sorting.ts) |
| The trail | [`crumbs.tsx`](../../extension/crumbs.tsx) |
| Remembered choices | `sort-<deck id>` and `layout-<deck id>` in the page's `localStorage` |
| The page summaries | `GET /api/decks/:deckId/pages` in [`routes.mjs`](../../src/server/routes.mjs); `listPages` and `pageSummary` in [`store-pages.mjs`](../../src/core/store-pages.mjs): 30 a page by default, at most 50, ordered in the database with the page ID as tie-break, and a cursor tied to the account's sequence |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/page-list.test.mjs`](../../tests/browser/page-list.test.mjs) | Quiet states, layouts remembered per deck, sorting, grouping, every pointer target, text selection and keyboard navigation; the sidebar's current deck |
| [`tests/browser/deck-return.test.mjs`](../../tests/browser/deck-return.test.mjs) | No empty or loading box on the way back from a page or after a re-sort |
| [`tests/browser/decks.test.mjs`](../../tests/browser/decks.test.mjs) | The head's actions, Escape, cancelling, and deleting with a replacement default |
| [`tests/browser/crumbs.test.mjs`](../../tests/browser/crumbs.test.mjs) | The trail to and from the deck |
| [`tests/browser/motion.test.mjs`](../../tests/browser/motion.test.mjs) | The deck's rows during the moves in the motion catalogue, frame by frame, never showing the empty box or the loading line over a deck with pages |
| [`tests/reads.test.mjs`](../../tests/reads.test.mjs) | Page summaries, page sizes and cursors |
| `npm run screens -- --only '^deck(-empty)?$'` | The `deck` (My Deck's 16 pages) and `deck-empty` (Reading list) screenshots, in both themes and six languages |
