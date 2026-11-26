# Retry

How to drive this feature with `npm run drive`. How Retry behaves is in [generation](../../../../docs/subsystems/generation.md#retry); where it is offered is in the [page](../../../../docs/screens/page.md) screen reference.

## Driving it with drive

- Launch with `--seed full`: it has a failed page for each module group. Find one with `query("SELECT page_id, id FROM components WHERE module_type = 'german' AND status = 'failed'")`.
- A closed failed card shows **Retry German** beside its tab. Clicking it starts at once: a failed or empty card has nothing to replace, so nothing is asked. Wait for the component's `status` to become `completed` and the card's `.list-status` ("Generation failed") to go.
- On a card with content, **Retry** sits under **Actions** (`cardButton(page, 'Retry German')`) and asks first: answer **Yes, retry German**.
- A facet has its own **Retry** by its label, and so does a parent's core; both are described in the [page](../../../../docs/screens/page.md) screen reference.
- Journey: [retry-a-failed-card.mjs](../journeys/retry-a-failed-card.mjs).

## Gotchas

- The provider is chosen at launch for the whole session. With `--provider unavailable` every Retry fails again; with `samples` it completes.
- Retry reads the page's main key and Context when its attempt runs, not the ones of the first attempt.
