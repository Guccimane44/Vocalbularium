# Plan: facet prompts that stand alone

Drafted 11 November 2026 for the owner's review. Status: **approved by the owner, 11 November 2026, as drafted** (a new `facets.prompt.md`; the restraint sentence in all four Languages modules). **Implemented and rerun the same day: [results](../history/evidence/facet-prompts-stand-alone.md).** German is fixed; the restraint sentence overcorrected English Etymology and did not reduce English Antonyms, so **the owner had it removed again (11 November 2026)**. Only Change 1 remains. Follows [M2](../history/evidence/m2-core-then-parallel.md), Phase 1 of the [split facets plan](split-facets.md), for the Languages modules.

## Problem

In M2, a facet written in its own request was worse than the same facet written in today's single request, in German and English (US). Chinese held. Two causes stand out.

**1. German grammar facets lose their subject.** Article, Declension, Conjugation and Comparison describe "the grammar word". Only the core's prompt defines it, in its last two sentences:

> The grammar word is one German word: the selection itself when it is German, otherwise the German word for its first meaning, "contextual" first. Only "gramRole" and the grammar facets describe the grammar word; …

A facet request carries the facet's prompt and `retry.prompt.md`, not the core's prompt. For a foreign key, the model then either describes the key (*la sobremesa*, *beautiful, more beautiful*, *ich run*, *das Komorebi*) or returns no facet. Declension was missing on 13 of 54 split cards, against 1 today.

**2. A facet asked for alone is written more readily.** Today's single request in English (US) wrote Antonyms on 7 cards and Synonyms on 26. The split wrote them on 18–20 and 34–35, and the extra lists are where the judge found loose synonyms and antonyms that aren't opposites (*walk* for *run*, *despite* for *because of*). Grammar Teacher made more wrong claims. German shows the same with Synonyms (25 cards today, 35–39 split). Each facet prompt already says to leave the facet out when it doesn't apply, and to give only what a dictionary lists. Asked for on its own, the model seems to treat the request as one it must answer.

**Today's facet Retry sends exactly the same request** (`composeModule` with `core`). So both causes most likely affect it today, whether or not the split goes ahead.

## Change

### 1. What the facets need from the core, in one file

A new optional prompt file per module: `facets/core/facets.prompt.md`. It holds what the core's prompt says that the facets rely on. The composer adds it:
- after the core's prompt, in today's single request and in the core-only request, and
- after `retry.prompt.md`, in a facet-only request (the split's facet requests and a facet's own Retry).

For **German**, it holds the two grammar-word sentences, moved out of the end of `core.prompt.md`. Because they already end that file, and the composer joins the two files with a space, today's single request keeps exactly the same text, and its prompt snapshot (`tests/prompts/german.txt`) doesn't change. Only the facet-only snapshots (`german.retry-*.txt`) gain the two sentences.

For **Chinese and English**, no sentence of the core's prompt is relied on by a facet: their Etymology prompts say which word they describe on their own. They get no file.

A catalog test checks that a module's `facets.prompt.md`, when it has one, appears in both kinds of request.

### 2. The same restraint when a facet is asked for alone

Add one sentence to each Languages module's `retry.prompt.md`, which only facet-only requests carry:

> Leaving the facet out is a complete answer: write it only when it applies and you are sure of it, as you would on a card with all its facets.

This changes the facet-only snapshots of all four Languages modules, and no full request.

**Not changed:** any facet's own prompt, the core's prompt as it reads in a full request, the shapes, the rules, Expertise and Mathematics.

## Test

Offline:
- `tests/prompts.test.mjs`: only the `*.retry-*.txt` snapshots of the four Languages modules change (`UPDATE_PROMPTS=1`); every full and core-only snapshot is unchanged.
- `tests/catalog.test.mjs`: the new test above.

Live, as a rerun of M2's arm C (facets at `low`) on the same inputs, through the same runner (`.data/m2/run.mjs`):

| Part | What | Why |
| --- | --- | --- |
| 1 | The 12 timing inputs through German, Chinese and English (US), A and C, one card at a time | Time again, with today's request alongside on the same day; also settles M2's German and Chinese time, which were close to the bar |
| 2 | The other 42 inputs, C only, 4 cards at a time | Quality. Today's single request doesn't change, so M2's A cards stand as the comparison |
| Judge | The new C cards, and part 1's new A cards | As in M2 |

About 1¼ hours in all, and about $3.

What counts:
- **German:** grammar facets missing at about today's rate (Declension 1, Article 1), and no `facets` fail for a grammar facet that describes the key.
- **English (US) and German:** Synonyms and Antonyms written on about as many cards as today, and the `facets` criterion failing no more often than today's.
- **All three modules:** the judge's pass, weak and fail counts at least as good as A's, as the [split plan's bar](split-facets.md#goal) asks. Time and cost as in M2.

**Today's facet Retry** gets the same change, so it should improve too. The rerun measures it indirectly: a split facet request is a facet's Retry request, sent with the first core. No separate run is planned.

## Limits

- **English (US) has no calibrated judge** (owner, for M2). Its result rests on the judge's uncalibrated verdicts, the counts of facets written, and the review file.
- **One sample** again. A small change in the counts is noise; the German grammar facets and the English antonyms are large enough to see.
- **The restraint sentence may overcorrect** and leave out facets that should be written. The counts of facets written, against today's, show that either way.
- **If the sentence doesn't help,** the next step is to give each facet request the other facets' names, so the model sees it is one part of a card. That is a bigger change and is not in this plan.

## Questions for you

1. Is a new file, `facets.prompt.md`, the right home for what the facets need from the core, or would you rather keep the German sentences in `core.prompt.md` and repeat them in `retry.prompt.md`?
2. Should the restraint sentence go only into English (US) and German, where M2 saw the problem, or into all four Languages modules?
