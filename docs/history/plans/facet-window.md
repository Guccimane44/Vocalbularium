# Plan: facets chosen on the parent, and explanations (0.8.1)

Proposed: 22 October 2026 (Europe/Berlin). Implemented in release 0.8.1 (increments A and B, [#204](https://github.com/Guccimane44/Vocalbularium/pull/204) and [#205](https://github.com/Guccimane44/Vocalbularium/pull/205)); owner acceptance is recorded on the tracker. Implements [D13](../../architecture/traceability-map.md#entries), accepted by the owner on 22 October 2026 and applied to the specifications in [#202](https://github.com/Guccimane44/Vocalbularium/pull/202), together with [D14](../../architecture/traceability-map.md#entries), which this milestone does not build. Tracker: [#203](https://github.com/Guccimane44/Vocalbularium/issues/203); milestone in [Actual Stages](https://app.notion.com/p/401bb1350208813c886dde8014d5ed17).

## Outcome

A parent's facets are chosen on the parent itself: **Facet** among its actions, on a page and in deck settings, opens a facet window listing every facet of its module, with the equipped ones ticked. The module window becomes simpler: it lists no facets and marks no module as already on the page, and ghost tags are retired. Every module in the module window and every facet gains an explanation, a few sentences and a sample for a word and for a sentence, so a user can learn what it does without trying it.

0.8.1 builds on `main` at 0.8.0. Storage, generation, cards and facet tags stay as they are; nothing stored changes and no migration is expected.

## Owner decisions

Recorded in D13 on 22 October 2026, with the proposed defaults of K31–K34, and applied to the specifications:

1. **Facet** stands between **Retry** and **Fold** on a parent's card and before **Remove** in deck settings, disabled while the parent generates or its card is edited ([pages and editing](../../specs/pages-and-editing.md#components-as-cards)).
2. **The facet window** is a popover below the tab: one row per facet of the module, the core excepted, in the module's order, with a tick; ticking or unticking applies at once (in deck settings to the draft) and the window stays open; unticking a facet with content asks in its row. Facets that do not apply to the page's key are listed too ([facet window](../../specs/pages-and-editing.md#facet-window)).
3. **The module window** lists no facets, has no facet drag, **+** or search, and no **Already here**; ghost tags are retired ([shared UI](../../specs/shared-ui.md#module-window)).
4. **Explanations:** a markdown file beside each module's and facet's definition in the catalog, in English; the sample is the module's existing `sample.json`, a facet showing its part. A module's opens from **About …** below its **+**, in a dialog; a facet's from an **ⓘ** on its row, expanding beneath it ([explanations](../../specs/modules.md#explanations), [generation architecture](../../architecture/generation.md#module-catalog)).
5. **Claude drafts the explanation texts; the owner reviews them** before release.

D14 (English first, localised for 1.0) only sets the language of the explanations here; localisation itself is planned in a later release ([K35](../../architecture/traceability-map.md#clarifications)).

## Target model

| Concept | 0.8.0 | 0.8.1 |
| --- | --- | --- |
| Adding a facet | Drag from the module window onto a parent of its type, or its **+**; several targets placed by ghost tags | Tick it in the parent's facet window, from **Facet** among its actions |
| Removing a facet | Its **Delete** beside its label, or its tag's remove | The same, or unticking it in the facet window |
| Module window | Modules and, under each parent, its facets; **Already here** on modules present | Modules only, with **About …** below each **+** |
| What a module or facet does | A one-line description | The description, and an explanation with samples |
| Catalog folder | `module.ts`, `sample.json`, prompts; facet `facet.ts` and prompts | Also `explanation.md` per module in the window and per facet but the core |

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

D13 and D14, the specification updates, this plan and the tracker, in [#202](https://github.com/Guccimane44/Vocalbularium/pull/202).

### A. The facet window

- **Facet action.** `extension/page-view.tsx` gains **Facet** in a parent card's ejected actions; `extension/configuration.tsx` gains it before **Remove** in deck settings. Both open one shared facet-window component, anchored below the tab.
- **Facet window.** Rows in the module's order with abbreviation mark, name and a checkbox; ticking calls the existing add-facet path (`addFacet` on a page, the draft's `withFacet` in deck settings), unticking the existing delete-facet path, with the facet's "Are you sure?" in the row when it has content. The tag flies from the row (`launchFacet`). Escape, a click outside or another action closes it; focus moves to the first row and back to the tab.
- **Module window.** `extension/shaping.tsx` drops `WindowFacet`, the facet drag and collision logic, the pick-and-place state and the ghost targets; `extension/facet-tags.tsx` drops ghost tags; facet names leave the window's search; the **Already here** mark goes. Families of modules on the page still start open.
- **Tests.** Extension unit tests for the window's rows, ticks and disabled states; browser E2E: tick and untick on a page (with and without content), tick in deck settings and save, two German parents each choosing their own facets, the module window without facets, keyboard use of the window. Existing facet-drag and ghost-tag tests are rewritten or removed.

### B. Explanations

- **Catalog.** `explanation.md` beside `module.ts` for German, Chinese, Computer Science, Mathematics, Context and Text, and beside `facet.ts` for every facet but the core (German Article, Examples, Synonyms, Antonyms; Chinese Examples, Pinyin). The definitions expose them; the extension bundle includes them (prompts are read only by the API, explanations must reach the extension).
- **Texts.** Claude drafts every explanation; the owner reviews them in the PR before merge.
- **Module window.** **About {label}** below each **+** opens a dialog with the module's name and family mark, its explanation and its samples for a word and a sentence, rendered by the card's renderer; close, Escape or a click outside returns the focus to the link.
- **Facet window.** An **ⓘ** per row expands that facet's explanation and its part of the sample, one at a time; a facet applying to one input type shows only that sample.
- **Guard.** The catalog conformance test fails when a module in the window or a facet but the core has no explanation, or when one does not render as markdown.
- **Tests.** Unit tests for sample slicing per facet and input type; browser E2E: **About German** opens and closes the dialog without adding a module; Article's **ⓘ** on a sentence page shows the word sample only.

### C. Verification and delivery (0.8.1)

- Browser E2E across the journeys above; the full unit and browser suites; both themes and forced colours for the facet window and the dialog.
- Version 0.8.1; the scope ledger's D13 rows to `implemented`, with an upgrade note (no data change); D13 to Implemented in the traceability map and Notion. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. On a German card, **Facet** opens a window listing Article, Examples, Synonyms and Antonyms in that order, the equipped ones ticked; ticking adds the facet at once, its tag flying from the row to the card, and it waits for **Retry**.
2. Unticking a facet with content asks "Are you sure?" in its row and **Cancel** keeps it; unticking an empty facet removes it at once.
3. In deck settings the same window changes the draft, never asks, and **Cancel** discards the changes.
4. The module window shows no facets, no facet drag or **+**, no ghost tags and no **Already here**; searching a facet's name finds nothing.
5. **About German** opens a dialog with German's explanation and its word and sentence samples, adds nothing, and Escape returns the focus to the link.
6. Every facet row's **ⓘ** expands its explanation; Article's shows a word sample only.
7. The conformance test fails for a module or facet without an explanation.
8. **Facet** is disabled while the parent generates or its card is edited, and the whole window works from the keyboard and with a screen reader.

## Risks

- **Removing the facet drag** touches the module window's shared drag-and-drop code; module drag, reorder and keyboard drag must stay as they are. The existing module-drag browser tests guard this.
- **The extension bundle** gains markdown files; it should not grow noticeably, and the API must not need them.
- **Explanation quality:** generic texts would not help. The owner reviews every draft before increment B merges.

## Not in this milestone

Localisation, the language preference and the string process ([D14](../../architecture/traceability-map.md#entries), accepted for 1.0, planned later; [K35](../../architecture/traceability-map.md#clarifications) open); D12's folded empty cards; facets on input modules; further modules or facets.
