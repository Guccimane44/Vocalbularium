# Expertise staying with the subject: the English run and the owner's ranking

24 October 2026 (Europe/Berlin). Increment A of the [0.11.0 plan](../plans/expertise-subject.md), implementing [D16](../../architecture/traceability-map.md#entries). It checks the rewritten Computer Science and Mathematics core prompts in English against their golden sets and against 0.10.0's output, before the review in the other languages.

## Method

- **Golden sets.** Mathematics gains retinol, 幸福, multi-core and cache; Computer Science gains retinol. Each input's `why` states what D16 expects ([golden sets](../../../tests/golden/)): 21 inputs in Mathematics, 18 in Computer Science.
- **Baseline.** Both sets on 0.10.0's prompts, English, three samples per input, before any prompt change: 117 outputs, no failures.
- **Runs.** The same on the D16 prompts, twice: round one on the first wording, round two after the fixes below. 117 outputs each, no failures. `deepseek-v4.1-flash` through OpenCode Go throughout.
- **Reading.** Every output was checked against its input's `why` by Claude, the drafter; the review in the other languages (increment B) uses a separate reviewer.
- **Owner's ranking.** On a private judging page, eight cards whose behaviour D16 changes: in Mathematics retinol, 幸福, multi-core, cache, Frontend and the grandmother's ring; in Computer Science retinol and 幸福. Each card shows two baseline samples and two from round two, shuffled, ranked 1–4 and marked fine or not fine. The outputs, the shuffle key and the judging data are kept in `.data/subject-2026-10-24/` (not committed).

## Round one

- **Done as D16 asks:** retinol in both modules was one sentence in every sample (baseline: 71–100 words on the vitamin). multi-core, cache and Frontend in Mathematics were named as not mathematics concepts and explained in one paragraph of 23–47 words, with no Amdahl's law or access-time formula (baseline: up to 135 words, with formulas). limit, field, group, bug and thread gave no everyday meaning. The ring and corn-kernel Contexts opened with one sentence naming the sense. Keys of the subject read as in the baseline.
- **Found:** 幸福 in Mathematics glossed the word in every sample, once wrongly ("which is English for 'happiness'"); 幸福 in Computer Science once listed the neighbouring fields from the prompt; the operating-system kernel twice referred back to the Context ("as in the context sentence").

## Fixes

The unrelated case now asks for one sentence of the form "<the selection> is not a mathematics concept.", without translating, glossing or explaining the selection and without naming the fields; an established term may be built on the word or its English translation. The Context rule now reads "do not restate, explain or refer to it", in the word and sentence prompts.

## Round two

- All three findings are gone: 幸福 and retinol give the plain sentence in all twelve samples, no output names the fields, and no core refers to the Context.
- No sample names happy numbers for 幸福; D16 allows it and does not require it.
- The plain sentence keeps the key's capitalisation ("retinol is not a mathematics concept."), and multi-core's paragraph is short (23–30 words). Both are left for the owner's ranking.

## Owner's ranking

On the [judging page](https://claude.ai/artifact/Cm4GTNv8wqW7Fz7SrD4ZXV), private to the owner, 24 October 2026. The owner judged the five cards they were confident about and left three untouched as unsure.

| Card | 0.10.0 answers | D16 answers | Ranking |
| --- | --- | --- | --- |
| retinol, Mathematics | both not fine | both fine | D16 1st and 2nd |
| retinol, Computer Science | both not fine | both fine | D16 1st and 2nd |
| Frontend, Mathematics | one fine, one not fine | both fine | not ranked |
| 幸福, Mathematics | both fine | both fine | not ranked |
| grandmother's ring, Mathematics | both fine | both fine | one 0.10.0 answer 1st, the rest unranked |
| multi-core, cache (Mathematics); 幸福 (Computer Science) | not judged | not judged | not judged |

No D16 answer was marked not fine; 0.10.0 answers were marked not fine five times. On the judged cards, D16 is preferred on two (retinol), at least as good on two (Frontend, 幸福 in Mathematics) and slightly behind on one (the ring, where the two prompts' answers barely differ). The adoption rule was met on every judged card; the three unjudged cards, including multi-core and cache, carry no owner judgement. Two notes held only fragments ("they", "the ").

**Adopted by the owner on 24 October 2026**, with the three cards unjudged; increment B reviews the D16 prompts in the other five languages.

## Limits

English only, one model, three samples per input, drafter's reading. Sentences outside the subject are not covered ([plan](../plans/expertise-subject.md#not-in-this-milestone)).
