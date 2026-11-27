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

- **What reached the judge.** Asked to quote any instructions besides its system prompt: with default settings Opus quoted the owner's CLAUDE.md and `rules/pstack-models.md`; with `--setting-sources ""` it quoted neither. One block stays in every mode: Claude Code attaches the account's email address (see Privacy below).
- **The reply** is the verdict's JSON as plain text, which the judge's existing parser reads. `--json-schema` is not needed.
- **Time and size.** 7 to 12 seconds per card, about 4,500 tokens in and 500 to 1,200 out. Claude Code reports $0.01 to $0.05 per card at API prices; on the owner's plan it counts against the plan instead. Three runs of all 216 cards are about 650 calls: about 1.6 hours one at a time, about 25 minutes at 4 at once.
- **Verdicts**, a sign only: the Ufer etymology fail and the run Präteritum fail were caught. The messy card した was judged weak, not fail, as expected while the messy-capture rules don't reach the judge. A pass card (Computer) was judged weak for a simple translation that leaves out "berechnet"; that is a reading of the rubric, not a dictionary point, so its label is left to the dev fix rounds.
- **One leak to keep in mind.** The messy-capture rules use the dev card した as their example. Its dev result after the rules are wired in shows nothing about the judge.


**Parallel runs.** Cards run a few at a time (4 by default), and output files get a unique name (`<date>-<random>-calibration-<part>.json`), so two runs never overwrite each other.

## Privacy: the account's email goes with every judge request

Claude Code attaches a short block to every request it sends: "As you answer the user's questions, you can use the following context", followed by the signed-in account's email address. It does this with the owner's plan token even with `--setting-sources ""`, `--disable-slash-commands`, a bare environment and `--safe-mode` (all tried on 2026-11-26; asked to quote what it was given, Opus quoted the email each time).

- **Where it goes.** Only to Anthropic, which already holds the account and its email. No card, prompt or verdict file in `.data/judge/` stores it: the judge's output keeps the verdicts and reasons, not the request.
- **What can drop it.** `--bare` sends no such block, but it reads no OAuth token: it needs an `ANTHROPIC_API_KEY`, billed per token. Claude Code's settings and environment variables documentation (read on 2026-11-26) names no switch that drops the block while signed in with a plan token.
- **The owner's choice** (2026-11-26): keep the plan token and accept the block.

## How the measurement works

**Three runs, not one.** Opus does not give the same verdict every time. Each part is judged three times. A fail counts as missed only when two of the three runs miss it; a miss in one run of three is listed as unsteady. Agreement is the share of cards where at least two runs agree with the label.

**The held-out part is run twice in this step, no more.** Once before any change to the instructions (the baseline), once after all changes (the result). Every other run is on the dev part. Looking at held-out results between changes would tune the instructions to them, and they would stop being held out. Each held-out run is recorded in this plan with its date, so a third one shows. The first held-out run waits until PR 367 is merged, so it runs on merged tooling with the messy-capture rules reaching the judge. Dev runs can go ahead before that.

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

## The judge with a reference, on etymology (dev only)

Dev run 1 (2026-11-26, one run) had Opus missing 13 of 16 etymology fails. Etymology is the part where a judge without a dictionary is weakest, and the [master plan](README.md)'s references pillar puts a dictionary entry beside the request. So the dev part is also judged with a Wiktionary etymology beside each card, to show how far a reference closes the gap:

- **Two conditions, same cards.** Three runs without a reference (the dev baseline), three with the card's grammar word's Wiktionary etymology in the judge's input, marked as a reference to check against, never as the answer.
- **Wiktionary's gaps are counted apart.** Cards where Wiktionary has no etymology, or where it disagrees with the label (which rests on Pfeifer), are listed in their own rows and not counted as judge misses or catches. A miss counts only where Wiktionary's entry supports the label.
- **Dev only.** The held-out part is not judged with a reference in this step: its two runs stay for the baseline and the result. Whether the judge uses a reference in steps 4 to 6 is decided from these dev numbers, with the owner.
- **Fetching.** The MediaWiki API, cached per word under `.data/` for the run, with Wiktionary's CC BY-SA credit in the report. No DWDS page is fetched: its terms require permission for automated queries.

