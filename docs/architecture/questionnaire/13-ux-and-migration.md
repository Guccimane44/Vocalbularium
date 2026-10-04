# 13 — UX and migration (Q67–Q71)

Close with the two decisions that protect everything already built: a UI direction that does not fight the rendering and state choices, and a migration path that never strands v0.3.0 data.

## Q67. When is the distinctive UI direction decided?

**Decision:** Before or after the rendering (Q13), state (Q12), and review (Q52) choices lock? What are the shared UI rules in the meantime?

**Context:** The vision demands a recognizable, deliberately crafted interface while explicitly not prescribing palette, type, or layout — concrete rules belong in a shared UI spec ([vision](../product/vision.md)). Today: plain-text content, Light/Dark, keyboard interactions, accessible state cues ([scope](../product/scope.md)). A junior trap is polishing visuals before the editor model (whole-seite vs blocks) is decided, then restyling twice.

**Options:**
- Direction after editor/state lock — visuals serve the interaction model; slower visual gratification.
- Direction in parallel with a prototype skin — faster feel; risks rework when block editing or review lands.
- No distinctive direction (functional UI ships) — cheapest; contradicts the vision's principle 12 openly, so state the tradeoff.

**Answer prompt:** Pick the timing and the interim shared rules (naming, sentence case, Light/Dark behavior, focus management). Research task: list every current UI string that would change under a new design language vs what is structural.

## Q68. What is the accessibility floor?

**Decision:** Target WCAG level, keyboard-only flows (capture → open → edit → retry without a mouse), and screen-reader behavior for seite navigation and generation status.

**Context:** Karte rows, editors, configuration controls, context menus, dialogs, and tooltips already carry accessibility labels through the terminology migration ([migration plan](../plans/v0.3.0-plus-terminology-migration.md)). Sort, pagination, and generation states are user-visible and therefore screen-reader-visible.

**Options:**
- WCAG 2.2 AA with keyboard parity — the defensible baseline for a public product; needs an audit and a test pass per release.
- Best-effort (labels maintained, no audit) — matches today; acceptable only while single-owner.
- Audit-driven (third-party or tool-gated CI) — strongest; adds cost and pipeline time.

**Answer prompt:** Set the level and the three keyboard flows that must always work. Research task: drive capture-to-retry keyboard-only with a screen reader and log every dead end.

## Q69. Which languages does the UI speak?

**Decision:** English-only UI vs localized UI (German, Chinese, ...)? Is UI language independent of generated content language?

**Context:** Generated content is multilingual by design with per-language modules and seites; the UI itself is English with sentence-case product copy ([migration plan](../plans/v0.3.0-plus-terminology-migration.md)). Mixing the two (e.g. German UI showing Chinese explanations) is normal for the flagship multilingual user — but only if the separation is deliberate.

**Options:**
- English UI only — simplest; generated content stays multilingual. State whether this holds at 1.0 or is a temporary position.
- Localized UI for N languages — widest reach; needs string externalization, translator workflow, and per-locale testing.
- Partial (key surfaces localized) — middle ground; inconsistent language boundaries confuse unless carefully chosen.

**Answer prompt:** Pick the scope and the string-management process. Research task: extract all UI strings and count them as the localization cost baseline.

## Q70. How long does v0.3.0 compatibility last?

**Decision:** Retirement condition for: v0.3.0 data and pending saves/receipts, `karte-draft`/`card-draft` fallbacks, old `#card/` links, `/api/cards` aliases and legacy fields, old cursors and content-loss digests.

**Context:** The boundary inventory requires preserving IDs, relationships, content, timestamps, outcomes, and operation IDs across the rename, with fingerprints pinned to original kinds/fields and replay converting on read ([terminology compatibility](terminology-compatibility.md)). Retirement explicitly needs a later decision once old installs, pending ops, and saved links no longer need support — receipt compatibility lasts as long as historical receipts are retained.

**Options:**
- Keep until a dated release (e.g. "removed in 0.5.0") — predictable; forces client-upgrade pressure by the date.
- Keep until telemetry shows zero legacy use — data-driven; needs version/terminology-header logging first.
- Keep indefinitely for receipts, dated for clients — splits the durable (fingerprint) from the transient (old builds).

**Answer prompt:** Write one retirement sentence per compat item. Research task: query how many stored receipts and drafts still use legacy fields today.

## Q71. What is built in what order?

**Decision:** Sequence the post-migration increments to minimize rework: main-key implementation, hosting/tenancy, semantic referent, module expansion + evals, rich rendering, review/SRS, search/scale.

**Context:** Main-key behavior is accepted but pending, with open implementation details (generation action, button label, replacement policy, whitespace rules, active-generation interplay, compat for input-less manual kartes) ([kartes-and-editing](../specs/kartes-and-editing.md)). The model warns these rules do not select the UI or policy by themselves. Building SRS tables before the semantic-object decision, or rich rendering before the editor model, guarantees a second migration.

**Options:**
- Contract-first (tenancy + API + statelessness) → data (referent + limits) → main-key → modules + evals → rendering → review → search.
- Product-first (main-key → modules + evals → rendering) → platform (hosting + tenancy + search + review) — faster visible progress; platform retrofits risk data migrations under live users.
- Slice-by-deck (one end-to-end slice: e.g. hosting + main-key + one new module) — motivating demos; architecture coherence needs extra discipline per slice.

**Answer prompt:** Order the seven items with one-line why-each-waits-for-the-previous. Research task: draw the dependency graph (which increment's output is another's input) and check the order has no cycles.
