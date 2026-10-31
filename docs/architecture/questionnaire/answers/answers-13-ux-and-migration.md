### 67

- Direction after editor/state lock — visuals serve the interaction model; slower visual gratification.

### 68

- WCAG 2.2 AA with keyboard parity — the defensible baseline for a public product; needs an audit and a test pass per release.

### 69

- English UI only — simplest; generated content stays multilingual. State whether this holds at 1.0 or is a temporary position.

**Decision (D14, accepted 22 October 2026):** English-only is a development position, not the 1.0 one. English stays the default language preference, and 1.0 ships with the interface localised into the major languages ([D14](../../traceability-map.md#entries); [shared UI](../../../specs/shared-ui.md#interface-language)). The languages for 1.0 are the six official UN languages, Arabic among them, and the list grows after 1.0 ([K35](../../traceability-map.md#clarifications)); the string process is chosen in the [localisation plan](../../../history/plans/localisation.md).

### 70

- can retire the old condition immediately.

Done in release 0.4.0 together with [Q72](answers-06-data-and-semantics.md#q72): the v0.3.0+ content, receipts and drafts were discarded, and the old dialects, draft fallbacks and links were removed.

### 71

**Decision:** Use vertical-slice development with a small contract-first foundation. Establish the minimum tenancy, API, persistence, migration, and generation-job contracts first; then build end-to-end product slices. Avoid completing entire architectural layers before validating them through a working slice.

**Build order:**

1. **Foundation: hosting + tenancy** — Must come first because all persistent objects, APIs, jobs, and authorization depend on stable account boundaries.
2. **Main-key + Context (+ opt-in interpretation)** — Define page identity and its generation input (main key, Context, and the optional interpretation line from Q30; no referent, resolves C5) before building substantial modules, because generated content and later review state depend on stable page identity. Main key and Context shipped in 0.4.0–0.4.1 with the page/component model (Q72); the opt-in interpretation remains.
3. **First module + evaluation** — Build one complete generation path end-to-end and validate its quality before expanding the module catalog.
4. **Module expansion + evaluation** — Add further modules once the module contract and evaluation process are proven, avoiding repeated changes to the generation architecture.
5. **Rendering/editor** — Refine richer rendering after the content and module contracts are stable, so presentation changes do not force data-model migrations.
6. **Review/SRS** — Add review state after page identity and content semantics are stable; review progress should reference stable pages rather than define their identity.
7. **Search/scale** — Optimize search and infrastructure only after real usage and data volume demonstrate the need.

The implementation should proceed as vertical slices rather than as seven isolated phases. Each slice should be implemented, tested, and evaluated end-to-end before expanding the next capability.