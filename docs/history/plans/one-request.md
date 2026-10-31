# Plan: one text request per module (0.12.0)

Proposed: 28 October 2026 (Europe/Berlin). Implements [D17](../../architecture/traceability-map.md#entries), accepted by the owner on 28 October 2026 with K49–K57 and C26–C27 resolved the same day ([decision](../../architecture/d17-one-request.md), [Notion](https://app.notion.com/p/407bb135020881ca86dbc12727814bf1)). Specifications applied in [#233](https://github.com/Guccimane44/Vocalbularium/pull/233): [modules](../../specs/modules.md#input-and-applicability), [capture and generation](../../specs/capture-and-generation.md#input-interpretation), [pages and editing](../../specs/pages-and-editing.md#required-main-key), [shared UI](../../specs/shared-ui.md#text-content), [generation architecture](../../architecture/generation.md). Evidence: the [generation rounds experiment](../evidence/generation-rounds-experiment.md). Tracker: [#234](https://github.com/Guccimane44/Vocalbularium/issues/234).

## Outcome

Each content module writes its card in one request. The run's shared word-or-sentence interpretation is gone: a Languages card decides word or sentence itself and shows it, with the key's language and, on a German word, its grammatical role, in its core header in the module's language; the label under the main key is gone. An Expertise card records D16's case as `relevance` and writes as 0.11.0 does. German gains Conjugation, Declension, Comparison and Case, Mathematics a Formula facet and Computer Science a Code example facet, shown only where their flags allow, with tables, KaTeX formulas and highlighted code. Generation is never cached. Upgrading discards every deck and page and keeps accounts, sign-in and the language preference.

0.12.0 builds on `main` after 0.11.0 and the D17 specification PR [#233](https://github.com/Guccimane44/Vocalbularium/pull/233). The minor version marks the change in how generation works and the fresh start.

## Owner decisions

Recorded in D17 on 28 October 2026 and applied to the specifications:

1. **One request per module**, flags first in the core; no shared interpretation, no gate, no core-then-facets split; a facet applies by its own prompt and the server drops one its flags rule out (K53).
2. **Flags:** `kind` and `language` for German and Chinese, `gramRole` for German only, `relevance` for the Expertise modules, `formula` for Mathematics, `code` for Computer Science.
3. **Header labels** in the module's language, fixed per flag value by the catalog, not editable (K51); the title's tier from length alone (K52).
4. **New facets** not in the default deck (K56); tables, KaTeX (the earlier no-HTML rule no longer applies) and code blocks, edited as source text (K54).
5. **Fresh start:** the upgrade discards every deck and page (K49).
6. **Verification:** golden sets in every interface language with expected flags; the owner reviews representative changed cards side by side with 0.11.0's (K50, K55); output stays well within the 60-second timeout (K57).

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

This plan and the tracker.

### A. One request per module, and the fresh start

- **Catalog.** Flags declared on each core (values, `shown`, the catalog's label per value and module language); one core shape and one `core.prompt.md` per module; facets' applicability stated in flags instead of input types (`packages/domain/src/catalog/`).
- **Prompts.** German and Chinese: the merged core prompt as tested in run 3 of the experiment (no "every meaning" phrase; the idiom line; the grammar word for German); each existing facet's prompt says when it applies. Mathematics and Computer Science: one core prompt with `relevance` first and D16's three cases, as O in the experiment. `main-key/interpretation.prompt.md` is removed.
- **Generation.** `src/server/generation.mjs` sends one request per attempt; `interpretation()` and the run's sharing go; the facet check drops a facet the flags rule out and records the mismatch in diagnostics without generated text; a facet's own Retry reads the stored core's flags.
- **Storage and contract.** Migration `0017` discards decks, pages, components, runs and attempts and drops `generation_runs.interpretation`; the account's next load creates the fresh My Deck. `Page.interpretation` leaves the contract and the OpenAPI document. The header stores `kind`, `language` and German `gramRole`; the Expertise core stores `relevance`.
- **Extension.** The label under the main key is removed; the Languages core header shows its labels; the title tier ignores generation. The first start clears cached content, unsent captures and pending saves from earlier builds and keeps sign-in.
- **Golden sets and snapshots.** Every input gains its expected flags; `scripts/golden-set.mjs` checks them and counts facet-check mismatches. Prompt snapshots change for every content module; the interpretation snapshot is removed.
- **Checks.** Unit tests for the composer, the facet check and the migration; the browser E2E covers capture → card with header labels and no label under the main key, with a mocked provider; an upgrade test from a 0.11.0 database. English golden-set run, then the owner's side-by-side review of representative cards against 0.11.0's (about eight: run, laufen, an idiom, a Chinese sentence, retinol, multi-core, derivative, ring with an outside Context).

### B. German grammar facets

- Conjugation (Co), Declension (De), Comparison (Cm) and Case (Ca) in `languages/german/facets/`, each with shape, formatter, prompt, sample part and explanations in six languages.
- The card and editor render markdown tables, scrolling within their container on a narrow card; a facet's own Edit edits the table as its source.
- Golden cases (K55): *sein*, *gehen*, *aufstehen*, *sich freuen*, *Junge*, *gut*, *tot*, *in*, *wegen*, plus the existing German inputs; the English run is checked for correct forms by a separate reviewer, and German cards with all eight facets stay well within the timeout (K57).

### C. Expertise facets

- Formula (Fo) for Mathematics and Code example (Cd) for Computer Science, with the `formula` and `code` flags, only for `relevance` `subject`.
- KaTeX renders display math (a formula that fails shows its LaTeX source); code blocks are highlighted; both edit as source text. KaTeX and the highlighter are bundled with the extension, no network fetch.
- Golden cases: a concept with and without a standard formula; a concept usually shown in code and one that is not; a neighbouring and an unrelated key, which never get either facet.

### D. Review per language, verification and delivery (0.12.0)

- All golden sets in the five interface languages other than English, each read by a separate Claude reviewer for D16's cases, the writing guide, header labels and the new facets; findings fixed and rerun; recorded in `extension/locales/reviews.json` and an evidence record.
- The full unit and browser suites; the upgrade rehearsal on a copy of the owner's database.
- Version 0.12.0; scope rows moved to `implemented`, the map row to `implemented (0.12.0)`, the Notion record to Implemented; upgrade notes with the backup step. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. A capture makes one provider request per content module; no request runs before them.
2. A German card for *run* shows *Englisch · run · Wort · Verb* in its header, Conjugation of *laufen* when added, and no Article or Declension; a sentence card shows *Satz* and no word-only facet. A Chinese card shows its labels in Chinese and has no grammatical role.
3. No label appears under the main key; the title's size depends on length only.
4. Expertise cards for retinol, multi-core and derivative read as in 0.11.0, and their recorded `relevance` matches the golden set.
5. Formula appears only for a mathematics concept whose definition has a formula, and renders with KaTeX; Code example only for a computer science concept usually shown in code.
6. A facet its flags rule out never reaches a card; mismatches are counted in the golden-set runs.
7. Upgrading from 0.11.0 leaves the account signed in with its language preference and one fresh My Deck, and no earlier deck or page.
8. A German card with all eight facets completes well within the 60-second timeout in the golden-set runs.

## Risks

- **Merged prompts change Languages output.** The experiment found today's level in English with one sample; the per-language review and the side-by-side review catch regressions.
- **Output size.** Eight German facets add several seconds; a widened prompt can reach the timeout. K57's rule applies to every prompt change.
- **Grammar tables can be wrong** (strong verbs, n-declension). The golden cases and the separate reviewer target them; a model-independent source for tables is out of scope.
- **The fresh start is irreversible.** The backup step and the upgrade rehearsal come before the owner's migration.
- **Live runs cost provider usage:** about 400 calls for A's English runs and review, about 200 each for B and C, and about 1,000 for D's five languages.

## Not in this milestone

Heavy facets (audio, images); graphs; subfields; Chinese grammar facets; a different model or provider; caching; changes to the writing guides beyond review findings.
