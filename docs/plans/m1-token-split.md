# M1: how one Languages request spends its tokens

Drafted 11 November 2026 for the owner's review. Status: **run 11 November 2026**; results in the [evidence note](../history/evidence/m1-token-split.md). Part of Phase 1 of the [split facets plan](split-facets.md).

## Question

Today a Languages card is one request: its core and all its facets together (D17). **Where do that request's tokens go?** Split by:
- **Input:** the shared rules, the module's rule, the core's prompt, each facet's prompt, the JSON schema, and the key with its Context.
- **Output:** the core, each facet, and the model's reasoning.

M2 needs the answer to predict what a split card will send, since each facet request repeats the shared parts. M3 needs it to put a cost on each facet. M1 changes no product code.

## Test set

[`tests/golden/token-split/inputs.json`](../../tests/golden/token-split/inputs.json), written for M1 alone. It has 122 inputs for the four Languages modules: German 32, Chinese 30, and English (US) and English (UK) 30 each. The two English modules share one list, so they can be compared input for input.

Every request asks for **all of its module's facets**, not just a deck's default ones, so every facet is measured. Whether a facet applies is still decided as it is today, by its `applies` and `when`. The set is built so that every facet applies often enough to measure:

| Module | Inputs | `word_phrase` / `sentence` | With a Context | Key in the module's language | Fewest cards for one facet |
| --- | ---: | ---: | ---: | ---: | --- |
| German | 32 | 26 / 6 | 10 | 15 | Comparison and Case, 5 each |
| Chinese | 30 | 23 / 7 | 8 | 15 | Grammar Teacher, 15 |
| English (US) | 30 | 24 / 6 | 6 | 15 | Grammar Teacher, 15 |
| English (UK) | 30 | 24 / 6 | 6 | 15 | Grammar Teacher, 15 |

How it was put together:
- **Half the keys are in the module's language and half aren't.** Grammar Teacher applies only to the first half, and the core writes its meanings differently for each.
- **About a third of the keys have a Context.** Phone captures will often arrive without one. The ones that do have a Context include words with several senses (*Schloss*, *bat*, *行*, *东西*), because a Context that picks a sense changes what the core writes.
- **German grammar words are spread across noun, verb, adjective, preposition and adverb.** A noun gets Article and Declension, an adjective Declension and Comparison, a verb Conjugation, and a preposition Case. An adverb gets none of them, which shows a card without grammar facets. Some of these come from foreign keys, where the grammar word is the German word for the first meaning: *despite* is described as *trotz*.
- **Mostly ordinary vocabulary**: single words, phrases, idioms and sentences of different lengths, in eight languages. M1 measures a typical card, not the hard cases the golden sets collect.
- **None of the inputs appears in the golden sets**, whose inputs the prompts were tuned on.

The descriptive fields (`kind`, `keyLanguage`, `gramRole`) are there to check coverage before the run. They aren't scored.

## Run

- **What is sent:** each input as today's single request, through the product's own composer and provider adapter (`composeModule`, `OpenCodeProvider`), with the model and settings the product uses: deepseek-v4.1-flash through OpenCode Go, at the default reasoning.
- **Samples:** two per input, 244 requests in all. Reasoning length varies from run to run, and two samples show how much.
- **One request at a time,** so time per request is a clean baseline for M2.
- **What is kept for each request:** the composed prompt, the provider's whole reply including its full `usage` object, the parsed output, and the time. Keeping the whole `usage` object means cached tokens show up if the provider reports them.
- **Where:** the runner and its results stay under `.data/m1/` and aren't committed. It needs `npm run build:packages` first.
- **Sends:** the text provider only, as the product already does, and it spends provider usage.

## Analysis

### Input split

1. Cut each request's system prompt at its known boundaries: the core's prompt, each facet's prompt line, `rules.md` with the module's `module.prompt.md`, and the JSON schema. Then add the user message, which holds the key and its Context.
2. Count each part's characters.
3. Turn characters into tokens using that request's own reported input total. The ratio comes from the whole request, and each part gets its share.

This shares out a measured total; it isn't a tokenizer's count for each part. The prompts are English apart from the key and Context, so one ratio per request should be close. M2 checks it, because each split request reports its own exact input.

### Output split

1. Measure the core and each facet in the output JSON, in characters.
2. Share the visible output tokens (output minus reasoning) between them the same way.
3. Report reasoning as one figure of its own. A single request can't divide it between facets.

### What a split card would send

From the same parts, predict for each input what a split card's requests would hold. One core request: the core's prompt, the shared parts, and the key and Context. Then one request for each facet that applied: that facet's prompt, the shared parts, the key and Context, and the core's output. Set this against today's request, per module. This is the number M2 starts from.

## Output

An evidence note, `docs/history/evidence/m1-token-split.md`, with:
- Per module: median input tokens by part, and each part's share.
- Per facet: median prompt tokens, median output tokens, and how many cards it applied to.
- Reasoning's share of output, per module, and how much it varies between the two samples.
- Time per request, per module, as M2's baseline.
- Whether the provider reported cached tokens.
- The predicted input of a split card against today's, per module.
- Limits, as below.

## Limits

- **Shared out, not counted.** Each part's token count is a share of a measured total, not a tokenizer's count.
- **Reasoning can't be divided.** M1 reports how large it is. Whether a split facet request reasons only about its own facet, or as long as a whole card, is for M2 to measure.
- **Constructed inputs.** The set is designed for coverage. It isn't drawn from real decks, so its mix of kinds and languages is a choice, not a measurement of use.
- **One model,** at the default reasoning, as the product runs today.

## Questions for you

1. Are two samples per input enough, or do you want three, about 370 requests?
2. Should the review of the test set come first, before anything is run?
