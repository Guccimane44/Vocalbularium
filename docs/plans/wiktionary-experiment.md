# Experiment: an English card from Wiktionary

Draft for the owner's review, 9 November 2026. Nothing here is decided. The experiment answers one question before any architecture is designed: **for the English (British) module, how much of a card can Wiktionary fill, how good is it, and how much faster is it than today's single request?**

## What is compared

| Variant | How a card is made |
| --- | --- |
| **A** (today) | One request to the pinned text model with the core and all seven facets ([D17](../architecture/decisions/d17-one-request.md)). |
| **W** (dictionary first) | 1. Word or sentence: a sentence goes to A unchanged. 2. Look the key up in Wiktionary. No entry: A unchanged. 3. Entry found: pick the language when several have one, and the sense the Context means (Jev if we have access, otherwise a small model request, counted as such). 4. Fill from the entry what it holds (table below). 5. The facets left over go to the model as a facet's own Retry does today, with the dictionary core as `core`, in parallel. |

Every card runs every facet of English (British): Examples, Synonyms, Antonyms, Pronunciation, Etymology, Simple translation and Grammar teacher.

### What W takes from the entry

| Part | From Wiktextract | Notes |
| --- | --- | --- |
| Core: `kind`, `language`, `key` | the entry's `lang_code`, `word` | |
| Core: `meanings` | `senses[].glosses` | Leave out senses tagged obsolete, archaic, rare or dated; at most the first N (N = 4, as today's cards average); a sense pick fills `contextual`. |
| Pronunciation | the key itself for an English key; for a foreign key the English gloss when it is one word or short phrase | Today's rule: an English key is spoken itself, once. |
| Examples | `senses[].examples` | Only for an English key, whose examples need no translation; otherwise the model. |
| Synonyms, Antonyms | `synonyms`, `antonyms` (entry and senses) | At most five. Missing: left out, as the facet allows. |
| Etymology `origins` | `etymology_templates` (`inh`, `der`, `bor`) | Language names, oldest first. |
| Etymology `text` | `etymology_text` | Its first two or three sentences, without the "Etymology tree" lines; noted where too raw to show. |
| Simple translation, Grammar teacher | — | Always the model. |

## Inputs

The 54 inputs of `tests/golden/parents.json`, the set the owner already reviews. About 40 are words or phrases: English keys (*river*-like nouns, *run*, *break the ice*, *get up*, *colour*/*color*/*apartment*), foreign keys (German, Chinese, Spanish, French, Japanese), a name (*John Cena*) and a technical term (*COVID-19*). Six carry a Context that picks a sense (*bank* twice, *breadcrumb*, *Schloss*, *行*, *refrigerator* with one sense). The sentences go to A in W by design and count as misses.

Wiktionary data: the English edition's per-word files on kaikki.org (`/dictionary/<Language>/meaning/<a>/<ab>/<word>.jsonl`, about 100–200 KB each), fetched once into `.data/wiktionary-2026-11/`, not committed. No 3.4 GB dump is needed for the experiment. The English edition gives English glosses for foreign words too, which is what an English module needs.

## What is measured

1. **Coverage.** Share of word keys with an entry; for each facet, the share W filled from the entry rather than the model.
2. **Checks.** The catalog's content checks on every W card (`british-spelling`, `english-key-spoken`, the Etymology checks …), against A's pass rate.
3. **Senses.** Meanings per card in W and A; senses a learner would not want (from the sample *river*: "the last card dealt in a hand", "one who rives"); for the six Context inputs, whether the picked sense is right.
4. **Quality.** The owner ranks A and W blind, card by card, as in the [Expertise ranking](../history/evidence/expertise-insight-ranking.md); the judge (`npm run judge`) scores both against `rubric.md`.
5. **Time.** Wall time per card, first request to last facet, A against W; for W, lookup, sense pick and model time separately.

One sample per variant, the pinned provider, four cards at a time, as in the [generation rounds experiment](../history/evidence/generation-rounds-experiment.md).

## Proposed reading of the results

To be set by the owner before the run:

- **Worth designing** if most English word keys hit (say 70 % or more), W is ranked at least as good as A on most of them, and W's median time is about half of A's or less.
- **Worth it only for some facets** if the core is weaker but Pronunciation, Etymology origins or Synonyms are as good: then the dictionary feeds facets, and the model keeps the core.
- **Not worth it** if glosses read as too raw for the card without a model rewriting them, since a rewrite gives back most of the time saved.

## Out of scope

Product code, storage, migrations, licence and attribution on cards (CC BY-SA), the German and Chinese modules (they need the German and Chinese Wiktionary editions), and the schema cleanup, which runs on its own.

## Output

A runner kept locally in `.data/`, an evidence note in `docs/history/evidence/wiktionary-english-experiment.md`, the blind ranking sheet for the owner, and a short recommendation on whether to design the dictionary path.

## Open before the run

1. Jev access. Without it, the sense pick uses a small model request, and the experiment cannot say how fast Jev would be.
2. N, the most senses a W card shows.
3. The thresholds above.
