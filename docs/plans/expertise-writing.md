# Plan: the Expertise modules written for the interface language (0.10.0)

Proposed: 23 October 2026 (Europe/Berlin). Implemented in release 0.10.0 (increments 0, A, B and C, [#221](https://github.com/Guccimane44/Vocalbularium/pull/221), [#222](https://github.com/Guccimane44/Vocalbularium/pull/222), [#223](https://github.com/Guccimane44/Vocalbularium/pull/223) and [#224](https://github.com/Guccimane44/Vocalbularium/pull/224)); owner acceptance is recorded on the tracker. Implements [D15](../architecture/traceability-map.md#entries), accepted by the owner on 23 October 2026, with K39–K43 resolved the same day. Specification: [modules § Writing in the interface language](../specs/modules.md#writing-in-the-interface-language) and the [generation architecture](../architecture/generation.md#prompts). Tracker: [#220](https://github.com/Guccimane44/Vocalbularium/issues/220).

## Outcome

With the language preference set to any of the six interface languages, the Expertise modules' output reads as that language is natively written, not as a translation: no stock phrases carried over from English, technical terms written the way that language writes them with the English in brackets, its own punctuation, and lengths that suit it. Their prompts stay English. Each language's Expertise output has been reviewed before release. The Languages modules and every other part of generation are unchanged.

0.10.0 builds on `main` after 0.9.1 and [#219](https://github.com/Guccimane44/Vocalbularium/pull/219), which repairs the brace that `deepseek-v4.1-flash` sometimes drops in Chinese replies. No migration: decks, pages and components do not change, and components generated before 0.10.0 keep the prompt version they were made with.

## Owner decisions

Recorded in D15 on 23 October 2026 and applied to the specifications:

1. **Scope:** the Expertise family only; the Languages modules and the Creative family get no guide (K39).
2. **One writing guide per interface language**, in English with short example phrases in the language, added by the composer to every Expertise request; prompts stay English, never translated.
3. **Length** is written as a placeholder that each language's guide fills in its own unit (K40).
4. **Guides** live in `catalog/expertise/writing/`, from one five-section template, drafted by Claude and checked by a separate Claude reviewer; the owner checks Chinese and English (K41).
5. **Review per language:** each Expertise golden set is reviewed in each language before release; the six current languages stay offered meanwhile (K42).
6. **English guide first checked:** a guide in English is compared with one in the language before the guides are built (K43).

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

This plan and the tracker.

### A. Check the English-written guide (K43)

- **Golden sets in a language.** `scripts/golden-set.mjs` takes a language (`npm run smoke:generation -- computer-science zh-Hans`) and runs the module's golden set with that preference, three samples per input when asked; its review file states the language. Later increments use it for the reviews.
- **Comparison.** Draft the Chinese and French guides from the template, in English with examples in the language, and run Computer Science's golden set in both languages, three samples each, against round two's guides written in the language ([prompt test](../history/evidence/writing-guide-prompt-test.md)). Measure as in round two (failures, length against the limit, stock phrases, terms with English, punctuation) and read the outputs side by side.
- **Decision.** The English guide is adopted unless it is clearly worse; if it is, the owner chooses before B starts. The result is an evidence record beside the prompt test.

### B. The guides and the composer

- **Template and guides.** The five-section template ([modules](../specs/modules.md#writing-in-the-interface-language)) and a guide for each interface language: `en`, `ar`, `zh-Hans`, `fr`, `ru` and `es` in `packages/domain/src/catalog/expertise/writing/`. Example phrases only, never a whole sample answer. Each guide is reviewed by a separate Claude reviewer (its examples correct and idiomatic, nothing specific to one subject) and recorded in `extension/locales/reviews.json` beside that language's strings.
- **Composer.** `moduleInstructions` adds the guide of the request's language to an Expertise module's instructions after the shared rules; other families get none. The length placeholder in the Computer Science and Mathematics prompts is filled from the guide (50 words in English, French, Spanish and Russian; about 80 characters in Chinese; the Arabic guide sets its own). The Expertise prompts no longer name words.
- **Snapshots and guards.** The prompt snapshots gain one Expertise request per interface language other than English (`computer-science.word_phrase.zh-Hans.txt`), and the English Expertise snapshots change to carry the English guide; the German, Chinese and interpretation snapshots stay byte-identical. The conformance test requires a guide with all five sections for every interface language, and no word count outside the placeholder in an Expertise prompt.
- **Tests.** Unit: the guide is added to Expertise requests only, the placeholder is filled per language, a missing guide fails the conformance test, the prompt version differs per language. Browser E2E: an Expertise page generated in Chinese with a mocked provider, checking that the request carried the Chinese guide; the existing suites pass.

### C. Review per language (K42)

- **Runs.** The golden sets of Computer Science and Mathematics in each of the six languages, three samples per input, through `smoke:generation`.
- **Review.** A Claude reviewer separate from the drafter reads each language's outputs for facts, invented terms, the guide's conventions and length; findings that come from a guide are fixed in it and that language is run again. The owner reads Chinese and English. Each language's result is recorded in `extension/locales/reviews.json`, and the runs are summarised in an evidence record.
- **Not changed here:** the module prompts' own wording, beyond the length placeholder.

### D. Verification and delivery (0.10.0)

- The full unit and browser suites; the golden-set evidence from C.
- Version 0.10.0; the scope ledger's D15 row to `implemented`, with an upgrade note (no migration; Expertise output reads differently from 0.10.0, earlier components unchanged); D15 to Implemented in the traceability map and Notion. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. With the preference in Chinese, a Computer Science explanation writes terms as 中文术语（English term）, uses no stock phrase the guide lists, and keeps each paragraph within about 80 characters.
2. Every Expertise request carries the guide of the interface language; a German or Chinese module's request is byte-identical to 0.9.1's.
3. The Expertise prompts are English and name no word count; a language's guide sets the length unit.
4. Every interface language has a reviewed guide and a recorded Expertise review; the conformance test fails for a language without a guide.
5. Components generated before 0.10.0 keep their content and prompt version; a new one records the version for its language.

## Risks

- **An English-written guide may steer less well** than one in the language: increment A measures it before any guide is built.
- **Review in languages the owner does not read:** a separate Claude reviewer reads facts and terms against the guide, as for the interface strings; the owner's later check can still correct it.
- **English output changes too,** since English gets a guide: its golden sets are reviewed like the others.
- **Examples in a guide can leak** into output, as a full sample answer did in round one: guides hold short phrases only, and the review looks for them in outputs.
- **Live runs cost provider usage:** about 600 calls for C across two modules and six languages.

## Not in this milestone

The Creative family's language handling; guides for the Languages modules; translated prompts; changing the Expertise prompts' wording beyond the length placeholder, such as the "simple example or picture" that produced forced comparisons in the prompt test; a different model.
