# Quality gate

The quality gate gives a quality verdict on a content module's cards. It informs a release; it does not block one. It runs a module's golden set against the live model, checks each card with the catalog's content checks, has a judge model score each card against the module's rubric, and gives one verdict, passed or failed. A judge counts only after it has scored the module's calibration set, an answer key of cards whose right verdict is known. A second judge from another model family then audits the same cards and lists where the two disagree, without changing the verdict. The gate runs on a developer's machine, never for a user: generation for a user runs no checks and no judge (see the [module catalog](module-catalog.md)). What a module, its facets and its checks are is in the [module catalog](module-catalog.md); how a card is generated is in [generation](generation.md).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| The gate | Runs the steps below in order, applies the thresholds, writes one report per run. | [`scripts/gate.mjs`](../../scripts/gate.mjs) (`WEAK_SHARE`, `CALIBRATION`) |
| Golden set | The inputs a module's cards are written for, some with the flags they must get; run live, calling the provider directly, one card per input by default. | [`tests/golden/`](../../tests/golden); [`scripts/golden-set.mjs`](../../scripts/golden-set.mjs), [`scripts/golden-card.mjs`](../../scripts/golden-card.mjs) |
| Content checks | Deterministic tests of each part of a card, defined by its facet. | a facet's `checks` in the catalog; `checkCard` in [`checks.ts`](../../packages/domain/src/checks.ts) |
| Rubric | What a good card of the module is, as named criteria. | `rubric.md` beside each module's `module.prompt.md` in the [catalog](../../packages/domain/src/catalog) |
| Judge | Scores one card per criterion as pass, weak or fail, after its content checks. | `judgeCard` in [`scripts/judge.mjs`](../../scripts/judge.mjs); its instructions in [`scripts/judge.md`](../../scripts/judge.md) |
| Calibration set | The answer key: cards with the verdict a careful human gives them. | [`tests/golden/calibration/<module>.json`](../../tests/golden/calibration) |
| Audit | A second judge on the same cards; lists the cards the two score differently. | `disagreements` in [`scripts/judge.mjs`](../../scripts/judge.mjs); the audit step in [`scripts/gate.mjs`](../../scripts/gate.mjs) |
| Reports | Every gate run, golden run, judgement and calibration, kept locally and never committed. | `.data/gates/`, `.data/golden/`, `.data/judge/` |

## Runtime path

`npm run gate -- <module>` takes these steps:

1. **Offline tests.** The catalog, prompt snapshot, localisation, content check and judge tests run first, with no model call.
2. **Golden set.** Each input in the module's golden set is sent to the generating model (`OPENCODE_MODEL`, Claude Haiku 5.5 by default), and each card is checked for any flags its input expects and by its content checks. Checks and judging look only at the facets the card shows.
3. **Calibration lookup.** The gate finds the latest calibration that scored this module with the judge's model (`JUDGE_MODEL`, the generating model by default).
4. **Judge.** Only when the golden set produced a run and that calibration passed, the judge scores every card of the run. Without a calibration the step fails with the command that calibrates it; without a run it is skipped.
5. **Audit.** Whenever the golden set produced a run, the audit model (`AUDIT_MODEL`, GPT-6 Luna by default) scores the same cards. The gate matches the two judges' cards by position and lists every card whose overall verdict differs, with both judges' reasons. It also reports the audit model's latest calibration for the module, if any; the audit does not need one to run.
6. **Report.** The gate prints each step and writes `.data/gates/<module>-<time>.md`.

## Behaviour

**The verdict.** A module passes when every counted step passes:

- the offline tests pass;
- every golden card is generated, gets any flags its input expects and passes its content checks;
- the judge is calibrated for the module, no card fails or goes unscored, and at most 10 % of cards are weak.

The audit is not a counted step: it is reported, and it never fails the gate.

**How a card is scored.** The judge gives each rubric criterion a verdict:

- **pass**: the card meets it fully;
- **weak**: a careful native reviewer would point out a flaw, but a learner would not be misled;
- **fail**: it does not meet it, or a learner would be misled (a wrong sense, a factual or grammatical error, a translation that says something else, the wrong language or script).

A card fails when any content check fails or any criterion fails. It is weak when a criterion is weak, and passes otherwise.

**Calibration: grading the judge.** A judge is a model grading another model's work, so its verdicts count only once it has shown it can be trusted on the module. A calibration set holds two kinds of card:

- cards the owner reviewed as good, labelled *pass*;
- cards labelled *fail*: copies of good cards with one fault planted on purpose, or real faulty cards recorded from earlier runs.

`npm run judge -- --calibrate <module>` has the judge score every card without seeing the labels. The judge is **calibrated** for the module when it agrees with at least 90 % of the labels and misses no expected fail. Agreement is pass-or-fail only: a card the judge rates *weak* counts as agreeing with a *pass* label. The first rule shows it is not too strict; the second, that it is not blind to a known fault. Because *weak* counts as *pass* here, a judge can rate a real fault weak and still be calibrated. A calibration counts only for the model it ran with: a new judge model calibrates again.

Some rules below are working agreements kept by review, not by code: who writes labels, which model family audits, and who approves a threshold change.

**The audit: a second opinion.** By default the judge belongs to the same model family as the generator, and can share its blind spots. The audit judge comes from another family, so it catches some faults the judge passes. It is also stricter than the owner's labels and less steady from one run to the next. So it informs and never decides: a card it lists is a lead to read, and is fixed only when its reason holds up.

**What a new module brings.** A content module joins when it has a golden set, a `rubric.md`, a calibration set whose labels the owner reviewed, a judge calibrated on it, and a passing gate.

## Constraints and failure behaviour

- **The labels are the answer key, and only a person sets them.** A wrong label grades the judge wrongly: a judge that rightly fails a faulty card labelled *pass* is counted as wrong. Labels are written by someone who can judge the module's language and subject, never by a model, and a label changes only with a reason that can be checked, recorded in the card's `why`.
- **A card labelled *pass* that carries a real fault is fixed, not relabelled**, unless the fault is the point. Fixing it keeps the set's balance of good cards and planted faults.
- **An uncalibrated judge never counts.** The gate fails its Judge step and says which calibration to run; it does not fall back to the uncalibrated verdicts.
- **A failure within a step is counted, not fatal.** A golden card that fails to generate is counted as failed and reported. A judge call that fails or times out leaves the card unscored, which counts as failed. If the audit cannot run, its step says so, and the verdict is unchanged. The exception: when the golden set produces no run at all, the judge is skipped and the report has no audit step.
- **Thresholds change only on purpose.** The 10 % weak share and the calibration bar live in `gate.mjs`. A change to them changes what a passing verdict means, and goes through the owner.
- **The gate spends provider usage.** Run it when a module's prompts, rubric or calibration set change, or a language is added; not on every commit.
- **Results stay local.** Golden runs, judgements, calibrations and gate reports are written under `.data/` and never committed.

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/judge.test.mjs`](../../tests/judge.test.mjs) | Every module with a rubric has named criteria; how a card's verdict follows from its checks and criteria; how the audit matches two judges' verdicts |
| [`tests/content-checks.test.mjs`](../../tests/content-checks.test.mjs) | Each facet's checks on recorded good and bad cards |
| `npm run judge -- --calibrate [module]` | Live: a judge model against the calibration sets; reports agreement and missed expected fails |
| `npm run gate -- <module>` | Live: the whole gate, with the audit |

How to work through a failing gate is in the [Verify skill](../../.agents/skills/vocabularium-verify/SKILL.md#the-gate-loop).
