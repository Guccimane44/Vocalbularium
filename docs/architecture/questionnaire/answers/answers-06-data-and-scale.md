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
