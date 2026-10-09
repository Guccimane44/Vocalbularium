### Q29

**Amended 10 October 2026 by [Q72](#q72):** read karte as page and seite as component. Each component stores its own block content and latest outcome. There is no pinned layout revision. The rest stands.
Stored per karte/seite/attempt: main key + optional Context (surrounding block, capped ~500 chars, editable, nullable) + current per-seite content as a block document with a schema version (Q13; not an edit history) + pinned layout revision + latest attempt outcome per seite (loading/completed/failed). Model, timestamp, tokens, and cost of every provider call go to the usage ledger (Q33) + capture URL/title + timestamp per Q07-Standard. No frozen word/phrase/sentence + source-lang, no referent. Seite content is block JSON per Q13 (resolves C1). Optional per-karte interpretation line (nullable, editable) only when the Q30 interpretation setting is on (resolves C5).

Rule: interpretation is always re-derived from main key + saved Context at generation time. History shows what was produced, not how it was classified. Drift on re-run is accepted.

Consequence: hypothetical Timeline on 5 old kartes may classify differently than 2026 runs — accepted per owner decision; user fixes by editing main key/Context + retry, not by correcting a stored interpretation.

Needs: retention/redaction rule per Q11/Q33 for the stored Context. If Q07 capture-with-Context stays off, this Q29 choice still works but re-derivation falls back to the bare key.

### Q30

(a) String only — simplest; every generation re-interprets from scratch. Ambiguous keys flip meaning between runs.
The saved Context can provide extra surroundings for the plain string, and Context edits follow the main-key rule (save first, no auto-regeneration).

Opt-in interpretation (resolves C5 in the [traceability map](../traceability-map.md#conflicts)):
- Default mode is (a) string only, as above.
- A setting turns on a lightweight interpretation, off by default. When on, generation records a short interpretation line for the karte (for example "Otto von Bismarck, German chancellor"), shown next to the main key and Context.
- The user can edit or clear the line. Later generations use main key + Context + interpretation. Clearing it lets the next generation derive a new one.
- Edits to the line, and main-key or Context edits, follow the main-key rule: save first, no auto-regeneration.
- Turning the setting on does not backfill existing kartes; they gain a line on their next explicit generation. Turning it off hides and ignores existing lines without deleting them.
- This is not a referent: there is no entity model and no identity shared across kartes.
- Open (K14): setting level (account or deck), length cap, and whether a stale line is flagged after main-key edits.

### Q31

**Superseded 10 October 2026 by [Q72](#q72):** pages don't pin a layout. Generation and every retry use the deck's live configuration, and configuration changes never touch existing pages until the user retries. The answer below is kept for history.
Versioned layouts: each karte pins its deck layout revision at capture (or manual creation). Deck-configuration edits apply to newly created kartes only — never a bulk rewrite of existing kartes. Viewing and generation again on an existing karte use its pinned layout; the live configuration is a template for new kartes. Spec: [kartes-and-editing](../../../specs/pages-and-editing.md), [Select and Add](../../../MVP-Product-spec-select-and-add.md#capture-scenario).

### Q32

**Amended 10 October 2026 by [Q72](#q72):** read karte as page and `seites` as components. Move and copy carry the components unchanged, with no remap. A moved page's next retry uses the target deck's configuration. Pinned layout revisions no longer exist. Statements about existing receipts apply to receipts created after the refactor, because the upgrade discards earlier content.
Karte-centered with true move, full-carry copy, and trash + restore + timed purge. Every karte belongs to exactly one deck at a time (`kartes.deck_id`); a deck is a view and organizer. Moving a karte from deck A to B only changes `deck_id`. Deck configuration applies only to newly generated kartes in that deck, never reshaping existing kartes (per Q31 pinned layout).

- Move (true move): `id`, `created_at`, `selected_text`, pinned layout revision, and all `seites` rows travel verbatim. Usage-ledger rows (Q33) keep pointing at the unchanged karte `id`; `loading` attempts are cancelled, never moved as loading. No seite remap, drop, or backfill, even when the target deck has a different seite count.
- Copy: new karte `id` in the target deck with the same content and pinned layout revision; new `created_at`; no usage-ledger rows carried (fresh generation only). Source karte untouched. Matching main keys never merge identities.
- Delete: trash + restore + timed purge. Trash sets `deleted_at` and hides the karte from deck lists, recent captures, and counts while keeping `seites` and the latest outcomes. Restore clears `deleted_at`. A purge job hard-deletes after retention (proposed 30 days).
- Idempotency: move, copy, trash, restore, and purge run as idempotent operations with new operation IDs and receipts; existing receipts replay unchanged.
- Layout-mismatch paper check: a 4-seite karte moved into a 2-seite deck keeps all 4 seites unchanged; the target deck gains no empty seites and loses none. New captures in that deck follow its own layout.

Needs: decouple karte-owned `seites` from `layout_seites` conformance (current reads join on `l.deck_id = b.deck_id`, `saveDeck` backfills/deletes `seites`), and change `saveDeck` to template-only.

### Q33

Current content only at 1.0 (resolves C11 in the [traceability map](../traceability-map.md#conflicts)):
- Content: each seite stores only its current content and latest outcome (completed / failed / inapplicable). No version history of content or edits; a retry or edit replaces what was there.
- Usage ledger (internal, append-only): one row per provider call with account, karte, seite, model, prompt version (release version, Q47), input/output tokens, cost, outcome, and timestamp. It feeds the quota (Q48), cost tracking (Q65), and debugging. It is never shown as karte history; users see only usage totals.
- Ledger retention follows Q39 (proposed ~13 months; open in K7).

### Q34

**Amended 10 October 2026 by [Q72](#q72):** the seite limit is replaced by at most 12 content modules per deck. View limits are decided with the view modules that need them. The answer below is kept for history.

Keep 1–4 seites + bounded modules — preserves current editor, layout, and migration behavior; revisit only with a layout-migration design.

### Q72

Decided by the owner on 9 October 2026 and revised and approved on 10 October 2026: components on the live configuration, with views. Notion: [decision record](https://app.notion.com/p/3f4bb1350208812e8085ffd751302842). Full plan: [deck → page → component refactor](../../../plans/page-component-refactor.md).

- **Model:** a deck contains pages. A page is an ordered list of components: the main key (required), Context (optional), and one component per content module instance in the deck configuration. Users may add manual text components that generation never touches.
- **Generation:** each content module produces or replaces only its own component. Retry targets one component or the whole page and uses only the main key, Context and the deck's current configuration. It replaces the targeted content, including the user's edits, after confirmation. Capture generates automatically; manual creation never does.
- **Views:** a page is data, and a view is a way to show it, as in a Notion database. View modules provide views. The **default view** module shows a page as its ordered component list and is always available. The old karte design becomes a later **card** view module; it and every other view module are out of scope for this refactor. No term is defined for parts of a view.
- **Terms:** karte and seite are dropped. Use deck, page, component, content module, view, view module, default view.
- **Existing content:** discarded on upgrade. Decks, kartes, seites, layouts, attempts and receipts are deleted, and the account starts with one fresh default deck. Accounts and sign-in stay.
- **Compatibility:** a breaking contract version. The card/page and karte/seite dialects are retired in the same release (see Q14 and Q70).
- **Limits:** at most 12 content modules per deck.
- **Release:** its own milestone, after the logging stack merges.

Changes: Q31 superseded; Q13, Q14, Q29, Q32, Q34 and Q53 amended.

