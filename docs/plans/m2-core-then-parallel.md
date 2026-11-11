# M2: core then parallel facets, against one request

Drafted 11 November 2026 for the owner's review. Status: **approved by the owner and run, 11 November 2026**; results in the [evidence note](../history/evidence/m2-core-then-parallel.md). Part of Phase 1 of the [split facets plan](split-facets.md), for the Languages modules first.

## Question

For the Languages modules (German, Chinese and English US; see [Inputs](#inputs) for English UK), does writing a card as **the core first, then each facet that applies in its own request, all at once** meet the plan's bar against today's single request (D17)?

- **Quality not lower:** no more failed cards, missing facets, wrong flags, failed content checks, or `fail` and `weak` verdicts from the judge.
- **Faster:** the median time per card is at least 25 % lower, one card at a time.
- **Cost:** the average cost per card is at most 10 % above today's.

M2 also records what Phase 3 and the decision need: how long each facet request reasons, how often requests fail and why, and when parallel requests begin to slow each other down or meet the provider's rate limit.

## What M1 changed

[M1](../history/evidence/m1-token-split.md) found that reasoning is 70–82 % of a request's cost, and that a split card's extra input alone adds 10–19 % to the cost. **The split can only meet the cost bar if its requests reason less in total than today's one request.** So M2 measures reasoning per request, and it adds a third arm in which the facet requests reason less.

M1 also found that 7 % of today's requests fail, nearly all by using up the 8,192-token output limit in reasoning. That is today's baseline for failures.

## Arms

Each card is written three ways. All three use the product's own functions in `packages/domain/src/modules.ts`, so no product code changes.

| Arm | How the card is written | Function |
| --- | --- | --- |
| **A, today** | One request, the core and every facet of the module | `generateComponent` with every facet, as the golden set does |
| **B, split** | One request for the core alone. When it returns, one request for each facet its flags call for, all sent at once. Each facet request gets the key, the Context and the core as written, as a facet's own Retry does today | `generateComponent` with no facets, then `generateFacet` for each facet in `facetsFor` (`packages/domain/src/parents.ts`), in parallel |
| **C, split, facets reasoning `low`** | As B, but the facet requests ask for `reasoning_effort: low`. The core keeps the default | As B, with a second `OpenCodeProvider` set to `low` for the facets |

Why C uses `low`: in the [reasoning effort experiment](../history/evidence/reasoning-effort-experiment.md), `low` lost no measurable quality on whole cards and cut reasoning by about a sixth. `none` was six times faster but clearly worse on the hard cases. A facet request, with its core already written, may need less reasoning than a whole card, but that is what C tests, not something assumed. The owner chose `low`.

A card in B or C is put together from its core and its facets into the same shape as A's, so the same content checks and the same judge score all three.

## Inputs

[`tests/golden/parents.json`](../../tests/golden/parents.json): the 54 Languages golden inputs (43 words, 11 sentences, 6 with a Context), through **German, Chinese and English (US)**, one sample each. That is 162 cards per arm, 486 in all.

- **English (UK) is left out.** In M1 it matched English (US) within a few percent on every measure, with the same inputs and nearly the same prompts. If the split is decided for Languages, the gate checks English (UK) in Phase 3.
- **One sample.** It keeps the run within 2 hours. The bar is read from medians over 54 cards per module and arm, and each input is compared across arms, so one sample is enough to see a clear difference; it is not enough to see a small one (see [Limits](#limits)).
- The prompts were tuned on these inputs, so they show whether the split keeps today's quality where it is best known, not how it does on new keys.

## Run

The run has two parts, so that time is measured cleanly without taking all day.

| Part | Inputs | How | Used for |
| --- | --- | --- | --- |
| **1. Timing** | 12 of the 54 inputs (9 words, 3 sentences, 2 with a Context), the same 12 through each module: 36 cards per arm | One card at a time. For each input, the three arms run back to back, in a random order, so a slow spell of the service falls on every arm alike | Time, and everything below |
| **2. The rest** | The other 42 inputs through each module: 126 cards per arm | 4 cards at a time, as the product runs up to 4 generation attempts at once (`maxActive` in `src/server/generation.mjs`); arms shuffled | Quality, cost, tokens and refusals. Not time, because the cards compete |

Part 2 also shows the split under the load of a deck capture: up to 4 cards at once, each with up to 9 facet requests. Its refusals and its time to the last facet, against part 1's, are what Phase 3 needs to set a limit on parallel requests.

- **Model and settings:** deepseek-v4.1-flash through OpenCode Go, the product's 8,192-token output limit, default reasoning except for C's facet requests.
- **Rate limits:** a request refused with HTTP 429 is retried after 30 s, up to 5 times. Each refusal is counted per arm. In part 1, a card that met a refusal is kept for quality and cost but left out of the timing, because its time is the wait.
- **Kept per request:** the composed prompt, the provider's whole reply with `usage`, the time it was sent and the time it returned. Kept per card: the three arms' cards, their flags, and their content check results.
- **Where:** a runner under `.data/m2/`, not committed, built on `scripts/golden-card.mjs`. It needs `npm run build:packages` first.
- **Sends:** the text provider only, as the product does, and it spends provider usage.

**Estimated time and cost:**
- Part 1: 36 inputs × 3 arms. At about 40 s for A (M1) and somewhat less for B and C, about 1 hour.
- Part 2: 126 inputs × 3 arms, 4 at a time, about 45 minutes.
- The judge: 486 cards, 8 at a time, about 20 minutes.
- In all, about 2 hours and $5–8.

## Judge

The judge scores each card against its module's `rubric.md`, as `npm run gate` does. The gate trusts the judge only once it agrees with the calibration set (`tests/golden/calibration/<module>.json`) on at least 90 % of cards and misses no fail.

- **German and Chinese** use their latest calibration, as the gate does: 19 of 19 and 18 of 18 on 3 November. That was before the 0.16.4 prompt changes, so it is a limit, not a fresh check.
- **English (US) is not calibrated for M2** (owner). Its judge verdicts are reported but not used for the bar.
- **For English (US)**, quality rests on the flags, the content checks, and the owner's review below.
- **The rubric's `facets` and `simple-translation` criteria** check that facets follow the core's meanings. That is where a split card would show facets that disagree with the core.

## Measured

Per module and arm:

| Measure | How |
| --- | --- |
| **Time per card** | A: the request's time. B and C: time to the core, time to the last facet, and the card's total. Median and 90th percentile |
| **Cost per card** | The provider's `list_cost`, summed over a card's requests. Mean and median |
| **Tokens** | Input, output, reasoning and cached, per request. For B and C, per facet request, per facet: this answers M1's open question |
| **Failed cards** | A card fails when any of its requests fails (output limit, invalid result, time-out), as the product would publish it today. Also counted per request |
| **Missing facets** | Facets the flags call for that the card leaves out, per facet, against A's rate |
| **Flags** | Against the golden expectation (`unexpected`, as the golden set reports it). And between arms: whether the core alone writes the same `kind`, `gramRole` and `contextual` as the core written with its facets |
| **Content checks** | `checkCard`, failures per card |
| **Judge** | `pass`, `weak` and `fail` per card, and per criterion |

**Paired comparison.** Each input is compared across arms, card by card, as the reasoning effort experiment did: better, same or worse by the judge's verdict.

**Owner's review.** A review file lists, side by side, every card where the arms' verdicts differ, and every card where the core's flags differ between arms. The owner reads those before the decision.

## Output

An evidence note, `docs/history/evidence/m2-core-then-parallel.md`, with:
- Per module and arm: the bar's three measures, and whether each is met.
- Reasoning and cost per facet request, today's whole card against the facets added up.
- Failures by cause, missing facets, flags that changed between arms, content checks, and judge verdicts.
- Part 2's refusals and times under load, for the limit on parallel requests.
- What was mocked (nothing but the database, the API and the extension) and the limits.

M3, the average cost per facet, is worked out from these runs and M1's, without sending anything more.

## Limits

- **Golden inputs only.** The prompts were tuned on them. They show whether the split keeps today's quality, not how it does on keys nobody has tried.
- **One sample, and a small timing set.** Reasoning length varies a lot between samples (M1: 600–1,200 tokens). The time bar is read from 12 cards per module and arm, the quality and cost bars from 54. A difference of 25 % in time or 10 % in cost should show; a few points either way won't. If a result lands near the bar, a second run of part 1 settles it.
- **The judge is the generator's own model,** trusted only as far as its calibration.
- **Time comes from part 1 only.** Part 2 shows the load of a deck capture, but on one day's service, not a busy one.
- **English (UK) is not run.** It is inferred from English (US) and M1.
- **The core alone is today's core prompt with its facets cut out.** It is not tuned for being written alone. If B's core is worse, a prompt change may fix it, but that would be a separate change and a separate test.

## Questions for you

1. ~~Arm C at `low` or `none`?~~ Owner: `low`.
2. ~~Calibrate the judge for English (US) as part of M2?~~ Owner: no.
