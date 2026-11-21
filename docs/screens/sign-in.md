# Sign-in

The sign-in view is what the extension shows when no one is signed in on this installation. There is one account, `admin`; the rules for it, the token's seven-day lifetime and logging out are in [sessions and recovery](../subsystems/sessions-and-recovery.md#account-and-sign-in).

## Getting there

- The toolbar button opens `app.html`, which shows this view when the installation has no sign-in.
- **Log out** in the [account menu](account-menu.md) returns here, and so does any request the API answers with 401 (an expired or revoked sign-in).
- There is no route of its own and no trail: the sidebar is hidden while signed out.

## What it shows

1. **The header**, with the appearance control (**System**, **Sage**, **Moss night**) on its own, since there is no account menu ([appearance](../subsystems/interface.md#appearance)).
2. **"Welcome back."** and one line, "Sign in to open your decks and saved vocabulary."
3. **Username** and **Password**, both required, with the browser's username and current-password autocomplete.
4. **Sign in**, the one primary button.
5. **The build line** under the form: the extension's version and commit ([packaging and releases](../subsystems/packaging-and-releases.md#behaviour)).

## What the user can do

- **Sign in.** The button is disabled while the request runs. Success opens Home; a failure shows its error and keeps what was typed.
- **Choose the appearance.** It is kept on this installation and survives signing in and out.

## States

- **Signed out after an expiry.** A page draft and a pending save are kept and offered again after signing in ([sessions and recovery](../subsystems/sessions-and-recovery.md)).
- **The API not running.** Signing in fails with the API's connection error.

## Source

| Part | Source |
| --- | --- |
| The view and its form | `login` in [`app.js`](../../extension/app.js) |
| The signed-out header and hidden sidebar | `showSignedOutShell` in [`shell.js`](../../extension/shell.js) |
| Signing in | the worker's `login` message in [`background-runtime.js`](../../extension/background-runtime.js) → `POST /api/login` → `Authentication.login` in [`auth.mjs`](../../src/server/auth.mjs) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/accounts.test.mjs`](../../tests/browser/accounts.test.mjs) | Signing in, two installations, reopening, a server failure, logging out, and expired access keeping a draft |
| `npm run screens -- --only '^sign-in$'` | The `sign-in` screenshot, in both themes; English only, since a signed-out view has no account language |
