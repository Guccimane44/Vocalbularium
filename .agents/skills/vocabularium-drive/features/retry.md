# Retry

How to drive this feature with `npm run drive`. How Retry behaves is in [generation](../../../../docs/subsystems/generation.md#retry); where it is offered is in the [page](../../../../docs/screens/page.md) screen reference.

## Driving it with drive

- Launch with `--seed full`: it has a failed page for each module group. Find one with `query("SELECT page_id, id FROM components WHERE module_type = 'german' AND status = 'failed'")`.
- Click **Retry German**, answer **Yes, retry German** if it is asked, and wait for the component's `status` to become `completed` and the card's `.list-status` to go.
- Journey: [retry-a-failed-card.mjs](../journeys/retry-a-failed-card.mjs).

## Gotchas

- The provider is chosen at launch for the whole session. With `--provider unavailable` every Retry fails again; with `samples` it completes.
- Retry uses the page's main key and Context at the moment it is confirmed, not the ones of the first attempt.
