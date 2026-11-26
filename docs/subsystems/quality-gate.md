# Quality gate

The quality gate gives a quality verdict on a content module's cards. It informs a release; it does not block one. It runs a module's golden set against the live model, checks each card with the catalog's content checks, has a judge model score each card against the module's rubric, and gives one verdict, passed or failed. A judge counts only after it has scored the module's calibration set, an answer key of cards whose right verdict is known. A second judge from another model family then audits the same cards and lists where the two disagree, without changing the verdict. The gate runs on a developer's machine, never for a user: generation for a user runs no checks and no judge (see the [module catalog](module-catalog.md)). What a module, its facets and its checks are is in the [module catalog](module-catalog.md); how a card is generated is in [generation](generation.md).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| The gate | Runs the steps below in order, applies the thresholds, writes one report per run. | [`scripts/gate.mjs`](../../scripts/gate.mjs) (`WEAK_SHARE`, `CALIBRATION`) |
| Golden set | The inputs a module's cards are written for, some with the flags they must get; run live, calling the provider directly, one card per input by default. | [`tests/golden/`](../../tests/golden); [`scripts/golden-set.mjs`](../../scripts/golden-set.mjs), [`scripts/golden-card.mjs`](../../scripts/golden-card.mjs) |
| Content checks | Deterministic tests of each part of a card, defined by its facet. | a facet's `checks` in the catalog; `checkCard` in [`checks.ts`](../../packages/domain/src/checks.ts) |
| Rubric | What a good card of the module is, as named criteria. | `rubric.md` beside each module's `module.prompt.md` in the [catalog](../../packages/domain/src/catalog) |
| Judge | Scores one card per criterion as pass, weak or fail, after its content checks. | `judgeCard` in [`scripts/judge.mjs`](../../scripts/judge.mjs); its instructions in [`scripts/judge.md`](../../scripts/judge.md); headless Claude Code in [`scripts/claude-code.mjs`](../../scripts/claude-code.mjs) |
| Judge report | Combines several calibration runs: missed and unsteady fails per criterion and facet, pass and weak agreement, results by who wrote the card, and the scorer beside the labels on closed facets. | `tally` and `closedFacets` in [`scripts/judge-report.mjs`](../../scripts/judge-report.mjs) |
| Golden plan | A module's failure points per facet, which facets are scored against references, and the frequency bands. | `catalog/<family>/<module>/golden/plan.ts`, listed in [`golden/index.ts`](../../packages/domain/src/golden/index.ts) (`@vocabularium/domain/golden`, never imported by the extension) |
| Golden folder | A module's items and reference answers, read and checked through one reader. | `tests/golden/<module>/`; [`scripts/golden-sets.mjs`](../../scripts/golden-sets.mjs) |
| Scorer | Scores a golden run's closed facets against the references, per facet, failure point, band and split. | [`scripts/golden-score.mjs`](../../scripts/golden-score.mjs) (`npm run golden:score -- <module>`); [`scripts/golden-coverage.mjs`](../../scripts/golden-coverage.mjs); [`scripts/golden-draft.mjs`](../../scripts/golden-draft.mjs) |
| Calibration set | The answer key: cards with the verdicts a careful human gives them, per criterion or for the card as a whole. | [`tests/golden/calibration/<module>.json`](../../tests/golden/calibration), read by [`scripts/calibration.mjs`](../../scripts/calibration.mjs) |
| Audit | A second judge on the same cards; lists the cards the two score differently. | `disagreements` in [`scripts/judge.mjs`](../../scripts/judge.mjs); the audit step in [`scripts/gate.mjs`](../../scripts/gate.mjs) |
| Reports | Every gate run, golden run, judgement and calibration, kept locally and never committed. | `.data/gates/`, `.data/golden/`, `.data/judge/` |

## Runtime path

`npm run gate -- <module>` takes these steps:

