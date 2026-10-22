# Forced colours in both themes: verification

22 October 2026. The owner asked in a Claude Code chat on 22 October 2026 to fix, in the cleanup after 0.8.0, the forced-colors bug found there and the three defects it exposed, and to verify light and dark forced colours with screenshots. It covers:
- **The dark system theme.** The forced-colors block of the generated theme lost on specificity to the dark block's `:root:not([data-theme="light"])`. With a dark system theme, forced colours and no chosen appearance, every Sage token kept its Moss night value. The block now repeats that selector and wins in every theme.
- **Filled actions.** A failed card's Retry, Delete when hovered, and the confirming Delete on a card and on a facet drew Canvas text on a CanvasText fill. Chromium's backplate behind adjusted text is Canvas too, so their labels vanished. Filled card actions and a facet's confirming button now draw their own colours, with Canvas text on any family fill.
- **Highlights.** The main key's highlight, and every highlight in a card or editor, took the Canvas surface colour. They now show as the system highlight.
- **Deck colour swatches.** All six showed the same system colour. The theme now carries each family colour again for swatches, which forced colours leave alone, so the swatches keep their colours, with the system highlight ringing the chosen one.

Light forced colours already had the last three defects on `main`. The dark theme escaped them only through the first bug.

## Verification

Run locally on macOS with PostgreSQL 18, Playwright's Chromium and controlled generation providers. Source revision: the head of the PR that adds this record.

- **Tokens:** every theme token, read in Chromium in both system schemes, each appearance setting (system, light, dark) and with forced colours off and on, on the document root and on a shadow host: 1,608 checks. Outside forced colours, no token differs from `main`. In forced colours, all 45 mapped tokens are system colours everywhere. The eight swatch copies equal their family colour and keep it.
- **Views and states:** a temporary browser scenario signed in, built a deck with a finished, a failed and a loading page, and went through 17 states: sign-in, decks, the account menu, the page list in all three layouts, the page view, the delete-page dialog, a card's actions with Edit and Delete hovered, the delete and retry confirmations, a facet's actions and confirmation, the editor with its highlight palette, and deck settings with a module's actions. In each state, in forced light and dark, it took a screenshot and checked every visible text for the backplate and, where forced colours are off, for 3:1 contrast. It also checked that every highlight shows the system highlight and that the deck colour swatches differ.
  - `main`: Retry, the hovered and the confirming Delete hidden in light; highlights not shown in either theme; the deck swatches alike in light.
  - This change: nothing found. The editor's highlight palette shows one colour for its five swatches, as on `main`. Its buttons never opted out of forced colours, unlike the deck swatches, so they are left as they are.
  - Outside forced colours, all 34 screenshots match `main`, up to the few pixels at card edges in which two runs of `main` also differ.
- `npm run check`, `npm test` (175/175) and the browser suite (33/33) pass.

## Screenshots

- [`forced-colours/before-after.png`](forced-colours/before-after.png): the six affected spots on `main` and with this change, in forced light and dark.
- [`forced-colours/page-view-light.png`](forced-colours/page-view-light.png) and [`forced-colours/page-view-dark.png`](forced-colours/page-view-dark.png): the whole page view with this change.

## Not verified

- **Windows:** these are Chromium's emulated forced colours on macOS, not a Windows contrast theme. The system colours differ by theme there; the same rules apply.
- **The capture popup** on web pages: its tokens are checked on a shadow host, but no screenshot was taken.
- **Every state:** hover is covered for card actions only, and focus rings are not checked.
