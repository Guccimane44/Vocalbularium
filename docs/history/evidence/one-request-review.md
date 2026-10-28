# 0.12.0 review per language: one request per module and the new facets

28 October 2026 (Europe/Berlin). Increment D of [#234](https://github.com/Guccimane44/Vocalbularium/issues/234), the per-language review of [D17](../../architecture/d17-one-request.md) (K50, K55) before 0.12.0 is offered. The golden-set outputs are kept locally in `.data/golden/` (not committed); each language's result is recorded in `extension/locales/reviews.json`.

## Method

- **Runs.** Both Expertise golden sets (Computer Science 18 inputs, Mathematics 21) in each of the five interface languages other than English, one sample per input, `deepseek-v4.1-flash`, through `npm run smoke:generation`. English ran in increments A to C, and the Languages modules (German, Chinese) write in their own language whatever the interface language, so they were not rerun per language.
- **Review.** One Claude reviewer per language, separate from the drafter, read the cards against D16's cases and the language's writing guide, checked every formula and code example, and read the catalog text new in 0.12.0: the explanations and names of Conjugation, Declension, Comparison, Case, Formula and Code example.
- **Rerun.** After the fixes, both sets ran again in all six languages, English included.

## First round

| Language | Verdict | Main findings |
| --- | --- | --- |
| Arabic | fail | The Case explanation wrote the German dative as الجر, which an Arabic reader takes for the genitive; الإعراب as the Declension label |
| Spanish | pass | Formula symbol lists padded with digits and signs; «caché (cache)» against the guide |
| French | fail | Plain spaces before : ; ? ! in the model's prose and in the six new explanations |
| Russian | fail | «Какой падеж управляет немецкий предлог» in the Case explanation is ungrammatical |
| Chinese | pass | Formula padding; the labels 格 and 比较级 too bare |

All five found D16 held on every card, every formula and code example correct, and formulas and code only for keys of the subject. Two findings recurred across languages and so were prompt problems: Formula listed digits, `=`, comparisons and quantifiers as symbols (18 entries for *limit*), and `hasCode` gave code to concepts not usually shown as a program (*Frontend*, *cache*, *garbage collection*).

## Fixes

- **Formula prompt:** only the variables, functions and notation a learner needs; never digits, equals or comparison signs, arithmetic operators or logical quantifiers.
- **`hasCode`:** yes only when a short program is the usual way to show the concept itself (an algorithm, a data structure, a language construct), no for a role, a system, hardware or a general idea.
- **Catalog text:** Russian «Каким падежом управляет»; Arabic حالة القابل (Dativ), تصريف الأسماء, تصريف الأفعال, المقارنة والتفضيل; Chinese 支配格 and 比较级与最高级 and the Formula explanation's wording; Spanish «no rige caso» and the German words in italics; French non-breaking spaces in the six new explanations, as the existing ones have, and «ne régit pas de cas».
- **Writing guides:** Spanish «caché», not «caché (cache)»; Arabic names the subjects علوم الحاسوب and الرياضيات and writes Big O as ترميز O الكبير.
- **Not changed:** the capitalised key at the start of an unrelated key's sentence (*Retinol is not a mathematics concept.*), which K45's example follows; the owner kept the Arabic case names as fixed (28 October 2026).

## Rerun

| | Cards | Failures | Unexpected flags | Facets dropped |
| --- | --- | --- | --- | --- |
| Mathematics, six languages | 126 / 126 | 0 | 0 | 0 |
| Computer Science, six languages | 107 / 108 | 1 (invalid JSON, English) | 0 | 0 |

- **Formula:** 45 formulas across the six languages list no digit, equals or comparison sign or quantifier; one `\cdot` for *group*, the group operation, is a real symbol.
- **Code:** recursion, 递归 and the recursion sentence get code in every language; race condition, thread and Schnittstelle in some; Frontend, cache, API, garbage collection, Big O and bug in none.

## Known limits

- **French typography:** the model writes a plain space before : ; ? ! and inside « », as 0.11.0's output already did, despite the guide. Inserting the non-breaking spaces after generation would be a separate change.
- **One-off slips** the reviewers left: a factorial example with the base case `n == 1`; recursion called a function in one Spanish card; a gloss added to 幸福 in one Chinese sample; GC described as forbidding manual freeing in one Arabic card.
- **Invalid JSON:** about one reply in a hundred cannot be parsed; the card fails and Retry runs it again.
- One sample per input; the owner did not read these languages.
