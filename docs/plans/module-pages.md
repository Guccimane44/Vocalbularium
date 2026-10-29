# Plan: family, module and facet pages (0.13.0)

Proposed: 29 October 2026 (Europe/Berlin). Implements [D20](../architecture/traceability-map.md#entries), accepted by the owner on 29 October 2026 with C29–C30 and K62–K68 resolved the same day ([decision](../architecture/d20-module-pages.md), [Notion](https://app.notion.com/p/408bb13502088178989be16624f29b14)). Specifications applied in [#245](https://github.com/Guccimane44/Vocalbularium/pull/245): [modules](../specs/modules.md#explanations), [shared UI](../specs/shared-ui.md#module-window), [pages and editing](../specs/pages-and-editing.md#facet-window), [decks and configuration](../specs/decks-and-configuration.md#configuration), [generation architecture](../architecture/generation.md#module-catalog). Reference design: the owner's settled canvas, its source in [d20-design](../architecture/d20-design/). Tracker: [#246](https://github.com/Guccimane44/Vocalbularium/issues/246). Milestone in Notion: [0.13.0](https://app.notion.com/p/408bb13502088158bafcd9388a90f32b).

## Outcome

The explanations of 0.8.1 give way to pages. A family's heading in the module window, **About** below a module, a card's **About**, deck settings, a facet-window row's **›** and a facet's **About** on a card open a family, module or facet page in one side sheet over the module window, linked by a path (*Languages / German / Article*), with Back and Escape. The pages are the same wherever they open. A module page shows its facts, a sample the user can switch between the six interface languages and between a word and a sentence, how the key becomes the core and the facets, and its facets with what they apply to; a facet page shows what it applies to and describes, its samples and where it sits. The Languages samples are *language* and *Languages are the bridges connecting people and the world.*, generated once per language and reviewed; 幸福 is retired, also from the deck-settings preview. No stored data changes.

0.13.0 builds on `main` after 0.12.2 and the D20 PR [#245](https://github.com/Guccimane44/Vocalbularium/pull/245). The minor version marks a new surface replacing the explanations.

## Owner decisions

Recorded in D20 on 29 October 2026 and applied to the specifications:

1. **One side sheet** for family, module and facet pages, linked by a path; Back one step; Escape closes and returns the focus (C29).
2. **Static pages**, the same in the page view and deck settings: no add button, nothing from the current card; adding stays in the module window.
3. **Entry points:** the family heading and **About** in the module window; a card's **About** with the module's name; **About** first among a module's actions in deck settings; the facet window's **›**; a facet's About on a card.
4. **Layout and wording** as the settled canvas draws them: boards 0–6 (K67).
5. **Samples:** the *language* set in every interface language offered (K64), starting at the interface language (K66); Conjugation *speak*, Comparison *clear*, Case *between* (K65); the Expertise modules keep their own term and have no language dropdown; generated once by a script, reviewed, stored, regenerated only when prompts change (K63); the deck-settings preview uses them (C30).
6. **Page text** as `about.json` per family, module and facet, translated beside it, replacing `explanation*.md` (K62).
7. **Verification** as K68: catalog tests in every language, a browser E2E test of every entry point and control including Arabic, and the owner's screenshot review in light and dark.

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

This plan and the tracker.

### A. Page text and samples in the catalog

- **Page text.** `about.json` for the Languages, Expertise and Notes families, every module in the module window and every facet but the core, with the fields the boards show (summary, facts, the family's steps, applies to, describes), written from the canvas's wording; `about.<language>.json` in Arabic, Chinese, French, Russian and Spanish, each checked by a separate Claude reviewer as for the 0.9.0 translations. `explanation*.md`, `packages/domain/src/explanations.ts` and the generated `explanations.generated.ts` give way to the page text, gathered by `scripts/build-packages.mjs` into one generated module.
- **Samples.** A script (`scripts/samples.mjs`) generates with the current prompts, per interface language: German and Chinese for *language* and the bridges sentence; German Conjugation for *speak*, Comparison for *clear*, Case for *between*; Mathematics and Computer Science for their current terms and sentences, written in each language. It writes `samples/<language>.json` in the module's or facet's folder; `sample.json` is removed from every module, and Context keeps its sample text per language. A separate Claude reviewer reads each language's samples for correct forms (articles, conjugation, declension, romanization) and the owner reviews a representative set before the increment merges.
- **Preview.** The deck-settings preview reads the samples in the interface language (C30).
- **Checks.** The catalog conformance test (`tests/catalog.test.mjs`): every family with modules, module and facet but the core has its page text in every interface language; every content module and every facet with its own words has samples in every interface language, validating against the facets' shapes and formatting into markdown; no `sample.json` or `explanation*.md` remains. The localisation test covers the page text.

### B. The sheet and its entry points

- **Sheet.** A new sheet component in the extension replaces the explanation dialogs (`extension/explanation.tsx`): family, module and facet pages as boards 0–5 draw them, in the Sage tokens of both themes; the path, Back, Escape with the focus returned to the opener; the key-language dropdown (interface languages named in themselves and in English) and Word/Sentence; the core-only card with the **+ Facets** hint; How it works's four lines; Applies to, Describes, Samples, Where it sits and the facet strip. Mirrored in Arabic; no sliding under reduced motion.
- **Entry points** (board 6). The module window: the family name in each group heading opens the family page, its collapse control unchanged; **About** with the module's name replaces the round ⓘ (`extension/shaping.tsx`). The facet window: each row's ⓘ becomes a **›** that opens the facet page and the inline explanation goes (`extension/facet-window.tsx`). A card's actions gain **About** with the module's name, before **Fold**; a facet's About opens its facet page (`extension/page-view.tsx`). Deck settings: **About** first among a module's ejected actions (`extension/configuration.tsx`).
- **Strings.** New interface strings in the English catalogue and the five translations.
- **Checks.** The browser E2E test (`tests/app.browser.test.mjs`), with a mocked provider: each entry point opens the right page; the path moves between family, module and facet; Back and Escape work and the focus returns; the dropdown and Word/Sentence change the sample; acceptance scenarios 31 and 32 of [pages and editing](../specs/pages-and-editing.md#acceptance-scenarios); the sheet in Arabic.

### C. Verification and delivery (0.13.0)

- The full unit and browser suites; screenshots of every page in light and dark and in Arabic for the owner's review against the canvas.
- Version 0.13.0; the scope row moved to `implemented`, the map row to `implemented (0.13.0)`, the Notion record to Implemented. No migration and no upgrade step beyond installing the build. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. **About German** in the module window opens German's module page in a side sheet over the module window, with the path *Languages / German*; it adds nothing to the page.
2. Its How it looks starts in the interface language; choosing *Русский · Russian* shows *язык* above a German card with the core only, two meanings (*die Sprache*, *die Zunge*) and the **+ Facets** hint; **Sentence** shows the Russian sentence and its German translation.
3. How it works shows Main key, Read as (*Wort · Nomen*; *Satz* for the sentence), Module core with one numbered meaning per line, and Facets with Ar, Ex, Sy, An and De filled for the word and only Ex for the sentence.
4. Article in the module page's facets, the facet window's **›** and Article's About on a card all open Article's facet page: Applies to *Nouns*, Describes, samples (*die Sprache · die Sprachen*; Left out for a sentence), Where it sits and the German facets strip. Conjugation's samples use *speak* (*sprechen*).
5. The family heading in the module window and *Languages* in the path open the Languages family page, whose modules open their module pages.
6. Back returns one step; Escape closes the sheet and returns the focus to what opened it.
7. The same module page opens from deck settings, and the deck-settings preview shows the *language* samples in the interface language.
8. Mathematics' page shows *eigenvalue* with Word and Sentence and no language dropdown or How it works; Text's shows its facts and example note.
9. Every page reads in each interface language and mirrors in Arabic; the catalog test finds every page text and sample in every language.
10. No 幸福 sample remains, and no deck, page or account changes on upgrade.

## Risks

- **Sample quality in six languages:** a wrong article, conjugation or romanization would teach the wrong form. The separate reviewer and the owner's review target it; a sample can be corrected by hand before it is stored.
- **Facet words beside *language*:** *clear* and *between* are new to the owner's review; the review may change them.
- **Two surfaces at once:** the module window, facet window, card actions and deck settings all change entry points; the E2E test covers each.
- **Live runs cost provider usage:** about 70 calls for the samples in six languages, plus reruns after review findings.

## Not in this milestone

New modules or facets; changes to what any module generates; pages for the main key or the core; contextual hints from the current card; adding a module from its page; a family page for families without modules.
