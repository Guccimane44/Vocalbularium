> DEFERRED — module iteration parked until the future module brief is given.
> Q40–Q44 below may be irrelevant or reframed by that brief, so no 1.0 catalog,
> input, multilingual, or custom-module assumptions are recorded here. Q45
> (composition) was answered by the page/component decision, Q72.

### Q40
OPEN — need: future module brief.

### Q41
OPEN — need: future module brief.

### Q42
OPEN — need: future module brief.

### Q43
OPEN — need: future module brief.

### Q44
OPEN — need: future module brief.

### Q45
Answered 10 October 2026 by [Q72](answers-06-data-and-semantics.md#q72) and implemented in release 0.4.0.
- Per-module components: each content module instance owns one component per page. Outputs are no longer joined into shared text.
- Re-generation: a retry of one component, or of the whole page, replaces the targeted components' content, including the user's edits to them, after confirmation. **Generate missing** fills only components that have none; it replaces nothing.
- Kept: the main key, the Context, manual components, and components of instances no longer configured. Generation never touches them.
- Configuration changes never rewrite existing pages; the next generation or retry uses the deck's current configuration.
- No edit history or append-only runs (Q33).

