# M1: how one Languages request spends its tokens

Run 11 November 2026, following the [M1 plan](../../plans/m1-token-split.md), Phase 1 of the [split facets plan](../../plans/split-facets.md).

## Summary

- **Reasoning is most of the output, and most of the cost.** Across the four modules, reasoning is 85–94 % of the output tokens and 70–82 % of the cost. The visible card is only 200–350 tokens.
- **Input is the smaller cost.** A request's input is 2,000–3,000 tokens and accounts for 13–20 % of its cost.
- **A split card would send 1.5–1.8 times today's input.** Each facet request repeats about 240–290 tokens of shared prompt plus the core's output. That extra input alone adds about 10 % to a German card's cost, 13 % to an English card's and 19 % to a Chinese card's, before any facet request reasons.
- **So the split meets the cost bar only if its requests reason less in total than today's single request.** Today's bar is at most 10 % above the current cost, and input alone reaches or passes it. M2 has to measure how long each facet request reasons.
- **7 % of today's requests fail, nearly all by running out of output tokens.** 16 of 242 measured requests reached our own limit of 8,192 output tokens (`MAX_TOKENS` in `packages/domain/src/composer/compose.ts`), and in 14 of them reasoning used every token. They are all word keys, and 12 of the 16 came with a Context, although only about a quarter of the inputs have one.
- **Word cards reason far more than sentence cards:** about 3,000–4,000 reasoning tokens against 400–1,000, and 2.5–6 times the time.
- **The provider reported no cached tokens** on any request.

## What was run

| | |
| --- | --- |
| Inputs | [`tests/golden/token-split/inputs.json`](../../../tests/golden/token-split/inputs.json): German 32, Chinese 30, English (US) 30, English (UK) 30 (the same list as English US) |
| Samples | 2 per input, 244 requests |
| Request | Today's single request per module, with every facet of the module asked for, through the product's composer and `OpenCodeProvider` |
| Model | deepseek-v4.1-flash through OpenCode Go, default reasoning, `max_tokens` 8,192 as in the product |
| Order | Shuffled across modules, one request at a time |
| Mocked | Nothing. No database, no extension: the requests were made from a local script (`.data/m1/run.mjs`, not committed) |
| Kept | Each request's prompt, the provider's whole reply with `usage`, the parsed card and the time, under `.data/m1/run-2026-11-11/` |

**Rate limits.** 38 of the first 70 requests were refused with HTTP 429 within half a second. They were rerun one at a time with a 20-second pause, and none was refused again. Two requests have no measurement: one timed out at 180 s (English US, *东西*) and one failed on the network during the rerun (Chinese, *打算*). They are left out of every figure below. Each of those inputs still has its other sample.

## Per module

Medians per request, over every measured request, the failed ones included, since they spent tokens too.

| | German | Chinese | English (US) | English (UK) |
| --- | ---: | ---: | ---: | ---: |
| Measured requests | 64 | 59 | 59 | 60 |
| Failed | 7 | 1 | 5 | 4 |
| Input tokens | 3,021 | 2,025 | 2,257 | 2,251 |
| Output tokens | 3,197 | 1,691 | 4,011 | 3,283 |
| of which reasoning | 2,874 | 1,528 | 3,769 | 3,092 |
| Visible output | 351 | 250 | 204 | 207 |
| Reasoning's share of output | 89 % | 85 % | 94 % | 94 % |
| Reasoning's share of cost | 75 % | 70 % | 82 % | 82 % |
| Cost per request | $0.0037 | $0.0019 | $0.0037 | $0.0038 |
| Time, successful requests: median | 36 s | 24 s | 45 s | 41 s |
| Time: 90th percentile | 77 s | 53 s | 76 s | 79 s |
| Time: longest | 150 s | 84 s | 123 s | 167 s |
| Reasoning, difference between the two samples of one input (median) | 621 | 984 | 1,174 | 943 |
| Cached input tokens | 0 | 0 | 0 | 0 |

The cost is the provider's own `list_cost` for each request. Fitted over all requests, it works out at about $0.26 per million input tokens and $0.97 per million output tokens. The whole run cost $0.95.

