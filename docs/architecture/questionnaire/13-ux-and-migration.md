# 13 — UX and migration (Q67–Q71)

Close with the two decisions that protect everything already built: a UI direction that does not fight the rendering and state choices, and a migration path for what comes after 0.4.0. Q70 was asked when v0.3.0+ data still needed protecting; 0.4.0 discarded that data by owner decision (Q72).

## Q67. When is the distinctive UI direction decided?

**Decision:** Before or after the rendering (Q13), state (Q12), and review (Q52) choices lock? What are the shared UI rules in the meantime?

**Context:** The vision demands a recognizable, deliberately crafted interface while explicitly not prescribing palette, type, or layout — concrete rules belong in a shared UI spec ([vision](../../product/vision.md)). Today: pages in the default view as a plain-text component list, Light/Dark, keyboard interactions, accessible state cues ([scope](../../product/scope.md)). A junior trap is polishing visuals before the editor model (plain text vs rich blocks) and the later view modules (such as the card view) are decided, then restyling twice.

**Options:**
- Direction after editor/state lock — visuals serve the interaction model; slower visual gratification.
- Direction in parallel with a prototype skin — faster feel; risks rework when block editing or review lands.
- No distinctive direction (functional UI ships) — cheapest; contradicts the vision's principle 12 openly, so state the tradeoff.

**Answer prompt:** Pick the timing and the interim shared rules (naming, sentence case, Light/Dark behavior, focus management). Research task: list every current UI string that would change under a new design language vs what is structural.

## Q68. What is the accessibility floor?

**Decision:** Target WCAG level, keyboard-only flows (capture → open → edit → retry without a mouse), and screen-reader behavior for component navigation and generation status.

**Context:** Page rows, the page editor, deck settings, context menus, dialogs, and tooltips carry accessibility labels, renamed in the page/component refactor ([refactor plan](../../history/plans/page-component-refactor.md)). Sort, pagination, and generation states are user-visible and therefore screen-reader-visible.

**Options:**
- WCAG 2.2 AA with keyboard parity — the defensible baseline for a public product; needs an audit and a test pass per release.
- Best-effort (labels maintained, no audit) — matches today; acceptable only while single-owner.
- Audit-driven (third-party or tool-gated CI) — strongest; adds cost and pipeline time.

**Answer prompt:** Set the level and the three keyboard flows that must always work. Research task: drive capture-to-retry keyboard-only with a screen reader and log every dead end.

## Q69. Which languages does the UI speak?

**Decision:** English-only UI vs localized UI (German, Chinese, ...)? Is UI language independent of generated content language?

**Context:** Generated content is multilingual by design with per-language modules and components; the UI itself is English with sentence-case product copy ([product model](../../product/model.md)). Mixing the two (e.g. German UI showing Chinese explanations) is normal for the flagship multilingual user — but only if the separation is deliberate.

**Options:**
- English UI only — simplest; generated content stays multilingual. State whether this holds at 1.0 or is a temporary position.
- Localized UI for N languages — widest reach; needs string externalization, translator workflow, and per-locale testing.
- Partial (key surfaces localized) — middle ground; inconsistent language boundaries confuse unless carefully chosen.

**Answer prompt:** Pick the scope and the string-management process. Research task: extract all UI strings and count them as the localization cost baseline.

## Q70. How long does v0.3.0 compatibility last?

*Kept as asked against the 0.3.0+ baseline. Answered "retire immediately"; release 0.4.0 retired it together with the karte/seite content ([Q72](06-data-and-semantics.md#q72-what-is-a-karte-made-of-and-how-is-it-shown)).*

**Decision:** Retirement condition for: v0.3.0 data and pending saves/receipts, `karte-draft`/`card-draft` fallbacks, old `#card/` links, `/api/cards` aliases and legacy fields, old cursors and content-loss digests.

**Context:** The boundary inventory requires preserving IDs, relationships, content, timestamps, outcomes, and operation IDs across the rename, with fingerprints pinned to original kinds/fields and replay converting on read ([terminology compatibility](../../history/architecture/terminology-compatibility.md)). Retirement explicitly needs a later decision once old installs, pending ops, and saved links no longer need support — receipt compatibility lasts as long as historical receipts are retained.

**Options:**
- Keep until a dated release (e.g. "removed in 0.5.0") — predictable; forces client-upgrade pressure by the date.
- Keep until telemetry shows zero legacy use — data-driven; needs version/terminology-header logging first.
- Keep indefinitely for receipts, dated for clients — splits the durable (fingerprint) from the transient (old builds).

**Answer prompt:** Write one retirement sentence per compat item. Research task: query how many stored receipts and drafts still use legacy fields today.

## Q71. What is built in what order?

**Decision:** Sequence the increments after 0.4.x to minimize rework: hosting/tenancy, opt-in interpretation, module expansion + evals, rich rendering, review/SRS, search/scale.

**Context:** The main key, Context, per-component generation and retry, and the default view shipped in 0.4.0–0.4.1; main-key validation, whitespace rules and edits during active generation are still to specify ([pages and editing](../../specs/pages-and-editing.md)). Building SRS tables before the semantic-object decision, or rich rendering before the editor model, guarantees a second migration.

**Options:**
- Contract-first (tenancy + API + statelessness) → data (interpretation + limits) → modules + evals → rendering → review → search.
- Product-first (modules + evals → rendering) → platform (hosting + tenancy + search + review) — faster visible progress; platform retrofits risk data migrations under live users.
- Slice-by-deck (one end-to-end slice: e.g. hosting + one new module) — motivating demos; architecture coherence needs extra discipline per slice.

**Answer prompt:** Order the items with one-line why-each-waits-for-the-previous. Research task: draw the dependency graph (which increment's output is another's input) and check the order has no cycles.
