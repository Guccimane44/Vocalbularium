# Expertise output reviewed in each interface language (K42)

23 October 2026 (Europe/Berlin). Increment C of the [0.10.0 plan](../plans/expertise-writing.md), tracked in [#220](https://github.com/Guccimane44/Vocalbularium/issues/220): the review of the Expertise output in each of the six interface languages ([K42](../../architecture/traceability-map.md#clarifications)), run on `main` after increment B ([#223](https://github.com/Guccimane44/Vocalbularium/pull/223)) with the brace repair of [#219](https://github.com/Guccimane44/Vocalbularium/pull/219).

## Method

`npm run smoke:generation -- <module> <language> 3`: the golden sets of Computer Science and Mathematics (17 inputs each), in English, Arabic, Chinese (Simplified), French, Russian and Spanish, three samples per input, through OpenCode Go with `deepseek-v4.1-flash`: 612 generations per round. Each language's outputs were read by its own Claude reviewer, separate from the drafter, for facts, invented terms, the guide's conventions and length. Findings that came from a guide were fixed in it and every language was run again; each reviewer then re-checked its language. Three rounds were run. The outputs and the reviewers' notes are kept locally in `.data/writing-guide-2026-10-23/c`, `c2` and `c3` (not committed).

## Results

Failures and the share of paragraphs over the length limit (50 words; about 80 characters in Chinese), per module, Computer Science / Mathematics:

| Language | Round 1 failed | Round 1 over | Round 2 failed | Round 2 over | Round 3 failed | Round 3 over |
| --- | --- | --- | --- | --- | --- | --- |
| en | 0 / 0 | 10% / 5% | 0 / 1 | 6% / 9% | 0 / 0 | 6% / 3% |
| ar | 1 / 0 | 0% / 2% | 2 / 0 | 1% / 1% | 0 / 0 | 2% / 0% |
| zh-Hans | 0 / 1 | 0% / 1% | 0 / 0 | 0% / 0% | 0 / 0 | 2% / 3% |
| fr | 0 / 1 | 17% / 12% | 0 / 0 | 6% / 6% | 0 / 1 | 11% / 6% |
| ru | 0 / 1 | 1% / 2% | 0 / 0 | 0% / 2% | 2 / 0 | 0% / 2% |
| es | 1 / 2 | 5% / 7% | 0 / 0 | 5% / 8% | 0 / 0 | 2% / 5% |

Each round failed 3 to 7 of 612 generations as invalid results. The three round-three failures generated on every one of three reruns, so they are occasional malformed replies, not a problem of an input or a language.

**Verdicts:** after round 1, every language passed after guide fixes; after round 2, Arabic, Chinese and Spanish passed, and English, French and Russian needed further fixes; after round 3, all six passed.

## What the review changed in the guides

- **Round 1.** Every language opened paragraphs with a "this matters because" sentence in a form the guide did not list (English 34 paragraphs, Chinese about 15, Spanish 10, French 10, Russian 15). When the selection was the English term, the model put it first or repeated it in parentheses. Terms were calqued (« condition de course », «división y conquista», «правило степени»). Arabic wrapped terms in quotation marks and let Arabic commas and letters into formulas; Chinese used full-width punctuation inside formulas and mixed spacing; English mixed British and American spelling. The guides gained rules for each.
- **Round 2.** Those patterns were gone, but two rules backfired: asking for English "at the first use of a technical term the explanation relies on" glossed everyday words (bracketed English per answer rose by up to 40%), and every example the guides gave of a better opener became the new stock opener (« Elle sert à » 26 times, «Без …» 14, "makes possible"). The English guide's "explain every technical term" stacked explanations inside sentences.
- **Round 3.** The guides limit English to the selection and one or two specialist terms, name no replacement phrase, and ask that the use or consequence be worked into the explanation. Glosses returned to round-one levels and no template opener remained.

The lesson for later guides: a phrase offered as an example is copied as a template; rules work better than sample wording.

## Not fixed by the guides

- **Module prompts.** In every language the model restates or explains the Context when it is inside the subject, which the [modules spec](../../specs/modules.md#input-and-applicability) forbids, and adds an everyday meaning when no Context asks for one. Both come from the Computer Science and Mathematics prompts' wording, which this release leaves unchanged.
- **French and Russian non-breaking spaces.** The model writes them before ; : ! ? and dashes only part of the time, whatever the guide says; a normaliser after generation would fix it.
- **Facts.** Each round had isolated factual slips. Recurring ones: an eigenvector "keeps its direction" (false for negative eigenvalues), Big O read as an exact growth rate, the 1947 moth told as the origin of "bug", lines that do not meet called parallel without "in the plane", and garbage collection said to prevent all memory leaks.
- **Guide length.** The guides grew to 290–364 words, above the 150–250 words of [K41](../../architecture/traceability-map.md#clarifications); the owner amended K41 to about 250–400 words on 23 October 2026.

## Limits

One model and two modules; each language read by one Claude reviewer, not by a speaker; facts checked by reading, not against references. The owner reads Chinese and English later, as K41 and K42 provide.
