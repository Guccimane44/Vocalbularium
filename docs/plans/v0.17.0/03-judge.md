# Step 3: Measure the judge (German)

Scope agreed in the [master plan](README.md); this is the full plan (2026-11-26).

Opus 5.5 is the judge (owner, 2026-11-24), run through headless Claude Code. No stronger model is available, so this step does not choose a judge or decide whether Opus may judge. It measures where Opus's verdicts can be trusted on German, fixes what its instructions can fix, and records what is left, so steps 4 to 6 know how far to rely on its numbers.

## What we start from

- **The calibration set** from [step 2](02-calibration-set.md): 216 German cards. The dev part has 83 graded cards and 40 messy ones; the held-out part has 61 graded and 32 messy. Dev's graded cards are Haiku's plus the 21 old ones; held-out's are Haiku's (36) and Argon's (25). No Opus-written graded card exists.
- **Fails in the held-out part**, per criterion and facet: etymology 23, grammar tip 7, declension 4, examples 3, German 3, article 3, and 2 each for meaning, simple translation, conjugation, synonyms, opposites and pronunciation. Weak cards: article 5, declension 5, synonyms 4, grammar tip 3, simple translation 3.
- **No way to call Opus from a script.** `scripts/judge.mjs` only knows the OpenCode provider. In step 2, Opus judged through files relayed to Claude Code subagents. On 2026-11-26, `claude -p` in a terminal answered "Not logged in": the desktop app's sign-in does not reach the command line, and `--bare` (which loads no CLAUDE.md, hooks or plugins) accepts only an `ANTHROPIC_API_KEY`.
- **A bias to keep in mind.** Claude, which is Opus, drafted every graded verdict and graded every messy card. The graded verdicts rest on DWDS and Pfeifer, and the owner decided 44 of them, so the bias there is limited. The messy cards rest on Claude's judgement alone, so Opus's agreement on them is reported as a sign, not a measure.

## The adapter

A provider class beside `OpenCodeProvider`, `src/server/claude-code.mjs`, that `judge.mjs` picks when `JUDGE_MODEL` names a Claude model (`claude-opus-5-5`). It runs one `claude -p` per card:

- the judge's instructions as `--system-prompt`, the card as the prompt on standard input, the verdict's JSON schema as `--json-schema`, `--output-format json`;
- no tools (`--tools ""`), no saved session (`--no-session-persistence`), a time limit per card;
- an empty working folder in `.data/`, so this project's CLAUDE.md, hooks and Stop hook never reach the judge;
- the reply's text, time, tokens and cost read from the JSON result into the judge's output, as the meter does for OpenCode.

**What must reach the judge, and what must not.** The owner's own CLAUDE.md and rules in `~/.claude/` must not shape a verdict. The first task is a trial on 5 dev cards that checks this, with `--setting-sources` and `--bare` as the two ways to keep them out. If only `--bare` keeps them out, the adapter needs an API key (see open question 1).

**Parallel runs.** Cards run a few at a time (4 by default), and output files get a unique name (`<date>-calibration-<part>-<run id>.json`), so two runs never overwrite each other.

## How the measurement works

**Three runs, not one.** Opus does not give the same verdict every time. Each part is judged three times. A fail counts as missed only when two of the three runs miss it; a miss in one run of three is listed as unsteady. Agreement is the share of cards where at least two runs agree with the label.

**The held-out part is run twice in this step, no more.** Once before any change to the instructions (the baseline), once after all changes (the result). Every other run is on the dev part. Looking at held-out results between changes would tune the instructions to them, and they would stop being held out. Each held-out run is recorded in this plan with its date, so a third one shows.

**The report** (`npm run judge -- --report <calibration run>...`, written to `.data/judge/` as `.md` and `.json`):

- per criterion and per facet: cards, fails, missed fails and unsteady misses, as counts ("missed 1 of 2"), never as a percentage below 10 cards;
- pass/weak agreement per criterion and facet, as a separate count;
- the same split by generator (Haiku, Argon, the old cards), and the messy cards split by Haiku's and Opus's;
- the cost and time per card.

**What a small count can show.** With 2 fails, "missed 0 of 2" does not show the judge catches that fault; it only shows no sign that it doesn't. The report says so beside every part with fewer than 5 fails, and the list of what's left (below) treats those parts as unproven, not as covered.

## Fixing what Opus misses

Where Opus misses fails on the dev part, change its instructions (`scripts/judge.md`) or German's `rubric.md`, and run the dev part again. Changes are made only from dev cards. A change that fixes one criterion must not lower agreement on another: each dev rerun is compared with the one before, per criterion.

