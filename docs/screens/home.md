# Home

Home, titled **Your decks**, is the first screen after signing in. It shows the account's decks and the most recent captures, and it is where the user reorders decks, makes one the default, configures or deletes one, and creates a new one.

## Getting there

- The toolbar button opens it in a Chrome tab when signed in. Opening it clears the capture badge.
- **Home** in the sidebar, and the first crumb of every trail.
- Route: `app.html` with no hash. No trail.

## What it shows and what the user can do

### Decks and recent captures

The dashboard is the main view, titled **Your decks**. It shows every deck of the account as a card, in the account's order, in batches of 40, with **Load more decks** when more exist. Each deck card shows its colour along its top edge, its name, and its page and module counts. Behind its top edge, a little module card stands for each module family its configuration uses: paper, with the family's colour along its top and as a small index tab. They overlap in a row with the first in front, and only their tops show. While the deck is pointed at or focused, it lifts and they rise to their own heights and lean apart, one after another; under reduced motion they stand still. Below the decks, **Recent captures** lists the twenty most recent captures and any capture receipts not yet saved ([what a capture saves](../subsystems/capture-and-save.md#what-a-capture-saves)) as compact entries: the main key, its deck, and the time. Each entry is one link to its page; an entry that is saving or not saved shows its state and button as in a page list ([list state presentation](../subsystems/interface.md#list-state-presentation)).

- **+ New deck** (on the dashboard and in the sidebar) opens deck settings for a new deck, starting with the same configuration as a new account's **My Deck**. **Save** creates the deck; **Cancel** discards the draft. Creating a deck does not change the default deck.
- Clicking a deck opens its page list ([deck](deck.md)).
- A deck's actions are symbols along the bottom of its card: a star for **Set as default**, a filled star with the word **Default** on the default deck, a gear for **Configure deck**, and a trash for **Delete deck**. The deck's page shows the same three in a quiet group in its head, then **Add page manually** as the one primary symbol. Every symbol is named and keeps its name as a tooltip; after an action the focus returns to the symbol that took it.
- A deck's card drags to a new place among the decks by its body, and from the keyboard Space picks it up, the arrow keys move it, Space drops it and Escape puts it back ([D27](../decisions/d27.md)). A move shorter than a few pixels is a click that opens the deck.

#### Deleting a deck

**Delete deck** asks for confirmation that the deck and all its pages will be deleted. Cancel leaves everything unchanged. Deleting the default deck requires choosing another deck as the new default in the same dialog. Deleting the only deck replaces it with a new, empty **My Deck** with the initial configuration. Deleting the deck currently shown returns to the dashboard. Deleting a deck cancels pending generation on its pages.

The rules for the default deck are in the [store](../subsystems/store.md#default-deck); how a capture reaches **Recent captures** is in [capture and save](../subsystems/capture-and-save.md).

## States

- **A new account** (`dashboard-empty`): **My Deck** alone, with no pages and no recent captures.
- **Saves that failed** show as notices with **Try saving again** ([capture and save](../subsystems/capture-and-save.md#saving-every-change)).
- **A capture still saving** shows its state in **Recent captures** until it hands over to its page ([list states](../subsystems/interface.md#list-state-presentation)).

## Source

| Part | Source |
| --- | --- |
| The screen | `Dashboard`, `DeckGrid` in [`dashboard.tsx`](../../extension/dashboard.tsx) |
| Deck cards and their order | `SortableDecks`, `SortableDeck`, `DeckActions` in [`dashboard.tsx`](../../extension/dashboard.tsx); [`families.tsx`](../../extension/families.tsx) for the little module cards |
| Recent captures and failed saves | `RecentCaptures`, `PendingSaveNotices`, `RecoveryButton` in [`dashboard.tsx`](../../extension/dashboard.tsx); `GET /api/captures/recent` |
| Deck routes | `GET /api/decks` (`listDecks`), `/api/deck/move`, `/api/default-deck`, `/api/deck/delete` in [`routes.mjs`](../../src/server/routes.mjs) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/deck-cards.test.mjs`](../../tests/browser/deck-cards.test.mjs) | The little module cards rising on hover, and the three deck symbols |
| [`tests/browser/deck-order.test.mjs`](../../tests/browser/deck-order.test.mjs) | Dragging a card on Home, and moving a sidebar row by keyboard and pointer |
| [`tests/browser/decks.test.mjs`](../../tests/browser/decks.test.mjs) | Deleting with a replacement default, cancelling, and the sole-deck reset |
| [`tests/browser/capture.test.mjs`](../../tests/browser/capture.test.mjs) | **Recent captures** handing a receipt over to its page |
| `npm run screens -- --only '^dashboard'` | `dashboard` and `dashboard-empty`, in both themes and six languages |
