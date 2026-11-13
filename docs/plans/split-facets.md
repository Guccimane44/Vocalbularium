# Plan: split each card into its core and parallel facets

Drafted 11 November 2026 for the owner's review. Status: **draft; the owner's questions are answered**. Nothing has been run or changed in code.

This replaces the earlier draft of the same day, which classified each key with Jev before generation and then sent each facet to a lookup or to generation. The owner dropped the classifier (see [Why there is no classifier](#why-there-is-no-classifier)). Two parts of that draft carry over: the split into core and parallel facets, which this plan now centres on, and the German lookup, which stays deferred.

Background:

- [D17](../architecture/decisions/d17.md): one text request per module, which this plan measures itself against
- [Generation rounds experiment](../history/evidence/generation-rounds-experiment.md) and [Wiktionary experiment](../history/evidence/wiktionary-english-experiment.md)
- [Facet dependencies](../../maps/facet-dependencies.md), [headers and flags map](../../maps/headers-and-flags-map.md), [capture-to-card walkthrough](../../maps/capture-to-card-walkthrough.md)
- [Step 2 plan](https://github.com/Guccimane44/Vocalbularium/blob/claude/catalog-dead-fields/docs/plans/step-2-flag-definitions.md): flag definitions and their declaration (on `claude/catalog-dead-fields`)
- [Held-out label review](../history/evidence/held-out-label-review.md)

## Goal

Today each content module writes its whole card in one request: the core with its flags, then every facet. This plan tests a different order:

```
capture ─▶ core (one request: header, flags, meanings) ─▶ each facet that applies, in its own request, all in parallel
```

The core decides every flag, as today. The flags then decide which facets run, and a facet that doesn't apply is never requested.

Success is measured against today's single request per module:

- **Quality not lower:** the golden sets, the content checks and `npm run gate` per module score at least as well as today, and no facet goes missing.
- **Faster:** the median time per card is at least 25 % lower, one card at a time.
- **Cost:** the average cost per card is at most 10 % above today's.

The split ships only if Phase 1 shows it meets all three.

**Not in this plan:** a classifier before generation, starting facets before the core, new modules or facets, view modules, languages other than today's, and any change to what a facet says.

## Why there is no classifier

The owner's reasons, 11 November 2026:

- **An early classifier restricts the model.** It has to commit to one answer before anything is written, and the core then has to follow it. The text model never had that limit: it reads the key and its Context and writes whatever fits.
- **A language tag is too restrictive.** *Paris* is a word in French, English and German. *Gift* is German and English. *42* is in no language. One language code forces a single answer onto a key that honestly has several, or none.
- **A missing Context will be the normal case.** Outside a desktop browser, phone captures will mostly bring only the selected text, both on iOS and on Android. Without a Context, several readings are open far more often, and the card should be able to say so rather than settle on one early.

What this drops from the earlier draft:
- Jev and the classifier provider.
- M4, the test of Jev on `kind`.
- Starting facets before the core. That needed `languageMatch` before the core, and only a classifier could have given it.

The held-out classification set stays in the repository, reviewed, in case a later plan needs it.

## Decided so far

| Decision | Source |
| --- | --- |
| `kind` is `word_phrase` \| `sentence`, decided by the core. A verbless set phrase and a bare verb form are a `word_phrase`; a title accepts both, `word_phrase` first | Owner, 11 November 2026; [label review](../history/evidence/held-out-label-review.md) |
| `language` stays as it is today, decided by the core | Owner |
| `languageMatch` (`yes` \| `no`: is the key in the module's language?) follows from the core's `language` | Owner; how to read it from today's value is settled in Phase 2 |
| `gramRole` stays with the core | Owner |
| An Expertise card whose key is `unrelated` skips its facets and shows a fixed message | Owner. With the split this happens on its own: the core says `unrelated`, and no facet is requested |
| Existing cards are for testing and are discarded if a stored shape changes: decks and pages go; accounts, sign-in and the language preference stay, with a fresh My Deck | Owner, as in 0.12.0 |
| The success bar above | Left to Claude by the owner |
| Synonyms and Antonyms are written together, in one request, wherever both apply; every other facet has its own request. Asked for alone, Antonyms in English (US) gave wrong opposites (*adult* for *tot*); written with Synonyms, most of those went away | Owner, 11 November 2026; [facet prompts follow-up](../history/evidence/facet-prompts-stand-alone.md#follow-up-what-reduces-the-extra-antonyms) |
| What the facets rely on from the core lives in the module's `facets/core/facets.prompt.md`, which every request that writes a facet carries | Owner, 11 November 2026; [plan](facet-prompts-stand-alone.md) |

## What we know and what we don't

| Known | Source |
| --- | --- |
| A sequential core-then-facets split was slower than one request, and it dropped facets | Generation rounds experiment, basis of D17 |
| Parallel facet requests looked about 3× faster (38.7 s to 12.2 s), but the run was confounded: four cards at once, so the parallel requests competed | Wiktionary experiment |
| The text model decided `relevance` and the `has…` flags 39 of 39 times inside one request | Generation rounds experiment |
| Examples and Simple Translation need the core's meanings; most other facets need only the key and the flags | Facet dependencies |

| Unknown | Measured in |
| --- | --- |
| How one request's tokens divide between the shared prompt, the core's rules, each facet's prompt, and the output | M1 |
| Whether core-then-parallel is faster per card, one card at a time, and whether it keeps every facet and its quality | M2 |
| What each facet, the core included, costs on average, today and split | M3 |

## Phase 1: measure the split (no product code)

Each measurement gets its own short plan for approval, a runner kept locally under `.data/`, and an evidence note in `docs/history/evidence/`. M1, M2 and M3 here were M2, M3 and M6 in the earlier draft.

| | What | How | Sends anything out? |
| --- | --- | --- | --- |
| **M1** | Token split per module ([plan](m1-token-split.md), [results](../history/evidence/m1-token-split.md)) | Today's single request, with every facet, on a test set built for M1 (`tests/golden/token-split/`): the tokens of the shared prompt, the core's rules, each facet's prompt, and each part of the output | Text provider only, as today |
| **M2** | Core-then-parallel against one request ([plan](m2-core-then-parallel.md), [results](../history/evidence/m2-core-then-parallel.md)) | For every golden-set input of the Languages modules (Expertise and Mathematics follow only if Languages passes): today's single request, then the split (the core alone, then each facet that applies as its own request, given the key, the Context, the core's flags and meanings, and that facet's prompt, all at once). One card at a time, several runs each, the same model and settings. Recorded: time to the core, time to the last facet, facets missing or failing their checks, golden-set and gate scores | Text provider only, as today |
| **M3** | Average cost per facet, the core included ([plan](m3-cost-per-facet.md), [results](../history/evidence/m3-cost-per-facet.md)) | Each part's input and output tokens at the provider's prices, averaged over the runs: from M1 for today's single request, and directly from each split request in M2. The two together show what the split adds per card and where | No (M1's and M2's runs) |

M1 runs first: its token split tells M2 how large each facet request will be. M3 needs both.

**Points for M2's own plan:**
- **The shared context.** Each facet request repeats the shared prompt and the core's output. M1 shows how large that is, so the cost can be predicted before M2 runs.
- **Concurrency.** How many requests at once the provider takes for one card before they slow each other down. One card at a time removes the confound in the earlier experiment, but a deck capture may still start several modules together, and that should be recorded too.
- **The core's request.** It is today's core shape, with its facets cut out. Whether the core is as good when written without them is part of what M2 measures.
- **Variance.** Time per request varies between runs, so medians over several runs, not single timings.

## Decision point

With M1 to M3 for the Languages modules, a decision record (a new D-number) states whether the split replaces D17's single request for them, and with what limit on parallel requests. Expertise and Mathematics are measured and decided afterwards, the same way. If the split fails the bar, D17 stands, and the evidence notes record why.

## Phase 2: the flags, defined and declared

Runs alongside Phase 1. It is the step 2 plan, with the definitions decided so far.

- **Part A:** `flag-definitions.md`, one entry per flag: meaning, values, decided from, depends on, which facets it decides, hard cases. It includes how `languageMatch` is read from today's `language` value.
- **Part B:** each core's flags declared in the catalog, with no change in behaviour; `ruledOut()` and the core's Retry read the declarations.

The split needs this, because the server has to know from the core's flags which facets to request.

## Phase 3: the split in the product (only if the decision says so)

- **Generation:** the core's request, then one request per applicable facet (Synonyms and Antonyms together in one), in parallel up to the limit the decision sets. Provider calls stay outside database transactions and the ordered executor.
- **Storage:** the card still publishes whole, as today (owner, 11 November 2026). The core and each facet are staged as they arrive, and the module's attempt publishes once every requested facet has succeeded or failed. The reader sees no change except speed. If staging per facet changes a stored shape, it is a new migration, and the upgrade discards existing cards as decided.
- **Failure:** a facet that fails or times out is retried on its own or marked failed. It never fails the core or the other facets.
- **Retry:** a facet's Retry is one facet request again. The core's Retry writes the core again and then requests the facets its new flags allow. A card's Retry does both.
- **Recovery:** after a restart, an attempt with a staged core and missing facets requests only the missing facets, then publishes.
- **Expertise:** an `unrelated` core publishes the fixed message and requests nothing more.
- **Contract and API:** any change to what a page or attempt reports regenerates `docs/api/openapi.json`.

## Later: German lookup

Deferred until the owner designs it after Phase 1. A lookup takes chosen parts of a Wiktionary entry, not the whole entry. With the split, a lookup would simply replace one facet's request with a check against a local import, and the rest of the card is unchanged. The label review's notes on the German set (*Beamte*, *Deutsche*, rarer variants) are input to that design.

Now planned in [M4](m4-dictionary-reading.md), after a [coverage check of the German Wiktionary](../history/evidence/m4-german-wiktionary-coverage.md).

## Verification

| Phase | Checks |
| --- | --- |
| 1 | Each evidence note states its inputs, number of runs, the model and settings, what was mocked, and its limits |
| 2 | No prompt snapshot or OpenAPI change in Part B; a catalog test that every flag a facet's `when` reads is declared |
| 3 | `generation` and `generation-recovery` tests for a facet that fails, times out, or is missing after a restart; `tests/upgrade.test.mjs` if a stored shape changes; golden sets and `npm run gate` per module against today's single request; a browser journey from capture to card, with a facet that fails |

## Risks

- **More requests, more input tokens.** The shared context is paid once per request, so cost grows with the number of facets. M1 and M3 say by how much.
- **Facets that disagree.** Written apart, two facets may pick different meanings of an ambiguous key. Giving each facet the core's meanings is meant to prevent that, and M2 checks it.
- **Rate limits.** Many parallel requests per card, across several modules, may hit the provider's limits. M2 records where requests begin to slow each other down.
- **The slowest facet sets the card's time.** Because the card publishes whole, one slow facet holds the rest back. M2 records the time to the last facet, and Phase 3 needs a timeout per facet.

## Questions for you

1. ~~Should M2 cover all three families?~~ Owner: Languages first.
2. ~~Should the core publish on its own before its facets?~~ Owner: no, the whole card publishes together.
3. ~~Keep the held-out classification set?~~ Owner: keep it, unused for now.
