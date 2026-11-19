# Decks

Pages live in decks. Home lists the decks and recent captures; a deck lists its pages; a deck's settings choose its colour and the modules its new pages start with. Rules: [decks and configuration](../../../../docs/specs/decks-and-configuration.md).

## Sub-features

- Home: **Your decks** and **Recent captures**.
- The sidebar: **Home**, each deck with its page count, **+ New deck**.
- A deck's page list, with its layouts (list, table, gallery) and sorting.
- **Configure deck**: name, colour and the modules (and facets) a new page starts with. Changes reach only new pages.
- Reordering decks in the sidebar by dragging.
- The default deck, which the capture menu names.

## How to get to it (user POV)

Click **Home** or a deck in the sidebar. A deck's settings open from **Configure deck** in the deck view.

## Driving it with drive

- Routes: `${app}` (Home, heading **Your decks**), `${app}#deck/<deck id>`, `${app}#configure/<deck id>`.
- Deck IDs: `query('SELECT id, name, colour FROM decks ORDER BY ordinal')`; the default deck is `account.default_deck_id`.
- `--seed empty` has one deck, **My Deck**, with Main key, Context and German. `--seed full` adds pages in it and an empty second deck, **Reading list**.

## Gotchas

- A deck's colour follows its random ID until one is chosen, so screenshots of a new deck differ from run to run.
- Deck settings change what new pages start with, never existing pages (D02).