1. **Offline tests.** The catalog, prompt snapshot, localisation, content check and judge tests run first, with no model call.
2. **Golden set.** Each input in the module's golden set is sent to the generating model (`OPENCODE_MODEL`, Claude Haiku 5.5 by default), and each card is checked for any flags its input expects and by its content checks. Checks and judging look only at the facets the card shows.
3. **Calibration lookup.** The gate finds the latest calibration that scored this module with the judge's model (`JUDGE_MODEL`, the generating model by default). `JUDGE_MODEL=claude-code/<model>` judges through headless Claude Code on the owner's plan, with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` in `.env`; `claude` runs from an empty folder with no settings, skills or tools, so the owner's own CLAUDE.md and rules never reach it. Such a calibration counts only for that name, apart from the same model on OpenCode.
4. **Judge.** Only when the golden set produced a run and that calibration passed, the judge scores every card of the run. Without a calibration the step fails with the command that calibrates it; without a run it is skipped.
5. **Audit.** Whenever the golden set produced a run, the audit model (`AUDIT_MODEL`, Gemini 4 Argon by default since v0.17.0) scores the same cards. The gate matches the two judges' cards by position and lists every card whose overall verdict differs, with both judges' reasons. It also reports the audit model's latest calibration for the module, if any; the audit does not need one to run.
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

A card carries its labels in one of two forms:

- **Graded per criterion**: a verdict, pass, weak or fail, for every criterion of the module's rubric, and for each criterion graded weak or fail a list of reasons, each with its source. A reason under the facets criterion also names the facet it is about, such as antonyms. The card's verdict is its worst criterion.
- **Graded as a whole**: one verdict and one reason for the card. This form is for a card no source can grade criterion by criterion, and every card made before v0.17.0 uses it.

Each card is in one of two parts, `dev` or `held-out`. The judge's prompt is tuned against the dev part; the held-out part shows how it does on cards it was not tuned against. A card made from a golden item is in that item's part, `held-out` for the item's `test` split. A card also says who settled its verdicts (`decided`), and may name the golden item, the model that wrote it and whether its fault is real or planted. [`scripts/calibration.mjs`](../../scripts/calibration.mjs) reads the files and rejects a card that breaks this shape, naming the file, the card and the fix.

`npm run judge -- --calibrate <module>` has the judge score every card without seeing the labels; `--part dev` or `--part held-out` scores one part only. For a card graded per criterion, a **missed fail** is a criterion labelled fail that the judge did not fail, reported with the facets its reasons name: a judge that fails the card for another criterion still misses it. For a card graded as a whole, it is the card labelled fail that the judge did not fail. A card the judge could not score misses every fail it has. The judge is **calibrated** for the module when it agrees with at least 90 % of the labels and misses no fail. Agreement is pass-or-fail only: a card the judge rates *weak* counts as agreeing with a *pass* label. The first rule shows it is not too strict; the second, that it is not blind to a known fault. Because *weak* counts as *pass* here, a judge can rate a real fault weak and still be calibrated. A calibration counts only for the model it ran with: a new judge model calibrates again.

One run can mislead, since a judge does not give the same verdict every time. `--runs 3` writes three runs, each to its own file with a random part in its name, so runs started together never overwrite each other; `--parallel <n>` judges that many cards at once (4 by default through Claude Code). `npm run judge:report -- <runs…>` combines them: a fail is **missed** when most runs miss it and **unsteady** when fewer do. It gives counts, not percentages, below 10 cards, and calls a part with fewer than 5 fails unproven rather than covered. A rubric's section after its criteria, such as German's on messy captures, goes to the judge with them; it adds no criterion.

Some rules below are working agreements kept by review, not by code: who writes labels, which model family audits, and who approves a threshold change.

**The audit: a second opinion.** By default the judge belongs to the same model family as the generator, and can share its blind spots. The audit judge comes from another family, so it catches some faults the judge passes. It is also stricter than the owner's labels and less steady from one run to the next. So it informs and never decides: a card it lists is a lead to read, and is fixed only when its reason holds up.

### Golden folders

A module with a golden plan (German since v0.17.0) keeps its golden set in `tests/golden/<module>/` instead of a single file, and no family file runs it. The set is built from the facets up:

- **Failure points.** The plan lists, for every facet and the core, the ways it can fail, such as the ihr form in the Präteritum. Its type is a record over the module's facets, so a facet without failure points does not compile. A failure point marked as an abstention is one where the right answer is to leave something out, such as no Etymology for a word of unclear origin.
- **Items** (`items.json`). Each item names the failure points it fills, its split (dev or test) and its German word, or for a foreign key the German words it may translate to. A knowledge item's DWDS frequency class gives its band: common (4–6), middle (2–3) or rare (0–1). Prompt work looks only at dev items. Test items change only by addition.
- **References** (`references.json`). For the closed facets (Article, Declension, Conjugation, Comparison, Case), each word's right answers, expanded from de.wiktionary by `npm run golden:draft` and checked against DWDS. An alternative is one whole right paradigm (der or das Joghurt), a cell may hold several accepted forms, `"none"` means the word has no such facet, and every decision against the source is recorded in `disputes`. `npm run golden:draft -- german --check [words…]` reruns the DWDS comparison: it reads the grammar line of each word's entry page on dwds.de and compares the key cells (a noun's gender, genitive singular and plural; a verb's er/sie/es in the Präsens and Präteritum and its Perfekt; an adjective's comparative, superlative and whether it declines). It prints each disagreement no dispute decides, fails while one remains, and writes nothing. A dispute decides the cells it names (`Perfekt|*` covers every person of the Perfekt). Prepositions are not compared, since DWDS's line names only their case.
- **Scoring.** `npm run golden:score -- <module>` compares each closed facet of a run's cards with the references, cell by cell, with no judge. A wrong cell fails only the failure points that own it. A plural left out, with every form given right, is weak, not fail (owner, 2026-11-25).
- **Coverage.** Every failure point needs at least 3 items, one in the test split, and the points of Etymology, Conjugation and Declension one item per band where the band has words. `tests/catalog.test.mjs` fails on any gap and names the fix; `npm run golden:coverage -- <module>` prints the table.

Until v0.17.0 step 3, the judge still scores closed facets too, and the gate does not run the scorer.

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
| [`tests/judge.test.mjs`](../../tests/judge.test.mjs) | Every module with a rubric has named criteria; how a card's verdict follows from its checks and criteria; every calibration file reads, with at least 5 pass and 5 fail cards per module; which fails a judgement misses; how the audit matches two judges' verdicts; the Claude Code adapter against a fake `claude`; the rubric's notes reaching the judge; the report's missed and unsteady counts across runs |
| [`tests/content-checks.test.mjs`](../../tests/content-checks.test.mjs) | Each facet's checks on recorded good and bad cards |
| `npm run judge -- --calibrate [module] [--part dev\|held-out] [--runs n]` | Live: a judge model against the calibration sets, or one part of them; reports agreement and missed fails per criterion |
| `npm run judge:report -- <runs…>` | Offline: combines calibration runs into the per-criterion and per-facet report |
| `npm run gate -- <module>` | Live: the whole gate, with the audit |

How to work through a failing gate is in the [Verify skill](../../.agents/skills/vocabularium-verify/SKILL.md#the-gate-loop).