**When to stop.** Three rounds of changes at most, or sooner when a round changes nothing. What is still missed after that goes on the list of what's left.

**The messy-capture rules reach the judge.** `rubricOf` reads only the criterion lines of `rubric.md`. It also reads the "Messy captures" section, and the judge's instructions say to apply it when the capture is messy. This is done before the baseline, since the owner approved the rules in step 2.

## What's left, and what checks it instead

For each part where Opus still misses fails, or where the held-out count is too small to show anything, the list names what checks it instead in steps 4 to 6:

- **The step 1 scorer**, for the closed facets (article, declension, conjugation, comparison, case). It compares a card's forms with the golden set's references, so it needs no judge.
- **The owner**, for the open facets the judge cannot be trusted on: a sample of those facets read by hand in step 4.
- **No dictionary check** is built in this step. If etymology stays unreliable, building one is its own decision.

The list is written into this plan, and steps 4 to 6 read it.

## Second check on closed facets

The judge's verdicts on the closed facets are compared with the step 1 scorer on the same cards. The scorer works on golden runs; a small adapter feeds it the calibration cards by their golden item. Two changes come first:

- **The scorer learns weak.** Today it marks a left-out plural as a fail; the owner's ruling (2026-11-25) makes it weak. The scorer gives weak where a whole plural column or row is left out and every given form is right.
- **Where the scorer and the label disagree**, the label is checked against DWDS first, since the scorer's references can be wrong too.

The comparison is reported per closed facet: how often judge and scorer agree, and which one was right where they differ.

## Audit model

Gemini 4 Argon is the second judge, which only informs (owner, 2026-11-25). The gate's `AUDIT_MODEL` default moves from GPT-6 Luna to Argon, and the [quality gate](../../subsystems/quality-gate.md) page says so.

Argon is run once on the held-out part, with the same report. This is not a choice of judge: it tells steps 4 to 6 how much an Argon disagreement means. Argon wrote 25 of the held-out graded cards, so its agreement on its own cards is reported apart.

## Tasks

1. **Trial.** The owner signs in once (open question 1). Run `claude -p` on 5 dev cards: check what reaches the judge, the reply's shape, time and cost per card.
2. **The adapter**, with tests that stand in for `claude` (a fake command), and unique output names.
3. **The messy-capture rules** read by `rubricOf` and the judge's instructions.
4. **The report**: three runs, majority verdicts, counts per criterion, facet, generator and messy source.
5. **Baseline**: three runs on dev, three on held-out (held-out run 1 of 2).
6. **Fix rounds** on dev, three at most.
7. **Result**: three runs on held-out (run 2 of 2). Write the list of what's left.
8. **Scorer**: weak for a left-out plural, the calibration adapter, the closed-facet comparison.
9. **Argon**: `AUDIT_MODEL`, one held-out run, the quality-gate page.
10. `npm run check` and `npm test`.

Tasks 2 to 4 and task 8 can run in parallel; task 5 needs 1 to 4. One PR for the tooling (tasks 2 to 4, 8, 9's code), one for the measurement and the list (tasks 5 to 7, 9's run), so the second PR's numbers come from merged tooling.

## Check

- The baseline and result reports exist for dev and held-out, from three runs each, and the result is kept in `docs/plans/v0.17.0/` as the baseline for later reruns.
- The held-out part was run exactly twice, both dated in this plan.
- The list of what's left names every criterion and facet where Opus still misses a fail, or whose held-out count is under 5, with what checks it instead.
- The closed-facet comparison exists, and the scorer gives weak for a left-out plural, with a test.
- The adapter's tests pass without calling the real `claude`.

## Defaults taken

- Three runs per part, a miss counts when two runs miss.
- Held-out runs: two in this step.
- Three fix rounds at most.
- 4 cards in parallel.
- Counts, not percentages, below 10 cards; "unproven" below 5 fails.
- No dictionary check built here.
- Argon runs once on held-out, for information.
- The owner reads open facets the judge misses in step 4, by sample.

## Open questions for the owner

1. **How should the adapter sign in?** Two ways. A **subscription token**: you run `claude setup-token` once, and judging uses your Claude plan, but the trial must show your own CLAUDE.md and rules can be kept out. An **API key** (`ANTHROPIC_API_KEY`): `--bare` keeps everything out for certain, but each run is billed per token. The default is the subscription token, falling back to an API key if the trial shows it can't be kept clean.
