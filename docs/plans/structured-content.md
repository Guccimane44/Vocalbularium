# Plan: structured parent content and a field editor (0.7.4)

Proposed: 16 October 2026 (Europe/Berlin). Implements [D09](../architecture/traceability-map.md#entries), accepted by the owner on 16 October 2026 and applied to the specifications in increment 0. Tracker: [#152](https://github.com/Guccimane44/Vocalbularium/issues/152); milestone in [Actual Stages](https://app.notion.com/p/3fbbb135020881fb962ad678a3cb613f). Status: increment 0 merged in [#153](https://github.com/Guccimane44/Vocalbularium/pull/153); increment 1 (domain and contracts) merged in [#154](https://github.com/Guccimane44/Vocalbularium/pull/154); increment 2 (generation) merged in [#156](https://github.com/Guccimane44/Vocalbularium/pull/156) after the owner approved the golden set (16 October 2026); increment 3 (storage, API and upgrade) in review.

## Outcome

A parent's content becomes structured data. The provider returns a JSON object instead of markup text, the component stores it, the card fills a fixed container per facet from it, and **Edit** shows fields instead of the stored syntax. The card's look stays as in 0.7.3; only the editor changes visibly.

## Owner decisions

Recorded in D09 on 16 October 2026 and applied to the specifications:

1. **Structured result:** a core and one entry per facet, in the shapes of the [render contracts](../specs/modules.md#render-contracts). Examples are their own numbered list, not tied to meanings.
2. **Containers:** the card is drawn from the data into fixed containers: the core, then each facet with content, in the parent's order. A facet without content is not shown and its tag stays blander.
3. **Field editor:** **Edit** turns the whole card into fields in place, with one **Save** and **Cancel** ([pages and editing](../specs/pages-and-editing.md#editing-generated-components)). Items can be added at the end and deleted, not moved. The module's name, the facet names and the core's top line are shown but not editable; no syntax is shown. A facet without content appears as an empty container to fill. Every field may be left empty, the core's included: Save never refuses, a row with nothing in it is dropped, and a half-filled item keeps and shows the parts that have text (amended 16 October 2026). Generated results stay complete.
4. **Facet Retry and Delete** act on the facet's entry.
5. **Upgrade:** every deck and page is discarded, sign-in stays, and My Deck starts fresh, as in 0.7.0.
6. **Unchanged:** the interpretation stage and the model (`deepseek-v4.1-flash`); Context, Text and the main key keep plain text.
7. **Release:** one release, 0.7.4, built in increments.

## Target model

| Concept | 0.7.3 | 0.7.4 |
| --- | --- | --- |
| Provider result | `{ text }`: markup with `== … ==`, `=== Facet ===`, `: [1]`, `::` | `{ core, facets }` per parent, validated against its shape |
| Stored content | One paragraph block holding the markup | One typed `parent` block holding `{ core, facets }` |
| Rendering | Parsed at display; any unrecognised line makes the card plain text | Drawn from the data into fixed containers; nothing parsed |
| Editing a parent card | One textarea with the markup | Fields per meaning, translation and facet item; add at the end, delete |
| Facet Retry and Delete | Splice and cut text sections | Replace and remove the facet's entry |
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

### 5. Field editor

- **Edit** on a parent card: the core's top line shown read-only; meanings or the translation as fields; one container per facet the card has, empty ones included, with each facet's fields; **Add** at the end of every list and **Delete** on each item; one **Save** and **Cancel**.
- Drafts, the leave warning and save recovery as for any card.
- Keyboard and screen-reader paths: every field labelled by its facet and number, focus kept sensibly after Add and Delete.
- Browser E2E for editing, adding, deleting, filling an empty facet, half-filled items, an emptied core, and Cancel.

### 6. Verification and delivery (0.7.4)

- Browser E2E across capture, cards, facet Retry and Delete, and editing.
- Version 0.7.4, the upgrade note in scope, scope rows to `implemented`, D09 to Implemented in Notion; candidate package and evidence record. Owner acceptance is recorded separately.

## Acceptance criteria

1. Capturing a word and a sentence into My Deck produces parent cards that look as in 0.7.3, drawn from structured data.
2. A provider result outside the parent's shape fails its attempt; an omitted or empty facet has no content and a blander tag.
3. **Edit** shows fields only: no `==`, `===`, `[1]`, `::` or other syntax anywhere; the module name, facet names and the core's top line are not editable.
4. Meanings, examples, synonyms, antonyms and Pinyin lines can be added at the end and deleted, not moved; numbering follows.
5. A facet without content appears in the editor and can be filled; once saved it shows on the card and its tag is no longer bland.
6. Save accepts any empty field, the core's included; a half-filled item is kept and shown with the parts it has, an empty row is dropped; Cancel discards every change.
7. Facet Retry replaces only its facet's entry; facet Delete removes it; the other facets and the core stay.
8. Upgrading from 0.7.3 discards decks and pages, keeps sign-in, and leaves one My Deck.
9. Every editor field works from the keyboard and has an accessible name naming its facet and position.

## Risks

- **Provider JSON:** the model may still return malformed or misshapen JSON, as one golden-set case did on 16 October 2026. Strict validation fails the attempt rather than storing bad data; the golden set measures the rate before the prompt merges.
- **Prompt change:** a new prompt can change content quality; the owner's golden-set review gates it.
- **Data loss on upgrade:** intended by the owner (development data); the backup command protects against mistakes.
- **Test churn:** unit and browser fixtures written as markup move to structured data.

## Not in this milestone

A different model for interpretation or generation; moving items; tying examples to meanings; editing the core's top line; rich text inside fields; new parents or facets.
