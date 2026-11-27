# Step 3: Measure the judge (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

Opus 5.5 is the judge (owner, 2026-11-24), run through headless Claude Code. No stronger model is available, so this step does not choose a judge or decide whether Opus may judge. It measures where Opus's verdicts can be trusted on German, fixes what its instructions can fix, and records what is left, so steps 4 to 6 know how far to rely on its numbers.

- **Adapter.** Build what the judge and gate need to call Opus through headless Claude Code.
- **Measure on the held-out cards.** Opus scores the calibration set without seeing the labels. Only the held-out cards count. The report gives agreement and missed fails per criterion and per facet (from the calibration cards' `facet` field), as counts such as "missed 1 of 4", not just one overall score. Pass/weak agreement is a separate number. Agreement is also given per generator, and on messy cards separately for Haiku's and Opus's cards. Claude (Opus) graded the messy cards, so Opus's agreement on them is a sign, not a measure. Step 3 also gives the judge the messy-capture section of the rubric, which `rubricOf` does not read yet. 90% agreement with no missed fail stays the target for each facet, not a gate.
- **Fix, then measure again.** Where Opus misses fails, change its instructions or German's `rubric.md`, tuning only against the cards that are not held out, and measure again on the held-out cards.
- **Record what is left.** Each facet where Opus still misses fails is listed with what checks it instead: the step 1 scorer, a dictionary check, or the owner. Steps 4 to 6 read this list.
- **Second check on closed facets.** The judge's verdicts on closed facets are compared with the step 1 scorer on the same cards.
- **Audit model.** Gemini 4 Argon is the second judge, which only informs (owner, 2026-11-25). No other model is run on the calibration set. The gate's `AUDIT_MODEL` default moves from GPT-6 Luna to Argon, and the [quality gate](../../subsystems/quality-gate.md) page says so.
- Judge output files named so parallel runs cannot overwrite each other.

**Check:** a per-facet report of Opus on German's held-out cards, kept as the baseline for later reruns, and the list of facets its verdicts do not cover.
