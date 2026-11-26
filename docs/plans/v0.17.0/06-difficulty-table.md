# Step 6: Derive the difficulty table (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

A facet's tier is the cheapest model whose cards meet the bar on that facet: no fail, at most 10% weak, by the Opus judge. An assisted facet (etymology, synonyms, antonyms) gets two tiers: with a reference, and without one, for words its source does not cover. Etymology without a reference has no tier, since it is left out (owner, 2026-11-26). Facets where no model beats Haiku stay on the cheap tier and get prompt work instead (simple translation is the likely first). Tiers live in each module's facet definitions in the catalog (D25: a module owns its facets). There is no central table.

**Check:** the table reproduces the benchmark. A card routed by it scores no worse than the strongest model on its hardest facet.
