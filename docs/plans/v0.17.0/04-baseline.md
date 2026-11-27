# Step 4: Baseline the current model (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

Run the golden set with Haiku 5.5 at default effort, 3 samples per key, judged by the Opus judge, reading its per-facet report from step 3. Record per-facet fail and weak rates, time and cost per card. Etymology, synonyms and antonyms are run twice, with and without their [references](03b-references.md), so each has both numbers; the share of words with no entry is recorded too. Build the bench script and the per-facet report here.

**Check:** run the baseline twice. Per-facet rates should stay within a few points of each other, or the sample count goes up.
