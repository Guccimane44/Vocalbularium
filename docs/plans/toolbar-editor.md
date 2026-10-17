# Plan: an editor without markdown, a toolbar and a facet's own Edit (0.7.5)

Proposed: 17 October 2026 (Europe/Berlin). Implements [D10](../architecture/traceability-map.md#entries), accepted by the owner on 17 October 2026 and applied to the specifications in increment 0. Tracker: [#167](https://github.com/Guccimane44/Vocalbularium/issues/167); milestone in [Actual Stages](https://app.notion.com/p/3fcbb1350208816382f8d2a2fb4fb0f8). Status: increment 0 merged in [#168](https://github.com/Guccimane44/Vocalbularium/pull/168) after the owner accepted D10 (17 October 2026); increment 1 (the toolbar editor) merged in [#169](https://github.com/Guccimane44/Vocalbularium/pull/169); increment 2 (a facet's own Edit) merged in [#170](https://github.com/Guccimane44/Vocalbularium/pull/170); increment 3 (verification and delivery) merged in [#171](https://github.com/Guccimane44/Vocalbularium/pull/171); increment 4 (the D10 amendment) merged in [#172](https://github.com/Guccimane44/Vocalbularium/pull/172); increment 5 (the editor as the card) merged in [#173](https://github.com/Guccimane44/Vocalbularium/pull/173); increment 6 (the core's own Edit and Retry) merged in [#174](https://github.com/Guccimane44/Vocalbularium/pull/174); increment 7 (rebuild and delivery) merged in [#175](https://github.com/Guccimane44/Vocalbularium/pull/175); increment 8 (the second D10 amendment) merged in [#176](https://github.com/Guccimane44/Vocalbularium/pull/176); increment 9 (plain Examples, size and font) merged in [#177](https://github.com/Guccimane44/Vocalbularium/pull/177); increment 10 (rebuild and delivery) merged in [#178](https://github.com/Guccimane44/Vocalbularium/pull/178); increment 11 (the third D10 amendment) merged in [#179](https://github.com/Guccimane44/Vocalbularium/pull/179); increment 12 (highlight colours) merged in [#180](https://github.com/Guccimane44/Vocalbularium/pull/180); increment 13 (rebuild and delivery) merged in [#181](https://github.com/Guccimane44/Vocalbularium/pull/181); increment 14 (the fourth D10 amendment) merged in [#182](https://github.com/Guccimane44/Vocalbularium/pull/182); increment 15 (the main key as a stored highlight) in review.

## Outcome

Editing a parent card no longer involves markdown. What the user types stays as typed, and formatting comes from a toolbar beside the part being edited. A facet with content can also be edited on its own, without opening the whole card. The card, the stored content and generation are unchanged from 0.7.4.

## Owner decisions

From the owner's answers in chat on 17 October 2026:

1. **No markdown in the editor:** typed `**`, `*`, `-`, `1.`, `` ` `` and `==` stay as characters, with no live formatting ([pages and editing](../specs/pages-and-editing.md#editing-generated-components)).
2. **Toolbar:** bold, italic, highlight, inline code, bulleted list and numbered list; no font or size choice. Cmd/Ctrl+B and +I stay.
3. **Placement:** beside the focused facet, on its rule next to its tab (the core's toolbar sits on its top line).
4. **Facet Edit:** beside Retry and Delete; edits that facet alone, in place, with its own Save and Cancel ([editing one facet](../specs/pages-and-editing.md#editing-one-facet)).
5. **Release:** 0.7.5. 0.7.4 is accepted as built at `8fa0caa`.

## Increments

Stacked PRs, each reviewed and green in CI.

### 0. Record the decision and the plan (this PR)

D10 and C22 in the traceability map, the specifications, the scope rows `accepted for 1.0`, this plan, the tracker and the Notion records.

### 1. Toolbar editor without markdown

- TipTap without its markdown input rules or the shortcuts beyond Cmd/Ctrl+B and +I; typed markdown characters are stored escaped and shown as typed.
- The toolbar: six buttons with pressed states and names, shown beside the focused part only, keeping the focus in the text.
- Pasting keeps the supported formatting; pasted markdown stays characters.
- Browser E2E: typed markdown stays literal in the editor, the stored text and the card; each button toggles its formatting; the toolbar follows the focus; keyboard use.

### 2. A facet's own Edit

- Edit beside Retry and Delete for a facet with content; that facet alone becomes an editor in place with the toolbar, Save and Cancel; the rest stays read-only.
- It counts as editing the card: the other actions wait; drafts, the leave warning, save recovery and a save during generation as for a card. Save sends only that facet's change over the stored content.

*Changed during increment 2 (17 October 2026):* a save's change gains an optional `facet`, and the server takes only that facet's text over the content it has stored. So the API and the extension upgrade together in 0.7.5; a 0.7.4 API would save the whole component.
- Browser E2E: edit one facet and save; Cancel; emptying it; the card's Edit unchanged; a save while the card generates.

### 3. Verification and delivery (0.7.5)

- Browser E2E across capture, cards, the card editor and a facet's Edit.
- Version 0.7.5, the upgrade note in scope (no migration expected), scope rows `implemented`, D10 Implemented in Notion; candidate package and evidence. Owner acceptance is recorded separately.

### 4. Amend D10: the editor as the card, the core's own Edit and Retry (this PR)

*Amended 17 October 2026, before the owner accepted 0.7.5.* The owner asked that what the editor shows be what the card shows, and that the core be edited and retried on its own, placed as a facet's actions; the card's Edit stays so empty facets can still be filled. Owner answers: the editor takes the card's styling; the core's Retry regenerates only the core; still 0.7.5.

### 5. The editor as the card

- Each part's editor in its card styling: the numbered list's number column, the Examples' display font and soft-italic translations, the core's size.
- Browser E2E comparing the editor's and the card's styles for a numbered list and the Examples.

### 6. The core's own Edit and Retry

- Edit and Retry on the core's top line, shown on hover or focus as a facet's; Edit opens the core alone with its toolbar, Save and Cancel; Save writes only the core over the stored content.
- A core target for generation: the provider writes the core and no facet; the result replaces only the meanings or translation; the top line and facets stay; the spark round the top line; a failure leaves everything as it was and says so on the top line.
- Browser E2E for both, and a store test for the core-only save and attempt.

### 7. Rebuild and deliver 0.7.5

- The full suites, D10 back to `implemented (0.7.5)`, the candidate rebuilt with the earlier ZIP kept, and the owner's API restarted if the API changed.

### 8. Amend D10 again: plain Examples, size and font (this PR)

*Amended 17 October 2026, before the owner accepted 0.7.5.* The owner found the Examples still in a size of their own, with no way to change text size, and asked for the Examples as plain text like the other facets and for font and size in the toolbar. Owner answers: Small / Normal / Large; Text / Display / Mono; on the selected text; stored inside today's markdown. Still 0.7.5 (a default the owner may change on review).

### 9. Plain Examples, size and font

- The Examples' own display font and size go; they render as every other facet does.
- The markdown subset gains a bracketed span, `[text]{size=… font=…}`, parsed and rendered by the shared render contract, escaped in what the user types, and converted to and from the editor's marks.
- Two editor marks, size and font, with a Size and a Font choice in the toolbar showing what applies at the cursor.
- Unit tests for the span (parse, render, round trip, escaping); browser E2E setting a size and a font, saved and shown on the card, and the Examples looking like the other facets.

### 10. Rebuild and deliver 0.7.5

- The full suites, D10 back to `implemented (0.7.5)`, the candidate rebuilt with the earlier ZIP kept, and the owner's API restarted if the API changed.

### 11. Amend D10 a third time: highlight colours (this PR)

*Amended 17 October 2026, before the owner accepted 0.7.5.* The owner found the toolbar's highlight unlike the main key's yellow and asked for one yellow and a small palette. Owner answers: Yellow (default), Green, Blue, Pink, Orange; the button applies the last colour and an arrow opens the swatches. Still 0.7.5 (a default the owner may change on review).

### 12. Highlight colours

- One yellow token for the main key's emphasis and the default highlight, in both themes; four more pale colours.
- The span gains `highlight=…`; the highlight mark gains a colour; the toolbar's split Highlight button with its palette.
- Unit tests for the colour in the span; browser E2E choosing a colour, saved and shown, and the default matching the main key.

### 13. Rebuild and deliver 0.7.5

- The full suites, D10 back to `implemented (0.7.5)`, the candidate rebuilt with the earlier ZIP kept, and the owner's API restarted.

### 14. Amend D10 a fourth time: stored main-key highlights, Context and Text, empty parents (this PR)

*Amended 17 October 2026, before the owner accepted 0.7.5.* The owner wanted the main key's yellow to come from the highlight function, visible in the editor, instead of being drawn by the card; and every card, Context and Text included, and every empty card, editable with the same editor. Owner answers: every part of a parent; existing cards converted once; Context and Text get Edit and Delete on a top row and their text converted once; an empty parent's top line is the main key with the language blank; still 0.7.5. Defaults to confirm: Context's main key is a stored highlight too; the row's Delete deletes the component after asking; the core's own Retry fills a blank language.

### 15. The main key as a stored highlight

- Formatting writes `==…==` around each occurrence of the main key in the core and every facet; the card's own emphasis goes for parent content and Context.
- A migration converts existing parent content and Context once.
- Unit tests for the formatting and the conversion; browser E2E that the editor shows the main key's highlight and that removing it sticks.

### 16. Context and Text in the toolbar editor

- Their text becomes markdown, converted once with characters kept as typed; the card renders it with the shared renderer.
- Edit and Delete on a top row; Edit opens the toolbar editor with its own Save and Cancel; Delete asks first.
- Browser E2E for both, and for capture still filling Context.

### 17. Editing an empty parent

- Edit for a parent without content: a top line of the main key, the language blank, word or sentence from the page's reading; Save stores it; the server accepts that top line only for a parent without content.
- A later Retry, or the core's own, fills the language.
- Browser E2E and store tests.

### 18. Rebuild and deliver 0.7.5

- The full suites, D10 back to `implemented (0.7.5)`, the owner's database backed up, the migration run, the candidate rebuilt with the earlier ZIP kept, and the API restarted.

## Acceptance criteria

1. Typing `**word**`, `- item` or `==mark==` in any editor leaves those characters as typed; after Save the card shows them as typed.
2. Each toolbar button applies and removes its formatting on the selection, and shows whether it applies at the cursor; Cmd/Ctrl+B and +I still work.
3. The toolbar shows only beside the focused facet or the core, never two at once.
4. A facet with content offers Edit beside Retry and Delete; it edits that facet alone and Save changes only that facet.
5. While a facet is edited, the card's Edit, the other facets' actions and the other cards wait; Cancel restores everything.
6. Every editor and toolbar button works from the keyboard and is named.
7. The editor shows each part as the card does: a numbered list's numbers and the Examples' font match before and after Save.
8. The core offers Edit and Retry on its top line; Edit changes only the core; Retry regenerates only the meanings or translation and leaves every facet and the top line as they were.
9. The Examples show in the same font and size as every other facet.
10. Text given a size or a font in the toolbar keeps it after Save, on the card and when edited again.
11. The default highlight is the same yellow as the main key's emphasis; a colour chosen from the palette keeps it after Save.
12. In a generated card the main key shows as a highlight in the editor too, and removing it there removes it from the card.
13. Context and Text offer Edit and Delete on a top row; their text edits with the toolbar and reads as before after the upgrade.
14. An empty German card can be written by hand and saved, with the main key in its top line.

## Risks

- **Escaping:** characters the user types must round-trip without turning into formatting; the existing serializer escapes them, and increment 1 adds tests for each.
- **Facet save:** a facet-only save must not overwrite a concurrent change to the rest of the component; it applies over the stored content like the card's Save.

## Not in this milestone

Font and size choices (they would need storage beyond markdown); editing the core alone; changes to generation or the card's look.
