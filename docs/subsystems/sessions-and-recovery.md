# Sessions and recovery

Vocabularium has one account and any number of Chrome installations signed in to it. This page covers sign-in, the one browser session each installation holds at a time, how open views stay current, and what happens to work in progress when Chrome or the API stops. How a save gets to the store exactly once is in [capture and save](capture-and-save.md); how generation itself fails and retries is in [generation](generation.md). Public accounts, registration, OAuth and passkeys are proposed and not built ([scope](../product/scope.md)).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Sign-in | The one account, `admin`, with a scrypt password hash seeded on first start; a token lasts seven days and is stored only as its SHA-256 digest. Logging out revokes it. | `Authentication` (`login`, `accepts`, `logout`) in [`auth.mjs`](../../src/server/auth.mjs); `credential`, `saveToken`, `token`, `revokeToken` in [`postgres.ts`](../../src/persistence/postgres.ts) |
| Browser session | Each installation's `{ installationId, epoch, sessionId }`: the ID is kept in `chrome.storage.local`, the epoch grows each time Chrome starts (a worker restart keeps both), and the session itself lives in `chrome.storage.session`, so it ends when Chrome closes. | `initialize` in [`background-runtime.js`](../../extension/background-runtime.js) |
| Session check | Opening a session ends the installation's previous one and fails its loading attempts; capture, capture preparation, generate, poll and publish name a session and are rejected as `stale_session` once it has ended. | `openSession`, `requireSession` in [`store-sessions.mjs`](../../src/core/store-sessions.mjs); the `installations` table |
| Refresh | Open views ask the worker for the account every five seconds while visible, and redraw only when it changed. | the `setInterval` at the end of [`app.js`](../../extension/app.js); `refreshAccount` in [`background-runtime.js`](../../extension/background-runtime.js) |
| Generation recovery | On start, the API stages results kept in its journal and fails every loading attempt that has none. | `Generation.initialize` in [`generation.mjs`](../../src/server/generation.mjs) |
| Audio recovery | On start, the API fails the clips it was still speaking. | `Audio.initialize` in [`audio.mjs`](../../src/server/audio.mjs) |
| Receipt recovery | After a worker restart, interrupted capture and save receipts become pending for **Try saving again**; a capture the new worker is itself saving is not interrupted. | `reconcile` in [`capture.js`](../../extension/capture.js); `recover` in [`save-operations.js`](../../extension/save-operations.js) |

## Runtime path

1. The extension's page asks the worker to `initialize`. Without a stored token it shows the sign-in view; signing in posts `/api/login` and stores the token.
2. The worker makes or reads its browser session, and sends `/api/session` with operation `session-<sessionId>`. The store's `openSession` rejects a session older than the one it knows; a newer one replaces it and fails the previous session's loading attempts.
3. The worker reconciles its receipts against the new session ([capture and save](capture-and-save.md#constraints-and-failure-behaviour)), refreshes the account, and starts the `recover` alarm, which polls for generation results every 30 seconds.
4. While the page is visible it refreshes every five seconds. A refresh that finds the sign-in gone returns to the sign-in view.
5. When Chrome closes, `chrome.storage.session` is cleared. The next start opens a new session at a higher epoch, and step 2 fails whatever the old one left loading.

## Behaviour

### Account and sign-in

Vocabularium is account-based. The current build has one built-in owner-test account, `admin` with password `admin`, and no registration. It is one account with one set of decks and pages, not an account per installation: every Chrome installation signed in to the same backend sees the same data.

Clicking the extension button opens the dashboard in a Chrome tab when signed in, or the sign-in view otherwise. Successful sign-in opens the dashboard. A sign-in lasts seven days. **Log out** in the header ends it on that installation; account data and capture are unavailable until the user signs in again. An expired or revoked sign-in returns the user to the sign-in view.

### What the account owns

Decks, their configurations, the default-deck choice, and saved pages belong to the account and persist across closing and reopening Chrome. Unsaved drafts, capture receipts awaiting saving, the theme, and page-list sort orders belong to the installation.

### Browser sessions

Each Chrome installation has one browser session at a time, named by the installation, an epoch that grows each time the browser starts, and a session ID. Opening a new session ends the previous one: any generation that session had in progress is marked failed. A request from an older epoch, or from another session ID at the same epoch, is rejected as `stale_session`, so a browser that has been restarted never sees a reply meant for its earlier run.

### Synchronization

Open views refresh from the account every five seconds, and after each change the installation makes. Other installations' changes appear on the next refresh.

How saves from several installations are ordered, and what a failed save does, is in [capture and save](capture-and-save.md#saving-every-change).

### Chrome closing during generation

If Chrome closes on the installation that started a generation run, its unfinished attempts are considered failed. Completed and saved components remain intact. A retried component whose attempt was interrupted remains empty and failed under the replacement rule. Closing Chrome on another installation does not fail work initiated elsewhere.

On reopening Chrome, reconcile interrupted attempts as **Failed** and make the page accessible for explicit **Retry**. Do not automatically resume or restart those attempts. Late results from an interrupted attempt must not replace the failed state or the component's content.

Audio jobs follow the same rule: those still waiting or generating when Chrome closes are failed and can be retried.

Closing only the capture popup or dashboard tab does not count as closing Chrome. The three-second popup duration has no effect on generation lifetime.


## Constraints and failure behaviour

- **One API process.** The API holds an advisory lock on its database; a second API, or a migration against a running one, fails at start ([store](store.md#ordering-recovery-and-single-process-ownership)).
- **A restart never resumes a model call.** Attempts the API was running when it stopped are failed, unless their result reached the journal; the user retries them.
- **Only the session that started an attempt publishes it.** `publish` fails as `wrong_session` for any other session, so a restarted browser never receives a result meant for its earlier run.
- **A 401 signs the installation out**, from any request; the account's data stays on the server.

## Verification

| Check | What it covers |
| --- | --- |
| `npm run check:sessions` | An ended session changes nothing, and none of its attempts stays loading, for capture, publish and delete page in every order |
| [`tests/server.test.mjs`](../../tests/server.test.mjs) | Sign-in, two installations on one account, logout revoking one login, expired tokens, logins surviving a restart |
| [`tests/foundation.test.mjs`](../../tests/foundation.test.mjs) | A browser restart failing only its unfinished components and fencing late results; a worker reconnecting in the same session interrupting nothing |
| [`tests/postgres.test.mjs`](../../tests/postgres.test.mjs) | Session invalidation fencing late results; a restart keeping staged output and failing unowned generation |
| [`tests/generation-recovery.test.mjs`](../../tests/generation-recovery.test.mjs) | Session invalidation aborting active and queued work; the result journal surviving a failed database write and a restart |
| [`tests/browser/reliability.test.mjs`](../../tests/browser/reliability.test.mjs) | Worker suspension, abrupt exit and another installation, end to end |
| [`tests/browser/accounts.test.mjs`](../../tests/browser/accounts.test.mjs) | Signing in and out, two installations, reopening Chrome, and expired access keeping a draft |
