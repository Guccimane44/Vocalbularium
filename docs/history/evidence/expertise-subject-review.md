# Expertise staying with the subject: the review in every interface language

24 October 2026 (Europe/Berlin). Increment B of the [0.11.0 plan](../../plans/expertise-subject.md), tracked in [#227](https://github.com/Guccimane44/Vocalbularium/issues/227): the D16 prompts, adopted by the owner after the [English run and ranking](expertise-subject-english.md), reviewed in each interface language ([K42](../../architecture/traceability-map.md#clarifications), [K48](../../architecture/traceability-map.md#clarifications)).

## Method

`npm run smoke:generation -- <module> <language> 3`: the Computer Science and Mathematics golden sets (18 and 21 inputs), three samples per input, through OpenCode Go with `deepseek-v4.1-flash`. Round one ran the five languages other than English (585 calls); rounds two to five ran all six (702 calls each). Each language was read by its own Claude reviewer, separate from the drafter, for D16's cases (the plain sentence for an unrelated key, one plain paragraph for a neighbouring term, no forced connection, the Context, no unrequested everyday meaning) and for facts, invented terms and the writing guide's conventions; each reviewer re-checked its language after every prompt revision. English got its own reviewer from round two, after the prompts had changed since the owner's ranking. The outputs are kept in `.data/subject-2026-10-24/` (not committed).

Two runs started in the same millisecond overwrote each other's file in round one; `scripts/golden-set.mjs` now names its output by language and module as well as time.

## Rounds

| Round | Prompt change before it | Pass | Needs fixes | Provider failures |
| --- | --- | --- | --- | --- |
| 1 | (the adopted prompts) | ru | fr, es, ar, zh-Hans | 4 of 585 |
| 2 | Unrelated key: a natural sentence in the interface language instead of an English template; an outside Context may be pointed at by its opening sentence | fr, en | es, ar, zh-Hans, ru | 4 of 702 |
| 3 | A term the subject defines is its own; an in-subject Context is not mentioned | es | fr, en, ar, zh-Hans, ru | 2 of 702 |
| 4 | Neighbouring term explained as its field uses it, with no remark on the subject; nothing beyond the unrelated sentence | not sent to reviewers; the drafter's check found en | en | 4 of 702 |
| 5 | A term of any other field, such as chemistry, biology or medicine, is unrelated | en, ar, zh-Hans, fr, ru, es | none | 10 of 702 |

What each round found that led to the next change:

- **Round 1.** The unrelated sentence copied the prompt's English template ("retinol is not a computer science concept." in French and Chinese output) or read like a bare label («retinol no es un concepto matemático.»). The prompt's "do not refer to the Context" contradicted "name that sense", so every outside-Context opening said "here" or "in the context".
- **Round 2.** Both fixed. New: Big O notation in Mathematics was called a computer science term (Arabic and Spanish, one sample each), and in-subject Contexts (the algebra ring, the scheduling kernel) were echoed in every language.
- **Round 3.** Both fixed. New: neighbouring terms gained asides on how they relate to mathematics (six answers in Russian, Chinese and Spanish, «Для математика это…»), and retinol in Mathematics explained the vitamin twice (English, French).
- **Round 4.** The asides were gone in all 54 neighbouring-term answers, but English Mathematics explained retinol in two of three samples, reading it as a neighbouring term.
- **Round 5.** Every check holds in every language: all 72 unrelated-key answers are one sentence, all 54 neighbouring-term answers one paragraph with no link to mathematics, Big O is mathematics in all 18 samples, and no in-subject Context is mentioned. All six reviewers pass.

## Left as minor

Isolated model slips, none from a prompt or guide rule: the corn-kernel answer often adds the machine-learning kernel (a computer science sense, so allowed); an outside-Context opening sometimes restates more than the sense («qui éclate à la chaleur»); neighbouring terms sometimes open with the English term (Arabic); paragraphs above the length in every language, most in Chinese; and single factual slips, of which the recurring one is an eigenvector said to keep its direction (false for a negative eigenvalue). Each language's are recorded in `extension/locales/reviews.json`.

## Provider failures

Every round failed 2 to 10 calls as an invalid or empty reply, across different inputs, mostly in the Computer Science half while six runs shared the provider; one reply put "facets" inside the core and one added a "kind_note" field. They show as a failed attempt the user can retry. Round five's 10 is the highest; it is not tied to an input, and is noted for delivery.

## Limits

One model and two modules; each language read by one Claude reviewer, not a speaker; facts checked by reading. The owner reads Chinese and English later, as K41 and K42 provide; the three cards left unjudged in the owner's ranking (multi-core, cache, 幸福 in Computer Science) remain unjudged by the owner, and the neighbouring-term wording changed after the ranking.
