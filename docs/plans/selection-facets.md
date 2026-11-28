# Plan: language facets describe the selection

Copied from the session brief on 2026-11-27; this is the plan the [decision](../decisions/d374-selection-facets.md) applies.

Draft, 2026-11-27, for a new session. Owner's decisions in conversation (2026-11-27); not yet a decision record. Applies to all three language modules: German, English and Chinese.

## The decision

A language module's card describes **the word the user selected**, written in the module's language. German is the example below; English and Chinese follow the same rule (owner, 2026-11-27). Today, when the selection is not German, most facets describe a German translation instead (the "grammar word": Kühlschrank for "fridge", Sprache for язык). That serves almost nobody:

- **Learners of German** select German words, so the selection already is the German word. Nothing changes for them.
- **People who already know German** select foreign words. They want "fridge" or 经济 explained, not Kühlschrank's plural.

So the "grammar word" goes. Each facet is about the selection, or is left out when it cannot be.

## What each facet does after the change

| Facet | German selection | Foreign selection |
| --- | --- | --- |
| core: meanings, contextual | as now | as now (already explain the selection in German) |
| simple translation | as now | as now |
| examples | as now | as now (sentences in the selection's language, German translation) |
| etymology | the selection's, from the German Wiktionary | the selection's, from its own language's entry in the English Wiktionary, written in German |
| synonyms, antonyms | German, as now | in the selection's language ("icebox" for "fridge") (owner, 2026-11-27) |
| article, declension, conjugation, comparison, case | as now | left out |
| grammar tip | as now (already German only) | left out, as now |
| pronunciation | **removed** from every language module | **removed** |

**Pronunciation leaves the language modules** (owner, 2026-11-27): the Sound module's Pronunciation already speaks the selection, so the language modules' own Pronunciation facet goes, in German, English and Chinese.

`gramRole` then describes the selection's part of speech, for any language.

## Why this also fixes step 3b

The word to look up is always the selection, known before generation. No core step naming a German word, no guessing it from the meaning (which gave Gesamtheit for Wirtschaft), no second request. Step 3b's "one request or two" flow goes away.

## Steps

1. **Decision record.** `docs/decisions/d374-selection-facets.md`: the decision, the two users, the table above, what it replaces. It supersedes the grammar-word rule in D17/D35 where they state it (check both, and `docs/decisions/d29.md`, `d20-module-pages.md`). Open the GitHub issue and rename the file to `d<issue>-selection-facets.md`.
2. **Plans.** The v0.17.0 master plan's "How the pillars fit together" (one card, step by step; one request or two), and step 3b: the lookup key is the selection, the source is the Wiktionary of its language, OpenThesaurus covers only German selections, and the prototype's bar becomes "the facet says what the entry says" (owner's other decision of 2026-11-27: etymology is written from a Wiktionary entry and not judged for truth, only for agreeing with the entry; no entry means no etymology).
3. **Catalog, German module first, then English and Chinese** (`packages/domain/src/catalog/languages/german/`):
   - `facets/core/facets.prompt.md` and `core/facet.ts`: remove the grammar word; `gramRole` is the selection's part of speech.
   - `etymology`, `synonyms`, `antonyms`: prompts describe the selection; drop the "is German" checks in their `facet.ts` for foreign selections (keep "the explanation is German").
   - `article`, `declension`, `conjugation`, `comparison`, `case`: only when the selection is German (`language` is Deutsch), as `grammar-teacher` already does. Decide whether that rule lives in the prompt only, or also in facet selection so the facet is never requested.
   - `pronunciation`: removed from `languages/german`, `languages/english` and `languages/chinese` (folder, `catalog/index.ts` entry or the module's facet list, golden-set failure points, samples, about texts). The Sound module (`catalog/sound/pronunciation`) stays. Check what speaks a language facet today (`domain/spoken.ts`, `src/server/audio.mjs`, D24/D28/D29/D30 and their tests, among them the browser test "a German card's Pronunciation facet speaks each line beside its own player") and remove or rewrite each.
   - Samples (`samples/*.json`, `sample-key.json`) and `about*.json` texts that describe the grammar word, in every interface language.
   - `rubric.md`: the criteria follow the table; the missing-etymology rule becomes "no etymology is right when the source has none".
4. **Prompt snapshots:** `UPDATE_PROMPTS=1` for `tests/prompts.test.mjs`, after reading the diff.
5. **Golden and calibration sets.** Cards with a foreign key (the `r-*` cards such as r-refrigerator, r-good, r-ba, r-get-up, real-jingji, real-kafei, and others: list them by `language` not Deutsch) were labelled under the old rule. Their etymology, synonym, antonym and grammar labels are regraded or dropped; the golden set's closed-facet references for foreign keys go. Keep the dev / held-out split as it is. Record which cards changed, since step 3's numbers were measured on the old labels.
6. **Docs:** [module catalog](../subsystems/module-catalog.md), the German module page, [generation](../subsystems/generation.md) if it names the grammar word, and the card screen reference if a facet's label changes ("Herkunft von fridge").
7. **Card screen.** A foreign card now shows no grammar facets; check `npm run screens -- --base main` and label the PR `screens-changed` if screens change.
8. **Check:** `npm run check`, the catalog, prompt, content-check and localisation tests, then `npm run gate -- german` on a sample of German and foreign keys.

## Owner answers (2026-11-27)

1. **Pronunciation** leaves the language modules; the Sound module is enough.
2. **Synonyms and antonyms for a foreign selection** are in the selection's own language.
3. **English and Chinese** get the same change. Each module's catalog folder repeats step 3; their golden and calibration sets, where they exist, repeat step 5.
4. **Existing cards stay as they are.** No migration and no regeneration offer. Stored cards keep their old facets, Pronunciation and grammar-word facets included, so the card screen must still render a stored facet the catalog no longer has; check how it does today and add a test for it (`tests/upgrade.test.mjs` or the facets tests).

## Order

German first, through step 8. Then English, then Chinese, one PR each, so each module's gate run is read on its own. The decision record and plans (steps 1 and 2) go in the first PR.

## Out of scope

The Wiktionary lookup in generation itself (step 3b and step 7 of v0.17.0); this change only makes the lookup key the selection.
