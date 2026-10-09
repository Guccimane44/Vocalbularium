### Q52

- Leitner boxes — simplest correct scheduler; coarse but explainable and easy to eval.

### 53

**Amended 10 October 2026 by [Q72](answers-06-data-and-semantics.md#q72):** reviews reference page and component IDs, not karte/seite IDs. References to parts of a card wait for the card view module.

- Separate progress tables (reviews reference karte/seite IDs) — cleanest; karte content and study state evolve independently.

### 54

- Decks + tags — flexible cross-cutting; needs tag storage, rename/merge, and filter UI.

### 55

- Single-owner scale (low thousands) — current pagination suffices; budgets stay tight and cheap to meet. Latency targets are in Q16 (resolves C7).

### 56

- Visible queue (position, ETA, cancel) — transparent; needs attempt state broadcasting and cancellation semantics (Cancel will not refund quota once the provider call has started; cancelling a still-queued attempt costs nothing — narrowed by C9, see Q48).
