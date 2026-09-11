# Install Vocabularium in Chrome on Windows

This is an MVP testing candidate. The package's `package-info.json` identifies its version, server address, and source revision. Hosted and owner Windows acceptance are still pending.

## Before installing

Use current Google Chrome (minimum supported version 120). A package labeled **local** connects to a server on the same computer at `127.0.0.1:4318`. The hosted package will be built with the Render address after access is arranged; both test installations must use that same hosted address.

## Install

1. Extract the ZIP to a permanent folder, such as `Documents\Vocabularium`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted `extension` folder containing `manifest.json`.
4. Open Chrome's Extensions menu and select **Vocabularium**. Pin it if you want the button visible.
5. Sign in with username **admin** and password **admin**.

The initial dashboard contains **My Deck**. Select text on a normal webpage, right-click, and choose **Add to default deck**. “Capture received” disappears after three seconds. Open the dashboard to check the save and generation outcome, then open the saved card.

## Update an installed copy

Finish or cancel manual edits and allow active generation to finish. Replace the files in the same permanent extension folder with the new package, then select **Reload** on Vocabularium's entry at `chrome://extensions`. Keep the backend address unchanged to access the same account. Reloading the extension ends its browser session, so unfinished generation is reconciled as failed.

Do not delete the backend's account-data directory when updating it. Saved decks and cards belong to the backend account.

## If something does not work

- **No capture menu:** open Vocabularium and sign in; make sure the extension is enabled and some text is selected.
- **Cannot sign in:** check the server address in `package-info.json`. A local package requires its local backend to be running. A hosted package requires the configured server to be reachable.
- **Capture received, but generation failed:** the request receipt confirms capture only. Check the saved card's page outcome. Server generation needs the owner's OpenAI API key.
- **Try saving again:** this resubmits the pending save. **Retry** on a captured page starts replacement generation after a warning.
- **Chrome closed during generation:** reopen it and review the card's failed page; use explicit page Retry when ready.
- **Feedback on a restricted page:** Chrome can prevent a page overlay. A separate brief feedback window is the fallback; owner Windows presentation remains part of acceptance.

Report the package version, Chrome version, Windows version, steps, and visible message in the linked [Windows milestone](https://github.com/Guccimane44/Vocalbularium/issues/12). Do not include API keys.
