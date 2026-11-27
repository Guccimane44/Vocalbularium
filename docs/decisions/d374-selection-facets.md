# D374: Language facets describe the selection

- **Opened:** 2026-11-27
- **Status:** applied (German, English and Chinese)
- **Notion:** pending
- **Source:** the owner in a Claude Code chat, 27 November 2026, issue [#374](https://github.com/Guccimane44/Vocalbularium/issues/374), and their answers the same day to the [selection facets plan](../plans/selection-facets.md): Pronunciation leaves the language modules; a foreign selection's synonyms and antonyms are in its own language; English and Chinese get the same change; cards stored before stay as they are.
- **Affected docs:** [module catalog](../subsystems/module-catalog.md#facets-describe-the-selection), [generation](../subsystems/generation.md), [quality gate](../subsystems/quality-gate.md), [page](../screens/page.md), [module pages](../screens/module-pages.md), the [v0.17.0 master plan](../plans/v0.17.0/README.md) and [step 3b](../plans/v0.17.0/03b-references.md)
- **Open items:** none. Chinese Pinyin keeps giving the reading of each Chinese meaning for a foreign selection: it reads the core, as Simple translation restates it, and describes no translation word.

## Context

When the selection was not in a Languages module's language, most of its facets described a translation instead, the "grammar word": a German card on *fridge* gave Kühlschrank's article, declension and etymology, and on язык those of Sprache ([D17](d17-one-request.md), [D29](d29.md)). That serves almost nobody:

- **Learners of German** select German words, so the selection already is the German word. Nothing changes for them.
- **People who already know German** select foreign words. They want *fridge* or 经济 explained, not Kühlschrank's plural.

It also made v0.17.0 step 3b hard: the word to look up was known only after the core named it, which needed a second request, and the model sometimes guessed it from a meaning (Gesamtheit for Wirtschaft).

## Decision

**A Languages module's card describes the word the user selected, written in the module's language.** Each facet is about the selection, or is left out when it cannot be.

| Facet | Selection in the module's language | Foreign selection |
| --- | --- | --- |
| Core: meanings, meaning in this Context | as before | as before: the selection explained in the module's language |
| Simple translation, Examples | as before | as before |
| Etymology | the selection's | the selection's own, in its language, written in the module's language |
| Synonyms, Antonyms | in the module's language | in the selection's language (*icebox* for *fridge*) |
| Grammar facets (German: Article, Declension, Conjugation, Comparison, Case; English: Forms) | as before | left out |
| Grammar teacher | as before | left out, as before |
| Pronunciation | removed: the Sound module speaks the selection | removed |

- `gramRole` is the selection's own part of speech, whatever its language.
- The grammar facets' condition reads the core's `language` flag as well as `gramRole`, so a foreign card never asks for them, and generation drops one the model writes anyway.
- **Pronunciation is retired**, not deleted: its definition stays, marked `retired`, so a card written before still reads, renders and plays it. It is never offered in the facet window (except on a card that has it, so it can be removed), never requested, and has no Retry, prompt or golden failure points. The Sound module's Pronunciation stays.
- **Cards written before keep what they have**: no migration and no offer to regenerate. A stored grammar facet on a foreign key still renders, with its Retry unavailable.

This replaces the grammar-word rule where [D17](d17-one-request.md) ("the German facets describe the grammar word"), [D29](d29.md) ("the grammar word follows the first line") and [D20's detail](d20-module-pages.md) (*grammar word* as an internal term) state it, and, once applied to English, [D35](d35.md)'s "for a key in another language it describes the English word for the first meaning".

## Consequences

- **Step 3b** looks up the selection in its own language's source before generation, so a card stays one request. Etymology is written from the Wiktionary entry and judged only for agreeing with it; no entry means no etymology.
- **Golden and calibration sets.** German's golden items with a foreign key lost their German candidates and their grammar and Pronunciation fills; three German items replace the points they filled. Calibration cards with a foreign key lost the facets the module no longer writes for them, with their labels; the PR lists every changed card, since step 3's numbers were measured on the old labels.
- **Module pages.** A grammar facet's sample is a word in the module's language in every interface language; the module's own sample, on a foreign word, shows no grammar facet.
- **Screens.** A foreign card shows fewer facets, and the module pages' samples change.