### Word cards and sentence cards

Successful requests only, by the `kind` the core wrote.

| | German | Chinese | English (US) | English (UK) |
| --- | --- | --- | --- | --- |
| Word: cards, median reasoning, median time | 45, 3,133, 42 s | 44, 1,695, 25 s | 42, 3,961, 52 s | 44, 3,907, 50 s |
| Sentence: cards, median reasoning, median time | 12, 686, 11 s | 14, 518, 16 s | 12, 1,000, 18 s | 12, 389, 9 s |

A sentence card asks for fewer facets (no Synonyms, Antonyms, Etymology or grammar tables) and reasons a fraction as long.

## Input by part

Median tokens per request. Each part's share comes from its characters, scaled by the request's measured input total (see [Limits](#limits)). A facet's figure is its prompt line plus its part of the JSON schema.

| Part | German | Chinese | English (US) | English (UK) |
| --- | ---: | ---: | ---: | ---: |
| Core prompt | 639 | 524 | 580 | 583 |
| Core schema | 90 | 82 | 77 | 78 |
| Shared rules (`rules.md`) | 55 | 54 | 51 | 51 |
| Module rule | 31 | 71 | 114 | 112 |
| Wrapper (headings, schema frame, return line) | 138 | 117 | 114 | 115 |
| Key and Context | 15 | 15 | 16 | 16 |
| **Facets, all together** | **2,053** | **1,162** | **1,306** | **1,296** |
| Examples | 153 | 179 | 162 | 162 |
| Synonyms | 142 | | 154 | 155 |
| Antonyms | 94 | | 102 | 102 |
| Pronunciation | 160 | 133 | 172 | 172 |
| Etymology | 286 | 331 | 306 | 307 |
| Simple Translation | 230 | 236 | 155 | 156 |
| Grammar Teacher | 284 | 145 | 255 | 243 |
| Pinyin | | 137 | | |
| Article | 92 | | | |
| Declension | 198 | | | |
| Conjugation | 203 | | | |
| Comparison | 107 | | | |
| Case | 105 | | | |

Facets are about two thirds of today's input in German and a little over half elsewhere. Every request carries every facet's prompt, whether it applies or not.

## Output by part

Visible output only, median tokens on the cards that wrote the part. Reasoning can't be divided between parts from a single request.

| Part | German | Chinese | English (US) | English (UK) |
| --- | ---: | ---: | ---: | ---: |
| Core | 50 | 56 | 45 | 48 |
| Examples | 37 | 43 | 33 | 34 |
| Synonyms | 15 | | 12 | 11 |
| Antonyms | 6 | | 6 | 6 |
| Pronunciation | 5 | 5 | 6 | 5 |
| Etymology | 96 | 52 | 79 | 78 |
| Simple Translation | 22 | 19 | 21 | 23 |
| Grammar Teacher | 105 | 82 | 91 | 91 |
| Pinyin | | 27 | | |
| Article | 17 | | | |
| Declension | 100 | | | |
| Conjugation | 163 | | | |
| Comparison | 26 | | | |
| Case | 72 | | | |

### How often each facet applied

On successful cards: how often the flags call for the facet, and how often the card wrote it.

| Facet | German | Chinese | English (US) | English (UK) |
| --- | --- | --- | --- | --- |
| Examples, Pronunciation, Simple Translation (and Pinyin) | 57 of 57 | 58 of 58 | 54 of 54 | 56 of 56 |
| Synonyms: called for, written | 45, 38 | | 42, 30 | 44, 32 |
| Antonyms | 45, 22 | | 42, 10 | 44, 9 |
| Etymology | 45, 41 | 44, 39 | 42, 31 | 44, 32 |
| Grammar Teacher | 29, 29 | 28, 29 | 28, 28 | 28, 28 |
| Article | 16, 16 | | | |
| Declension | 22, 22 | | | |
| Conjugation | 11, 11 | | | |
| Comparison | 6, 6 | | | |
| Case | 10, 10 | | | |

Synonyms, Antonyms and Etymology are often left empty when they apply. Those are the model's own choices, which the prompts allow (no antonym, no known origin). With the split, each of them would still be one request, so an empty facet would cost as much input as a full one. The one Chinese card with Grammar Teacher written but not called for is a mismatch between the analysis's reading of the `language` value and the model's; it changes no figure here.

## What a split card would send

Predicted from the parts above, per successful card:
- **One core request:** core prompt, core schema, shared rules, module rule, wrapper, key and Context.
- **One request per facet the flags call for:** that facet's prompt and schema, the same shared parts, and the core's visible output.

| | German | Chinese | English (US) | English (UK) |
| --- | ---: | ---: | ---: | ---: |
| Today's input (median) | 3,019 | 2,025 | 2,257 | 2,251 |
| Split card's input (median) | 4,503 | 3,416 | 4,071 | 4,133 |
| Ratio | 1.49 | 1.69 | 1.80 | 1.84 |
| Requests per card (median) | 9 | 6 | 7 | 7 |
| Shared part repeated in each request | 238 | 257 | 294 | 293 |
| Extra input's cost, against today's cost per request | +10 % | +19 % | +13 % | +13 % |

The prediction leaves out the reasoning and visible output of the split requests, which is where most of the cost is today. It is the input M2 starts from, not a prediction of M2's cost.

## Failures

| Module | Failed | Keys |
| --- | ---: | --- |
| German | 7 of 64 | *klug* (both samples), *spring* (both), *happy* (both), *run* |
| Chinese | 1 of 59 | *马马虎虎*, an invalid result |
| English (US) | 5 of 59 | *Schloss*, *lift*, *run*, *加油*, *学习* |
| English (UK) | 4 of 60 | *take off*, *东西*, *学习*, *bat* |

All but one reached the output limit of 8,192 tokens. In 14 of the 16 the reply had no visible output at all: reasoning used up every token. In the product these cards fail, and the reader has to retry. Most are keys with several senses (*spring*, *run*, *bat*, *lift*, *Schloss*, *东西*). 12 of the 16 came with a Context, against about a quarter of all inputs, so a Context that picks a sense doesn't shorten the reasoning; the replies were not read to see why it runs longer. The German keys *klug* and *happy* (described as *glücklich*) also have a full declension table to write. This 7 % failure rate is today's baseline, and M2 should report the split's against it.

## Limits

- **Shared out, not counted.** A part's tokens are its share of the request's measured input by characters, not a tokenizer's count. The prompts are English apart from the key and Context, so the error should be small. M2 measures each split request's input exactly.
- **Reasoning can't be divided** between the core and the facets from one request. Whether a facet request alone reasons briefly or as long as a whole card is the main open question for M2.
- **Two samples per input.** Reasoning length varies by 600–1,200 tokens between two samples of the same input, so per-input figures are noisy. The module medians are over about 60 requests each.
- **Constructed inputs.** The set was built to cover every facet, not drawn from real decks. Its mix of words and sentences, and of keys with and without a Context, is a choice.
- **Rate-limited start.** 38 requests were rerun later in the day. The model and settings were the same, but the service's load may have been different.
- **One model**, at the default reasoning and with the product's output limit.

## What this means for M2

- **Measure reasoning per facet request.** It decides the split's cost. If each facet request reasons as long as today's whole card, the split costs several times more. If reasoning shrinks with the request, the split may fit the bar.
- **The cost bar may be out of reach on input alone for Chinese and English.** The extra input already costs 13–19 % more. M2 should report the split's cost first, before the bar is applied.
- **Only the split can leave out the facets that don't apply.** Today's single request carries every facet's prompt, 1,200–2,000 tokens, because the flags that decide them are written in that same request. The split sends a facet's prompt only when the core's flags call for it, which is why a split card's input grows less than its number of requests.
- **Report failures, by output limit, for both orders.** A split facet request has much less to write, so it may run out of tokens less often; the core request still has to choose the sense.
- **Word cards set the time.** The median card is 36–45 s today, and word cards with several senses take the longest.
