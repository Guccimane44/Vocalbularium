# Install Vocabularium in Chrome on Windows

This is an MVP testing candidate. The package's `package-info.json` identifies its version, server address, and source revision. Live generation and hosted synchronization pass; owner Windows acceptance is still pending.

## Before installing

Use current Google Chrome (minimum supported version 120). Choose `vocabularium-0.1.0-configured-candidate.zip` for the hosted test backend at `https://vocabularium.onrender.com`. Both test installations must use that same address. A package labeled **local** connects to a server on the same computer at `127.0.0.1:4318`.

The Render Free test server can take about a minute to wake up. Open [the backend health check](https://vocabularium.onrender.com/health), wait for the healthy response, then sign in. Its test decks, cards, login sessions, and pending server results can be erased when it sleeps, restarts, or is redeployed. Use disposable examples; this candidate does not provide durable hosted storage.

## Install

1. Extract the ZIP to a permanent folder, such as `Documents\Vocabularium`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted `extension` folder containing `manifest.json`.
4. Open Chrome's Extensions menu and select **Vocabularium**. Pin it if you want the button visible.
5. Sign in with username **admin** and password **admin**.

The initial dashboard contains **My Deck**. Select text on a normal webpage, right-click, and choose **Add to default deck**. “Capture received” disappears after three seconds. Open the dashboard to check the save and generation outcome, then open the saved card.

## Update an installed copy

Finish or cancel manual edits and allow active generation to finish. Replace the files in the same permanent extension folder with the new package, then select **Reload** on Vocabularium's entry at `chrome://extensions`. Keep the backend address unchanged to access the same account. Reloading the extension ends its browser session, so unfinished generation is reconciled as failed.

Saved decks and cards belong to the backend account. Keep the local backend's account-data directory when updating it. Render Free deployments reset that directory and require a fresh sign-in.

## If something does not work

- **No capture menu:** open Vocabularium and sign in; make sure the extension is enabled and some text is selected.
- **Cannot sign in:** check the server address in `package-info.json`. A local package requires its local backend to be running. For Render Free, open the server's `/health` address and allow it to wake up before trying again.
- **Capture received, but generation failed:** the request receipt confirms capture only. Check the saved card's page outcome. Server generation needs the owner's OpenCode Go API key and access to `deepseek-v4.1-flash`.
- **Test cards disappeared or sign-in is requested again:** the Render Free server may have reset. Sign in and create fresh test data; an old pending save cannot restore the erased account.
- **Try saving again:** this resubmits the pending save. **Retry** on a captured page starts replacement generation after a warning.
- **Chrome closed during generation:** reopen it and review the card's failed page; use explicit page Retry when ready.
- **Feedback on a restricted page:** Chrome can prevent a page overlay. A separate brief feedback window is the fallback; owner Windows presentation remains part of acceptance.

Report the package version, Chrome version, Windows version, steps, and visible message in the linked [Windows milestone](https://github.com/Guccimane44/Vocalbularium/issues/12). Do not include API keys.
