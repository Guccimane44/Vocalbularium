# Plan: clean up, then refine (0.15.0, 0.17.0)

Approved by the owner on 31 October 2026 (Europe/Berlin). Two milestones before the language expansion: 0.15.0 makes the repository clean and well-defined without changing what the user sees; 0.17.0 refines the product as it is, after [back pressure](backpressure.md) in 0.16.0. The expansion method ("what can a dictionary of this language offer") is specified after 0.17.0.

## Before 0.15.0

The work in flight lands first, so the cleanup starts from one settled `main`:

- **0.13.3** ([#255](https://github.com/Guccimane44/Vocalbularium/pull/255)) and the **0.14.0** increments ([#257](https://github.com/Guccimane44/Vocalbularium/pull/257)–[#260](https://github.com/Guccimane44/Vocalbularium/pull/260)) and the 0.14.0 release ([#261](https://github.com/Guccimane44/Vocalbularium/pull/261)) were merged on 31 October 2026.
- **Release trackers** 0.7.0 to 0.13.3 were closed by the owner on 31 October 2026; the 0.14.0 tracker ([#256](https://github.com/Guccimane44/Vocalbularium/issues/256)) closed with its release.

## Starting point

Measured on 31 October 2026 at 0.14.0:

- **Code:** about 15,300 lines of product source in a sound layering (contracts and domain packages, server, store, persistence, extension; one catalog folder per module). Hotspots: `src/core/store.mjs` (900 lines, 63 KB), `extension/page-view.tsx` (50 KB), and `tests/app.browser.test.mjs` (296 KB, about 4,000 lines in one file). About 4,500 lines are untyped JavaScript.
- **Documents:** about 97,000 words of current authority (product, specifications, architecture, plans, guides) beside 67,000 words of history. The traceability map alone is 16,000 words, with entries of up to 6,500 characters. `AGENTS.md` has 360 words and no architecture.
- **History inside current documents:** `pages-and-editing.md` has about 70 phrasings such as *since 0.x*, *until*, *in place of*, *no longer* or *retired*, `scope.md` 30 and `modules.md` 22; retired features (ghost tags, the deck-settings preview) are still described. The scope ledger opens with release-by-release paragraphs before what is supported.
- **Plans:** six finished plans (0.8.1 to 0.13.0) remain in `docs/plans/`.
- **Links:** every relative link outside `docs/history/` resolves.

The goal: a fresh session gets the full current picture of the product from a few thousand words instead of searching about 160,000.

## 0.15.0: cleanup

Nothing a user sees changes; stored data keeps its shape, so no migration is expected. Each increment is one PR against `main`; A and B are documents only and can run beside C–E.

### A. Instructions and workflow

- **Architecture map** in `AGENTS.md`, about 1,000 words: the anatomy of a module and a facet (definition, prompts, page text and samples per interface language, voice), the path from contract to prompt to card, the store and its invariants, where each kind of change belongs, and which tests guard it. Process detail moves out of `AGENTS.md` into the skills.
- **Skills:** the Change, Verify and Deliver skills keep their procedures and gain pointers into the architecture map; repetition between them and the project workflow is removed.
- **A lighter workflow** in the [project workflow](../guides/project-workflow.md): a D-number only for changes to the product model, the architecture or a contract; interface polish batched per milestone under the milestone's plan; one owner review packet per milestone (screenshots of every changed screen in both themes and every interface language, golden-set output diffs, test evidence, known gaps).
- **An intake step** in the Change skill: a request is restated as before/after behaviour and acceptance criteria, with questions only on genuine ambiguity, and the owner confirms it before work starts.
- **Memory** keeps durable preferences and pointers; release status stays in GitHub and Notion.

A working-process decision; it gets a Notion decision record (System area) for the owner's acceptance.

### B. Documents state current rules

- **Specifications** describe today's behaviour only, `pages-and-editing.md` and `modules.md` first: phrasings of what changed when, and descriptions of retired features, are removed. Decision references stay where a reader needs the rationale, as one link, not as history.
- **Scope** opens with what is supported; the release-by-release paragraphs go, since the ledger rows and git already carry them. The upgrade notes stay.
- **Traceability map:** one line per decision (ID, date, one-sentence summary, affected documents, Notion link, status); each entry's full text moves to its own file beside the map, as [D17](../architecture/decisions/d17-one-request.md) and [D20](../architecture/decisions/d20-module-pages.md) already have.
- **Finished plans** move to `docs/history/plans/`; `docs/plans/` holds only live plans.
- **Scope check:** every capability marked `implemented` is checked against the code.

### C. Facets owned by their module

- The stored `facets` object in `packages/contracts/src/pages.ts` stops listing every facet name; it accepts the facets the module declares, validated against the catalog.
- No German or Chinese name remains outside their catalog folders and test fixtures. The default deck (`src/core/store.mjs`, `extension/configuration.tsx`) keeps German but reads its facets from the catalog.
- An upgrade test shows that pages stored by 0.14.0 read unchanged.

A contract change; it gets a traceability-map entry and the owner's acceptance before it is applied.

### D. Conformance driven by the catalog

- The catalog, prompt, localisation and golden-set tests loop over the modules in the catalog instead of naming German and Chinese.
- A fixture language module, present only in tests, passes the whole suite without any change outside its own folder. That is the proof the expansion can add a language on its own.

### E. Code a session can read whole

- **Browser tests** split from `tests/app.browser.test.mjs` into one file per journey (capture, cards and editing, facets, deck settings, module pages, localisation, upgrade, audio) with shared helpers; `npm run test:browser` and CI run all of them, and no scenario is lost (the count of tests before and after matches).
- **The store** splits `src/core/store.mjs` by concern (accounts and sessions, decks, pages and components, generation and receipts, audio) behind the same interface; the existing tests pass unchanged.
- **Types:** [#199](https://github.com/Guccimane44/Vocalbularium/issues/199) for the files these splits touch.

### F. Known debt

- [#155](https://github.com/Guccimane44/Vocalbularium/pull/155) the flaky facet-tag test.
- From a static code review of 25 October 2026, kept outside the repository: a shared `now` for the page list's date groups (finding 1) and a `reconcile()` staleness test matching the server's (finding 3), each with a regression test.

### G. Verification

The full unit and browser suites, CI green, and the first owner review packet in the new form.

### Acceptance criteria

1. The test fixture language module passes every catalog-driven test with no change to contracts, shared code or shared tests.
2. Outside their catalog folders and fixtures, no source file names German- or Chinese-specific facets.
3. A database written by 0.14.0 reads and edits unchanged under 0.15.0.
4. `AGENTS.md` lets a new session find where a facet is defined, prompted, stored, shown and tested without searching.
5. Specifications describe no retired feature and say nothing of what changed when; the scope ledger starts with what is supported.
6. The traceability map has one line per decision, and `docs/plans/` holds only live plans.
7. No source or test file exceeds about 30 KB, and the browser suite runs the same number of tests as before the split.
8. The current documents total well under half their present 97,000 words, with every relative link resolving.

## 0.17.0: refinement

Moved from 0.16.0 on 1 November 2026: the owner chose to build [back pressure](backpressure.md) first, so refinement runs with visual diffs, layout rules and content checks in place.

Refines the product as it stands; no new modules or languages. Its scope is set by the owner at the start:

1. **Intake.** The owner lists what feels wrong or unfinished. Claude adds an exploratory sweep (every screen in both themes and every interface language, the main journeys driven in the browser) and a fresh static review, and proposes a candidate list.
2. **Selection.** The owner picks the batch and its priorities once; Claude turns each item into acceptance criteria under the intake step.
3. **Build** in parallel increments where they touch separate files, then one review packet for the whole batch.

Candidates already known: the static review's other findings (a dangling context-capture script on timeout, `.trim()` on non-string required fields, the component position contract); owner items to come.

## Not in these milestones

The expansion: the language-dictionary method, its pilot languages and the batch that follows.
