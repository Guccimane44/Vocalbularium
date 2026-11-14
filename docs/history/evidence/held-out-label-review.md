# Held-out label review

11 November 2026. An independent check of the [held-out sets](../../../tests/golden/held-out/README.md), done for a draft plan that would have tested Jev on them (M4). The owner later dropped the classifier, and the plan became [split facets](../../plans/split-facets.md), so no M4 runs; the reviewed sets stay for later use.

## What was done

| Set | Check | Independent of the author? |
| --- | --- | --- |
| `classification.json`, 247 items | A fresh Claude agent labelled every key blind: it saw only the key and its Context, never the labels, and used the Phase 0 definitions (`word_phrase` \| `sentence`, ISO 639-1 codes). The two label sets were then compared item by item | The same model, but with no sight of the first labels. It catches oversights; it cannot catch a blind spot both share |
| `lookup-german.json`, 115 headwords | Each label compared with the inflection table of its German Wiktionary entry (fetched 11 November 2026) | A separate source. 24 inflected keys were checked by hand only |

Nothing was sent to Jev. No model was asked to classify for M4.

## Classification: results

191 of 247 items agreed in full. Of the 56 that did not, most differences were acceptable answers missing from one side, not wrong answers.

| Field | Items that differed | Note |
| --- | --- | --- |
| `kind` | 12, and 4 more in order only | Mostly the boundary cases below |
| `language` | 24, and 1 in order only | Mostly a second language the first labels missed |
| `pos` | 15 | Not scored in M4: the core decides `gramRole` |
| `lemma` | 7 | Normalised spellings (*recieve*, *Strasse*) that the blind labels did not count as inflected; no change |

### Applied

Every change is dated in the item's `why`, as the set's rules require.

- **`word` renamed `word_phrase`** throughout, to match the Phase 0 definition.
- **Languages added** where the same spelling is a common word: *كتاب* (Persian, Urdu), *under* (Swedish, Danish, Norwegian), *lief* (Dutch), *книги* (Ukrainian, Bulgarian), *говорил* (Bulgarian), *Gift* (Swedish, Danish, Norwegian), *Hand*, *die*, *Brief*, *café* (Dutch), *sale* (Spanish), *Björk* (Swedish), *infor-mation* (French), *Stop!* (French, Dutch), *c'est la vie* (English).
- **One correction:** *angel* was labelled Spanish, but Spanish spells it *ángel*. It is now English or Dutch.
- **Second `kind` answers added** where both readings hold: *Wie geht's* and *c'est la vie* also as `word_phrase`.
- **Parts of speech added** for keys without a Context: *学习*, *因为*, *lief*, *Gift*, *gift*, *Hand*, *Tag*, *fast*, *hell*, *pain*, *sale*.

### Rules settled by the owner

The owner then kept `language` out of the classifier: a key can belong to several languages or to none, more often without a Context. M4 scores `kind` only, and the `language` labels stay in the set unscored, so the rules for keys in no language and for names are no longer needed.

| Rule | Owner's decision | Applied to |
| --- | --- | --- |
| A verbless set phrase | `word_phrase` only | *Danke!*, *Hilfe!*, *Yes.*, *Guten Morgen*, *早上好*, *加油*, *(siehe unten)*, *ありがとうございます* |
| A bare verb form that stands as a whole utterance | `word_phrase` only | *Stop!*, *llueve*, *食べました*, *走了*, *不知道* |
| A title | Both, `word_phrase` first | *Im Westen nichts Neues* (already so) |

Still accepting both, and verbless, so the first rule may reach them too: *No smoking*, *Betreten verboten*, *What a day!*, *Why not?*, *¿Qué tal?* and *Rain expected tomorrow*.

## German lookup: results

107 of 115 headwords match German Wiktionary on article, genitive, plural, the three verb forms, the auxiliary, or comparison. The rest:

| Key | Label | Wiktionary | Reading |
| --- | --- | --- | --- |
| *sich erinnern*, *sich beeilen*, *sich anziehen* | forms with *sich* | the same forms without *sich* | Only a difference in format |
| *Beamte*, *Angestellte* | `der` (*Angestellte* also `die`) | its entry under this spelling is the feminine; the masculine is listed as *Beamter*, *Angestellter* | A lookup by the key lands on the feminine. The labels are right, but the M5 design has to handle this |
| *Deutsche* | `der` or `die`, a person | also *das Deutsche*, the language, with no plural | A second reading the label misses |
| *Milch* | no plural | *Milche*, *Milchen* (technical) | Rare plurals |
| *bekommen* | auxiliary `haben` | `haben` or `sein` | `sein` is for a second sense, *Das Essen ist mir gut bekommen* |

Wiktionary also lists rarer variants that the labels leave out: *Herzes*, *Herren* as a genitive of *Herr*, *Mannen*, the plural *Mädchens*, *Bande*, *dünkler*, and separate nouns under *Tag* and *Mutter*.

**No change was made to `lookup-german.json`.** M5 is deferred until you design the lookup. Correcting these labels from Wiktionary would also make a later Wiktionary-based M5 look better than it is, because the test labels would partly come from the source being tested. What a lookup should do with second readings and rare variants is part of that design.

The 24 inflected keys (*Häusern*, *rief an*, *am besten*, …) were checked by hand, and every headword is right.

## Limits

- The classification check is two passes by the same model family. Neither pass has been checked by a native speaker.
- The Wiktionary check covers the forms in the tables, not the classes the items are filed under.
- The comparisons are in the session's scratchpad and are not kept in the repository.
