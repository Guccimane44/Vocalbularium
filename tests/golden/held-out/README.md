# Held-out evaluation sets

Draft for the owner's review, 10 November 2026. Nothing here is decided, and no script reads these files yet.

The golden sets in the folder above guard prompt changes: each input is a case a prompt once got wrong, and the prompts were tuned on them. These sets answer a different question: **how often is a decision about a key right, on keys nobody tuned for?** They hold labels only, so they run without generating a card.

| File | Decides | Items |
| --- | --- | --- |
| `classification.json` | word or sentence, the key's language, a word's own part of speech | 247 |
| `lookup-german.json` | a German word's headword, part of speech and the forms that fix its table | 139 |

## Rules

1. **Held out.** No item is used as an example in a prompt or in a question to a classifier, and none is copied into a golden set. A key that also appears in a golden set is here only with a different Context or for a different decision. Three keys are shared without a Context, *Chef*, *tot* and *gut*: the golden sets state no language for them, and this set does.
2. **Labelled before any model is run.** A label states what is right, not what a model answers. A label is changed only for a reason written in the item's `why`, never because a model disagreed.
3. **Every acceptable answer is listed, the likeliest first.** *Chef* without a Context is German, French or English, and any of them is right. A decision is scored correct when it is in the list; a second score counts only the first answer.
4. **Strata are reported apart.** A total over all items hides what matters: easy headwords would outweigh the hard cases.
5. **Changes are additions.** An item is corrected or added, with the date; items are not removed to make a result better.

## Classification strata

| Stratum | Items | What it tests |
| --- | --- | --- |
| `headword` | 30 | Clear dictionary words in eleven languages: the floor every method should reach |
| `inflected` | 33 | Forms as a reader meets them (*lief*, *Häuser*, *went*), each with its headword |
| `boundary` | 45 | Word or sentence: fragments, headlines, signs, titles, one-word imperatives, clauses, sentences without punctuation |
| `homograph` | 38 | A spelling several languages share, without a Context: any listed language is right |
| `homograph-context` | 28 | The same spellings with a Context that decides |
| `name-number-code` | 23 | Names, numbers, formulas, addresses: keys in no language, or in a language only by origin |
| `noise` | 24 | What a capture adds: punctuation, quotation marks, capitals, an article, a misspelling, a line-break hyphen |
| `pos-context` | 26 | A word whose part of speech only its Context decides |

The part of speech is the key's own, in its own language. It is not today's `gramRole`, which describes the German word for the first meaning.

## German lookup classes

Nouns (52), verbs (43) and adjectives (20) by inflection class, each with the forms that decide its table, and 24 inflected keys that must first be traced to their headword. Three nouns and one verb are several words under one spelling (*See*, *Band*, *Leiter*, *übersetzen*): a lookup must tell them apart from the Context or fall back.

## Known limits of this draft

- **The labels are one author's.** Claude wrote them; the owner has not reviewed them. The German forms were written from memory and need a check against a reference grammar before they count as truth.
- **No real captures.** Every item is constructed. Keys and Contexts from real decks would show how often each stratum occurs in use, which these sets cannot.
- **Sizes support comparisons, not fine thresholds.** With 30 items in a stratum, one miss is about 3 %.
- **English and German carry most of it.** Other languages have a few items each, enough to notice a failure, not to measure one.
