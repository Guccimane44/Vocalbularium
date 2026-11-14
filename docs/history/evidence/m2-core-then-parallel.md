# M2: core then parallel facets, against one request

Run 11 November 2026, following the [M2 plan](../../plans/m2-core-then-parallel.md), Phase 1 of the [split facets plan](../../plans/split-facets.md).

## Summary

| | German | Chinese | English (US) |
| --- | --- | --- | --- |
| **B, split:** time, part 1 median | +6 % ✗ | −25 % ✗ (just short) | −58 % ✓ |
| **B:** cost per card | +18 % ✗ | +15 % ✗ | +4 % ✓ |
| **B:** quality | lower ✗ | not lower ✓ | lower ✗ |
| **C, split, facets at `low`:** time | −26 % ✓ | −30 % ✓ | −61 % ✓ |
| **C:** cost per card | −8 % ✓ | −1 % ✓ | −14 % ✓ |
| **C:** quality | lower ✗ | not lower ✓ | lower ✗ |

- **Arm C meets the time and cost bars in all three modules.** With the facet requests at `low` reasoning, a split card is 26–61 % faster and up to 14 % cheaper than today's.
- **Arm B (default reasoning everywhere) meets them only in English.** Its facet requests together reason about as long as today's whole card, so the extra input pushes the cost up.
- **Quality holds in Chinese but drops in German and English (US).** The losses are in the facets written alone:
  - German grammar facets were written for the key instead of the German translation (*la sobremesa*, *beautiful / more beautiful*), or left out.
  - English antonyms that aren't true opposites, and grammar notes that are wrong.
- **The likely cause is in the prompts, not the split itself.** The German grammar facets say "the grammar word" and rely on the core's prompt to define it as the German word for the first meaning, but a split facet request doesn't carry the core's prompt. Today's facet Retry has the same gap.
- **The split had no failures from the output limit**, against 4 for today's request. No request was refused for rate limits, even with 4 cards running at once.

**By the plan's bar, the split does not pass yet.** C passes on time and cost, but not on quality in German and English (US). Making each facet's prompt stand on its own, then running C again, is the next step if the owner wants to pursue the split.

## What was run

