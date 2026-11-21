# Install Vocabularium in Chrome

A candidate ZIP contains this guide, the `extension` folder, and `package-info.json`, which identifies the package version, server address, and source revision. The package is a local build: it connects to the Vocabularium API on the **same computer** at `127.0.0.1:4318`.

## Before installing

Use current Google Chrome. Start PostgreSQL 18 and the local API first, following the [local PostgreSQL setup](local-postgresql.md) and the README's [account and dashboard steps](../../README.md#account-and-dashboard): `npm ci`, `npm run db:setup`, then `npm start` from the repository root. Check that `package-info.json` shows the expected version and `http://127.0.0.1:4318` before signing in.

Use a separate Chrome profile for this local account rather than one that held an earlier hosted build. What an upgrade keeps and changes is stated for each release in its own file under [docs/releases](../releases/README.md); this package carries its own as `RELEASE.md` ([0.16.8](../releases/0.16.8.md)).

## Install

1. Extract the ZIP to a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted `extension` folder containing `manifest.json`.
4. Open Chrome's Extensions menu and select **Vocabularium**. Pin it if you want the button visible.
5. Sign in with username **admin** and password **admin**.
6. To use Vocabularium in Arabic, Chinese (Simplified), French, Russian or Spanish, open **Account**, then **Language**, and pick one. The choice belongs to the account, so every installation connected to it follows.

The dashboard starts with **My Deck**. Select text on a webpage, right-click, and choose **Create a page in “My Deck”** (or the current default deck name). Recent outcomes appear on the dashboard; open a page to see its components. On a page and in deck settings, the module window on the right adds modules: drag one into place. Each component card has its own Edit, Generate or Retry, and Delete.

## Update an installed copy

Finish or cancel manual edits and let active generation finish. When the update includes a backend change, stop the API, back up the database with `npm run db:backup -- .data/backup-before-<version>.dump` (a file that does not exist yet; see [backup and restore](local-postgresql.md#backup-and-restore-into-a-separate-database)), apply the reviewed migrations with `npm run db:migrate`, and restart the API before updating the extension; backend and extension upgrade together. Keep the PostgreSQL database and `DATA_DIR/generation-outbox`. Read the version's `RELEASE.md` in the package (the latest is [0.16.8](../releases/0.16.8.md)) before migrating: it says what the upgrade keeps and changes. Finish or discard pending saves first.

Replace the files in the same permanent extension folder with the new package, then select **Reload** on Vocabularium's entry at `chrome://extensions` and reload any open Vocabularium dashboard tabs. Reloading ends the extension's generation session, so unfinished generation is reconciled as failed; review those components using the [capture and generation rules](../subsystems/generation.md) and retry them explicitly.

## If something does not work

- **Cannot sign in:** check the server address in `package-info.json` and that the local API is running (`GET http://127.0.0.1:4318/health/ready`).
- **`npm start` says another API already owns the database or the port is in use:** an earlier API is still running; only one API may serve the account. The message names the address and the build that answers there. Stop that process (Ctrl+C in its terminal, or end it by its process ID: `lsof -i :4318` shows it on macOS and Linux), then start again.
- **"Different builds" under your name in the account menu:** the extension and the API come from different commits, shown as two short commit IDs (`?` for an API older than this check). Restart the API from the checkout the extension was built from, or rebuild and reload the extension; `GET http://127.0.0.1:4318/health/live` names the API's version, commit and whether its checkout had uncommitted changes.
- **No capture menu:** open Vocabularium and sign in; make sure the extension is enabled and some text is selected.
- **Capture received, but generation failed:** the receipt confirms capture only. Check each component's outcome on the saved page. Generation needs the owner's OpenCode Go key on the server.
- **English Pronunciation has the wrong voice:** English speaks as `en`, so the voice decides the accent. Name one for its part in `ELEVENLABS_VOICES`, beside the others: `{"default":"<voice id>","english.pronunciation":"<voice id>"}` (a part without its own voice falls back to `en`, then `default`), and restart the API. The entries `english-british.pronunciation` and `english-american.pronunciation` of 0.16.4 and earlier are no longer read.
- **A Pronunciation clip failed or never plays:** spoken parts need `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICES` on the server (see `.env.example`); the text of the card appears without them. Use **Retry** on the clip after setting them and restarting the API. When several clips of one card fail with *Too much audio at once*, the server sends more speech calls at a time than the ElevenLabs plan allows: set `AUDIO_MAX_ACTIVE` to the plan's concurrency limit (2 by default) and restart the API.
- **Try saving again:** resubmits the pending save. **Retry** on a card starts replacement generation, after "Are you sure?" when the card has content.

Collect [diagnostic logs](diagnostics.md) if needed. Report the package version, Chrome version and operating system, steps, and visible message in the relevant delivery issue. Do not include API keys.
