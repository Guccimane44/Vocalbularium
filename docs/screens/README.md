# Screen references

Each page describes one screen of the extension: how the user gets there, what it shows, what the user can do, and the states it can be in. Names follow the [screens catalogue](../guides/screens.md#the-catalogue) (`tests/screens/catalogue.mjs`), so a page and its baseline screenshots share a name.

| Screen | Catalogue entries | Reference |
| --- | --- | --- |
| A deck's page list | `deck`, `deck-empty` | [Deck](deck.md) |

The screens' rules are still in [`docs/specs/`](../specs/) until each screen has its page.

## Which page owns a fact

- **True on one screen** (what it shows, its order, its actions, its empty state): that screen's page.
- **True on every screen** (colours, type, motion, dialogs, list states, the sidebar and trail, interface languages): the [shared interface](../specs/shared-ui.md), which is becoming a subsystem page. A screen page links to it and doesn't repeat it.
- **How data moves or is stored** (what a request carries, ordering, receipts, limits the store enforces): the [subsystem page](../subsystems/README.md). A screen page says what the user sees and links there for why.
- **A rule every change must keep**: the [code standards](../code-standards.md).

## What a page contains

Every page uses these sections, in this order:

1. **An opening paragraph**: what the screen is for.
2. **Getting there**: where it opens from, its route (`app.html#…`), and its trail.
3. **What it shows**: its regions from top to bottom, and what each one holds.
4. **What the user can do**: each action, what it leads to, and its keyboard path.
5. **States**: loading, empty, saving, generating, failed, and anything else that changes the screen.
6. **Source**: the files that draw it and the routes it reads.
7. **Verification**: the browser tests and the screens-catalogue entries that capture it.

## Keep a page current

A change to what a screen shows or what the user can do on it updates that screen's page in the same PR, and its screenshots are looked at before it merges ([screens](../guides/screens.md)). Describe the screen as it is now, in the interface's English words, with the product model's terms. The upkeep and review rules of the [subsystem references](../subsystems/README.md#keep-a-page-current) apply here too.
