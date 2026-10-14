# Plan: parent modules with a core and facets (0.7.0)

Proposed: 14 October 2026 (Europe/Berlin). Implements [D08](../architecture/traceability-map.md#entries), accepted by the owner on 14 October 2026 and applied to the specifications in [#137](https://github.com/Guccimane44/Vocalbularium/pull/137). Tracker: [#138](https://github.com/Guccimane44/Vocalbularium/issues/138); milestone in [Actual Stages](https://app.notion.com/p/3f9bb1350208814b8731f4d726254fa5). Status: approved by the owner on 14 October 2026; increment 0 merged in [#139](https://github.com/Guccimane44/Vocalbularium/pull/139), increment 1 (domain and contracts) in [#140](https://github.com/Guccimane44/Vocalbularium/pull/140), increment 2 (storage and API) in [#141](https://github.com/Guccimane44/Vocalbularium/pull/141), increment 3 (generation and golden set) in [#142](https://github.com/Guccimane44/Vocalbularium/pull/142), increment 4 (extension, reset and retirement) in [#143](https://github.com/Guccimane44/Vocalbularium/pull/143); increment 5 (verification and delivery) in the release PR. The owner's content review of the golden set is pending.

## Outcome

Every content module becomes a **parent module**: a core that works for every word, phrase, and sentence, plus facets that the user adds and deletes like modules. A module dragged onto any page now produces content; it no longer completes empty because the key is a sentence. The first catalog is two parents in a new Translation family, **German** and **Chinese**, and the three earlier content modules are retired.

The interaction model of 0.6.3 stays: page-owned modules, the module window, cards with tabs and ejected actions, Retry only, and drag-only shaping ([D02](../architecture/traceability-map.md#entries), [D04](../architecture/traceability-map.md#entries), [D07](../architecture/traceability-map.md#entries)). The owner will refine the card's look later; this milestone builds facets with the existing styling.

## Owner decisions

Recorded in D08 on 14 October 2026 and applied to the specifications:

1. **Parents and facets:** a parent has a required core and facets in an order its type fixes. Facets describe the core's translation. A facet that does not apply is not shown. Parent and facets are one component from one generation, and Retry regenerates them together ([modules](../specs/modules.md#parent-modules-and-facets)).
2. **Same-language keys:** a key already in the parent's language is explained in that language, and its translation is the key itself.
3. **Catalog:** `German` (Article, Examples, Synonyms, Antonyms) and `Chinese` (Examples, Pinyin; simplified characters). On a sentence, Examples gives one similar sentence and Pinyin the pinyin of the translation; Article, Synonyms, and Antonyms are for words only ([catalog](../specs/modules.md#catalog)).
4. **Facets in the window:** listed beneath their parent and added like modules, by dragging or **+**, but only to a parent of their own type, on a page or in deck settings. A parent is added with its core only. An added facet waits for **Retry**; a facet is deleted like a component ([shared UI](../specs/shared-ui.md#module-window), [pages and editing](../specs/pages-and-editing.md#shaping-a-page)).
5. **Interpretation:** only word/phrase or sentence, shown under the main key and not correctable. No source language is classified ([input and applicability](../specs/modules.md#input-and-applicability)).
6. **Repeated parents** generate independently.
7. **Families:** Translation is a seventh family, petrol with a two-speech-bubble icon (K26). Deck colours stay the six earlier ones.
8. **Upgrade:** every deck and page is discarded, accounts and sign-in stay, and My Deck starts with Context and `German` with all four facets.

## Target model

| Concept | 0.6.3 | 0.7.0 |
| --- | --- | --- |
| Content module types | `german-explanation`, `german-examples`, `sentence-usage`, each for one input type | Parents `german` and `chinese`, each for every input type |
| Module instance | `{ id, type }` | `{ id, type, facets }`: an ordered list of the parent's facet types, empty for input modules |
| Applicability | Per instance: an inapplicable instance completes empty | Per facet: the core always applies, an inapplicable facet is left out |
| Interpretation | `{ inputType, sourceLanguage }` per run | `{ inputType }` per run; the page reports its latest one for the label under the main key |
| Repeated instances | Retried until their outputs differ (`claimOutput`) | Independent; no distinctness check |
| Module window | Modules by family; drag or **+** | Parents with their facets beneath them; a facet's **+** offers the parents that take it |
| Card content | One render contract per module type | Core, then a labelled section per facet; each facet label has **Delete** |
| Families | Six | Seven: Translation added |
| My Deck | Main key, Context, `German explanation + examples` | Main key, Context, `German` with Article, Examples, Synonyms, Antonyms |

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan (this PR)

This plan, the tracker issue, and the 0.7.0 milestone in Actual Stages (`Not started`). The specifications were already updated with D08 in #137.

### 1. Domain and contracts

- `packages/domain`: the parent catalog with each parent's facets, their order, and which input types each facet applies to; the Translation family; rules for adding a facet (eligible parents, already present, generating) and deleting one, next to the existing shaping rules.
- `packages/contracts`: module instances carry `facets`; `InputInterpretation` drops `sourceLanguage`; a page carries its latest interpretation.
- Render contracts in `render.ts`: core for a word, core for a sentence, and facet sections, with the plain-text fallback.
- Unit tests for the catalog, facet rules, and renderer.

### 2. Storage and API

- Migration `0010` (additive): an ordered facet list on deck modules and on components, and run order so a page can report its latest interpretation.
- Parents join the module catalog and the stored modules, but stay out of the module window until increment 4; deck colours become their own list of the six earlier family colours, and Translation joins the families.
- API: adding and deleting a facet on a page component (`/api/page/facets/add`, `/api/page/facets/delete`), with the same rejections as the domain rules; deleting a facet removes its section from the content; configuration saves carry facets; page reads carry each component's facets and the page's latest interpretation; attempts record the facets they generate. OpenAPI regenerated.
- Store and upgrade tests, including an upgrade from a 0.6.3 database.

*Changed during increment 2 (14 October 2026):* the reset that discards decks and pages and creates the new My Deck moves to increment 4, where the three earlier modules are retired, so the extension and its browser tests keep working with them until then.

### 3. Generation

- Interpretation asks only for word/phrase or sentence.
- One provider call per parent attempt, for its core and its current facets, following the text formats in the render contracts. Retry includes facets added since the last attempt and never a deleted one. `claimOutput` and the distinctness retries are removed.
- A **golden set** per parent (C8): about 20–30 inputs covering words, phrases, sentences, keys in the parent's language, nouns and verbs, Chinese and German keys. A script runs them against the live provider and writes the outputs for the owner's review. The exact text formats are fixed here.
- Generation tests with the fake provider: core per input type, facet applicability, same-language keys, failures.

### 4. Extension

- Migration `0011`: the upgrade discards decks and pages as `0008` did, keeps sign-in, and creates My Deck with Context and `German` with all four facets; the three earlier content modules are retired. Back up first with `npm run db:backup`.
- Theme: `fam-translation` tokens; the speech-bubble icon (drawn in increment 2); the contrast test covers the seventh family.
- Module window: parents with their facets beneath them, drawn as parts of their parent; dragging a facet marks the parents that take it and lands only on them; a facet's **+** adds it to the only eligible parent or offers the eligible ones; disabled facets say why. Keyboard and screen-reader paths as for modules.
- Page: a parent card shows the core, then each applicable facet under its label; a waiting facet shows only its label; **Delete** on a facet label asks "Are you sure?" when it has content. The word or sentence label under the main key.
- Deck settings: facets on parent rows, added and deleted the same way; the preview's word and sentence samples show which facets apply.
- Browser E2E for the new journeys.

### 5. Verification and delivery (0.7.0)

- Browser E2E: capture a word and a sentence into My Deck; add a parent and a facet on a page and in deck settings; a facet refused on the wrong parent; the facet's **+** choosing among two parents; delete a facet and retry; the interpretation label.
- The owner reviews the golden-set outputs for both parents.
- Version 0.7.0; scope ledger rows to `implemented`; D08 to Implemented in Notion. Owner acceptance is recorded separately.

## Acceptance criteria

1. Capturing a word into My Deck produces a `German` component with an explanation in German, then the article, examples, synonyms, and antonyms that apply.
2. Capturing a sentence produces its German translation and one similar sentence; Article, Synonyms, and Antonyms are not shown, and the label under the main key says "sentence".
3. A German key in a German parent is explained in German, and Article gives its own article. A Chinese parent writes simplified characters, and Pinyin gives the pinyin of its translation.
4. No content component completes empty because of the input type.
5. A parent dragged or added with **+** comes with its core only. A facet lands only on a parent of its type. Its **+** offers the choice when there are several, and it is disabled with a reason when there are none.
6. An added facet shows only its label until **Retry**. A deleted facet does not come back on **Retry**.
7. Two parents of one type generate independently; retrying one leaves the other unchanged.
8. Deck settings add and delete facets like the page does, and a new page copies the deck's parents with their facets.
9. Upgrading from 0.6.3 discards decks and pages, keeps sign-in, and leaves one My Deck as specified.
10. The Translation tab meets the contrast targets in both themes, and every facet action works from the keyboard.

## Risks

- **Provider format:** one call now returns a core and up to four facets. The renderer falls back to plain text, and the golden set fixes the formats before the extension depends on them.
- **No source language:** the explanation's language heading now comes from the provider's own reading of the key, and two parents may read an ambiguous key differently. The golden set includes ambiguous keys such as `幸福`.
- **Data loss on upgrade:** intended by the owner; the backup command protects against mistakes.
- **E2E churn:** tests that select the three retired modules are rewritten in increments 1–4.

## Not in this milestone

Further parents (Spanish, a Li Bai poem) and the Creative family; retrying a single facet; correcting the interpretation; changing the card's look beyond showing facets; block (rich) output ([Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13)); passages ([Q42](../architecture/questionnaire/08-modules.md#q42-what-input-sizes-are-supported)).