| | |
| --- | --- |
| Inputs | [`tests/golden/parents.json`](../../../tests/golden/parents.json), the 54 Languages golden inputs, through German, Chinese and English (US), one sample: 162 cards per arm, 486 in all |
| Part 1, timing | 12 inputs (*bank* with a Context, *Schloss* with a Context, *run*, *break the ice*, *幸福*, *laufen*, *Fernweh*, *gut*, *咖啡*, *It's raining cats and dogs.*, *Der Zug ist schon abgefahren.*, *我把书放在桌子上了。*), one card at a time, the three arms back to back in a random order |
| Part 2 | The other 42 inputs, 4 cards at a time, arms shuffled. Used for quality and cost, not time |
| A, today | `generateComponent` with every facet: one request |
| B, split | `generateComponent` with no facets (the core alone), then `generateFacet` for each facet in `facetsFor`, all at once, each given the core as the model wrote it |
| C | As B, the facet requests at `reasoning_effort: low` |
| Model | deepseek-v4.1-flash through OpenCode Go, the product's 8,192-token output limit |
| Judge | `judgeCard` from `scripts/judge.mjs` against each module's `rubric.md`, at the default reasoning, 8 at a time. German and Chinese use their calibration of 3 November (19/19, 18/18). **English (US) is not calibrated** (owner): its verdicts are reported, not trusted for the bar |
| Mocked | Nothing. The requests were made from a local script (`.data/m2/run.mjs`, not committed), without the database, the API or the extension |
| Kept | Each card's JSON, flags, checks and requests (time, `usage`, finish reason); the judge's verdicts; a side-by-side review of every input where the arms differ. All under `.data/m2/run-2026-11-11/` |

Generation took about 1 h 55 min, and the judge about 1 h, with a pause between.

## Time

Seconds per card. Part 1 is the measure for the bar; part 2 ran 4 cards at once.

| | German A / B / C | Chinese A / B / C | English (US) A / B / C |
| --- | --- | --- | --- |
| Part 1, median | 32.5 / 34.3 / 23.9 | 24.3 / 18.3 / 17.1 | 45.9 / 19.4 / 18.1 |
| Part 1, 90th percentile | 79 / 54 / 49 | 40 / 44 / 36 | 86 / 75 / 54 |
| Part 1, time to the core | – / 10.8 / 6.8 | – / 6.9 / 6.9 | – / 8.7 / 6.5 |
| Part 2, median, 4 cards at once | 46.8 / 28.4 / 21.3 | 19.1 / 18.9 / 18.2 | 30.1 / 23.8 / 20.0 |

- **The slowest facet sets the card's time.** In German, Etymology and Grammar Teacher take a median of 10–13 s each, after a core of 7–11 s.
- **The split's tail is shorter.** The 90th percentile is lower in five of the six split columns, because no single request has to reason through a whole card.
- **Under load, today's request slowed more than the split did.** With 4 cards at once (part 2), German A took a median of 47 s, against 21–28 s for B and C. This is one run at one time of day.
- **Part 1 has only 12 cards per module and arm.** German B (+6 %) and Chinese B (−25 %) are close enough to the bar that a second run could change the verdict.

## Cost and tokens

Per card, medians unless stated.

| | German A / B / C | Chinese A / B / C | English (US) A / B / C |
| --- | --- | --- | --- |
| Cost, mean | $0.00252 / 0.00297 / 0.00231 | $0.00130 / 0.00150 / 0.00128 | $0.00200 / 0.00208 / 0.00173 |
| Requests | 1 / 9 / 9 | 1 / 6 / 6 | 1 / 7 / 7 |
| Input tokens | 3,019 / 4,535 / 4,494 | 2,024 / 3,339 / 3,327 | 2,257 / 4,062 / 4,062 |
| Reasoning tokens | 3,234 / 3,330 / 2,490 | 1,250 / 1,380 / 1,080 | 2,331 / 2,059 / 1,637 |
| Cached input tokens | 512 / 768 / 768 | 512 / 768 / 768 | 512 / 896 / 896 |

- **M1's prediction of the split's input held.** M1 predicted 4,503, 3,416 and 4,071 input tokens. The measured medians are 4,535, 3,339 and 4,062.
- **Added up, B's requests reason about as long as today's single request** (−12 % to +10 %). Splitting a card doesn't by itself shorten the reasoning. It only spreads it over requests that run at the same time.
- **`low` cuts the facets' reasoning by about a quarter**, and that is what pays for the extra input.
- **The provider cached part of the input this time.** It cached a median of 512 input tokens per card in A and 768–896 in B and C; M1 saw none. Cached tokens cost less, so this run's costs are lower than M1's, and the arms aren't affected equally. This is the provider's own behaviour, not something the product asks for.

### Reasoning per request, by role

Median reasoning tokens in B (C in brackets).

| Request | German | Chinese | English (US) |
| --- | --- | --- | --- |
| Core alone | 302 (265) | 155 (178) | 272 (212) |
| Etymology | 553 (482) | 329 (303) | 324 (312) |
| Grammar Teacher | 550 (367) | 251 (276) | 226 (266) |
| Synonyms | 485 (363) | | 461 (315) |
| Antonyms | 158 (128) | | 171 (128) |
| Examples | 158 (113) | 161 (150) | 122 (127) |
| Simple Translation | 204 (203) | 119 (122) | 127 (110) |
| Pronunciation | 159 (160) | 139 (99) | 80 (73) |
| Article / Declension / Conjugation | 204 / 211 / 162 (131 / 228 / 166) | | |
| Pinyin | | 217 (173) | |

The core alone reasons for 150–300 tokens, far less than today's whole card at 1,250–3,230. Most of today's reasoning goes to the facets.

## Quality

### Judge

| | German A / B / C | Chinese A / B / C | English (US) A / B / C, not calibrated |
| --- | --- | --- | --- |
| Pass | 29 / 29 / 30 | 40 / 42 / 40 | 44 / 33 / 34 |
| Weak | 16 / 16 / 14 | 7 / 8 / 7 | 3 / 9 / 11 |
| Fail | 9 / 9 / 8 | 7 / 3 / 7 | 7 / 12 / 9 |
| Not scored | 0 / 0 / 2 | 0 / 1 / 0 | 0 / 0 / 0 |
| Paired against A: better / same / worse | B 15 / 24 / 15, C 17 / 20 / 17 | B 11 / 34 / 9, C 11 / 32 / 11 | B 5 / 35 / 14, C 9 / 28 / 17 |

German's totals are level, but where its faults lie moved:

| Criterion not passed | German A | German B | German C | English A | English B | English C |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `facets` fail | 1 | 7 | 5 | 2 | 8 | 8 |
| `facets` weak | 0 | 6 | 4 | 3 | 7 | 5 |
| `simple-translation` weak | 13 | 8 | 8 | | | |
| `examples` weak or fail | 0 | 2 | 3 | 2 | 6 | 3 |

Split cards write a better Simple Translation in German, but their other facets fail more often, in both German and English.

### What goes wrong in the split

**German grammar facets describe the key, not the German translation.** The judge's reasons include:
- Article *la sobremesa* and *le dépaysement*, instead of the German noun's.
- Comparison *beautiful, more beautiful, most beautiful*, instead of *schön, schöner, am schönsten*.
- Conjugation *ich run*.
- Article *das Komorebi* for *木漏れ日*.

**Or they leave the facet out.** Declension is missing on 13 German B cards (8 in C) and Article on 6 (2), against 1 each today. In every case the facet was asked for, and the model returned an empty `facets` object, about 8 tokens.

The German facet prompts refer to "the grammar word", and the core's prompt says what that is: the key when it is German, otherwise the German word for the first meaning. A split facet request carries its own facet's prompt and `retry.prompt.md`, but not the core's prompt. So for a foreign key, the model either describes the key or decides the facet doesn't apply. Today's facet Retry sends the same request and has the same gap.

**English facets are written with less restraint.** Today's single request leaves Antonyms out on 34 of 54 cards. The split leaves it out on 25 (B) and 22 (C), and the extra antonyms are the judge's main complaint: *walk* for *run*, *despite* for *because of*. Grammar notes also make more wrong claims, such as that *in* always takes an object.

**Chinese holds.** Fewer fails in B (3 against 7), the same in C, and no facet newly missing.

### Flags, checks and failures

| | German A / B / C | Chinese A / B / C | English (US) A / B / C |
| --- | --- | --- | --- |
| Cards that failed | 4 / 0 / 2 | 1 / 0 / 1 | 2 / 0 / 1 |
| Requests that hit the output limit | 3 / 0 / 0 | 0 / 0 / 0 | 1 / 0 / 0 |
| Unexpected flags (golden expectation) | 0 / 0 / 0 | 1 / 0 / 0 | 0 / 0 / 0 |
| Content checks failed | 0 / 2 / 2 | 1 / 0 / 0 | 3 / 3 / 2 |
| Rate-limit refusals | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

- **Failures:** today's failures are the output limit and invalid results. In C, three cards failed because their Etymology request returned an invalid result (*laufen*, *Junge*, *window*), and one because its core did (*经济*). Under the product's rule that a card publishes whole (owner), one failed facet fails the card, so a facet request needs its own retry in Phase 3.
- **Flags:** the core written alone wrote the same flags as today's in all but two cards. *refrigerator* in Chinese (B and C) gave no `contextual`. *break the ice* in German (C) gave no `gramRole`, so no Conjugation was asked for.

## What this means

1. **The split doesn't pass the bar as it stands.** C passes on time and cost in all three modules, but quality drops in German and English (US).
2. **The quality loss looks like a prompt gap, not a limit of the split.** A facet written alone needs everything its prompt relies on: in German, what "the grammar word" is; in English, the restraint today's prompts get from writing every facet together. The fix would make each facet's prompt stand on its own, and it would also fix today's facet Retry, which has the same gap.
3. **If the split is pursued, the next measurement is C again**, after that prompt change, on the same inputs, with a second sample of part 1 for German and Chinese time. For it to count on English, the judge would need calibrating for English (US) first.
4. **The cost case rests on `low` reasoning for facets.** Without it (B), the split costs 15–18 % more in German and Chinese.
5. **For Phase 3:** time is set by the slowest facet (Etymology, Grammar Teacher, Synonyms), and a failed facet fails the whole card unless it is retried on its own.

## Limits

- **One sample.** Reasoning varies by 600–1,200 tokens between samples (M1), and part 1's time has only 12 cards per module and arm. German B and Chinese B are within noise of the time bar.
- **The judge is the generator's model.** German and Chinese use a calibration from before the 0.16.4 prompt changes. English (US) is not calibrated, so its quality drop is a strong signal, not a verdict.
- **Golden inputs only,** on which today's prompts were tuned. That favours arm A, whose prompts were tuned for writing all the facets together.
- **The provider's caching** differed between this run and M1, and between the arms.
- **English (UK) was not run,** as planned.
