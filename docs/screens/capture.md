# Capture

Capture happens on the web page the user is reading, not in the extension's own tab: the context menu's **Create a page in “{deck}”**, the selection's flight into the popup, the popup itself, and the toolbar badge. What a capture saves and how it reaches the store is in [capture and save](../subsystems/capture-and-save.md).

## Getting there

- Select text on any web page, right-click, and choose **Create a page in “My Deck”** (the default deck's name). The item is there only while signed in with a default deck ([availability](../subsystems/capture-and-save.md#availability-and-the-default-deck)).
- The same works on Vocabularium's own tab, where the popup is drawn the same way.

## What it shows

### The menu, the popup, the flight and the badge

- **The popup.** As soon as the capture is accepted, a popup at the top right of the page says **Capture received**. It confirms receipt only, not saving or generation. It closes after exactly three seconds, or on its close button, and closing it cancels nothing. Each capture gets its own popup. It uses the Sage styling with the destination deck's colour, and looks the same on a web page and on Vocabularium's own dashboard. On the dashboard it opens no window and changes no focus or route, other dashboards don't show it, account rerenders keep it, and a theme change restyles it without restarting its timer. If that dashboard closes or navigates away, the capture goes on and its feedback goes nowhere else. On Chrome's restricted pages a small feedback window takes its place. A capture that can't be accepted shows a failure message instead.
- **The capture flight.** Where the selection can be read, it lifts off the page as a small label and flies along a short arc into the popup in about half a second. Labels over about 44 characters are cut with an ellipsis; the capture still takes the whole selection. The flight never delays the capture or moves the page, and is skipped under reduced motion, on restricted pages and when the capture fails.
- **The badge.** The toolbar icon counts the captures accepted since the dashboard was last opened, up to `99+`. Opening the dashboard clears it.
- **Where the page appears.** The extension never opens the new page or moves the user away from what they are reading. The page shows in its deck's list ([deck](deck.md)) while it generates and after it fails. The toolbar button opens the dashboard in a Chrome tab, where **Recent captures** lists the twenty newest captures and any receipts not saved yet; a receipt hands over to its saved page without the row disappearing for a moment.

## Source

| Part | Source |
| --- | --- |
| The menu item | `captureMenu` in [`context-menu.js`](../../extension/context-menu.js) |
| The popup and the feedback window | [`feedback.js`](../../extension/feedback.js), [`feedback-popup.js`](../../extension/feedback-popup.js), [`feedback-view.js`](../../extension/feedback-view.js), [`feedback-dashboard.js`](../../extension/feedback-dashboard.js); [`feedback.css`](../../extension/feedback.css) |
| The badge | `captureBadge` in [`badge.js`](../../extension/badge.js) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/capture.test.mjs`](../../tests/browser/capture.test.mjs) | The flight, reduced motion, the badge, and Recent captures |
| [`tests/browser/save-feedback.test.mjs`](../../tests/browser/save-feedback.test.mjs) | The popup on the dashboard: appearance, lifetime, the originating tab, rerenders and no extra windows |
| [`tests/extension.test.mjs`](../../tests/extension.test.mjs) | The menu item's title |

The popup is drawn into the web page, so the screens catalogue doesn't capture it.
