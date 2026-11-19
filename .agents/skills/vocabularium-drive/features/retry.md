# Retry

A card, or one of its facets, is generated again from the page's current main key and Context. A failed card shows **Retry <Module>** beside its tab; a completed card's Retry asks first, because it replaces the content, edits included. Rules: [capture and generation](../../../../docs/specs/capture-and-generation.md) and decisions [D19](../../../../docs/decisions/d19.md), [D22](../../../../docs/decisions/d22.md) and [D28](../../../../docs/decisions/d28.md).

## Sub-features

- Retry a failed card.
- Retry a completed card (asks: **Yes, retry <Module>**).
- Retry one facet, from the facet's own menu.
- Retry from the page list (**Retry…**).

## How to get to it (user POV)

On a page, a failed card shows **Generation failed** and a **Retry <Module>** button. For a completed card, click its tab, then **Retry**.

## Driving it with drive

- Launch with `--seed full`: it has a failed page for each module group. Find one with `query("SELECT page_id, id FROM components WHERE module_type = 'german' AND status = 'failed'")`.
- Click **Retry German**, answer **Yes, retry German** if it is asked, and wait for the component's `status` to become `completed` and the card's `.list-status` to go.
- Journey: [retry-a-failed-card.mjs](../journeys/retry-a-failed-card.mjs).

## Gotchas

- The provider is chosen at launch for the whole session. With `--provider unavailable` every Retry fails again; with `samples` it completes.
- Retry uses the page's main key and Context at the moment it is confirmed, not the ones of the first attempt.
