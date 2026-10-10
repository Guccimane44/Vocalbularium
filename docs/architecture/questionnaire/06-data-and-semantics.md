    # 06 — Data and semantics (Q29–Q34, Q72)

This is the product's long-term memory. The vision's "persistent semantic object" is the differentiator: future modules should work on captures from years ago. Whatever you store (or refuse to store) now decides whether that promise is real or marketing.

## Q29. What is stored vs generated?

**Decision:** For each page, what persists: main key + Context + per-component content + attempt metadata only, or also interpretation (word/phrase/sentence + source language) and semantic referent?

**Context:** The model defines main key, Context, interpretation per run, content module instances, components, attempts, and outcomes as distinct concepts — and explicitly says these are product relationships, not a storage prescription ([model](../../product/model.md)). Since 0.4.0 each component stores its own content as a block document (plain-text paragraphs today) with its latest outcome; one interpretation per generation run is shared by its attempts; manual content establishes no generation success.

**Options:**
- Minimal (key + Context + component content + outcome) — smallest schema; future modules re-derive everything from the key. Fails when re-derivation disagrees with what the user originally meant.
- Standard (+ frozen interpretation per attempt) — reproducible generation history; still cannot distinguish "which Bismarck" across years.
- Rich (+ referent + context snapshot) — future-proof for new modules on old pages; needs a referent model and correction UI (see Q30).

**Answer prompt:** List the stored fields per page/component/attempt. Research task: pick 5 old pages and ask whether a hypothetical new Timeline module could run correctly from stored data alone.

## Q30. How semantic is the object?

**Decision:** (a) main-key string only, (b) key + frozen interpretation, or (c) key + user-correctable meaning/referent + context snapshot?

**Context:** The model calls richer interpretation and semantic corrections "open" and "direction, not guarantee": current interpretation does not establish an enduring, correctable identity ([model](../../product/model.md)). The critique demands the opposite long-term: the system should understand what the object refers to so modules generate appropriate representations ([competitor critique](../../product/competitor-critique.md)).

**Options:**
- (a) String only — simplest; every generation re-interprets from scratch. Ambiguous keys flip meaning between runs.
- (b) Frozen interpretation — stable history; wrong first interpretations are preserved faithfully instead of fixed.
- (c) Correctable referent — the vision's promise; needs identity UX ("did you mean X?"), storage, and a rule for main-key edits (keep referent vs re-interpret).

**Answer prompt:** Pick a–c and write the main-key-edit rule. Research task: capture an ambiguous term (e.g. a place that is also a person), generate twice, and record whether outputs agree.

## Q31. How does deck layout evolution affect existing kartes?

