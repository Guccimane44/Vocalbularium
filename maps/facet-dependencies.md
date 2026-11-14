# What each facet waits for

11 November 2026. Read from the facet prompts on `main` at `761bfbd` (release 0.16.4). Companion to the [headers and flags map](headers-and-flags-map.md) and the [capture-to-card walkthrough](capture-to-card-walkthrough.md).

The question: if a classifier (Jev) decided the flags before generation, which facets could start at once, beside the core, and which would still have to wait for the core's written meanings?

## Two kinds of dependency

- **Flags** decide whether a facet applies (Article only for a noun). A classifier can supply these before generation.
- **Core content** is what a facet builds on: the meanings, their order, the translation. Only the written core has it.

Most facets depend on one thing more than on any flag: **whether the key is in the module's own language.** A German key on a German card is described as itself; an English key on a German card is described through its German translation, which the core decides. So each facet appears twice below.

## The table

*Early* means it needs only the key, its Context and the flags, so it can run beside the core. *Waits* means it needs the core's content.

| Module | Facet | Flags it needs | Key in the module's language | Key in another language | Could be a lookup |
| --- | --- | --- | --- | --- | --- |
| German | Article | `gramRole` = noun | Early (the key itself) | Waits (the German word of the first meaning) | Yes, Wiktionary has gender and plural |
| German | Declension | `gramRole` = noun or adjective | Early | Waits | Yes, inflection tables |
| German | Conjugation | `gramRole` = verb | Early | Waits | Yes, inflection tables |
| German | Comparison | `gramRole` = adjective | Early | Waits | Yes |
| German | Case | `gramRole` = preposition | Early | Waits | Partly: the cases yes, the uses and examples no |
| German | Etymology | `kind` = word | Early | Waits | Partly: origins yes, the written history no |
| German | Synonyms, Antonyms | `kind` = word | Early, though each should fit a meaning the core gives | Waits ("of the translation") | Partly: dictionary lists, not filtered to the meanings |
| German | Grammar Teacher | `language` = German | Early (the selection itself) | Does not apply | No |
| German | Pronunciation | — | Early, **no model needed**: it is the key itself | Waits (one item per meaning) | — |
| German | Examples | `kind` | Waits (one sentence per meaning, in order) | Waits | No |
| German | Simple Translation | — | Waits ("the core's meanings again") | Waits | No |
| Chinese | Pinyin | — | Early (one entry for the selection) | Waits (the Chinese word of each meaning) | Yes for a Chinese key |
| Chinese | Etymology | `kind` = word | Early | Waits | Partly |
| Chinese | Grammar Teacher | `language` = Chinese | Early | Does not apply | No |
| Chinese | Pronunciation | — | Early, no model needed | Waits | — |
| Chinese | Examples, Simple Translation | `kind` | Waits | Waits | No |
| English (both) | Synonyms, Antonyms | `kind` = word | Early, with the same caveat as German | Waits | Partly |
| English (both) | Etymology | `kind` = word | Early | Waits | Partly |
| English (both) | Grammar Teacher | `language` = English | Early | Does not apply | No |
| English (both) | Pronunciation | — | Early, no model needed | Waits | — |
| English (both) | Examples, Simple Translation | `kind` | Waits | Waits | No |
| Mathematics | Formula | `relevance` = subject, `hasFormula` = yes | Early (the concept, from the key and Context) | Same | No |
| Computer Science | Python | `relevance` = subject, `hasCode` = yes | Early | Same | No |
| Chemistry | Equation | `relevance` = subject, `hasEquation` = yes | Early | Same | No |

Pronunciation (the module) and the Creativity modules have no facets. The Pronunciation module's whole text request is its `language` flag, so a classifier could replace that request entirely.

## What it means for the gate

1. **For a key in the module's own language, most facets could start early.** On a German card for *Ufer*, only Examples and Simple Translation have to wait; the four grammar facets could even be lookups, and Pronunciation needs no model at all.
2. **For a key in another language, almost everything waits.** On a German card for *bank*, every facet except Grammar Teacher (which does not apply) builds on the German word the core chooses. There the gate saves only the facets the flags rule out, and the order is simply core first, then the facets.
3. **So the gain depends on how often the key is in the module's own language.** That is a question about real decks, and it can be answered from stored pages: compare each Languages component's `language` with its module.
4. **Two caveats on "early":**
   - Synonyms, Antonyms and the Expertise facets follow a meaning. For an ambiguous key (*Bank*, *ring*), an early facet might describe a different sense from the one the core picks. The core reads the Context to choose, so an early facet would need the same Context and could still disagree.
   - Pronunciation of a key in the module's own language is the key itself. It needs no generation even today; the model only copies it.

## Sources

The facet prompts in `packages/domain/src/catalog/<family>/<module>/facets/<facet>/prompt.md`, and each facet's `when` in its `facet.ts`. Lookup coverage is not measured; the "could be a lookup" column says only what a dictionary entry usually holds.
