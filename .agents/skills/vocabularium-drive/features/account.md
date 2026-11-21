# The account menu

How to drive this feature with `npm run drive`. What the menu shows and does is in the [account menu](../../../../docs/screens/account-menu.md) screen reference.

## Driving it with drive

- A drive session signs in as `admin` with the password `admin`; use them to sign in again after **Log out**.

- `accountMenu(page)` and `chooseAppearance(page, 'light' | 'dark' | 'system')` in `tests/browser/helpers.mjs` open the menu reliably, from the keyboard.
- Report a problem: [report-a-problem.mjs](../journeys/report-a-problem.mjs). Prove it with `query('SELECT text, screen, module_type, issue FROM reports')`; `npm run reports -- pending` lists what the daily agent will file.
- Prove the language with `query('SELECT language FROM account')` as well as on screen. Appearance is kept in the extension, not the database.

## Gotchas

- The menu opens with **Enter** on its trigger; a click can land on the capture popup in the top-right corner.
- A drive session builds its extension and runs its API from the same checkout, so the build warning never shows there. To see it, the two would have to come from different commits.
