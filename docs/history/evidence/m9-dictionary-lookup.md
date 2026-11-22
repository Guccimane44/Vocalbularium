# M9: a dictionary the model can look up, against today's request

Run on 22 November 2026 with `claude-haiku-5-5`. The owner asked whether the dictionary approach still pays now that Haiku replaced DeepSeek ([D36](../../decisions/d36.md)). Unlike [M4](../plans/m4-dictionary-reading.md), now dropped, the dictionary is not pasted into every request. The model gets a `lookup` tool and decides when a part is worth looking up. The core and facet split is out of scope.

## Verdict

**Keep today's approach.** On these keys the lookup tool made German cards worse, about 1.6 to 1.9 times as costly, and about 1.8 times as slow. It made English cards neither better nor worse, because the model rarely used it there.

One part did gain. Etymologies written after a lookup were more specific and better dated. That gain is narrow, so it is worth a separate trial only if etymology quality becomes a priority.

## What was run

- **Keys.** A test set of 26 keys built for this run (`.data/m9/set.json`), chosen where memory is most likely to fail. It covers words with two genders (*Gehalt*, *Junge*), a word with three entries (*Band*), verbs with old irregular forms (*backen*, *melken*), a separable and a reflexive verb, irregular comparison (*gut*, *dunkel*), English keys with tricky etymologies (*nice*, *quixotic*, *serendipity*), irregular plurals (*criterion*, *mouse*), and one sentence per module as a control. The golden set was too large for the two-hour limit.
- **Modules.** German, 14 keys, and English, 12 keys. Chinese was left out, as in M4.
- **Arms.** Two samples per key and arm, 132 cards in all.
  - **A.** Today's request, one call per card, unchanged.
  - **B.** The same request with a `lookup` tool and one paragraph telling the model to look up a word when a part depends on facts that are easy to misremember, and to take only what fits. German reads the German Wiktionary, English the English Wiktionary. A lookup returns the word's entries as plain lines (senses, synonyms and antonyms by sense, etymology, forms), at most four entries of 2,000 characters each. Up to five rounds of calls.
  - **C.** Arm B with one round of lookups. A later call is answered "No more lookups". German only. It was added after arm B looped.
- **Measured.** Cost from the service's own `list_cost`, wall time, output tokens, lookups, invalid replies, the content checks, the Haiku judge against each module's `rubric.md`, and how many synonyms, antonyms and forms the entry supports.
- **Cost of the run.** $0.23 of generation plus the judge, and about 40 minutes.

## Results

Medians over valid cards. Judge verdicts count cards that came back valid.

| Module | Arm | Valid cards | Median time | Median cost | Cards with a lookup | Judge: pass / weak / fail |
| --- | --- | --- | --- | --- | --- | --- |
| German | A | 26 of 28 | 11.1 s | 1,402 µ$ | 0 | 15 / 9 / 2 |
| German | B | 22 of 28 | 19.0 s | 2,657 µ$ | 26 | 6 / 9 / 6 |
| German | C | 21 of 28 | 20.4 s | 2,274 µ$ | 25 | 7 / 9 / 4 |
| English | A | 23 of 24 | 6.9 s | 865 µ$ | 0 | 13 / 9 / 1 |
| English | B | 23 of 24 | 6.6 s | 961 µ$ | 6 | 13 / 4 / 5 |

The noise between two samples of the same key in arm A was a median 34 % of cost for German and 41 % for English. German's gap of 60 % to 90 % is larger than that. English's 11 % is not.

The judge is Haiku, which D36 records as not calibrated for German or English. Every failing card's reason was read by hand, and the findings below rest on those reasons, not on the totals.

## Gains

- **Etymology.** After a lookup, the etymology names sourced stages and dates. *Gehalt* gains "Besoldung kommt im 18. Jahrhundert auf". *dunkel* gains althochdeutsch *tunkal* and its first sense, misty. Arm A left *dunkel*'s etymology empty once and dated *Schadenfreude* to the 19th century. The judge gave arm A three weak etymologies and arm B none. It also called two correct Wiktionary facts "doubtful" in arm C, so it undercounts this gain.
- **Synonyms and antonyms the dictionary lists.** The share found in the entry rose from 5 of 27 synonyms to 28 of 44 (German), and from 5 of 10 antonyms to 23 of 25. This is a gain only if "the dictionary lists it" is the rule. The losses show it is not.

## Losses

