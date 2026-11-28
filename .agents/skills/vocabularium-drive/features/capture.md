# Capture

How to drive this feature with `npm run drive`. What the user sees is in the [capture](../../../../docs/screens/capture.md) screen reference; what a capture saves is in [capture and save](../../../../docs/subsystems/capture-and-save.md).

## Driving it with drive

- `webPage()` opens a web page (the API's own `/health/live`) so the capture has a tab to come from, and `capture(text)` calls the worker's capture handler the way the menu item does. A context menu cannot be clicked over CDP.
- Prove the side effect with `query`: one row in `pages` with `selected_text` equal to the text, and its content components reaching `status = 'completed'`.
- Then open `#page/<page id>` and wait for `h1.main-key` with the text and an `article.component` headed by the module's name.
- Journey: [capture-a-word.mjs](../journeys/capture-a-word.mjs).

## Gotchas

- The `samples` provider answers each parent module with its catalog sample, from `samples/en.json` in the module's folder under `packages/domain/src/catalog/`, with only the key changed. The card's content will not match the word you captured; check that a card completed, not what it says.
- `--provider unavailable` makes every card fail, which is how to see a capture's failed state.
- The capture popup is drawn into the web page by the worker. A screenshot of the app page won't show it; take one of the web page's tab.
- Context comes from the selection on a real page. The `/health/live` tab holds no selection matching the text, so no Context is found and the Context component stays empty.
- Nothing stops the same word being captured twice, so a query on `selected_text` can return more than one page.
