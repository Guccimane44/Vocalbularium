# The account menu and sign-in

How to drive this feature with `npm run drive`. What the menu shows and does is in the [account menu](../../../../docs/screens/account-menu.md) screen reference; signing in is in the [sign-in](../../../../docs/screens/sign-in.md) screen reference.

## Driving it with drive

- A drive session signs in as `admin` with the password `admin`. After **Log out** the app shows sign-in, and `signIn(page)` in `tests/browser/helpers.mjs` signs in again.
- `accountMenu(page)` opens the menu from its trigger, **Account: admin**, at the foot of the sidebar. Signed out, it returns without opening anything, since there is no menu.
- `chooseAppearance(page, 'light' | 'dark' | 'system')` picks the radio **Sage**, **Moss night** or **System**.
- The menu holds Appearance, Language, Diagnostic logs (its own screen, `#diagnostics`), **Report a problem…** and **Log out**.
- Report a problem: [report-a-problem.mjs](../journeys/report-a-problem.mjs), which needs `launch --seed full` for a completed German card. Prove it with `query('SELECT text, screen, module_type, page IS NOT NULL AS has_page, logs IS NOT NULL AS has_logs, issue FROM reports')`; `npm run reports -- pending` lists what the daily agent will file.
- Prove the language with `query('SELECT language FROM account')` as well as on screen. Appearance is kept in the extension, not the database.

## Gotchas

- Open the menu with **Enter** on its trigger, as the helpers do: a click works, but it can land on the capture popup in the top-right corner.
- A drive session builds its extension and runs its API from the same checkout, so the build warning on the trigger never shows there. To see it, the two would have to come from different commits.
