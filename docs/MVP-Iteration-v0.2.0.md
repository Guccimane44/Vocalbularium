# v0.2.0 MVP iteration

## Changes

### Dashboard copy

- Remove the copy “Your words, kept close.”
- Remove the eyebrow text “YOUR VOCABULARY.”
- Replace “A growing collection.” with “Your decks.”

### Deck actions on the card-list page

Add a deck-actions menu to the deck’s card-list page with the same actions currently available from the dashboard’s three-dot menu:

- **Set as default**
- **Configure deck**
- **Delete deck**

Use the same confirmation dialogs and default-deck rules in both locations.

### Chrome context-menu label

When the user is signed in and a default deck exists, change the context-menu item from:

> Add to default deck

to:

> Create a card in “{default deck name}”

Update the label when the default deck is renamed or changed. Keep the action unavailable when capture is unavailable.

### Card-list status styling

On the deck’s card view page and in the recent capture section on the dashboard:

- Remove the visible “Completed,” “Loading,” and “Failed” status badges.
- Color the entire card row according to its state, using color blind palette for all three states:
  - completed
  - pending
  - failed
- Preserve an accessible status label or equivalent so status is not communicated by color alone.
- Keep cards without a generation status visually neutral.
- picking the color based on its conventional indicating meaning.

### Three-dot menu behavior

Fix the dashboard three-dot menu so that it closes after an action is selected and does not remain open after the dashboard rerenders or navigates.

### Dark mode

Add a Light/Dark theme toggle.

- Apply the selected theme across all extension views, dialogs, notices, and capture feedback.
- Apply the change immediately without reloading.
- Persist the selected theme after closing and reopening the extension.
- Maintain readable text and control contrast in both themes.

### Card-row navigation

Make the entire card row on the deck’s card view page clickable.

- Clicking anywhere on a card row opens that card’s content page.
- The user should not need to click only the entry text.
- Preserve the existing card sorting and index behavior.

## Acceptance criteria

- [ ] The card view page provides Set as default, Configure deck, and Delete deck.
- [ ] Card rows use state colors without visible status badges.
- [ ] The three-dot menu closes correctly after use.
- [ ] Light/Dark mode works across the extension and persists after restart.
- [ ] Existing capture, generation, retry, saving, deletion, and synchronization behavior continues to pass regression checks.
- [ ] Clicking any card row opens the correct card content page.
