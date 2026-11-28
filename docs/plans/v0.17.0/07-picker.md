# Step 7: Decide, then build

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

What this step builds depends on step 4 ([master plan](README.md#is-the-picker-still-needed)): the references in generation always, and then either nothing more, a fix for the one or two facets that fall short, or the picker below.

A decision record first, because generation starts looking words up, and a picker would replace D11's one pinned model. If the picker is built, the record settles:

- **The rule:** a card takes the highest tier among its requested facets, not a sum of difficulties, so many easy facets never outrank one hard one. A facet's own Retry uses that facet's tier.
- **References:** an assisted facet counts at its "with reference" tier when its lookup found an entry, and at its "without" tier when not. Every lookup runs before generation, since the word looked up is the selection ([D374](../../decisions/d374-selection-facets.md)), so a card is one request.
- **Failure:** what happens when the stronger model fails or times out (fall back to Haiku, or show an error). A lookup that fails or times out counts as no entry found.

Settled already (owner, 2026-11-24): no tier cap for users or decks (they get a fixed allowance), no Zen models, and no link to the deferred deck-level effort setting.

Then build: the tier on each facet, the picker in the composer or provider, a per-tier model setting on the server, the token limit per tier, the live lookups from [step 3b](03b-references.md) in generation, and each source's credit line on the card. Tests cover routing, Retry, fallback and the lookup's time limit. Without the picker, only the lookups, the credit lines and their tests.

**Check:** unit tests for routing. `tests/generation.test.mjs` and `tests/generation-recovery.test.mjs` pass.
