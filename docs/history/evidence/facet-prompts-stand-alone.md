# Facet prompts that stand alone: rerun of M2's arm C

Run 11 November 2026, following the [plan](../../plans/facet-prompts-stand-alone.md), after [M2](m2-core-then-parallel.md).

## Summary

| | German | Chinese | English (US) |
| --- | --- | --- | --- |
| Time, part 1 median, against today on the same day | −30 % ✓ | −42 % ✓ | −46 % ✓ |
| Cost per card | +1 % ✓ | −1 % ✓ | −23 % ✓ |
| Judge: pass / weak / fail, today | 30 / 14 / 10 | 41 / 8 / 5 | 44 / 3 / 7 |
| Judge: pass / weak / fail, C before the fix (M2) | 30 / 14 / 8 (+2 errors) | 40 / 7 / 7 | 34 / 11 / 9 |
| Judge: pass / weak / fail, C with the fix | 31 / 13 / 10 ✓ | 36 / 10 / 8 ✗ | 42 / 5 / 7 ≈ |
| Paired with today: better / same / worse | 12 / 30 / 12 | 11 / 27 / 16 | 8 / 37 / 9 |

- **German is fixed.** Declension is missing on 1 card, as today (8 before the fix); Article on 2, against 1 today. No grammar facet describes the key any more. The judge's counts match today's.
- **English (US) is close to today on the judge**, and much better than before the fix (12 cards better, 3 worse, paired with M2's C). But it gets there partly by writing less: **Etymology for a non-English key dropped from 14 cards today to 3**. The restraint sentence made the model leave out etymologies it should write, such as *wanderlust* for *Fernweh* or *happiness* for *幸福*. Antonyms are still written on 18 cards, against 8 today. Synonyms came down from 35 to 29, against 26 today.
- **Chinese is lower than today on the counts** (36 pass against 41). Paired with M2's C, which had no fix, the new C is 14 better and 16 worse, which is about what a second sample of the same request gives. The new failures are wording faults in Simple Translation and Examples, not facets left out or written for the wrong word. I can't tell from one sample whether the restraint sentence played a part.
- **Time and cost still meet the bar in all three modules.**

**By the plan's criteria:** German passes. English (US) fails on the facet counts: Antonyms are still written about twice as often, and Etymology is now left out where it should be written. Chinese fails on the judge's counts, most likely by chance.

## What I recommend

**Owner, 11 November 2026: the restraint sentence is removed; `facets.prompt.md` stays.** Only the German facet-Retry snapshots now differ from before the plan. The cards above were written with the sentence in place, so the rerun does not measure the change as it now stands.

1. **Keep `facets.prompt.md`.** It fixed what it was meant to fix, and today's full request is unchanged.
2. **Take the restraint sentence out again, or reword it.** It didn't bring the English antonyms down, and its "you are sure of it" made English drop most Etymology for foreign keys. Chinese may have lost a little too. Without it, M2 showed Chinese holding.
3. For the extra antonyms and synonyms, try the plan's next step: tell each facet request which other facets the card has, so the model sees it is one part of a card. Or tighten the Antonyms prompt for English on its own.

## What was run

| | |
| --- | --- |
| Change | The [plan](../../plans/facet-prompts-stand-alone.md) as approved: a new `facets/core/facets.prompt.md` for German, holding the grammar-word sentences, added to every request that writes a facet; the restraint sentence in the `retry.prompt.md` of the four Languages modules |
| Part 1 | The 12 timing inputs of M2, through German, Chinese and English (US), arms A and C, one card at a time |
| Part 2 | The other 42 inputs, arm C only, 4 cards at a time. Today's request didn't change, so M2's A cards are the comparison |
| Model, judge | As in M2. English (US) is still not calibrated (owner) |
| Mocked | Nothing. Run from `.data/m2/run.mjs`, not committed, without the database, the API or the extension |
| Judge timeouts | 6 cards timed out at the judge and were judged again with `.data/m2/judge-rest.mjs` |
| Kept | `.data/m2/rerun-2026-11-11/` (this run) and `.data/m2/rerun-combined/` (this run with M2's part-2 A cards, and M2's C as arm "B"), with `analysis.json` and `review.md` |

## Details

**Facets written, cards without a failure**

| | Cards | Synonyms | Antonyms | Etymology | Declension | Article |
| --- | --- | --- | --- | --- | --- | --- |
| German, today | 48 | 23 | 12 | 32 | 25 | 21 |
| German, C before | 52 | 35 | 16 | 35 | 21 | 23 |
| German, C after | 50 | 31 | 15 | 33 | 26 | 22 |
| English, today | 51 | 26 | 8 | 30 | | |
| English, C before | 53 | 35 | 20 | 30 | | |
| English, C after | 53 | 29 | 18 | 19 | | |

English Etymology, by the selection's language: today 16 English and 14 foreign; C after, 16 English and 3 foreign.

**The judge's `facets` criterion**, fail and weak:
- German: today none; C before 5 and 4; C after 3 and 2. The three failures are *COVID-19*'s article (*das*, not *die*), *John Cena* declined with an article, and *Junge* missing the neuter *das Junge*. None describes the key.
- English (US): today 2 and 2; C before 8 and 5; C after 5 and 5. Two of the failures are Pronunciation giving the American form of a British selection (*Do you have a pen?*), which today's request did too on one of them. The other three are wrong Grammar Teacher claims. None is an antonym.

**Failures:** German C had 4 cards with an invalid Etymology (3 before the fix); English C one invalid core. Today had 6 failures in German and 3 in English, mostly the output limit.

**Flags:** *一举两得* (German, C) gained `gramRole: verb`; *refrigerator* (Chinese) again lost `contextual`, as in M2.

## Limits

- One sample. The Chinese difference is within what two samples of the same request show.
- English (US) has no calibrated judge.
- Time compares part 1 only (12 inputs per module).

## Follow-up: what reduces the extra antonyms

The owner removed the restraint sentence and asked what else to try. On 11 November 2026 I resent only the Synonyms and Antonyms requests of the rerun's split cards, with each card's core as written, the requests at `low`, in four variants:

- **base:** today's facet-only request, without the restraint sentence.
- **siblings:** the same, plus a line naming the card's other facets and saying they are written in other requests.
- **pair:** Synonyms and Antonyms in one request.
- **strict:** base, plus one sentence on what an antonym is, with examples that are not in the golden set.

That makes 85 word cards: 42 English (US) and 43 German. The script is `.data/m2/antonyms.mjs` and the results are in `.data/m2/antonyms-2026-11-11/`.

| Cards with the facet | Today | base | siblings | pair | strict |
| --- | --- | --- | --- | --- | --- |
| English, Antonyms | 8 | 20 | 21 | **14** | 20 |
| English, Synonyms | 26 | 36 | 36 | 37 | 36 |
| German, Antonyms | 12 | 17 | 19 | 19 | 18 |
| German, Synonyms | 23 | 39 | 39 | 39 | 39 |

- **Naming the other facets and the stricter definition change nothing.** Both write about as many antonyms as base, and the same wrong ones: *adult* for *tot* and *bleach* for *color* in both. The strict variant even added *despite* for *wegen*.
- **The pair helps in English only.** Its six fewer antonyms are mostly the wrong ones: *adult* (*tot*), *reasoned* (*gut*), *colorlessness* (*colour*, *color*), *graceful person* (*Tollpatsch*). It made no difference in German or to Synonyms.
- **Not every extra antonym is wrong.** Of base's English extras, these are dictionary opposites that today's request leaves out:
  - *wasteful* for *经济*;
  - *lie down* for *get up*;
  - *homesickness* for *Fernweh*, which the German module gives as *Heimweh* today.

  So today's count of 8 understates the right number. Matching today's count is the wrong target; the target is no wrong antonyms.
- **On a card of only the core and these two facets, the judge lets most wrong antonyms pass,** including *adult* for *tot*. It failed only *stehen* for *gehen*, *walk* for *run* and *despite* for *wegen*. Its verdicts don't separate the variants, so the counts above and my own reading of the lists are the evidence.

**What I recommend:** write Synonyms and Antonyms in one request in the split. That is a grouping in the split's plan, not a prompt change, and today's request doesn't change. Leave the extra synonyms alone. They're written as often in every variant, and the judge finds few of them wrong, only weak.
