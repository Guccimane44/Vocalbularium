# Chrome capture extension

Load this folder using Chrome → Extensions → Developer mode → Load unpacked. No bundling is needed.

1. Open the working Vocabularium service and create a wordlist.
2. In Settings → Sync & devices, create a device token.
3. Open the extension, enter the service origin and token, choose Load wordlists, grant access to that origin, choose a default list, and Save connection.
4. Select a word on a page and choose **Add to Vocabularium** from the context menu, or type/paste in the popup.

Captures are saved in chrome.storage.local before confirmation, keyed by stable IDs. A one-minute alarm and browser startup retry uploads after service-worker termination. Captures remain assigned to their original account; signing into another account never uploads them. Unassigned captures require explicit assignment. Server acceptance is distinct from local saving. Tokens are excluded from exports and source control.

The owner-only Sites preview has an additional platform sign-in gate. For external-client verification, use a service endpoint that supports the configured email/Apple authentication without that preview gate; do not treat a preview-only token as proof of production connectivity.

Minimum Chrome: Manifest V3 with alarms, storage, contextMenus, and Intl.Segmenter (current Chrome). Actual Chrome installation/capture verification is still required before distribution.
