# Wiktionary experiment: an English card from the dictionary

9 November 2026 (Europe/Berlin). Plan: [wiktionary-experiment](../../plans/wiktionary-experiment.md). The question: for English (British), how much of a card can Wiktionary fill, how good is it, and how much faster is it than today's single request?

## Method

The 54 inputs of `tests/golden/parents.json`, English (British) with all seven facets, one sample per variant, OpenCode Go, `deepseek-v4.1-flash`, four inputs at a time.

- **A**: today's single request ([D17](../architecture/decisions/d17-one-request.md)).
- **W**: the key looked up in the English Wiktionary (Wiktextract per-word files from kaikki.org, fetched 9 November, in six languages: English, German, Chinese, Japanese, Spanish, French). A sentence or a key with no entry falls back to A. Otherwise a small model request (standing in for Jev, which we have no access to) picks the language when several have an entry and the sense the Context uses; the core's meanings are the first four glosses, taking each entry in turn and leaving out senses tagged obsolete, archaic, rare, dated, nonstandard or historical. Pronunciation, Examples, Synonyms, Antonyms and Etymology come from the entry when it holds them (rules in the plan); every facet left over goes to the model as a facet's own Retry with the dictionary core as `core`, one request per facet, in parallel.

Both runs were judged by `npm run judge` against `english-british/rubric.md` and checked by the catalog's content checks. The runner, the entries and every output are kept locally in `.data/wiktionary-2026-11/` and `.data/golden/2026-11-09T20-40-37-870Z-wiktionary-{A,W}-english-british.json` (not committed). Two keys were rerun after fixes to the runner (Chinese simplified forms are soft redirects to the traditional entry; the pick request needed a larger token budget).

## Results

**Coverage.** 43 word or phrase keys; 41 have an entry (missing: *John Cena*, *sich freuen*, whose headword is *freuen*). The 11 sentences fall back by design. Where each part of the 41 cards came from:

| Part | Dictionary | Model | Left out (none in the dictionary) |
| --- | --- | --- | --- |
| Core | 41 | 0 | — |
| Pronunciation | 33 | 8 | — |
| Synonyms | 13 | 25 | 3 |
| Antonyms | 6 | 25 | 10 |
| Etymology | 9 | 25 | 7 |
| Examples | 9 | 32 | — |
| Simple translation | 0 | 41 | — |
| Grammar teacher | 0 | 16 | — |

Every W card still called the model: Simple translation always applies, and foreign keys need translated examples, English synonyms and the English word's etymology, which the entry does not give.

**Quality.** The judge on the 41 cards with an entry:

| | Pass | Weak | Fail | Not scored |
| --- | --- | --- | --- | --- |
| A | 36 | 3 | 2 | 0 |
| W | 15 | 5 | 20 | 1 |

By key: English keys (16) A 11 pass against W 1; foreign keys (25) A 25 pass against W 14. Per criterion, W fails *sense* 11 times (A 0) and *facets* 20 times (A 1). Content checks: A 1 card failing, W 2 (`british-spelling`: *gray* in a gloss of *color*; Etymology over 600 characters for *run*).

The failures fall into five kinds:

1. **Glosses that are not senses.** Wiktionary lists form-of and spelling entries as senses: *run* "past participle of rin", *colour* "Commonwealth and Ireland standard spelling of color" (three times), *Junge* the adjective forms of *jung*, *把* "alternative form of 爬", *aufstehen* "to rest (on something)".
2. **Rare senses crowding out common ones.** *tea* got the plant, "good-looking, sexy" and a historical unit of time, but not the drink; *apartment* a threading-architecture sense; *refrigerator* "one who has a chilling influence". The dictionary's order is not a ranking for a learner.
3. **Synonyms and antonyms are not per sense.** Wiktextract's lists mix thesaurus links of every sense: *bank* got *block* and *grid*, *color* *DgammaDtime*, *serendipity* *casualty*, *window* *glass*.
4. **Readings.** *行* picked the háng sense for the Context, but the romanization and the other senses came from xíng; *bank*'s etymology described the money sense on a river-bank card.
5. **The model builds on what it is given.** Examples, Pronunciation and Simple translation written for a bad core repeat its errors (*Junge*, *aufstehen*, *把*), so one wrong gloss fails the whole card.

The language pick did well: it agreed with A on 39 of 41, and on the two it did not (*gut*, *tot*) it chose German, the reading the golden set intends, where A chose English. The judge then failed W's *tot* for not being English, so the judge alone undercounts W slightly. The judge is also noisy: on the 13 inputs where A and W are the same card (sentences and misses), it gave a different verdict twice.

**Time.** Median per card on the 41 hits: A 38.7 s, W 12.2 s; W was faster on 36. The pick request, asked for 19 cards, took a median 1.9 s. Both variants ran four inputs at a time and W's parallel requests competed with them, so both times are inflated (A's *breadcrumb* alone took 11 s): the ratio is indicative, not a measurement. W was slower on foreign keys with five or six facets left for the model (*laufen* 124 s, *Wohnung*, *Fenster*). W is faster because each request writes one facet for a given core, in parallel, not because of the dictionary.

## Conclusion

- **The plain "dictionary word → pull from Wiktionary" path is not good enough for English (British).** It passed 15 of 41 cards against today's 36. Raw glosses need choosing, ranking and cleaning that the dictionary does not do, and any rule good enough to do it is close to asking the model.
- **No card skipped the model.** The speed gain came from splitting the card into parallel facet requests, which can be tested without Wiktionary.
- **What the dictionary did well:** finding the key's language (better than A on *gut* and *tot*), Pronunciation for an English key, and Etymology origins as a list of languages. These are lookups, not explanations.

## What this suggests next

1. **Dictionary as input, not output:** give the model the entry's senses, forms and etymology as material in the request, and let it choose and write. This keeps today's quality and may make cards more reliable; it does not make them faster.
2. **Structured facets where Wiktionary is strongest:** German Article, Declension, Conjugation and Comparison come from inflection tables, where the model makes mistakes (*ihr liefet*). English (British) has no such facets, so this experiment could not test them.
3. **Parallel facet requests on their own:** today's core, then each facet in parallel, timed one card at a time, to see whether the speed gain holds without the dictionary.

## Limits

English (British) only, one sample, one judge pass with no fresh calibration, times taken under concurrency, the pick made by the text model rather than Jev, and simple selection rules (first four glosses, entries in turn) that a product would refine. The owner's blind ranking sheet (`.data/wiktionary-2026-11/ranking-sheet.md`, answer key beside it) was prepared but not filled in.