- **Loose antonyms and synonyms copied in.** Wiktionary's lists include contrasting and related words, and the model takes them. Examples are *Lohn* as the opposite of *Gehalt*, *sich fürchten* and *sich sorgen* as opposites of *sich freuen*, *pastell* as an opposite of *dunkel*, and *braten* as a synonym of *backen*. The prompt already forbids these. The entry overrides it. This is the same failure the [Wiktionary experiment](wiktionary-english-experiment.md) found.
- **Entries with several meanings mixed up.** *Band* has three entries (das, der, die). After the lookup, cards mixed their genders and senses, or dropped the original sense. *Junge* in a context about a cat's young gained *Bub* and *Knabe*, synonyms of the boy. *gut* gained a sense as a school grade that it does not have.
- **More invalid replies.** German valid cards fell from 26 of 28 to 22 (B) and 21 (C). After a tool turn the model drifts from the format. It wraps the JSON in code fences, writes `"kind": "phrase"`, or leaves `meanings` or `origins` empty. The product's parser rightly rejects these, so each one is a failed card and a Retry.
- **Loops.** In arm B, four German cards ran out of rounds by looking up the same word again (*Gehalt* five times, *Ufer* three). Arm C's cap stopped the loops but not the invalid replies. Switching tools off with `tool_choice: "none"` made the service return empty replies, so a hard cap needs another route.
- **Cost and time.** German cost rose 60 % to 90 %, and time rose by about 9 seconds. The limiter is output, not the entry's input tokens. Arm B's German cards wrote 4,233 output tokens on average against 2,434. Between 36 % and 43 % of that came in the turns before the lookup, where the model writes a draft and then writes the card again. The entry itself cost little because the long prompt was read from the cache in the second turn.
- **No gain on forms.** On these keys arm A wrote no wrong declension, conjugation, article or comparison. That includes *buk*, *molk* and *gemolken*, *besser*, and both genders of *Gehalt*. Haiku already knows these forms. The forms that did not match the entry were all formatting (*keine guten*, *backte oder buk*), except one invisible character arm B put inside *stand‍st auf*.
- **English barely used it.** The model looked up 6 of 24 English keys. English's extra fails were etymologies whose origins ran newest first. That error appeared in both arms and on cards with no lookup, so it is noise, not an effect of the tool.

## What would change the verdict

None of these were tested:

- **Etymology only.** A lookup offered for the etymology facet alone would keep the one gain and avoid the antonym and sense mix-ups. It still has to fix the drift in format and the draft written before the lookup.
- **Look up first.** An instruction to call `lookup` before writing anything should remove most of the extra output. It would not touch the quality losses.
- **The German tables from code** (M4's arm T). These fill forms without a model call. Under DeepSeek they were about 15 % of a German card's cost. With Haiku the forms were already right, so the gain would be cost only, and it is unmeasured.

## The flag design, revisited

Step 2 of the [catalog cleanup plan](../../plans/catalog-cleanup-and-flag-design.md) was written to give a classifier defined flags. The classifier and the core and facet split are both dropped, so that reason is gone. What remains matters for the language expansion:

- **`language` as an ISO 639-1 code.** German's and Chinese Grammar teacher decide whether a key is in their language by matching the core's free-text language name against a hard-coded list (`GERMAN_NAMES`, `CHINESE_NAMES`). Every new language would add another list, and a name the model writes differently turns the facet off. A code removes that. It changes the prompts, so it needs a golden-set run, and it changes stored headers, so it needs a migration or a reader that accepts both.
- **Part B, flags declared in the catalog.** Built after this run in [#346](https://github.com/Guccimane44/Vocalbularium/pull/346). Each core declares its flags, and a catalog test fails when a facet's `when` reads anything else, so a new language module fails a test instead of drifting.
- **The other questions can wait.** Whether `kind` is one answer per page, the closed list for `gramRole`, and the held-out labels mattered for a classifier. They can be settled when a module needs them.

## Data

Everything is in `.data/m9/` and not committed. It holds the set (`set.json`), the lookup (`dict.mjs` over the German Wiktionary extract from the M4 coverage check, and kaikki.org's English per-word files), the runner (`run.mjs`), every card with its turns and lookups (`results.jsonl`), the judge's verdicts (`judged.jsonl`), and the analysis (`analyse.mjs`).

## Limits

- 26 keys and two samples. The quality findings rest on specific failures read by hand, not on a significant difference in totals.
- The judge is uncalibrated for both modules.
- Only one tool design was tried: one tool, plain-line entries, and the model choosing when to look up.
- The German Wiktionary extract is from 12 November 2026, and English entries were fetched on the day.
