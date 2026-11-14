# M3: the average cost of each facet, the core included

Drafted 11 November 2026 for the owner's review. Status: **approved by the owner with the confirmation run, and run, 11–12 November 2026**; results in the [evidence note](../history/evidence/m3-cost-per-facet.md). Part of Phase 1 of the [split facets plan](split-facets.md), for the Languages modules. M3 comes after [M1](../history/evidence/m1-token-split.md), [M2](../history/evidence/m2-core-then-parallel.md) and the [facet-prompt fix](../history/evidence/facet-prompts-stand-alone.md).

## Question

What does each part of a card cost on average, today and split, and where does the split's cost come from?

M2 answered the bar for the card as a whole: arm C (the split, with the facet requests at `low` reasoning) costs between 23 % less and 1 % more than today's single request in the rerun, and 1–14 % less in M2. M3 breaks that figure down by part, so the decision record can say:
- which facets cost the most, and why: their input, their reasoning, or their output;
- what a facet costs when the model leaves it empty, which the split pays for and today's request doesn't;
- whether a facet should run at the default reasoning instead of `low`, or be written together with another facet, as Synonyms and Antonyms now are;
- what the split's cost is in the form it would ship.

## Two kinds of figure

**Split: measured.** Each split request is one part (the core, or one facet), and the provider reports its own `usage` and `list_cost`. A facet's cost is the mean over the requests that wrote it.

**Today: estimated.** Today's single request writes every part at once, so its cost can't be measured per part. Each part is given:
- **input:** its share of the request's measured input, by characters, as in M1;
- **visible output:** its share of the reply's visible output, by the characters of its JSON;
- **reasoning:** not divided. Reasoning is 70–82 % of today's cost (M1), and nothing in the reply says which part it was spent on. It is reported as one line for the whole card, not spread over the parts by a guess.

So today's figure per facet is a floor: what the facet costs to ask for and to write out, without the thinking behind it.

## Sources

| What | Where it comes from | New run? |
| --- | --- | --- |
| Today, per part | M1's 242 requests, which kept each prompt and reply (`.data/m1/`), and M2's arm A (`.data/m2/run-2026-11-11/`) | No |
| Split at the default reasoning, per part | M2's arm B | No |
| Split with the facets at `low`, per part | M2's arm C; for German, the rerun's C (`.data/m2/rerun-2026-11-11/`), which carried `facets.prompt.md` | No |
| Synonyms and Antonyms together | The antonyms follow-up's `pair` variant (`.data/m2/antonyms-2026-11-11/`) | No |
| The split as it would ship | The confirmation run below | Yes (owner) |

**About the existing runs.** None of them is quite the split in its final form:
- M2's C ran before the German fix.
- The rerun's C had the restraint sentence, which has since been removed.
- The antonyms follow-up's pair saved the facets the model wrote, but not each request's `usage`. Its cost can be estimated from M2's Synonyms and Antonyms requests, not measured.

### Confirmation run

The split as it would ship:
- the core at the default reasoning;
- each facet at `low`;
- Synonyms and Antonyms in one request;
- the prompts as now committed, with German's `facets.prompt.md` and without the restraint sentence.

It runs through M2's runner, with one change for the pair: the 42 part-2 inputs, through German, Chinese and English (US), 4 cards at a time, then the judge. That is about 40 minutes and about $1.50. It gives the split's cost per part in its final form. It also checks the two things the rerun couldn't: German's facets without the restraint sentence, and the pair's effect on cost. Time isn't measured again, because part 1 isn't run; the rerun's figures stand.

## What M3 reports

Per module, for each part (the core, then each facet in the module's order):

| Column | Today (estimated) | Split (measured) |
| --- | --- | --- |
| Times called for, and times written | ✓ | ✓ |
| Mean input tokens | ✓ | ✓ |
| Mean reasoning tokens | the card only | ✓ |
| Mean visible output tokens | ✓ | ✓ |
| Mean cost, and its share of the card's cost | without reasoning | ✓ |
| Mean cost when the facet came back empty | | ✓ |
| Failures (invalid result, output limit) | the card only | ✓ |

The split's part costs are also given at default reasoning (arm B) beside `low` (arm C or the confirmation run). That shows, facet by facet, how much `low` saves and what it cost in quality, using the judge's per-criterion verdicts from M2 and the rerun. Etymology is the case to watch: it failed most often at `low`.

Then, per module:
- **The card's cost, today against the split**, built up from the parts. It should match M2's card figures, as a check on the sums.
- **What the split adds:** the input repeated in each request (the shared rules and the core's output), the empty facets, and the core written on its own.
- **What the split saves:** each facet's prompt is sent only when the core's flags call for it, and its reasoning is shorter.

## Limits

- **Today's reasoning stays undivided.** No figure here says how much of today's thinking goes into Etymology or Declension. That would need a different experiment, such as dropping one facet at a time from today's request, and M3 doesn't do it.
- **One or two samples per input.** A facet's mean is over 30–50 requests per module. A difference of a few percent between facets is noise.
- **English (UK) isn't measured split.** M2 ran English (US) only. Its prompts are nearly the same, so its parts should cost about the same, but M3 doesn't claim it.
- **Prices are the provider's `list_cost`** on 11 November 2026, for deepseek-v4.1-flash through OpenCode Go. Cached input appeared in M2 and not in M1. Cost uses what the provider charged, and the cached share is reported beside it.

## Questions for you

1. ~~Should M3 include the confirmation run?~~ Owner: yes.
2. Is it right to leave today's reasoning undivided, rather than spreading it over the parts in proportion to their output? Until you say otherwise, it stays undivided.
