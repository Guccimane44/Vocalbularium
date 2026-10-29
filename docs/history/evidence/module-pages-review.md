# 0.13.0 review: page text and samples in every interface language

29 October 2026 (Europe/Berlin). Increment A of [#246](https://github.com/Guccimane44/Vocalbularium/issues/246), the review of [D20](../../architecture/d20-module-pages.md)'s page text (K62) and samples (K63, K65) before the pages' sheet is built.

## Method

- **Page text.** `about.json` for the 3 families, 6 window modules and 12 facets, written in English from the owner's settled canvas, and translated by the drafter into Arabic, Chinese (Simplified), French, Russian and Spanish: 126 files.
- **Samples.** `npm run samples` generated, with the 0.12.2 prompts and `deepseek-v4.1-flash`, 42 cards: German and Chinese for *language* and *Languages are the bridges connecting people and the world.* in each interface language, German Conjugation, Comparison and Case for *speak*, *clear* and *between*, and Mathematics and Computer Science for *eigenvalue* and *Frontend* and a sentence each, written in each interface language. The main key's and Context's 12 samples are hand-written.
- **Review.** One Claude reviewer, separate from the drafter, read every page text against its English and the interface's established terms, and every sample for correct German forms, simplified characters and pinyin, romanizations, translations and the Expertise explanations.

## Findings

48 problems and 45 suggestions. Every German article, plural, declension table, conjugation (*sprechen* with *haben*), comparison (*klar, klarer, am klarsten*) and *zwischen* with the accusative and the dative was correct in all six languages; every Chinese character was simplified with correct tones; every Languages card read *language* in its first meaning.

| Language | Problems | Main findings |
| --- | --- | --- |
| English | 3 | Both Examples pages described the facet backwards: its sentences are in the key's language with a German or Chinese translation, not the reverse (carried into every translation); a Mathematics example put the eigenvalues "along the diagonal" |
| French | 6 | Plain spaces before : ; ? ! and inside « » in 15 files; a pronoun without antecedent on the Formula page; Zunge and Redeweise as synonyms of Sprache; a sample's key language written Spanisch |
| Spanish | 8 | Indicative where the concessive needs the subjunctive (*uses*); "el valor propio es el doble" for an eigenvalue of 2; Zunge as a synonym; a sample's key language written Französisch |
| Russian | 10 | Захват for capture where the interface says добавление; two romanization systems mixed; agreement errors on the Notes pages (Пишет · Вы, «Осторожно с родной язык») |
| Arabic | 10 | المجموعة for deck where the interface says الرزمة; garbled or wrong mathematical terms (بعددي, القطرية for diagonalization); a romanization with a doubled consonant |
| Chinese | 11 | 采集 for capture where the interface says 摘录; 用自己的语言 read as "in one's own words"; 压短; Sprachvermögen as a synonym; 节日 for a festival |

Several Mathematics explanations said an eigenvector's direction never changes, which is wrong for a negative eigenvalue (Spanish, Russian, Arabic, Chinese). The facet was called фасет, أوجه and 侧面 where the interface calls it Раздел, جانب and 子项.

## Fixes

- Every problem was fixed in the page text and, by hand, in the stored samples; no sample was regenerated. The Examples pages say what the facet does, in all six languages.
- The facet is called by the interface's word in Russian, Arabic and Chinese (Раздел, جانب, 子项); capture by the interface's words (добавление, 摘录); a deck الرزمة.
- French files use a no-break space before a colon and a narrow no-break space before ; ? ! and inside « », as the interface does.
- Of the suggestions, those that removed ambiguity were taken (Expertise "best for" labels in Arabic and Russian; agreement on the Notes family page in French and Spanish; the French Context note); style preferences were left.

The owner reviews a representative set of samples before increment A merges.

## 0.13.1: the new Expertise samples and the Python facet

29 October 2026. [D21](../../architecture/traceability-map.md#entries) replaced the Expertise samples (*quadratic equation* in the interface language, *Hello, world* in English) and Code example with Python. `npm run samples` generated the 12 cards (24 provider calls, no failures); a separate Claude reviewer read them and the Python facet's page text in six languages, and ran every code example (all eight print as expected).

16 problems and 25 suggestions. The problems, all fixed by hand: solutions called the *points* where the parabola meets the axis instead of their abscissas (Arabic, Russian, Spanish); a muddled factor argument in Arabic; an equation called a polynomial in Spanish; "一个" real root where Chinese convention says two equal roots; an ungrammatical symbol meaning in the Russian formula; an English sentence card starting with an "it" without antecedent; `Hello, world!` with an exclamation mark in the Spanish code; a missing "من" and a misattributed test in Arabic; the jargon 必现 in Chinese; and four French spaces of the wrong width. Two suggestions were taken for consistency across languages: no sentence card shows a Python facet, and the Chinese code holds one example.

## 0.13.1: *good* for Synonyms, Antonyms and Declension

29 October 2026. [D21](../../architecture/traceability-map.md#entries) gives every facet page at least one representative sample: German's *language* has no synonyms or antonyms in most languages, so Synonyms and Antonyms use *good* (*gut*), and Declension adds it as an adjective. `npm run samples` generated the 18 cards (18 provider calls, no failures), read and corrected by hand: French *bon* was read as the German noun *Bon* (receipt) on the Synonyms and Antonyms cards, which now take the adjective; four Declension tables gave the weak and mixed forms without their articles and now match the English table; the English synonyms listed *gut* itself; and interjection meanings (*ja*, *na ja*, *okay*, *einverstanden*) were dropped from the cores. A catalog test now requires a sample for every facet in every interface language.
