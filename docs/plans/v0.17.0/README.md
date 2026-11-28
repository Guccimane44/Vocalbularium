# v0.17.0 master plan: better cards from two pillars, a model picker and references

Each step has its own plan in this folder. A step's plan is written in full when the step starts; until then its file holds the scope agreed here.

## Why

Generation quality depends on which facets a card has. Some facets need knowledge a small model lacks: etymology, German inflection forms, and the grammar tip's claims. Others do not, such as the article. The goal is to give each card the cheapest setup that writes all of its facets well.

Two pillars get us there (owner, 2026-11-26):

1. **The model picker**, only if step 4 shows it is still needed (owner, 2026-11-28; see [is the picker still needed?](#is-the-picker-still-needed)). Each facet gets a difficulty, and a card goes to the cheapest model that handles its hardest facet.
2. **References.** Etymology, synonyms, antonyms and German inflection are written with a dictionary entry beside the request. The entry is a reference the model reads for facts. It is never copied into the card.

Both need two things we do not have yet: per-facet quality numbers we can trust, and a judge that can tell a plausible fault from a correct answer. Steps 1 to 3 build those.

## How the pillars fit together

**References come first, and the picker is measured on top of them.** A reference changes how hard a facet is. Measured without one, etymology looks hard, and every card would go to the expensive model for that one facet. So a facet's difficulty is measured *with its reference*, and the picker reads that difficulty.

**A facet with a reference has two difficulties**: with a reference, and without one, for words the source does not cover. The picker uses whichever applies to the card in hand.

**One card, step by step:**

1. **The word to look up is the selection** (owner, 2026-11-27, [selection facets](../selection-facets.md)). Every facet describes the selection itself, so the word is known before generation, whatever its language.
2. **Look up references** for that word in its own language's source: etymology from that language's Wiktionary entry, synonyms and antonyms (OpenThesaurus covers only German selections). Each lookup finds an entry or none.
3. **Pick the model.** The card's difficulty is its hardest facet, an assisted facet counting at its "with reference" difficulty when an entry was found and at its "without" difficulty when not. The cheapest model that handles that difficulty writes the card.
4. **Generate.** The references go into the request as facts to draw on.

**One request.** Since the word to look up is the selection, every lookup runs before generation and the card is one request, as today. (Until 2026-11-27 a foreign selection's facets described a German "grammar word" that existed only after the core was written, which needed a second request; that rule is gone.)

**Reference, not copy.**

- The prompt says to take facts from the reference and write in plain German of the card's own.
- A content check compares each assisted facet with its reference and flags long word-for-word runs.
- The judge is given the reference too, and checks the card against it instead of against its own memory.

**Live lookups** (owner, 2026-11-26). Each card looks its selection up in the source at generation time, with a short time limit, so the cards always use the source's current entry and nothing is copied onto the computer. The selected word, never the user's sentence, goes to the source; the privacy rules in the code standards say so. A lookup that times out counts as "no entry found".

**When no entry is found.** Synonyms and antonyms are written by the model the "without reference" difficulty calls for. Etymology is left out (the rubric already accepts a missing etymology when the history is unknown), because a confident invented history is the fault this solves (owner, 2026-11-26).

## Is the picker still needed?

Decided by the owner on 2026-11-28: the picker is built only if the evidence still calls for it.

**Why it may not be.** The picker exists to send cards with hard facets to a stronger model. Since 2026-11-27 the hard facets have mostly gone:

- **Etymology** is written from a Wiktionary entry and checked only for agreeing with it, so any model that summarises faithfully can write it.
- **Inflection** (article, declension, conjugation, comparison) now appears only on a German selection ([D374](../../decisions/d374-selection-facets.md)). Its forms have one right answer, and Wiktionary has tables for them, so they become a reference too ([step 3b](03b-references.md)). D32 took the same route on the `claude/german-tables` branch.
- **What would remain** is the grammar tip, where Haiku states false facts, and whatever step 4 finds.

**The rule.** Step 4 measures Haiku with every reference. Then:

- **Every facet meets the bar** (no fail, at most 10% weak): no picker. Steps 5 to 7 shrink to building the references into generation; step 6 is dropped.
- **Only one or two facets fall short:** fix those facets instead, by a stronger model for that facet's request alone, a narrower facet, or prompt work. That choice is a decision record in step 7.
- **Several facets fall short:** the picker as planned, steps 5 to 7.

## What we know already

- **Reasoning effort is not the lever** (2026-11-24). Haiku 5.5 at medium, high and xhigh, against default, on German, Computer Science and Joke (84 cards each, 1 sample). Medium matched default on time and tokens. High cost about 40% more and was no better. Xhigh doubled time and cost, and cut off 4 German cards before they finished. Results: `.data/bench/results.md`.
- **A stronger model is** (2026-11-24). On the German golden set, the Opus 5.5 judge scored Opus 5.5 cards 45 pass, 9 weak, 0 fail, and Haiku cards 22 pass, 23 weak, 9 fail. Haiku's fails were guessed etymologies (Ufer, Fernweh, wegen), wrong Präteritum forms (run, 把, get up) and a garbled word.
- **Which facets are hard** (step 1's scorer and step 2's graded cards, 2026-11-26, one run each):
  - Etymology is hardest for every model: 27 fails in Haiku's 84 graded cards, and 10 in Argon's 22. Opus as judge missed 15 of 16 dev etymology fails over three runs, and still 11 after step 3's rubric fixes; a Wiktionary entry beside the card helped only a little ([step 3](03-judge.md#dev-results-so-far-2026-11-26-and-27)).
  - Inflection is hard for Haiku and much less so for Argon. The step 1 scorer's fail rates: declension 19% for Haiku and 6% for Argon, conjugation 14% and 3%, article 13% and 5%.
  - The grammar tip is in between: 11 fails for Haiku, mostly false claims, and 2 for Argon.
  - Meaning, examples, simple translation, pronunciation, comparison and case have few fails. Synonyms are often weak, rarely wrong.

  The graded-card counts show where faults occur, not how often, because those cards were chosen partly for their faults. Only the scorer's numbers are rates.
- **Sources for references** (2026-11-26):
  - **Etymology:** Wiktionary for now (CC BY-SA, through the MediaWiki API): free to use with credit, but less reliable than Pfeifer. Pfeifer's Etymologisches Wörterbuch, read on DWDS, is better, but its rights lie with the BBAW, and DWDS's terms allow automated queries or any reuse only with explicit permission. DWDS has no etymology API.
  - **Synonyms:** OpenThesaurus, under LGPL or CC BY-SA 4.0, free to reuse with a link to openthesaurus.de, with its own downloads.
  - **Antonyms:** OpenThesaurus has some; Wiktionary has more. Not yet checked.
- **Go's strongest models**, on the Artificial Analysis Intelligence Index (ModelGrep, November 2026): Gemini 4 Argon 50.4, Kimi K3.1 Pro 46.5, Qwen4 Max 42.9, then Haiku 5.5 at 36.5. Opus 5.5 scores 59.1.

## Decisions taken (owner)

1. **No Zen** (2026-11-24). Opus 5.5 is reached through Claude (headless Claude Code), not through OpenCode Zen. Generator candidates stay on Go.
2. **The judge is stronger than the generator** (2026-11-24). Opus 5.5 is the default judge. Since every generator candidate is a Go model, none is stronger than the judge, and Opus never judges its own product cards.
3. **The quality bar is the judge's verdict** (2026-11-24). The headless Opus judge gives each card pass, weak or fail against the module's rubric, and a setup meets the bar when its cards meet the gate's existing thresholds: no fail, and at most 10% weak.
4. **No tier cap for users or decks** (2026-11-24). Users get a fixed allowance; the picker's cost is ours to manage.
5. **The older v0.17 plan is deferred** (2026-11-24, [incrementv17.md](../incrementv17.md)): no deck-level effort setting, no reflection, no language expansion in this release.
6. **Argon is the audit model** (2026-11-25). Gemini 4 Argon replaces GPT-6 Luna as the second judge, which only informs.
7. **Two pillars** (2026-11-26). The model picker and references. Etymology, synonyms and antonyms use references as an aid; a reference is never copied into a card.
8. **The judge signs in with the owner's Claude plan** (2026-11-26), through `claude setup-token`.
9. **Live lookups** (2026-11-26). References are looked up at generation time, not kept as local data.
10. **When no entry is found** (2026-11-26). Synonyms and antonyms are written by the model their "without reference" difficulty calls for; etymology is left out.
11. **Wiktionary for etymology, for now** (2026-11-26). Development does not wait for the BBAW; Pfeifer replaces Wiktionary only if they give permission.
12. **Facets describe the selection** (2026-11-27, [D374](../../decisions/d374-selection-facets.md)), in every language module. The "grammar word" is gone; grammar facets appear only when the selection is in the module's language; Pronunciation leaves the language modules.
13. **Etymology is checked against its entry, not for truth** (2026-11-27). Step 3 showed even Opus cannot verify an etymology from memory.
14. **The picker only on evidence** (2026-11-28). Inflection becomes a reference, and step 4 decides whether the picker is built ([above](#is-the-picker-still-needed)).

## German first

Every step runs on the German module first, through to a working picker with references for German. Other modules then repeat the per-module steps (step 9).

## The loop

golden set → look up references → generate → score closed facets against references, judge the open ones → verify new findings → grow the calibration set and the failure points

## Steps

Step 3b was added on 2026-11-26 without renumbering the steps after it, which other plans already name.

| Step | Plan | Ends with |
| --- | --- | --- |
| 1 | [Rework the golden set](01-golden-set.md) | A German golden set built from each facet's failure points, with reference answers for the facets that have one right answer, and a test that makes every new facet grow the set |
| 2 | [Rework the calibration set](02-calibration-set.md) | German cards with verified verdicts, real defects, weak cases and a held-out part, reviewed by the owner |
| 3 | [Measure the judge](03-judge.md) | A per-facet report of the headless Opus judge on German's held-out cards, and the facets its verdicts do not cover |
| 3b | [References](03b-references.md) | A source for each assisted facet (etymology, synonyms, antonyms, German inflection) with its licence settled, the lookup, and a prototype showing how much a reference helps |
| 4 | [Baseline the current model](04-baseline.md) | Haiku's per-facet fail and weak rates, time and cost, with their run-to-run spread, with and without references, and whether the picker is needed |
| 5 | [Benchmark the candidate models](05-benchmark.md) | The same numbers for Argon, Kimi and Qwen on Go, for the facets step 4 leaves short; skipped if none |
| 6 | [Derive the difficulty table](06-difficulty-table.md) | Only if the picker is built: a difficulty on each German facet in the catalog, with a second one for assisted facets without a reference |
| 7 | [Decide, then build](07-picker.md) | A decision record, then the references in generation, and the picker or the per-facet fix that step 4 calls for, with tests |
| 8 | [Verify end to end](08-verify.md) | The gate and a real capture on each tier, with and without a reference found, against the baseline |
| 9 | [Roll out module by module](09-rollout.md) | English and Chinese, then Expertise, then Creativity, each with its own sources |

## Tooling to build along the way

Build these as scripts, not one-off runs. Each step's plan says which one it builds.

- A golden-set coverage report, and a scorer that checks the closed facets (article, declension, conjugation, comparison, case) against reference answers (step 1).
- Calibration cards graded per criterion, with missed fails counted per criterion, a structure test, and a review file for the messy cards (step 2).
- Calibration that reports held-out agreement and pass/weak agreement, a judge adapter for headless Claude Code, and output files named so that parallel runs cannot overwrite each other (step 3).
- A live lookup per source that finds a selection's entries, with a time limit (step 3b).
- A bench script that takes the model, effort, sample count and references on or off, and records tokens, time and cost per card (step 4).
- A per-criterion and per-facet report across runs (`.data/bench/opus/compare.mjs` is the sketch) (step 4).
