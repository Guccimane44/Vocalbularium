# Install Vocabularium in Chrome

A candidate ZIP contains this guide, the `extension` folder, and `package-info.json`, which identifies the package version, server address, and source revision. Release 0.4.1 is a local build: it connects to the Vocabularium API on the **same computer** at `127.0.0.1:4318`.

## Before installing

Use current Google Chrome. Start PostgreSQL 18 and the local API first, following the [local PostgreSQL setup](../architecture/local-postgresql.md) and the README's [account and dashboard steps](../../README.md#account-and-dashboard): `npm ci`, `npm run db:setup`, then `npm start` from the repository root. Check that `package-info.json` shows the expected version and `http://127.0.0.1:4318` before signing in.

Use a separate Chrome profile for this local account rather than one that held an earlier hosted or karte/seite build. Upgrading from that build discards its decks and kartes; accounts and sign-in stay ([upgrade from earlier builds](../product/scope.md#upgrade-from-earlier-builds)).

## Install

1. Extract the ZIP to a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted `extension` folder containing `manifest.json`.
4. Open Chrome's Extensions menu and select **Vocabularium**. Pin it if you want the button visible.
5. Sign in with username **admin** and password **admin**.

The dashboard starts with **My Deck**. Select text on a webpage, right-click, and choose **Create a page in “My Deck”** (or the current default deck name). Recent outcomes appear on the dashboard; open a page to see its components.

## Update an installed copy

Finish or cancel manual edits and let active generation finish. When the update includes a backend change, stop the API, back up the database, apply the reviewed migrations with `npm run db:migrate`, and restart the API before updating the extension; 0.4.x backend and extension upgrade together. Keep the PostgreSQL database and `DATA_DIR/generation-outbox`.

Replace the files in the same permanent extension folder with the new package, then select **Reload** on Vocabularium's entry at `chrome://extensions` and reload any open Vocabularium dashboard tabs. Reloading ends the extension's generation session, so unfinished generation is reconciled as failed; review those components using the [capture and generation rules](../specs/capture-and-generation.md) and retry them explicitly.

## If something does not work

- **Cannot sign in:** check the server address in `package-info.json` and that the local API is running (`GET http://127.0.0.1:4318/health/ready`).
- **No capture menu:** open Vocabularium and sign in; make sure the extension is enabled and some text is selected.
- **Capture received, but generation failed:** the receipt confirms capture only. Check each component's outcome on the saved page. Generation needs the owner's OpenCode Go key on the server.
- **Try saving again:** resubmits the pending save. **Retry** on a component or the whole page starts replacement generation after a warning.

Collect [diagnostic logs](diagnostics.md) if needed. Report the package version, Chrome version and operating system, steps, and visible message in the relevant delivery issue. Do not include API keys.
