# German Wiktionary coverage on the held-out German keys

12 November 2026 (Europe/Berlin). A model-free check before [M4](../../plans/m4-dictionary-reading.md): for the German module, does the German Wiktionary reach the right main word from a key as a reader selects it, and does that word's entry hold what the costly facets need? No model was called.

## Method

- **Data:** the German Wiktionary's Wiktextract extract (`de-extract.jsonl.gz` from kaikki.org, 310 MB, published 30 October 2026). It holds 1,336,315 entries, 1,016,948 of them German. The entries were trimmed to German and the fields a facet might read, giving 1.8 GB of JSONL. Trimming and the check take about 45 seconds in all.
- **Keys:** both held-out sets in `tests/golden/held-out/`:
  - `lookup-german.json`: 139 items, with a headword's expected article, genitive, plural, verb forms and comparison, and 24 inflected keys with their main word;
  - the 95 German items of `classification.json`, all strata.

  Both sets were labelled before any lookup ran. Their forms are still Claude's draft from memory, not yet reviewed.
- **Lookup:** the key itself, with surrounding punctuation stripped and a leading article dropped; then four ways to the main word:
  1. the key's own entry;
  2. a `form_of` or `alt_of` link on its senses;
  3. a reverse index from every form listed in a main word's table back to that word;
  4. the same key in another case.
- **Kept locally:** the runner, data and per-key results are in `.data/m4-coverage/` (not committed).

## Results

**From a selected form to the main word.** The right main word was among those found:

- 24 of the 24 inflected keys in `lookup-german`;
- 16 of the 17 in `classification` (the miss is *freute sich*, whose main word the label calls *sich freuen*; the dictionary files it as *freuen*).

Both links are needed. The `form_of` link alone finds 36 of 41. The reverse index finds the other five:
- *gewesen*;
- *am besten*;
- *angekommen*;
- *freute sich*;
- *gewesen* in the second set.

Separable verbs work: *rief an* reaches *anrufen*, and *stand auf* reaches *aufstehen*.

**More than one main word is common.** Ways it shows up:
- *gewesen* has its own adjective entry besides *sein*;
- *Bücher* also reaches *Büchle*;
- *Müttern* also reaches the verb *müttern*;
- *war* reaches *sein* and, through a name's table, *Waray*.

The lookup has to return all candidates, and the core's word and part of speech choose among them. Name entries (`pos: name`) should not take part in the reverse index; they caused the *Waray* and *Häusser* matches.

**Case.** Each case is its own entry, as you noticed: *Essen* and *essen*, *Morgen* and *morgen*, *Weg* and *weg*, *Laut* and *laut*. For all 12 `pos-context` keys, the expected part of speech is among the entries, and for all 10 `homograph-context` keys too. A case-insensitive lookup that returns both, with the core choosing by part of speech, covers them.

**Tables against the expected forms**, one entry per reading:

| | Checked | Agree | Disagree |
| --- | --- | --- | --- |
| Noun article | 56 | 52 | 4: *Eltern*, *Leute*, *Ferien* have no gender (plural only); *Beamte* is filed as the feminine |
| Noun genitive singular | 56 | 56 | 0 |
| Noun nominative plural | 56 | 55 | 1: *Milch*, where the dictionary gives *Milche*, *Milchen* and the label none |
| Verb 3rd person present and preterite, participle, auxiliary | 41 × 4 | 164 | 0 |
| Adjective comparative and superlative | 19 × 2 | 38 | 0 |

Where a key stands for several words, each has its own entry with its own gender and table: *See* (2), *Band* (3), *Leiter* (2). The one flaw found is *übersetzen*. Both of its verbs carry the same merged table, so both list *übersetzt* and *setzt über*. A merged table like this has to fall back to the model.

**Not found by the plain lookup:**
- **reflexive verbs**, *sich erinnern*, *sich beeilen*, *sich anziehen*: the dictionary files them without *sich*;
- ***viel***: filed as one adverb entry tagged adjective, numeral and pronoun. It has *mehr* and *am meisten*;
- ***Beamte***: the masculine is *Beamter*;
- ***strasse*** and ***Strasse***: they reach *Strass* (rhinestone), not *Straße*. The reverse index does reach *Straße*;
- **sentences, slogans and abbreviations** such as *z. B.*: as intended, none reach a word entry. Some set phrases have entries: *ins Gras beißen*, *wie geht es dir*, *der frühe Vogel fängt den Wurm*.

**What the entries hold**, over the 116 readings with an entry:

| | Share |
| --- | --- |
| Full noun declension, 4 cases × 2 numbers | 51 of 56 (the rest are plural-only or uncountable) |
| Full verb present and preterite, 3 persons × 2 numbers | 40 of 41 |
| Full adjective declension, strong, weak and mixed | 18 of 19 |
| Synonyms | 88 of 116, 86 with every synonym tied to a sense number; median 4 per entry |
| Antonyms | 77 of 116, 76 tied to a sense number; median 2 |
| Etymology | 110 of 116, median 175 characters |
| IPA | 116 of 116 |

## Conclusion

- **The variant problem is solved by the data.** Inflected forms, separable verbs and spelling variants link to their main word. A reverse index from the tables covers the forms that have no entry of their own. What remains is choosing among several candidates, which the core's word and part of speech can do.
- **The German grammar tables are ready to fill by code**, with these exceptions:
  - verbs whose readings share a table;
  - reflexive verbs, after dropping *sich*;
  - plural-only nouns, which have no gender.
- **Synonyms and antonyms are much better here than in the English Wiktionary.** Three quarters of entries have synonyms and two thirds antonyms, almost all tied to a sense. On 9 November, the English Wiktionary had synonyms for 13 of 41 entries and antonyms for 6, not tied to senses.
- **Etymology is nearly always present and short.**

## Limits

- The keys are held-out sets of common words, about 120 German words and 40 inflected forms, not real captures. Rare words, long compounds and colloquial forms are untested.
- The expected forms are unreviewed drafts. Agreement shows that the dictionary and the draft agree, not that both are right.
- Only whether data is present was checked, not its quality: whether the synonyms are good, or the etymology suits a learner, is for M4's reading arms.
- The English module and the English Wiktionary were not checked, at the owner's choice of download.
