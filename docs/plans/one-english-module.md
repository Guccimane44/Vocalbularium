# Plan: one English module

Drafted 12 November 2026 for the owner's review; revised the same day after the owner's answer on varieties. Status: **approved by the owner, 12 November 2026, as recommended**: existing English decks and pages are renamed in place; it ships as its own small release before the split's decision.

The owner, 12 November 2026:
- "We don't need British and American English in two modules. We should just have one module: English."
- On varieties: "Don't classify British and American English. We take what the model has generated. As long as it is proper English, we don't complain."

This plan replaces `english-british` and `english-american` (both added in 0.16.4) with one module, `english`, that has no variety rule at all.

## Why

- **The split's main English failure comes from the variety rule.** In [M3](../history/evidence/m3-cost-per-facet.md), Pronunciation written in its own request turned an English selection into the module's variety: *colour* into *color*, *The team are playing* into *The team is playing*. The module's rule, "write American English … never the British one", won over the facet's own "the selection itself, exactly as selected". Without a variety rule, nothing pulls the key away from what was selected.
- **Two modules double every English cost:**
  - 14 facet folders;
  - two rubrics and two calibration sets;
  - two sets of samples and about pages in six languages;
  - two gates, two voices.

  Only one of them was measured in M2 and M3.
- **The two modules differ only in their variety.** The difference is the variety rule in `module.prompt.md`, the spelling lists in `english.ts` and the checks built on them, and the variety words in prompts, samples and about pages.

**This changes a rule in the specs.** [`docs/specs/modules.md`](../specs/modules.md#catalog) says variety comes from more parent types, such as a German and a Spanish translation. For languages that stays true. Varieties of one language are not told apart at all. This needs a decision record of its own, D31.

## The module

| | |
| --- | --- |
| ID, label | `english`, **English** |
| Names | *Englisch*, *英语*, *anglais*, *inglés*, *английский*, *الإنجليزية* (one `names.<language>.json` each, as today) |
| Facets, in order | Examples, Synonyms, Antonyms, Pronunciation, Etymology, Simple translation, Grammar teacher: the same seven as today |
| Built from | `english-american`, the one M2 and M3 measured, with every variety sentence removed |
| Default deck | Not in it, as today |

### What it says about English

- **No variety rule.** The prompts say "English", never "American English" or "British English", and name no spellings or words of either. Whatever proper English the model writes is accepted, British, American or a mix.
- **The key is taken as selected, because it is the key, not because of its variety.** Pronunciation speaks an English key exactly as selected, as its prompt already says. An English example has no translation. *colour* is spoken as *colour*, and *The team are playing* as written.
- **The core doesn't comment on variety.** Today's core prompts ask the model to say when a key is the British or American spelling. That sentence goes. An English key is explained as an English dictionary would explain it.

### Checks

- **Stay:**
  - `english-key-spoken`: Pronunciation speaks an English key as selected.
  - `english-key-untranslated`: an English example has no translation.

  Both are about the key, not about variety.
- **Go:** `american-spelling` and `british-spelling` in every facet, and the spelling lists in `english.ts` that they use. No check replaces them.
- **Kept:** Grammar teacher applies when the key is English, as today. `ENGLISH_NAMES` and `isEnglish` stay in `english.ts`.

### The judge

`rubric.md` asks for proper, idiomatic English and doesn't score variety: British, American and mixed spelling all pass. The two old calibration sets merge into one, `tests/golden/calibration/english.json`, without their variety cases; any card seeded with a variety fault is dropped. The judge is calibrated on it before the gate.

### Pronunciation's voice

One English voice. `ELEVENLABS_VOICES` loses its two module entries (`english-british.pronunciation`, `english-american.pronunciation`), and English is spoken with the `en` voice. No flag is needed, since nothing depends on the variety.

## What changes

| Area | Change |
| --- | --- |
| Catalog | New `catalog/languages/english/`: the module, seven facets, about and names in six languages, samples, `rubric.md`, `english.ts` without spelling lists. The two old folders are removed. `catalog/index.ts`: one import, one entry |
| Prompts | New `tests/prompts/english.*.txt` snapshots; the old `english-british.*` and `english-american.*` snapshots are removed |
| Golden set | `tests/golden/parents.json` is per family, so it stays. Its three variety cases (*colour*, *color*, *apartment*) get a new `why`: an English key, explained normally, in any proper English. Same in `tests/golden/token-split/` and `tests/golden/silver/` |
| Content checks | `tests/content-checks.test.mjs` and `tests/fixtures/checks/recorded.json` lose the spelling cases |
| Judge | One `rubric.md`; one calibration set; calibrated before the gate |
| Storage | Migration `0019`: `deck_modules.type` and `components.module_type` change from `english-british` and `english-american` to `english`. Decks, pages, cards and audio all stay. Audio is stored per part (`core`, a facet), not per module, so it needs no change |
| Extension | `catalog/about.generated.ts` regenerated. `tests/browser/module-pages.test.mjs` lists *English* once. The two `tests/screens/rules/allowlist.mjs` selectors on `data-type="english-…"` follow the new ID |
| Audio | `tests/audio.test.mjs`: the two per-module voice cases go. `.env.example` and `docs/guides/install.md` lose the British and American voice entries |
| Docs | `docs/specs/modules.md` (catalog row, flag table), `docs/product/scope.md` (modules row, the upgrade), D31, and `maps/` where they name the two modules |
| API | No contract change. The module list comes from the catalog, so `docs/api/openapi.json` should not change; `npm run openapi` confirms it |

## Upgrade

The next release's upgrade keeps every account, deck, page, card and clip. Migration `0019` renames the module type in place. Cards written before the upgrade keep their text as written. **Question 1** asks whether to rename or to discard.

## Verification

| What | How |
| --- | --- |
| Catalog and prompts | `tests/catalog.test.mjs`, `tests/prompts.test.mjs` (`UPDATE_PROMPTS=1`; only English snapshots change), `tests/localisation.test.mjs`, `tests/content-checks.test.mjs` |
| No variety left | A catalog test that no English prompt, rubric or check names *American* or *British* |
| Upgrade | `tests/upgrade.test.mjs`: a database at `0018` with a British and an American English card on one page upgrades to two `english` cards, with their text, audio and facet lists unchanged. `tests/postgres.test.mjs` |
| Quality, live | Calibrate the judge on `english.json`, then `npm run gate -- english` on the golden set, against English (US) in M2 |
| The split's English | M3's English part 2 again (about 15 minutes), to see whether Pronunciation keeps the selection now |
| Journey | Browser: add English to a deck, capture *colour* and *color*, check both cards and their audio; a page from before the upgrade still opens. `npm run screens -- --base main` for the module pages |

## Limits

- **A card may mix spellings,** such as *colour* in one facet and *color* in another, now that facets are written apart. By the owner's rule that is accepted.
- **Old cards keep their text until retried.**

## Questions for you

1. ~~Rename or discard on upgrade?~~ Owner: rename in place.
2. ~~Its own release, or with Phase 3?~~ Owner: its own small release, before the split's decision.
