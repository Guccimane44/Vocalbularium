# Step 7: Decide, then build the picker

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

A decision record first, because the picker replaces D11's one pinned model and generation starts looking words up. It settles:

- **The rule:** a card takes the highest tier among its requested facets, not a sum of difficulties, so many easy facets never outrank one hard one. A facet's own Retry uses that facet's tier.
- **References:** an assisted facet counts at its "with reference" tier when its lookup found an entry, and at its "without" tier when not. The lookup runs before generation when the selection is German (one request), and after the core otherwise (a second, short request for the assisted facets, with its own tier). See the [master plan](README.md#how-the-pillars-fit-together).
- **Failure:** what happens when the stronger model fails or times out (fall back to Haiku, or show an error). A lookup that fails or times out counts as no entry found.

Settled already (owner, 2026-11-24): no tier cap for users or decks (they get a fixed allowance), no Zen models, and no link to the deferred deck-level effort setting.

Then build: the tier on each facet, the picker in the composer or provider, a per-tier model setting on the server, the token limit per tier, the live lookups from [step 3b](03b-references.md) in generation, the second request, and each source's credit line on the card. Tests cover routing, Retry, fallback, the lookup's time limit and the one-or-two-request flow.

**Check:** unit tests for routing. `tests/generation.test.mjs` and `tests/generation-recovery.test.mjs` pass.
