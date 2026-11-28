# Account menu

The account menu, at the foot of the sidebar, holds what belongs to the account and the installation rather than to a deck: appearance, the interface language, diagnostic logs, **Report a problem…** and **Log out**. It also shows which API the extension is signed in to, and warns when the two come from different builds.

## Getting there

- The trigger at the foot of the sidebar on every signed-in screen, named "Account: admin". Enter or a click opens it.
- No route of its own; it opens upward over the trigger. **Diagnostic logs** opens a screen of its own (below).

## What it shows and what the user can do

Its trigger shows the account's initial in a round mark, the account's name, *admin*, and beneath it the server it is signed in to (such as `127.0.0.1:4318`); its accessible name is "Account: admin". An API that sends no name leaves the trigger reading **Account**. The menu opens upward over the trigger, as wide as it, and holds, in order: **Appearance** with its three choices as icons on the same row ([appearance](../subsystems/interface.md#appearance)); the **Language** row ([interface language](../subsystems/localisation.md#interface-language)); **Diagnostic logs**; **Report a problem…** ([below](#report-a-problem)); and, after a rule, **Log out**. Each row has its icon. Escape or a click outside closes it and Escape returns the focus to the trigger.

- **Language** opens the language list (`language-list`) in the menu's place.
- **Log out** ends the sign-in on this installation and returns to [sign-in](sign-in.md).
- When the API and the extension were built from different commits, the trigger says **Different builds: API …, extension …** under the server, so it shows without opening the menu ([packaging and releases](../subsystems/packaging-and-releases.md#behaviour)).

### Report a problem

**Report a problem…** in the account menu opens a dialog of that name from any screen ([D336](../decisions/d336-report-a-problem.md)). **About** chooses what the report is about: on a page, *The whole page*, chosen first, or one of its content cards by its module's name; elsewhere, *This screen*. **What went wrong?** takes the user's own text, required, at most 2,000 characters. **Sent with your report** lists what is kept with it: the page and its cards as they are now (on a page), the build of the API and of the extension, and **Diagnostic logs from the last 15 minutes**, ticked at first. **Save report** keeps the report in the account's database and closes the dialog; **Cancel** closes it and keeps nothing. A notice then says **Report saved**, with **Undo**, which deletes the report again while the notice shows. A report keeps what it was about when that page is later deleted. Reports leave the computer only as described in [diagnostic logging](../subsystems/observability-and-reports.md#reports).

### Diagnostic logs

**Diagnostic logs** opens its own screen, `app.html#diagnostics`, with the trail *Home › Diagnostic logs*. It shows how much of the extension's buffer and the API's log budget is used and the API's content mode, says when logging is degraded, sets the extension's buffer budget (0 to 1024 MiB), and previews and clears logs by UTC range, or the extension's buffer alone. The rules are in [observability and reports](../subsystems/observability-and-reports.md#retention-cleanup-and-failure); the owner's terminal commands are in the [diagnostics guide](../guides/diagnostics.md).

## States

- **A report that fails to save** keeps the dialog open with what was typed, and says so.
- **A language that fails to save** keeps the previous language and says so in the list ([interface language](../subsystems/localisation.md#interface-language)).
- **Different builds** add the warning line to the trigger, under the server.

## Source

| Part | Source |
| --- | --- |
| The menu, its rows and the language list | `renderAccountMenu`, `languageViews`, `fillIdentity` in [`shell.js`](../../extension/shell.js) |
| Appearance | [`theme.js`](../../extension/theme.js) |
| The builds and the warning | [`builds.js`](../../extension/builds.js), [`version-line.ts`](../../extension/version-line.ts) |
| Report a problem | [`report-dialog.ts`](../../extension/report-dialog.ts); `POST /api/reports` and `/api/reports/delete` |
| Diagnostic logs | [`diagnostic-settings.js`](../../extension/diagnostic-settings.js); [`diagnostic-routes.mjs`](../../src/server/diagnostic-routes.mjs) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/localisation.test.mjs`](../../tests/browser/localisation.test.mjs) | Language in the menu, the account's preference across installations |
| [`tests/browser/accounts.test.mjs`](../../tests/browser/accounts.test.mjs) | Appearance in every open view, and logging out |
| [`tests/browser/report.test.mjs`](../../tests/browser/report.test.mjs) | Reporting about a card and off a page, saving and Undo |
| [`tests/extension.test.mjs`](../../tests/extension.test.mjs) | The warning when the builds differ |
| `npm run screens -- --only '^(account-menu\|language-list\|report-dialog\|diagnostics)$'` | The menu, the language list, the report dialog and diagnostic logs |