*Superseded by [Q72](#q72-what-is-a-karte-made-of-and-how-is-it-shown); kept as asked against the 0.3.0+ baseline. Since 0.4.0, configuration changes never rewrite existing pages and every generation or retry uses the deck's current configuration ([decks and configuration](../../specs/decks-and-configuration.md#effect-on-pages)).*

**Decision:** When seites/modules are added, removed, reordered, or reconfigured, what happens to kartes already saved under the old layout?

**Context:** Save applies layout to existing kartes today: new seites arrive empty, retained seites keep text, removing saved content needs confirmation against latest account data (README). Seites without triggered modules still exist but render empty; empty is valid, not failure ([modules](../../specs/modules.md)).

**Options:**
- Conform always (current) — every karte matches the live layout; layout edits are implicitly bulk migrations. Needs the confirmation flow to never lose text silently.
- Versioned layouts (kartes pin the layout revision they were generated with) — history is faithful; viewing and generation must handle N layout versions.
- Divergent kartes (kartes may differ from deck layout) — most flexible; deck layout becomes a template, and "which layout made this karte" needs answering everywhere.

**Answer prompt:** Pick the rule and the confirmation matrix (which layout edits need explicit consent). Research task: shrink a deck from 4 seites to 2 with content in the removed seites and record exactly what the user is asked.

## Q32. What is the page lifecycle across decks?

**Decision:** Copy/move semantics between decks, duplicate policy, delete semantics (hard vs trash + restore), and ID stability.

**Context:** Every page belongs to exactly one deck; copy/paste or move into another deck exists in the product description but moving/copying is deferred in scope ([vision/product description](../../../vocabularium-product-description.md), [scope](../../product/scope.md)). Matching main keys never merge identities ([model](../../product/model.md)).

**Options:**
- Copy-only (move = copy + delete) — simplest; new ID + fresh attempts, history stays behind unless explicitly carried.
- True move (ID + history preserved) — needs a rule for components whose module instances the target deck doesn't configure, and receipt continuity.
- Trash + timed purge — safest against accidents; needs retention timers and a purge job.

**Answer prompt:** Define copy vs move field-by-field (ID, attempts, timestamps, receipts) and the delete path. Research task: move a page between decks with different content module instances on paper and decide what its next retry does.

## Q33. What history and provenance is kept?

**Decision:** Per-component edit history, generation attempt log (prompt version, model, timestamp, cost), source URL — how much, how long, visible to whom?

**Context:** Attempts and outcomes are modeled separately from content, but no history UI or retention rule exists; smoke evidence today is ad-hoc JSON samples ([model](../../product/model.md), README smoke sections). Provenance is also the debugging story for "why does this say X?" and the eval story for prompt regressions.

**Options:**
- Attempt log only (latest outcome per component) — minimal; cannot answer "what changed and when".
- Full version history — answers everything; storage growth and a retention/purge policy required.
- Content-only history (edits versioned, attempts summarized) — middle ground; generation debugging stays coarse.

**Answer prompt:** Set the retention periods and visibility (user-visible history vs operator-only logs). Research task: estimate history-table growth at 100 pages/week with full versioning.

## Q34. What are the structural limits?

*Amended by [Q72](#q72-what-is-a-karte-made-of-and-how-is-it-shown): the seite limit became at most 12 content modules per deck. The options are kept as asked against the 0.3.0+ baseline.*

**Decision:** Max content modules per deck, main-key length, page count per deck — and which limits are product rules vs implementation guardrails?

**Context:** Since 0.4.0 a deck has at most 12 content module instances, repeats allowed, with word/sentence previews ([decks and configuration](../../specs/decks-and-configuration.md#configuration)). Page lists load 30 at a time, decks 40. Limits appear in scope and specs, not in one place.

**Options:**
- Keep 1–4 seites + bounded modules — preserves current editor, layout, and migration behavior; revisit only with a layout-migration design.
- Raise caps (e.g. 8 seites) — more expressiveness; every list, editor, and generation-fan-out path must handle the larger shape.
- No product caps, guardrails only — flexible; needs pagination, cost caps, and abuse limits to replace the guardrail function caps served.

**Answer prompt:** Write the numeric limits and where each is enforced (UI, API validation, DB constraint). Research task: create the largest plausible deck/page and record generation cost and dashboard render time.

## Q72. What is a karte made of, and how is it shown?

Added 10 October 2026, after Q29–Q34 were answered. Kept as asked against the 0.3.0+ baseline; implemented in release 0.4.0 ([refactor plan](../../plans/page-component-refactor.md)).

**Decision:** Does an item stay a set of seites defined by the deck layout, or become a page of components that content modules generate one by one and views present?

**Context:** In 0.3.0+, each seite's text joins the outputs of several modules, so generation, retry, and editing work on a whole seite. A module's output can't be retried or edited on its own, and layout changes need positional remapping or pinned revisions (Q31). The seite is also both the content and the face the user flips to.

**Options:**
- Keep seites — no rework; module outputs stay joined, and content and presentation stay coupled.
- Components with pinned layouts — per-module generation and retry; every page still carries its layout revision.
- Components on the live configuration, with views — per-module generation and retry, no pinned revisions, and presentation moves to view modules. Needs a new schema, contract, and editor.

**Answer prompt:** Pick the model, the terms, what happens to existing content, and which view modules are in scope.
