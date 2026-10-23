# Writing guide in English or in the language (K43)

23 October 2026 (Europe/Berlin). Increment A of the [0.10.0 plan](../../plans/expertise-writing.md), tracked in [#220](https://github.com/Guccimane44/Vocalbularium/issues/220). [K43](../../architecture/traceability-map.md#clarifications) asks whether a writing guide written in English, with examples in the language, works as well as the guide the [prompt test](writing-guide-prompt-test.md) used, which was written in the language. The English guide is adopted unless it is clearly worse.

## Method

As in round two of the prompt test: OpenCode Go with `deepseek-v4.1-flash`, the Computer Science core with its 17 golden inputs, Chinese (Simplified) and French, 3 samples per input, 204 calls. Both variants use the current English prompt with its one length rule restated in the language's unit (about 80 Chinese characters; 50 words in French). They differ only in the guide that follows it:

- **L**: round two's guide, written in the language.
- **E**: the same guidance written in English, its examples (stock phrases, a term with its English) in the language.

The provider ran without the brace repair of [#219](https://github.com/Guccimane44/Vocalbularium/pull/219), as in round two, so failures are comparable. The scripts and every output are kept locally in `.data/writing-guide-2026-10-23/k43/` (not committed).

## Results

Measured as in round two (the same pattern counts).

**zh-Hans**

| | Failed | Paragraphs | 汉字 per paragraph | Paragraphs over 80 | Stock phrases per output | Term | Typography |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L | 1/51 | 2.8 | 53 | 0% | 0.02 | 94% | 100% |
| E | 2/51 | 2.9 | 53 | 0% | 0.06 | 92% | 100% |

**French**

| | Failed | Paragraphs | Words per paragraph | Paragraphs over 50 | Stock phrases per output | Term | Typography |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L | 1/51 | 2.7 | 43 | 14% | 0.04 | 74% | 94% |
| E | 0/51 | 2.8 | 43 | 13% | 0.04 | 78% | 94% |

Every failure was the missing `}` before `"facets"` that #219 repairs.

## Reading

A cross-section was read in both languages (cache, race condition, 幸福). E and L read alike: textbook register, terms such as 竞态条件（race condition） and « condition de course (race condition) », no stock openers. Differences are single samples, not patterns: one E answer in Chinese quoted with 「」 rather than “”, some French answers in both variants used a straight apostrophe, and one L answer in French referred to a context it was not given.

## Conclusion

E is not worse than L on any measure or in reading, so the guides are written in English with examples in the language (K43). Two points for increment B: French paragraphs exceed 50 words in about one in seven, in both variants, so the guide's length wording deserves a check in the review; and the Chinese guide should name the quotation marks to use. Limits as in the prompt test: one model, one module, two languages, rough metrics and a partial reading.