## Dev results so far (2026-11-26 and 27)

Opus through Claude Code, three runs each, on the 123 dev cards. Reports in `.data/judge/`; runs cut off by the plan's 5-hour limit were set aside in `.data/judge/broken/` and rerun.

| | Baseline | With a Wiktionary reference | Fix round 1 | Fix round 2 |
| --- | --- | --- | --- | --- |
| Card agrees (fail or not) | 100 of 123 (81%) | 101 of 123 (82%) | 88 of 123 (72%) | 107 of 123 (87%) |
| Fails missed (most runs) | 29 | 25 | 12 | 15 |
| Etymology fails missed | 15 of 16 | 13 of 16 | 7 of 16 | 11 of 16 |
| Etymology passes agreed | 65 of 67 | not counted | 31 of 67 | 52 of 67 |

- **Baseline.** Opus caught every messy-capture fail, and every fail on synonyms, antonyms and conjugation. It missed 15 of 16 etymology fails, mostly by calling them weak (17 verdicts across the runs) or fine (25), and 4 of 13 German fails.
- **With a Wiktionary reference** (judge instructions as at the baseline). Of the 16 etymology fails, Wiktionary supports the label on 7 (Fenster, Ufer, Junge, Haus, Friseur, klein, halten), has no entry on 2 (planen, wegen), disagrees on 2 (both Kaffee cards: it names the Dutch route Pfeifer does not) and does not settle 5 (Fernweh, Wirtschaft, anfangen, Kühlschrank, gut). On the 7 it supports, Opus caught 3 with the reference and 1 without; three of the four it still missed are cards with no Etymology at all. The reference helps a little; it does not close the gap.
- **Fix round 1** wrote the owner's step 2 rulings into the rubric: any wrong stage of an etymology fails (weak only for a right but thin one), a card with no Etymology for a word with a known one fails, an example that shows the selection only inside a longer word fails, a Pronunciation of another word fails, a calque fails, and a label in "contextual" fails. Misses fell to 12, but Opus then failed 100 cards for a missing Etymology that the facet selection had simply left out: the judge cannot tell a facet the card was not asked for from one it left out.
- **Fix round 2** dropped the missing-Etymology rule and kept the rest. Misses are 15, agreement 87%. Examples, pronunciation and sense now miss nothing, but the rules quote those dev cards' own faults (Sandbank, Wissensdurst, ein Satz Räume, "hier:"), so their dev result shows nothing; held-out will. The held-out Kartoffel card was kept out of the rubric's examples for that reason.
- **Stopped after two rounds.** Of the 11 etymology fails still missed, 3 are missing Etymologies (a structural check, below) and the rest are facts Opus does not know (Kaffee's route, Junge's first sense, Friseur as a German formation). Instructions cannot add knowledge, so a third round would change nothing.
- **For the owner.** Opus fails the Hängematte card's etymology in all three runs: it says the word came through Dutch hangmat. If Pfeifer says so, the label is wrong. It is listed, not changed, since a fault a judge found never measures that judge and DWDS is not fetched by script.

## What's left, and what checks it instead

For each part where Opus still misses fails, or where the held-out count is too small to show anything, the list names what checks it instead in steps 4 to 6:

- **The step 1 scorer**, for the closed facets (article, declension, conjugation, comparison, case). It compares a card's forms with the golden set's references, so it needs no judge.
- **The owner**, for the open facets the judge cannot be trusted on: a sample of those facets read by hand in step 4.
- **No dictionary check** is built in this step. The reference measure above shows whether a Wiktionary entry closes the etymology gap; building references into generation is step 3b's work.
- **A structural check, for a left-out Etymology.** Whether a card left out a facet it was asked for is a fact about the request, not the text, so the gate compares the requested facets with the card's, and the judge is not asked.

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
6. **Fix rounds** on dev, three at most. Then **etymology with a reference**: three dev runs with a Wiktionary entry beside each card, and the report's split of Wiktionary's gaps.
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
- **The account email** (2026-11-26). The owner keeps the plan token and accepts that Claude Code sends the account's email to Anthropic with each judge request (see Privacy). No API key is used.
