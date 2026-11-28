# Step 4: Baseline the current model (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

Run the golden set with Haiku 5.5 at default effort, 3 samples per key, judged by the Opus judge, reading its per-facet report from step 3. Record per-facet fail and weak rates, time and cost per card. Etymology, synonyms, antonyms and inflection are run twice, with and without their [references](03b-references.md), so each has both numbers; the share of words with no entry is recorded too. Etymology with a reference is checked for agreeing with its entry, not for truth. Build the bench script and the per-facet report here.

**Then decide whether the picker is needed**, by the rule in the [master plan](README.md#is-the-picker-still-needed): every facet meets the bar with its reference, one or two fall short, or several do. The owner confirms the outcome before step 5.

**Check:** run the baseline twice. Per-facet rates should stay within a few points of each other, or the sample count goes up.
