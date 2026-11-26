# Step 3: Measure the judge (German)

Scope agreed in the [master plan](README.md); this is the full plan (2026-11-26).

Opus 5.5 is the judge (owner, 2026-11-24), run through headless Claude Code. No stronger model is available, so this step does not choose a judge or decide whether Opus may judge. It measures where Opus's verdicts can be trusted on German, fixes what its instructions can fix, and records what is left, so steps 4 to 6 know how far to rely on its numbers.

## What we start from

- **The calibration set** from [step 2](02-calibration-set.md): 216 German cards. The dev part has 83 graded cards and 40 messy ones; the held-out part has 61 graded and 32 messy. Dev's graded cards are Haiku's plus the 21 old ones; held-out's are Haiku's (36) and Argon's (25). No Opus-written graded card exists.
- **Fails in the held-out part**, per criterion and facet: etymology 23, grammar tip 7, declension 4, examples 3, German 3, article 3, and 2 each for meaning, simple translation, conjugation, synonyms, opposites and pronunciation. Weak cards: article 5, declension 5, synonyms 4, grammar tip 3, simple translation 3.
- **No way to call Opus from a script.** `scripts/judge.mjs` only knows the OpenCode provider. In step 2, Opus judged through files relayed to Claude Code subagents. On 2026-11-26, `claude -p` in a terminal answered "Not logged in": the desktop app's sign-in does not reach the command line, and `--bare` (which loads no CLAUDE.md, hooks or plugins) accepts only an `ANTHROPIC_API_KEY`.
- **A bias to keep in mind.** Claude, which is Opus, drafted every graded verdict and graded every messy card. The graded verdicts rest on DWDS and Pfeifer, and the owner decided 44 of them, so the bias there is limited. The messy cards rest on Claude's judgement alone, so Opus's agreement on them is reported as a sign, not a measure.

## The adapter

A provider class, `scripts/claude-code.mjs` (only scripts use it), that `judge.mjs` picks when `JUDGE_MODEL` starts with `claude-code/` (`claude-code/claude-opus-5-5`); `claude-haiku-5-5` alone still names the OpenCode model. It runs one `claude -p` per card:

- the judge's instructions as `--system-prompt`, the card as the prompt on standard input, `--output-format json`; the schema travels inside the instructions, as it does for OpenCode, and the reply's text parses as the verdict;
- no tools (`--tools ""`), no saved session (`--no-session-persistence`), no settings (`--setting-sources ""`), no skills (`--disable-slash-commands`), a time limit per card;
- an empty working folder in `.data/`, so this project's CLAUDE.md, hooks and Stop hook never reach the judge;
- a bare environment: only `HOME`, `PATH` and `CLAUDE_CODE_OAUTH_TOKEN`, so nothing from the shell or the desktop app that started it reaches `claude`;
- Claude Code 2.1.280 or newer, which Opus 5.5 needs; the adapter names the version when `claude` refuses the model;
- the reply's text, time, tokens and cost read from the JSON result into the judge's output, as the meter does for OpenCode.

**What must reach the judge, and what must not.** The owner's own CLAUDE.md and rules in `~/.claude/` must not shape a verdict. The trial below showed that `--setting-sources ""` keeps them out with the plan's token, so no API key is needed.

## The trial (2026-11-26)

`.data/calibration/claude-trial.mjs` (local, not committed) judged 5 dev cards through `claude -p` with the adapter's flags above.

- **What reached the judge.** Asked to quote any instructions besides its system prompt: with default settings Opus quoted the owner's CLAUDE.md and `rules/pstack-models.md`; with `--setting-sources ""` it quoted neither. One block stays in every mode: Claude Code attaches the account's email address. It carries no instruction, so it is left as it is.
- **The reply** is the verdict's JSON as plain text, which the judge's existing parser reads. `--json-schema` is not needed.
- **Time and size.** 7 to 12 seconds per card, about 4,500 tokens in and 500 to 1,200 out. Claude Code reports $0.01 to $0.05 per card at API prices; on the owner's plan it counts against the plan instead. Three runs of all 216 cards are about 650 calls: about 1.6 hours one at a time, about 25 minutes at 4 at once.
- **Verdicts**, a sign only: the Ufer etymology fail and the run Präteritum fail were caught. The messy card した was judged weak, not fail, as expected while the messy-capture rules don't reach the judge. A pass card (Computer) was judged weak for a simple translation that leaves out "berechnet"; that is a reading of the rubric, not a dictionary point, so its label is left to the dev fix rounds.
- **One leak to keep in mind.** The messy-capture rules use the dev card した as their example. Its dev result after the rules are wired in shows nothing about the judge.


**Parallel runs.** Cards run a few at a time (4 by default), and output files get a unique name (`<date>-<random>-calibration-<part>.json`), so two runs never overwrite each other.

## How the measurement works

**Three runs, not one.** Opus does not give the same verdict every time. Each part is judged three times. A fail counts as missed only when two of the three runs miss it; a miss in one run of three is listed as unsteady. Agreement is the share of cards where at least two runs agree with the label.

**The held-out part is run twice in this step, no more.** Once before any change to the instructions (the baseline), once after all changes (the result). Every other run is on the dev part. Looking at held-out results between changes would tune the instructions to them, and they would stop being held out. Each held-out run is recorded in this plan with its date, so a third one shows.

**The report** (`npm run judge:report -- <calibration run>...`, written to `.data/judge/` as `.md` and `.json`):

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

1. **Trial.** Done on 2026-11-26 (above).
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

## Owner answers

- **Sign-in** (2026-11-26). The adapter uses the owner's Claude plan. The owner runs `claude setup-token` and puts the token it prints in `.env` as `CLAUDE_CODE_OAUTH_TOKEN` (`.env` is ignored by git). The adapter passes it to `claude -p` and never logs it. If the trial shows the owner's own CLAUDE.md or rules still reach the judge, the owner is asked again before an API key is used.
