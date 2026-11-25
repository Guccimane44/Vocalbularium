# Step 3: Qualify the judge (German)

Scope agreed in the [master plan](README.md). The full plan is written when this step starts.

Opus 5.5 is the default judge (owner, 2026-11-24), run through headless Claude Code. This step builds the adapter the judge and gate need to call it, and qualifies it on the new calibration set. Only the held-out score counts. The bar stays at 90% agreement with no missed fails, and adds pass/weak agreement as a reported number.

Haiku 5.5, Gemini 4 Argon and Kimi K3.1 Pro are calibrated on the same cards for comparison, and to choose the audit model (the second judge that only informs).

The judge's verdicts on closed facets are compared with the step 1 scorer on the same cards, as a second check on the judge.

Also in this step: judge output files named so parallel runs cannot overwrite each other.

**Check:** Opus qualifies for German on the held-out cards.
