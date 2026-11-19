# Capture

The user selects a word or a sentence on any web page and sends it to Vocabularium from the context menu. A new page is made in the deck the menu names, with the selection as its main key, the surrounding paragraph as its Context, and one card per content module of that deck, each generated on its own. Rules: [capture and generation](../../../../docs/specs/capture-and-generation.md).

## Sub-features

- A word or phrase becomes a word page; a sentence becomes a sentence page.
- The Context: the paragraph around the selection, when the deck has a Context module.
- The capture popup on the web page ("Capture received").
- Recent captures on Home.
- The same selection captured twice makes two pages; a resubmitted capture (same receipt) does not.
- A capture made before sign-in, or while the API is down, says so and is kept to send later.

## How to get to it (user POV)

Select text on a web page, right-click, and choose **Create a page in "My Deck"** (the default deck's name). The page then appears under **Recent captures** on Home and in its deck.

## Driving it with drive

- `webPage()` opens a web page (the API's own `/health/live`) so the capture has a tab to come from, and `capture(text)` calls the worker's capture handler the way the menu item does. A context menu cannot be clicked over CDP.
- Prove the side effect with `query`: one row in `pages` with `selected_text` equal to the text, and its content components reaching `status = 'completed'`.
- Then open `#page/<page id>` and wait for `h1.main-key` with the text and an `article.component` headed by the module's name.
- Journey: [capture-a-word.mjs](../journeys/capture-a-word.mjs).

## Gotchas

- The `samples` provider answers every module with its catalog sample from `samples/en.json`, with only the key changed. The card's content will not match the word you captured; check that a card completed, not what it says.
- `--provider unavailable` makes every card fail, which is how to see a capture's failed state.
- The capture popup is drawn into the web page by the worker. A screenshot of the app page won't show it; take one of the web page's tab.
- Context comes from the selection on a real page. `capture(text)` passes no page selection, so the Context component stays empty.
