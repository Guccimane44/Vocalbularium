# Step 7: Decide, then build the picker

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

A decision record first, because the picker replaces D11's one pinned model. It settles:

- **The rule:** a card takes the highest tier among its requested facets, not a sum of difficulties, so many easy facets never outrank one hard one. A facet's own Retry uses that facet's tier.
- **Failure:** what happens when the stronger model fails or times out (fall back to Haiku, or show an error).

Settled already (owner, 2026-11-24): no tier cap for users or decks (they get a fixed allowance), no Zen models, and no link to the deferred deck-level effort setting.

Then build: the tier on each facet, the picker in the composer or provider, a per-tier model setting on the server, and the token limit per tier. Tests cover routing, Retry and fallback.

**Check:** unit tests for routing. `tests/generation.test.mjs` and `tests/generation-recovery.test.mjs` pass.
