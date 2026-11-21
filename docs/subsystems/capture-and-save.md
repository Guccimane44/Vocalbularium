# Capture and save

Capture turns a selection on a web page into a saved page in the default deck, and starts its generation. Saving covers how the extension gets every account change to the store exactly once: a durable receipt in the browser, an operation ID the store remembers, and **Try saving again** when a save did not get through.

This page ends where generation begins: what a generation attempt does and how it fails are in [generation actions](generation.md#generation-actions), and how **Retry** works is in [Retry](generation.md#retry). Browser sessions, which every capture names, are in [browser sessions](sessions-and-recovery.md#browser-sessions). What a captured page holds is in [context](../screens/page.md#context).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Capture menu | One context-menu item, **Create a page in “{deck}”**, named after the default deck of the stored account, removed when there is none. A zero-width space is put after the `%` of any `%s` in a deck name, because Chrome would replace `%s` with the selection. | `captureMenu`, `captureMenuTitle` in [`context-menu.js`](../../extension/context-menu.js) |
| Capture receipt | Written to `chrome.storage.local` as `capture-<operationId>` before anything is sent: the selection, the Context, the browser session and the default deck's modules at the moment of the click. Its `state` is `saving`, `pending` (with an error) or `saved` (with the page ID). | `handleCapture`, `submit` in [`capture.js`](../../extension/capture.js); `CaptureReceipt` in [`types/extension.ts`](../../types/extension.ts) |
| Context | The selection's surrounding block, read in the page through `chrome.scripting`, only when the deck has the Context module. | `captureContext` in [`context-extraction.js`](../../extension/context-extraction.js) |
| Feedback | The popup on the page (or a feedback window on restricted pages), the capture flight into it, and the toolbar badge. | [`feedback.js`](../../extension/feedback.js), [`feedback-popup.js`](../../extension/feedback-popup.js), [`feedback-view.js`](../../extension/feedback-view.js); `captureBadge` in [`badge.js`](../../extension/badge.js) |
| Save receipts | Every other page, deck and component change the worker sends is kept as `save-<operationId>` while it is in flight and after it fails, so it survives the worker stopping. | `saveOperations` (`perform`, `recordPending`, `recover`) in [`save-operations.js`](../../extension/save-operations.js) |
| Worker wiring | Opens the browser session, reconciles receipts after a restart, listens for the menu click and the `recover` alarm, and runs **Try saving again** (`try-saving-again`). | `startBackground` in [`background-runtime.js`](../../extension/background-runtime.js) |
| Routes | `POST /api/capture/prepare`, `POST /api/capture`, `POST /api/poll`, `POST /api/publish`, `GET /api/captures/recent`; each POST checks its payload against the contract before the store sees it. | [`routes.mjs`](../../src/server/routes.mjs); `CapturePreparationRequestSchema` in [`contracts/src/index.ts`](../../packages/contracts/src/index.ts), `PageCaptureRequestSchema` in [`contracts/src/pages.ts`](../../packages/contracts/src/pages.ts) |
| Operation receipts | The store runs each mutation once per operation ID and replays its first result. A reused ID with another payload fails as `operation_reused`. | `command` in [`store-sessions.mjs`](../../src/core/store-sessions.mjs); the `receipts` table ([`0000_account.sql`](../../migrations/0000_account.sql)) |
| Capture in the store | Checks the session, saves the page with its main key and Context in the deck's current configuration, and starts one generation run. | `prepareCapture`, `capture` in [`store-generation.mjs`](../../src/core/store-generation.mjs); `insertPage` in [`store-pages.mjs`](../../src/core/store-pages.mjs) |

## Runtime path

1. The user selects text and chooses **Create a page in “{deck}”**. `handleCapture` reads the sign-in, the browser session and the stored default deck. If any is missing, or the selection is empty, the popup says capture is unavailable and nothing is kept.
2. If the deck has the Context module, `captureContext` reads the surrounding block. A new operation ID is made, and the receipt is written with `state: 'saving'`. If writing the receipt fails, the popup says the capture was not received.
3. The popup shows **Capture received**, with the flight, and `submit` begins. Nothing after this point changes what the popup said.
4. `submit` asks `/api/capture/prepare` (operation `prepare-<id>`) for the deck's current configuration, puts that snapshot in the receipt's payload and marks the receipt `prepared: true`. A receipt recovered after the browser restarted may get `stale_session` here; it keeps the snapshot it was made with.
5. `submit` sends `/api/capture` with the receipt's operation ID and payload, and the current session as `recoverySession`. The route checks the payload (`captureValue`); the store's `capture` runs inside `command`, checks the session, saves the page and starts the run's attempts. If the capture comes from an earlier session of the same installation, its attempts are failed at once (`interrupted`), so the page exists with failed cards to retry.
6. A first acceptance (not a replay, not interrupted) starts generation (`generation.start`). Whatever the store answered, a successful reply adds one to the badge, the receipt becomes `saved` with its page ID, and `poll` begins.
7. `poll` calls `/api/poll` once a second while attempts are loading. For each ready attempt it sends `/api/publish` through a save receipt (operation `publish-<attemptId>`); for each attempt whose result the server could not save, it records a pending save. It stops when nothing is loading or a publish failed.
8. Any failure on the way leaves the receipt `pending` with its error. A 401 signs the installation out.

## Behaviour

### Availability and the default deck

Capture is offered for selected text once the extension is installed, initialised and signed in. The menu item names the last synchronised default deck. It follows sign-in, changes of the default, renames, deleting or replacing the deck, and account refreshes, including background recovery while Chrome is running. Offline, it keeps the last synchronised name, and unsaved drafts never change it. Signing out, an expired sign-in or a missing default or session removes it. Renaming the menu item never replaces the browser session.

The destination is the default deck at the moment of the click. Changing the default while generation runs does not redirect that capture. A new account starts with **My Deck** as its default ([initial default deck](store.md#initial-default-deck-example)); the dashboard can make another deck the default.

### What a capture saves

- The main key is the selected text exactly as selected. The Context is taken only when the deck has the Context module; the web page's URL and title are never taken ([Context](../screens/page.md#context)).
- The page gets a copy of the deck's module instances as the deck is configured when the store saves it, not as it was at the click, so Context is kept only if the deck still has the Context module then ([Context](../screens/page.md#context)).
- Every capture creates a new page, even for the same text in the same deck. There is no warning, merge or deduplication, and each duplicate can be edited and deleted on its own.
- The page is saved before generation begins, so it stays reachable when generation fails. Its existence does not mean generation succeeded.
- One generation run starts, with one attempt per content module instance. A run keeps the instances it started with; later changes to the deck or the page don't change it. Deleting the page, its deck or a targeted component cancels the affected attempts and never brings them back.
- Saving is automatic; the user never presses **Save** for a capture.

### Saving every change

Every page, deck and component change the extension sends (a capture, a page edit, a shaping step, a deck change, a publish) carries an operation ID, and the store applies it once. Signing in and out, and retrying one audio clip, don't. Sending the same operation again returns its first result instead of applying it twice.

- A save is never shown as saved before the store has it. A page whose cards failed is still saved; it is never labelled as generated.
- Saves from several installations apply in the order they reach the server, not in the order editing began or by device clocks. When two installations save different text for the same component, the later arrival wins; there is no merge or conflict dialog. Saves to different components keep both, because a save sends only what changed. A save to a page, deck or component that an earlier operation deleted fails instead of recreating it.
- A save never overrides a component that is generating: that save is rejected ([Retry](generation.md#retry)). A late result from a cancelled or interrupted attempt never overwrites a later save or Retry.
- A save in flight shows no recovery notice and no **Try saving again** (a capture still saving shows "Saving to your account" in Recent captures). A save that failed keeps its change and offers **Try saving again**, which sends the same operation again. It never generates, never starts another capture, never discards an edit and asks for no confirmation. It is a different thing from **Retry**, which generates again.
- A save interrupted by the worker stopping is offered for **Try saving again** when the worker starts again; it is never sent again silently. A successful save never briefly shows a recovery row in Recent captures or a page list.

## Constraints and failure behaviour

- **The receipt comes first.** Nothing is sent before the receipt is in `chrome.storage.local`. A capture whose receipt could not be written is reported as not received and is gone.
- **Every page, deck and component mutation goes through `command`.** It reads and writes the `receipts` row in the same transaction as the change, so a lost reply or a resent operation replays. The exceptions are sign-in, logout and an audio clip's Retry (`/api/pages/:pageId/audio/…/retry`), which needs none. Nothing makes a new mutation route use `command`; a reviewer checks.
- **A replay starts nothing.** The capture route starts generation only for a first acceptance (`!result.replayed`).
- **The session decides what runs.** `capture` and `prepareCapture` reject an ended session as `stale_session`. A capture recovered from an earlier session of the same installation is saved with its attempts failed; one from another installation fails as `wrong_session`.
- **After a restart.** `reconcile` turns every `saving` capture receipt into `pending` with "The save was interrupted. Try saving again.", and drops publish receipts of an earlier session. `recover` in `saveOperations` turns `saving` save receipts into `pending`, without a message. The `recover` alarm polls every 30 seconds while signed in.
- **Errors that end a save.** For a page, deck or component change, `confirmation_required`, `invalid`, `deleted`, `replacement` and `generation_busy` drop the receipt instead of keeping it for **Try saving again**, because sending the same operation again cannot succeed; a page's Generate also drops it on `generating`. Moving a deck and reports drop it on `invalid` and `deleted`, the language on `invalid`.
- **Upgrades.** A build with a new local data version (`DATA_VERSION` in [`recovery.js`](../../extension/recovery.js)) drops cached account data and unsent capture and save receipts once, and keeps the sign-in, installation identity, theme and log settings.
- **Logs.** `capture.invoked` is logged with the selection and Context as content ([observability](observability-and-reports.md#content-policy)); logging never fails a capture.

## Verification

| Check | What it covers |
| --- | --- |
| `npm run check:sessions` | Capture, publish and delete page in every order, with replays and ended sessions ([sessions skill](../../.agents/skills/vocabularium-sessions/SKILL.md)) |
| [`tests/browser/capture.test.mjs`](../../tests/browser/capture.test.mjs) | The receipt's lifetime, duplicate pages, interrupted and unsaved captures, Context, the flight and badge, and the hand-over in Recent captures |
| [`tests/browser/save-feedback.test.mjs`](../../tests/browser/save-feedback.test.mjs) | The popup on the dashboard, quiet successful saves, failed saves and **Try saving again**, and a save interrupted by worker loss |
| [`tests/browser/reliability.test.mjs`](../../tests/browser/reliability.test.mjs) | Lost acknowledgements, worker suspension, abrupt exit, another installation and cancellation, end to end |
| [`tests/postgres.test.mjs`](../../tests/postgres.test.mjs), [`tests/server.test.mjs`](../../tests/server.test.mjs) | Operation replay and `operation_reused`, session checks, and the capture route |
| [`tests/extension.test.mjs`](../../tests/extension.test.mjs) | The menu title, the receipts and `saveOperations` without a browser |
| `npm run drive` with [the capture journey](../../.agents/skills/vocabularium-drive/journeys/capture-a-word.mjs) | A real capture on a disposable account, with screenshots and database rows |
