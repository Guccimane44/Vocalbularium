# Writing in the interface language: prompt test

23 October 2026 (Europe/Berlin). The source of [D15](../../architecture/traceability-map.md#entries). The owner found Computer Science output awkward with the language preference set to Chinese. Since 0.9.0 the Expertise modules write in that preference ([D14](../../architecture/traceability-map.md#entries)) through English prompts whose `{{language}}` the composer fills with the language's English name ([generation architecture](../../architecture/generation.md#prompts)). This test asks whether the prompts should instead be written in the output language, or whether guidance about that language is enough.

## Method

OpenCode Go with `deepseek-v4.1-flash`, called through `OpenCodeProvider` directly, without the API, database or extension. The Computer Science core only (it has no facets), with the 17 inputs of its golden set (`tests/golden/computer-science.json`), the interpretation step skipped and the input type set from the input (a sentence ends with a full stop). Three variants:

- **A**: the current prompt, composed by `moduleInstructions` with the language preference.
- **B**: A with its one length rule restated in the unit the language counts in (zh-Hans "at most about 80 Chinese characters each"; French keeps "at most 50 words each"), followed by a short **writing guide** written in that language: natural, idiomatic prose in the register of a good textbook rather than a translation; no stock phrases (examples named); a technical term at first use as the established term with the English in brackets, English kept where no translation is current; code and identifiers untranslated; the language's punctuation.
- **C**: the whole prompt (core, facets line, shared rules and module rule) translated into the language, followed by the same guide.

**Round one** (zh-Hans only, one sample) gave B two handicaps: it kept the English "50 words" beside a second length rule in the guide, and the guide ended with a JSON example answer. C carried the same example. The example leaked into outputs (a kernel explanation borrowed its 学号), and C read clearly better than B. **Round two**, below, removed both handicaps and ran zh-Hans and French, 3 samples per input and variant: 306 calls.

The scripts and every output are kept locally in `.data/writing-guide-2026-10-23/` (not committed).

## Round two results

The metrics are rough pattern counts. *Stock phrases* counts phrases such as 想象一下, 简单来说, 很重要, 好比 or « Imaginez », « En termes simples », « C’est important ». *Term* is the share of outputs with at least one term followed by its English in brackets. *Typography* is the share without ASCII punctuation against Chinese characters (zh-Hans) or straight quotes and a missing space before `; : ! ?` (French).

**zh-Hans**

| | Failed | Paragraphs | 汉字 per paragraph | Paragraphs over 80 | Stock phrases per output | Term | Typography |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 8/51 | 2.6 | 62 | 6% | 0.56 | 0% | 100% |
| B | 3/51 | 3.0 | 56 | 4% | 0.04 | 94% | 100% |
| C | 1/51 | 2.8 | 54 | 4% | 0.04 | 92% | 100% |

**French**

| | Failed | Paragraphs | Words per paragraph | Paragraphs over 50 | Stock phrases per output | Term | Typography |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 0/51 | 2.6 | 41 | 11% | 0.06 | 18% | 92% |
| B | 1/51 | 2.8 | 44 | 11% | 0.10 | 80% | 92% |
| C | 2/51 | 2.7 | 42 | 8% | 0.06 | 82% | 98% |

## Reading

A cross-section of outputs was read in both languages (Frontend, garbage collection, kernel with the corn context, 幸福, and *Python is dynamically typed.*), not all 306.

- **zh-Hans, A** reads as translated: stock comparisons (好比餐厅的前台), 简单说, no English beside the terms, Latin script jammed against Chinese (HTML描述结构). Length is unpredictable, since "50 words" has no meaning in Chinese.
- **zh-Hans, B and C** read like a Chinese textbook and are close; C is slightly tighter, B sometimes adds a paragraph of further detail.
- **French, A** is already fluent; the guide mainly makes terms consistent (« ramasse-miettes (garbage collection) ») and C's typography is slightly cleaner. The gain is much smaller than in Chinese.
- **Every variant** turns the core prompt's "a simple example or picture" into a forced comparison (好比餐厅…, « Image : un agent de nettoyage », « Voyez-le comme un guichet unique »). This comes from the module prompt, not from its language.

## Failures

Every failure was `provider_invalid`. Most replies were JSON missing the `}` that closes `"core"` (`…"],"facets":{}}`); one put the core's keys at the top level. A's 8 of 51 in Chinese against 0 of 51 in French, with the same prompt and model, means the current prompt fails noticeably often in Chinese for a reason unrelated to its wording. It is investigated separately.

## Conclusion and limits

The language-specific parts, a length rule in the language's unit and a writing guide, bring most of the improvement; a translated prompt adds little over them on this model. Chinese gains far more than French. Limits: one model (trained heavily on Chinese), one module, rough metrics, a partial reading, and no third language with a different script direction such as Arabic.
