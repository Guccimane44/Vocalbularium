# v0.17.0 master plan: trustworthy judging, then a model picker by facet difficulty

Each step has its own plan in this folder. A step's plan is written in full when the step starts; until then its file holds the scope agreed here.

## Why

Generation quality depends on which facets a card has. Some facets need knowledge a small model lacks: etymology, and German inflection forms. Others do not, such as the article. The goal is to give each card the cheapest model that writes all of its facets well. That needs two things we do not have yet: per-facet quality numbers we can trust, and a judge that can tell a plausible fault from a correct answer.

## What we know already (2026-11-24)

- **Reasoning effort is not the lever.** Haiku 5.5 at medium, high and xhigh, against default, on German, Computer Science and Joke (84 cards each, 1 sample). Medium matched default on time and tokens. High cost about 40% more and was no better. Xhigh doubled time and cost, and cut off 4 German cards before they finished. Results: `.data/bench/results.md`.
- **A stronger model is.** On the German golden set, the Opus 5.5 judge scored Opus 5.5 cards 45 pass, 9 weak, 0 fail, and Haiku cards 22 pass, 23 weak, 9 fail. Haiku's fails were guessed etymologies (Ufer, Fernweh, wegen), wrong Präteritum forms (run, 把, get up) and a garbled word. Opus ran through Claude Code subagents, so its time and cost were not measured. The cross-check with a third judge, which would rule out Opus favouring its own cards, did not finish.
- **The Haiku judge misses those faults.** It passed German calibration 27/27, yet flagged one etymology as weak and none as failed on the same cards.
- **The calibration set is too easy.** Of German's 13 fail cards, about 9 are planted, obvious faults. Two touch etymology, one of them blatant. No card expects weak. Five pass cards were wrong until 2026-11-23. The judge prompt was tuned against the same cards.
- **Go's strongest models**, on the Artificial Analysis Intelligence Index (ModelGrep, November 2026): Gemini 4 Argon 50.4, Kimi K3.1 Pro 46.5, Qwen4 Max 42.9, then Haiku 5.5 at 36.5. GPT-6 Luna, the audit model, scores 27.9. Opus 5.5 scores 59.1.

## Decisions taken (owner, 2026-11-24)

1. **No Zen.** Opus 5.5 is reached through Claude (headless Claude Code), not through OpenCode Zen. Generator candidates stay on Go.
2. **The judge is stronger than the generator.** Opus 5.5 is the default judge. Since every generator candidate is a Go model, none is stronger than the judge, and Opus never judges its own product cards.
3. **The quality bar is the judge's verdict.** Quality is not scored by hand. The headless Opus judge gives each card pass, weak or fail against the module's rubric, and a tier meets the bar when its cards meet the gate's existing thresholds: no fail, and at most 10% weak.
4. **No tier cap for users or decks.** Users get a fixed allowance; the picker's cost is ours to manage.
5. **The older v0.17 plan is deferred** ([incrementv17.md](../incrementv17.md)): no deck-level effort setting, no reflection, no language expansion in this release.
6. **Argon is the audit model** (2026-11-25). Gemini 4 Argon replaces GPT-6 Luna as the second judge, which only informs. No other model is tested as a judge.

## German first

Every step runs on the German module first, through to a working picker for German. Other modules then repeat the per-module steps (step 9).

## The loop

golden set → generate → score closed facets against references, judge the open ones → verify new findings → grow the calibration set and the failure points

## Steps

| Step | Plan | Ends with |
| --- | --- | --- |
| 1 | [Rework the golden set](01-golden-set.md) | A German golden set built from each facet's failure points, with reference answers for the facets that have one right answer, and a test that makes every new facet grow the set |
| 2 | [Rework the calibration set](02-calibration-set.md) | German cards with verified verdicts, real defects, weak cases and a held-out part, reviewed by the owner |
| 3 | [Measure the judge](03-judge.md) | A per-facet report of the headless Opus judge on German's held-out cards, and the facets its verdicts do not cover |
| 4 | [Baseline the current model](04-baseline.md) | Haiku's per-facet fail and weak rates, time and cost, with their run-to-run spread |
| 5 | [Benchmark the candidate models](05-benchmark.md) | The same numbers for Argon, Kimi and Qwen on Go |
| 6 | [Derive the difficulty table](06-difficulty-table.md) | A tier on each German facet, in the catalog |
| 7 | [Decide, then build the picker](07-picker.md) | A decision record, and the picker in code with tests |
| 8 | [Verify end to end](08-verify.md) | The gate and a real capture on each tier, against the baseline |
| 9 | [Roll out module by module](09-rollout.md) | English and Chinese, then Expertise, then Creativity |
| 10 | [Keep the loop running](10-upkeep.md) | Standing rules for growing the calibration set and re-running the benchmark |

## Tooling to build along the way

Build these as scripts, not one-off runs. Each step's plan says which one it builds.

- A golden-set coverage report, and a scorer that checks the closed facets (article, declension, conjugation, comparison, case) against reference answers (step 1).
- Calibration cards graded per criterion, with missed fails counted per criterion, a structure test, and a review file for the messy cards (step 2).
- Calibration that reports held-out agreement and pass/weak agreement (step 3).
- A judge adapter for headless Claude Code, so the gate can call Opus (step 3).
- Judge output files named so that parallel runs cannot overwrite each other (a collision lost three runs on 2026-11-24) (step 3).
- A bench script that takes the model, effort and sample count (a cleaned-up `.data/bench/bench.mjs`) and records tokens, time and cost per card (step 4).
- A per-criterion and per-facet report across runs (`.data/bench/opus/compare.mjs` is the sketch) (step 4).
