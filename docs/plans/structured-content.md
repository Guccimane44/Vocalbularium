# Plan: structured parent content, markdown facets and a live editor (0.7.4)

Proposed: 16 October 2026 (Europe/Berlin). Implements [D09](../architecture/traceability-map.md#entries), accepted by the owner on 16 October 2026 and applied to the specifications in increment 0. Tracker: [#152](https://github.com/Guccimane44/Vocalbularium/issues/152); milestone in [Actual Stages](https://app.notion.com/p/3fbbb135020881fb962ad678a3cb613f). Status: increment 0 merged in [#153](https://github.com/Guccimane44/Vocalbularium/pull/153); increment 1 (domain and contracts) merged in [#154](https://github.com/Guccimane44/Vocalbularium/pull/154); increment 2 (generation) merged in [#156](https://github.com/Guccimane44/Vocalbularium/pull/156) after the owner approved the golden set (16 October 2026); increment 3 (storage, API and upgrade) merged in [#157](https://github.com/Guccimane44/Vocalbularium/pull/157); increment 4 (cards from data) merged in [#158](https://github.com/Guccimane44/Vocalbularium/pull/158); the item-based field editor ([#159](https://github.com/Guccimane44/Vocalbularium/pull/159)) closed unmerged after the owner's review; increment 5 (the D09 amendment: markdown per facet) merged in [#160](https://github.com/Guccimane44/Vocalbularium/pull/160); increment 6 (markdown storage and rendering) merged in [#161](https://github.com/Guccimane44/Vocalbularium/pull/161); increment 7 (the live-formatting editor) merged in [#162](https://github.com/Guccimane44/Vocalbularium/pull/162); increment 8 (verification and delivery) in review.

## Outcome

The provider returns a parent's content as JSON instead of markup text, checked strictly. The app formats it into **markdown per facet** when it is stored, the card renders each facet's markdown in its fixed container, and **Edit** formats markdown live, with no fields, numbers or separators of its own. The card's look stays as in 0.7.3.

*Amended 16 October 2026:* increments 1–4 built structured items (merged). After trying the item-based field editor (#159, closed unmerged), the owner amended D09 so that each facet is one markdown text, edited with live formatting (TipTap).

## Owner decisions

Recorded in D09 on 16 October 2026 and applied to the specifications:

1. **Structured result:** a core and one entry per facet, in the shapes of the [render contracts](../specs/modules.md#render-contracts). Examples are their own numbered list, not tied to meanings.
2. **Containers:** the card is drawn from the data into fixed containers: the core, then each facet with content, in the parent's order. A facet without content is not shown and its tag stays blander.
3. **Field editor:** **Edit** turns the whole card into fields in place, with one **Save** and **Cancel** ([pages and editing](../specs/pages-and-editing.md#editing-generated-components)). Items can be added at the end and deleted, not moved. The module's name, the facet names and the core's top line are shown but not editable; no syntax is shown. A facet without content appears as an empty container to fill. Every field may be left empty, the core's included: Save never refuses, a row with nothing in it is dropped, and a half-filled item keeps and shows the parts that have text (amended 16 October 2026). Generated results stay complete.
4. **Facet Retry and Delete** act on the facet's entry.
5. **Upgrade:** every deck and page is discarded, sign-in stays, and My Deck starts fresh, as in 0.7.0.
6. **Unchanged:** the interpretation stage and the model (`deepseek-v4.1-flash`); Context, Text and the main key keep plain text.
7. **Release:** one release, 0.7.4, built in increments.
8. **Markdown per facet (amendment, 16 October 2026):** the core's meanings or translation and each facet are one markdown text, formatted from the JSON when stored, as the card looks now ([render contracts](../specs/modules.md#render-contracts)). The core's top line stays structured and locked.
9. **Live formatting (amendment):** TipTap editors, one for the core and one per facet; bold, italic, bulleted and numbered lists, inline code and highlight; markdown characters do not stay visible ([pages and editing](../specs/pages-and-editing.md#editing-generated-components)). This replaces decisions 3's fields and item rules; any part may be emptied.
10. **Upgrade (amendment):** decks and pages are discarded again (migration 0013), sign-in kept.

## Target model

| Concept | 0.7.3 | 0.7.4 |
| --- | --- | --- |
| Provider result | `{ text }`: markup with `== … ==`, `=== Facet ===`, `: [1]`, `::` | `{ core, facets }` per parent, validated against its shape |
| Stored content | One paragraph block holding the markup | One typed `parent` block: the core's top line, the core's markdown, and one markdown text per facet |
| Rendering | Parsed at display; any unrecognised line makes the card plain text | Each facet's markdown rendered in its fixed container (a small markdown subset, never HTML) |
| Editing a parent card | One textarea with the markup | Live-formatting editors (TipTap), one per facet and one for the core |
| Facet Retry and Delete | Splice and cut text sections | Replace the facet's markdown with its new JSON formatted, or remove it |
| Context, Text, main key | Plain text | Unchanged |

## Increments

The increments are stacked PRs, each reviewed and green in CI. As in 0.7.0, they merge together for the release, because generation, storage and the card change their format at the same time.

### 0. Record the decision and the plan (this PR)

D09 in the traceability map with C21, the Notion decision record (Accepted), the specifications ([model](../product/model.md#component), [modules](../specs/modules.md#render-contracts), [shared UI](../specs/shared-ui.md#text-content), [pages and editing](../specs/pages-and-editing.md#editing-generated-components), [capture and generation](../specs/capture-and-generation.md#retrying-one-facet), [scope](../product/scope.md)), this plan, the tracker issue and the 0.7.4 milestone in Actual Stages.

### 1. Domain and contracts

- `packages/contracts`: the `parent` block type in the block document, with the core and facet shapes per parent.
- `packages/domain`: validation of a parent's data against its shape, complete for generated results and allowing empty parts for saved edits; the renderer reads the data instead of parsing text and shows half-filled items; helpers to read, replace and remove one facet's entry; the save rule (empty rows dropped, nothing refused).
- Unit tests for the shapes, validation, rendering and facet helpers.

### 2. Generation

- One JSON shape per parent and input type in the provider prompt and its result schema, replacing the markup instructions. A facet that does not apply, or comes back missing or empty, has no content; anything else outside the shape fails the attempt.
- Facet Retry sends the core as data and asks for that facet's entry alone.
- The golden set writes the structured results for review. **The owner reviews the golden-set outputs before this increment merges** ([C8](../architecture/traceability-map.md#conflicts)).
- Generation tests with controlled providers: both input types, both parents, omitted and empty facets, malformed results, facet Retry.

### 3. Storage, API and upgrade

- The store publishes the `parent` block; saving a parent component validates it with the domain rules; facet Delete and Retry act on entries.
- Migration `0012`: discards every deck and page as `0011` did, keeps sign-in, and creates My Deck with Context and `German` with all four facets. Back up first with `npm run db:backup`.
- OpenAPI regenerated; store and upgrade tests, including an upgrade from a 0.7.3 database.

*Changed during increment 3 (16 October 2026):* until the field editor lands in increment 5, a parent component that holds only text still accepts a text save, so the existing editor and its browser tests keep working; plain text can never replace structured content. Increment 5 removes the text path.

### 4. Cards from data

- The page view draws each parent card from its data into the containers it draws today, with the same look; tags are filled or bland from the facets' entries.
- Browser tests updated from markup fixtures to structured ones.

### 5. Amend D09: markdown per facet (this PR)

The amendment in the map and Notion, the specifications (modules, pages and editing, shared UI, model, capture and generation, scope) and this plan. #159 (the item-based field editor) is closed unmerged.

### 6. Markdown storage and rendering

- `packages/contracts`: the `parent` block holds the core's top line, the core's markdown and a markdown text per facet.
- `packages/domain`: formatting JSON into markdown per the [render contracts](../specs/modules.md#render-contracts); a parser for the supported markdown subset into a small tree (paragraphs, lists, bold, italic, inline code, highlight, line breaks) that clients draw, never HTML; facet helpers on markdown; the page list's meaning line from the core's first item.
- Generation and store: results are formatted into markdown as they are stored; facet Retry formats its facet; saves take the core's and facets' markdown with the stored top line.
- Migration `0013`: discards decks and pages, keeps sign-in, starts My Deck.
- Cards render each facet's markdown in its container; tags read whether a facet's markdown has text.
- Tests: formatting, the parser, saves, facet Retry, the upgrade; fixtures move to markdown.

### 7. Live-formatting editor

- TipTap editors, one for the core and one per facet, with the supported marks and lists, markdown in and out, input rules (`**`, `*`, `- `, `1. `, `` ` ``, `==`) and Cmd/Ctrl+B and +I.
- The editor's look in place: names and the top line locked, empty facets dimmed, tags filling as you type, actions waiting, no focus move; drafts, the leave warning and save recovery as for any card.
- Browser E2E for formatting, lists, emptying a facet and the core, filling an empty facet, Cancel and the two-installation resubmission.

### 8. Verification and delivery (0.7.4)

- Browser E2E across capture, cards, facet Retry and Delete, and editing.
- Version 0.7.4, the upgrade note in scope, scope rows to `implemented`, D09 to Implemented in Notion; candidate package and evidence record. Owner acceptance is recorded separately.

## Acceptance criteria

1. Capturing a word and a sentence into My Deck produces parent cards that look as in 0.7.3, rendered from markdown formatted out of the provider's JSON.
2. A provider result outside the parent's shape fails its attempt; an omitted or empty facet has no content and a blander tag.
3. **Edit** shows formatted text only: no `==`, `===`, `**`, list markers, item numbers in fields or separators of the editor's own; the module name, facet names and the core's top line are not editable.
4. Typing markdown formats live: bold, italic, bulleted and numbered lists, inline code and highlight, with Cmd/Ctrl+B and +I.
5. A facet without content appears in the editor and can be filled; once saved it shows on the card and its tag is no longer bland.
6. Save accepts any empty part, the core's included; Cancel discards every change.
7. Facet Retry replaces only its facet's markdown; facet Delete removes it; the other facets and the core stay.
8. Upgrading from 0.7.3 discards decks and pages, keeps sign-in, and leaves one My Deck.
9. Every editor works from the keyboard and is named by its facet.
10. Markdown never renders as HTML, whatever the user types.

## Risks

- **Provider JSON:** the model may still return malformed or misshapen JSON, as one golden-set case did on 16 October 2026. Strict validation fails the attempt rather than storing bad data; the golden set measures the rate before the prompt merges.
- **Prompt change:** a new prompt can change content quality; the owner's golden-set review gates it.
- **Data loss on upgrade:** intended by the owner (development data); the backup command protects against mistakes.
- **Test churn:** unit and browser fixtures written as markup move to structured data.

## Not in this milestone

A different model for interpretation or generation; editing the core's top line; markdown beyond the supported subset (headings, links, images, tables); the model writing markdown itself; new parents or facets.
