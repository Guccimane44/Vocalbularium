# The account menu

The account's own settings, at the foot of the sidebar: appearance, interface language, diagnostic logs, reporting a problem and log out. It also shows which build of the API the extension talks to, and warns when the extension and the API come from different commits. Rules: [accounts and sync](../../../../docs/specs/accounts-and-sync.md) and [shared UI](../../../../docs/specs/shared-ui.md).

## Sub-features

- **Appearance**: **System**, **Sage** (light) or **Moss night** (dark).
- **Language**: the interface languages; Arabic mirrors the layout.
- **Diagnostic logs**: buffer budget, preview and clear.
- **Report a problem…** ([D336](../../../../docs/decisions/d336-report-a-problem.md)): a dialog about the page shown (the whole page or one card) or the screen, a sentence, and the last 15 minutes of logs; **Save report** keeps it in `reports`, and the notice's **Undo** deletes it.
- **Log out**, and signing in again (username `admin`, password `admin` in a drive session).
- The build line and, when the builds differ, **Different builds: API …, extension …**.

## How to get to it (user POV)

Click **admin** at the foot of the sidebar (its accessible name is **Account: admin**).

## Driving it with drive

- `accountMenu(page)` and `chooseAppearance(page, 'light' | 'dark' | 'system')` in `tests/browser/helpers.mjs` open the menu reliably, from the keyboard.
- Report a problem: [report-a-problem.mjs](../journeys/report-a-problem.mjs). Prove it with `query('SELECT text, screen, module_type, issue FROM reports')`; `npm run reports -- pending` lists what the daily agent will file.
- Prove the language with `query('SELECT language FROM account')` as well as on screen. Appearance is kept in the extension, not the database.

## Gotchas

- The menu opens with **Enter** on its trigger; a click can land on the capture popup in the top-right corner.
- A drive session builds its extension and runs its API from the same checkout, so the build warning never shows there. To see it, the two would have to come from different commits.
