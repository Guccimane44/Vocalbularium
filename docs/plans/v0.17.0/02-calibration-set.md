# Step 2: Rework the calibration set (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

The calibration set is cards paired with verdicts, not one right answer per key. Since step 1 scores the closed facets (article, declension, conjugation, comparison, case) against reference answers, the calibration set concentrates on the open facets the judge scores: core, examples, synonyms, antonyms, etymology, simple translation, grammar teacher and pronunciation. A few closed-facet cards stay, so the judge's verdicts can be checked against the scorer.

- **Pass cards:** generated from the new golden set ([step 1](01-golden-set.md)), checked line by line against DWDS, Duden or Kluge for facts.
- **Real defects first:** faults models actually made, starting with the Opus-run findings (Ufer, Fernweh and wegen etymologies; run, 把 and get up Präteritum forms), each confirmed against a source. Planted faults only where no real defect covers a facet.
- **Hard cases per hard facet:** at least 3–4 real fails each for etymology (folk etymology and disputed origins included) and for each other open facet, including plausible-but-wrong cases.
- **Cards that expect weak**, so the line between pass and weak is tested.
- **A held-out part** (about a third) that no judge prompt is ever tuned against.
- Each verdict records its reason and its source.

Claude drafts verdicts with sources. The owner gives the final verdict on every card where the source and the draft disagree, and on every judgement call.

**Check:** the owner has reviewed the set. Haiku as judge now fails calibration on German (it misses the etymology fails). If it still passes, the set is still too easy.
