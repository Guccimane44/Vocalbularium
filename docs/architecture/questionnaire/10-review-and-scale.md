# 10 — Review and scale (Q52–Q56)

Memorization is optional by design — the vision says collection and reference must stay useful without review. If review ships at 1.0, its tables and interaction logs must be designed now, not bolted onto a schema that assumed kartes are never studied.

## Q52. Is spaced review in 1.0?

**Decision:** Ship review at 1.0 or keep collection/reference only? If yes: SM-2, FSRS, or simpler Leitner? Opt-in at deck or karte level?

**Context:** Memorization settings, spaced repetition, and study workflows are deferred; the deck defines whether memorization is enabled but nothing consumes that flag yet ([scope](../product/scope.md), [product description](../../vocabularium-product-description.md)). Karte identity is independent of any study interaction ([model](../product/model.md)).

**Options:**
- No review at 1.0 — keeps schema and UX focused; state the schema reservation (see Q53) so review does not force a rewrite later.
- Leitner boxes — simplest correct scheduler; coarse but explainable and easy to eval.
- FSRS/SM-2 — best scheduling; needs per-review logging (grade, latency, timestamp) and parameter storage from day one.

**Answer prompt:** Pick one and define the reviewable unit (front seite → rest? per seite?). Research task: read the FSRS data requirements and list the columns review would add to the schema.

## Q53. What does a study interaction record?

**Decision:** If review exists: what is logged per review (grade, latency, lapses, session), does review mutate the karte or separate progress tables, and how are stats aggregated?

**Context:** Generation attempts/outcomes are already separated from content; study interactions need the same separation so reviewing never rewrites what the user saved ([model](../product/model.md)). No review tables exist today.

**Options:**
- Separate progress tables (reviews reference karte/seite IDs) — cleanest; karte content and study state evolve independently.
- Columns on kartes (next-due, interval, ease) — simplest queries; mixes concerns and complicates layout moves/copies.
- Event log + materialized stats — most auditable; needs aggregation jobs and staleness rules.

**Answer prompt:** Sketch the tables/events and the deck-move/copy rule for progress. Research task: move a karte between decks on paper under each option and decide whether its schedule follows it.

## Q54. How are large libraries organized?

**Decision:** Decks only, or also tags, folders, filters (by module, language, failed generation, empty seite), and saved searches?

**Context:** Decks are the primary repository concept; every karte belongs to exactly one deck ([product description](../../vocabularium-product-description.md)). Beyond deck browsing, sorting, and opening kartes, no organization primitives exist ([scope](../product/scope.md)).

**Options:**
- Decks only — matches today; large libraries become long lists that need search to stay usable (see Q37).
- Decks + tags — flexible cross-cutting; needs tag storage, rename/merge, and filter UI.
- Decks + folders + saved filters — most structure; most navigation and move semantics to design.

**Answer prompt:** List the primitives and the move/copy interaction with Q32. Research task: take a 500-karte library and test whether decks-alone lets a user find any karte in under 30 seconds.

## Q55. What are the scale and latency budgets?

**Decision:** Design targets: kartes per account (hundreds, 10k, 100k?), decks per account, and latency budgets (dashboard open, capture receipt, generation p50/p95).

**Context:** Bounded reads exist (30 kartes, 40 decks, detail on open) with explicit sort semantics, but no scale target or latency budget is stated (README). Queue bounds and pool sizing assume modest concurrency ([local-postgresql](local-postgresql.md)).

**Options:**
- Single-owner scale (low thousands) — current pagination suffices; budgets stay tight and cheap to meet.
- Power-user scale (100k kartes) — needs virtualized lists, indexed search, and generation backpressure designed now.
- No stated target — fastest; performance becomes incident-driven later.

**Answer prompt:** Write the numeric targets and budgets. Research task: seed 10k synthetic kartes and record dashboard open, sort, and page-turn latency.

## Q56. How is generation backpressure communicated?

**Decision:** When the queue is full or the provider is slow, what does the user see and what can they do (wait, cancel, retry later)?

**Context:** Active/waiting seite attempts are bounded (4/16 defaults); provider calls run outside transactions; rejected saves are not queued ([README](../../README.md), [local-postgresql](local-postgresql.md)). No user-facing queue position or cancellation exists.

**Options:**
- Silent queue (current) — attempts start when capacity frees; users cannot tell stuck from slow.
- Visible queue (position, ETA, cancel) — transparent; needs attempt state broadcasting and cancellation semantics (does cancel refund quota?).
- Refuse-fast with retry-later — clearest backpressure; capture-heavy sessions hit walls during bursts.

**Answer prompt:** Pick the UX and the cancellation rule. Research task: fill the queue in dev and screenshot every state a user can observe.
