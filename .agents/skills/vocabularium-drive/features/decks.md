# Decks

How to drive this feature with `npm run drive`. What the user sees is in the [Home](../../../../docs/screens/home.md), [deck](../../../../docs/screens/deck.md) and [deck settings](../../../../docs/screens/deck-settings.md) screen references.

## Driving it with drive

- Routes: `${app}` (Home, heading **Your decks**), `${app}#deck/<deck id>`, `${app}#configure/<deck id>`.
- Deck IDs: `query('SELECT id, name, colour FROM decks ORDER BY ordinal')`; the default deck is `account.default_deck_id`.
- `--seed empty` has one deck, **My Deck**, with Main key, Context and German. `--seed full` adds pages in it and an empty second deck, **Reading list**.

## Gotchas

- A deck's colour follows its random ID until one is chosen, so screenshots of a new deck differ from run to run.
- Deck settings change what new pages start with, never existing pages (D02).
