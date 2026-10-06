 # 06 — Data and semantics (Q29–Q34)

This is the product's long-term memory. The vision's "persistent semantic object" is the differentiator: future modules should work on captures from years ago. Whatever you store (or refuse to store) now decides whether that promise is real or marketing.

## Q29. What is stored vs generated?

**Decision:** For each karte, what persists: main key + per-seite text + layout + attempt metadata only, or also interpretation (word/phrase/sentence + source language), per-module blocks, and semantic referent?

**Context:** The model defines main key, interpretation per attempt, module instances, attempts, and outcomes as distinct concepts — and explicitly says these are product relationships, not a storage prescription ([model](../product/model.md)). Current seite content is whole-text with outcomes tracked separately; manual content establishes no generation success.

**Options:**
- Minimal (key + text + layout + outcome) — smallest schema; future modules re-derive everything from the key. Fails when re-derivation disagrees with what the user originally meant.
- Standard (+ frozen interpretation per attempt) — reproducible generation history; still cannot distinguish "which Bismarck" across years.
- Rich (+ referent + context snapshot) — future-proof for new modules on old kartes; needs a referent model and correction UI (see Q30).

**Answer prompt:** List the stored fields per karte/seite/attempt. Research task: pick 5 old kartes and ask whether a hypothetical new Timeline module could run correctly from stored data alone.

## Q30. How semantic is the object?

**Decision:** (a) main-key string only, (b) key + frozen interpretation, or (c) key + user-correctable meaning/referent + context snapshot?

**Context:** The model calls richer interpretation and semantic corrections "open" and "direction, not guarantee": current interpretation does not establish an enduring, correctable identity ([model](../product/model.md)). The critique demands the opposite long-term: the system should understand what the object refers to so modules generate appropriate representations ([competitor critique](../product/competitor-critique.md)).

**Options:**
- (a) String only — simplest; every generation re-interprets from scratch. Ambiguous keys flip meaning between runs.
- (b) Frozen interpretation — stable history; wrong first interpretations are preserved faithfully instead of fixed.
- (c) Correctable referent — the vision's promise; needs identity UX ("did you mean X?"), storage, and a rule for main-key edits (keep referent vs re-interpret).

**Answer prompt:** Pick a–c and write the main-key-edit rule. Research task: capture an ambiguous term (e.g. a place that is also a person), generate twice, and record whether outputs agree.

## Q31. How does deck layout evolution affect existing kartes?

**Decision:** When seites/modules are added, removed, reordered, or reconfigured, what happens to kartes already saved under the old layout?

**Context:** Save applies layout to existing kartes today: new seites arrive empty, retained seites keep text, removing saved content needs confirmation against latest account data (README). Seites without triggered modules still exist but render empty; empty is valid, not failure ([modules](../specs/modules.md)).

**Options:**
- Conform always (current) — every karte matches the live layout; layout edits are implicitly bulk migrations. Needs the confirmation flow to never lose text silently.
- Versioned layouts (kartes pin the layout revision they were generated with) — history is faithful; viewing and generation must handle N layout versions.
- Divergent kartes (kartes may differ from deck layout) — most flexible; deck layout becomes a template, and "which layout made this karte" needs answering everywhere.

**Answer prompt:** Pick the rule and the confirmation matrix (which layout edits need explicit consent). Research task: shrink a deck from 4 seites to 2 with content in the removed seites and record exactly what the user is asked.

## Q32. What is the karte lifecycle across decks?

**Decision:** Copy/move semantics between decks, duplicate policy, delete semantics (hard vs trash + restore), and ID stability.

**Context:** Every karte belongs to exactly one deck; copy/paste or move into another deck exists in the product description but moving/copying is deferred in scope ([vision/product description](../../vocabularium-product-description.md), [scope](../product/scope.md)). Matching main keys never merge identities ([model](../product/model.md)).

**Options:**
- Copy-only (move = copy + delete) — simplest; new ID + fresh attempts, history stays behind unless explicitly carried.
- True move (ID + history preserved) — needs cross-deck layout mapping (different seite counts) and receipt continuity.
- Trash + timed purge — safest against accidents; needs retention timers and a purge job.

**Answer prompt:** Define copy vs move field-by-field (ID, attempts, timestamps, receipts) and the delete path. Research task: move a karte between decks with different seite counts on paper and decide where each seite's text goes.

## Q33. What history and provenance is kept?

**Decision:** Per-seite edit history, generation attempt log (prompt version, model, timestamp, cost), source URL — how much, how long, visible to whom?

**Context:** Attempts and outcomes are modeled separately from content, but no history UI or retention rule exists; smoke evidence today is ad-hoc JSON samples ([model](../product/model.md), README smoke sections). Provenance is also the debugging story for "why does this say X?" and the eval story for prompt regressions.

**Options:**
- Attempt log only (latest outcome per seite) — minimal; cannot answer "what changed and when".
- Full version history — answers everything; storage growth and a retention/purge policy required.
- Content-only history (edits versioned, attempts summarized) — middle ground; generation debugging stays coarse.

**Answer prompt:** Set the retention periods and visibility (user-visible history vs operator-only logs). Research task: estimate history-table growth at 100 kartes/week with full versioning.

## Q34. What are the structural limits?

**Decision:** Max seites per deck, modules per seite, main-key length, karte count per deck — and which limits are product rules vs implementation guardrails?

**Context:** Decks support 1–4 seites today with repeated module instances and word/sentence previews (README). Karte lists page at 30, decks at 40. Limits appear in scope and specs, not in one place.

**Options:**
- Keep 1–4 seites + bounded modules — preserves current editor, layout, and migration behavior; revisit only with a layout-migration design.
- Raise caps (e.g. 8 seites) — more expressiveness; every list, editor, and generation-fan-out path must handle the larger shape.
- No product caps, guardrails only — flexible; needs pagination, cost caps, and abuse limits to replace the guardrail function caps served.

**Answer prompt:** Write the numeric limits and where each is enforced (UI, API validation, DB constraint). Research task: create the largest plausible deck/karte and record generation cost and dashboard render time.
