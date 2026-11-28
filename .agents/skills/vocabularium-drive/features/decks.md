# Decks

How to drive this feature with `npm run drive`. What the user sees is in the [Home](../../../../docs/screens/home.md), [deck](../../../../docs/screens/deck.md) and [deck settings](../../../../docs/screens/deck-settings.md) screen references.

## Driving it with drive

- Routes: `${app}` (Home, heading **Your decks**), `${app}#deck/<deck id>`, `${app}#configure/<deck id>`, `${app}#configure/new`.
- Deck IDs: `query('SELECT id, name, colour FROM decks ORDER BY ordinal')`; the default deck is `account.default_deck_id`.
- A deck's card on Home is the group **Options for <deck>**, holding **Set as default** (not on the default deck), **Configure deck** and **Delete deck**. **New deck** is on Home and in the sidebar.
- In deck settings, the name is the field **Deck name**, and the colours are radios in the group **Deck colour** (Blue, Green, Amber, Violet, Rose, Sage); choose one with `getByRole('radio', { name })`, since its name is hidden text under the radio. **Save** saves.
- `--seed empty` has one deck, **My Deck**, with Main key, Context and German. `--seed full` adds pages in it and an empty second deck, **Reading list**.
- Journey: [deck-settings.mjs](../journeys/deck-settings.mjs) renames and recolours Reading list, makes it the default, and checks that no page was added or removed.

## Gotchas

- A deck's colour follows its random ID until one is chosen, so under `--seed empty`, and for decks made during a session, screenshots differ from run to run. `--seed full` sets both decks' colours.
- Deck settings change what new pages start with, never existing pages (D02).
- The deck-settings journey leaves Reading list renamed **Weekend reading** and the default, so later captures in the same session land there. Relaunch for a clean seed.
- Deleting the default deck asks for a new default; deleting the last deck replaces it with an empty **My Deck**.
- **Copy to another deck…** under a card's **Settings** is a placeholder; pages cannot move between decks yet.
