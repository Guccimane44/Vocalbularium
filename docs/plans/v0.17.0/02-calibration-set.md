# Step 2: Rework the calibration set (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

The calibration set is cards paired with verdicts, not one right answer per key. Since step 1 scores the closed facets (article, declension, conjugation, comparison, case) against reference answers, the calibration set concentrates on the open facets the judge scores: core, examples, synonyms, antonyms, etymology, simple translation, grammar teacher and pronunciation. A few closed-facet cards stay, so the judge's verdicts can be checked against the scorer.

- **Pass cards:** generated from the new golden set ([step 1](01-golden-set.md)), checked line by line against DWDS, Duden or Kluge for facts.
- **Real defects first:** faults models actually made, starting with the Opus-run findings (Ufer, Fernweh and wegen etymologies; run, 把 and get up Präteritum forms), each confirmed against a source. Planted faults only where no real defect covers a facet.
- **Hard cases per hard facet:** at least 3–4 real fails each for etymology (folk etymology and disputed origins included) and for each other open facet, including plausible-but-wrong cases.
- **Cards that expect weak**, so the line between pass and weak is tested.
- **A held-out part** (about a third) that no judge prompt is ever tuned against.
- Each verdict records its reason and its source.

## Messy captures

Step 1 added 36 messy captures to the golden set: slang, typos, broken selections, made-up words, colloquial forms, and noise such as a hashtag or an emoji, in seven languages. They have no right answer and no dictionary to check against, and the golden set gives the model no instruction on them: it decides what to make of each capture. So the owner is the judge here.

- **Cards:** each messy item is generated once by Haiku and once by Opus, so the set holds both weaker and stronger handling of the same capture (about 72 cards).
- **Verdicts:** the owner gives every card pass, weak or fail, with a one-line reason. Claude drafts no verdict on these cards, so the owner's judgement is not anchored to one.
- **What the reasons become:** Claude collects the reasons into a short section on messy input in German's `rubric.md`, which the owner approves. That section is what the judge is told in step 3.
- **Held out:** a third of the messy cards, drawn from the items in the golden set's test split, are held out like the rest.
- **Review:** the cards are laid out in one file for the owner, each with its capture, its Context and the card's core, with a place for the verdict and the reason.

Claude drafts verdicts with sources on every other card. The owner gives the final verdict on every card where the source and the draft disagree, and on every judgement call.

**Check:** the owner has reviewed the set and given a verdict on every messy card. Haiku as judge now fails calibration on German (it misses the etymology fails). If it still passes, the set is still too easy.
