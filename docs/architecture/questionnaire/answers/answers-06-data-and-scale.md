### Q29
Stored per karte/seite/attempt: main key + optional Context (surrounding block, capped ~500 chars, editable, nullable) + per-seite text + pinned layout revision + attempt outcome (loading/completed/failed, model, timestamp, cost) + capture URL/title + timestamp per Q07-Standard. No frozen word/phrase/sentence + source-lang, no referent, no per-module blocks.

Rule: interpretation is always re-derived from main key + saved Context at generation time. History shows what was produced, not how it was classified. Drift on re-run is accepted.

Consequence: hypothetical Timeline on 5 old kartes may classify differently than 2026 runs — accepted per owner decision; user fixes by editing main key/Context + retry, not by correcting a stored interpretation.

Needs: retention/redaction rule per Q11/Q33 for the stored Context. If Q07 capture-with-Context stays off, this Q29 choice still works but re-derivation falls back to the bare key.

### Q30

(a) String only — simplest; every generation re-interprets from scratch. Ambiguous keys flip meaning between runs.
The saved Context can provide extra surroundings for the plain string, and Context edits follow the main-key rule (save first, no auto-regeneration).

### Q31
Versioned layouts: each karte pins its deck layout revision at capture (or manual creation). Deck-configuration edits apply to newly created kartes only — never a bulk rewrite of existing kartes. Viewing and generation again on an existing karte use its pinned layout; the live configuration is a template for new kartes. Spec: [kartes-and-editing](../../../specs/kartes-and-editing.md), [Select and Add](../../../MVP-Product-spec-select-and-add.md#capture-scenario).

### Q32
Karte-centered with true move, full-carry copy, and trash + restore + timed purge. Every karte belongs to exactly one deck at a time (`kartes.deck_id`); a deck is a view and organizer. Moving a karte from deck A to B only changes `deck_id`. Deck configuration applies only to newly generated kartes in that deck, never reshaping existing kartes (per Q31 pinned layout).

- Move (true move): `id`, `created_at`, `selected_text`, pinned layout revision, and all `seites` rows travel verbatim. Completed `attempts` history stays linked to the karte; `loading` attempts are cancelled, never moved as loading. No seite remap, drop, or backfill, even when the target deck has a different seite count.
- Copy: new karte `id` in the target deck with the same content and pinned layout revision; new `created_at`; no `attempts` carried (fresh generation only). Source karte untouched. Matching main keys never merge identities.
- Delete: trash + restore + timed purge. Trash sets `deleted_at` and hides the karte from deck lists, recent captures, and counts while keeping `seites` and `attempts`. Restore clears `deleted_at`. A purge job hard-deletes after retention (proposed 30 days).
- Idempotency: move, copy, trash, restore, and purge run as idempotent operations with new operation IDs and receipts; existing receipts replay unchanged.
- Layout-mismatch paper check: a 4-seite karte moved into a 2-seite deck keeps all 4 seites unchanged; the target deck gains no empty seites and loses none. New captures in that deck follow its own layout.

Needs: decouple karte-owned `seites` from `layout_seites` conformance (current reads join on `l.deck_id = b.deck_id`, `saveDeck` backfills/deletes `seites`), and change `saveDeck` to template-only.
