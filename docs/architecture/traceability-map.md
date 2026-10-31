# Traceability map

This map is the entry gate for every decision that changes a specification, whatever its source: a new idea, a direct owner decision, an issue or feature request, a verification or delivery finding, or the [system-design questionnaire](questionnaire/00-overview.md). It follows [from decisions to iterations](../guides/project-workflow.md#from-decisions-to-iterations). Routine fixes that change no specification skip it.

Each decision has one line here and its full text in its own file under [decisions/](decisions/). [D17](decisions/d17-one-request.md) and [D20](decisions/d20-module-pages.md) also keep a longer detail file there.

## Adding an entry

1. **Write the decision file** `decisions/dNN.md` with the next D-number: where it came from (chat summary, issue, finding or questionnaire answer), the decision in full, the affected documents and what changes in each, and its open items.
2. **Check it against the existing entries and the specs.** Record a contradiction as a [conflict](#conflicts) and a missing detail as a [clarification](#clarifications), continuing their numbering: one line here, the full text in [conflicts](decisions/conflicts.md) or [clarifications](decisions/clarifications.md).
3. **Create its Notion decision record** as `Proposed`, and link it.
4. **Add its line** on top of the entries: ID linked to its file, date, one-sentence summary, affected documents, Notion link, status.
5. Once the open items are resolved and the owner accepts the record, **update the specs**, then the status in the line and the file.

A batch of related decisions, such as the questionnaire pass, gets one line here and keeps its per-decision detail in its own file.

**Status values**

- `proposed`: recorded, not yet accepted.
- `accepted`: the owner accepted the Notion record; the specs are not updated yet.
- `partial`: some of the changes are applied; the remainder is named in the decision file.
- `applied`: reflected in the specs, not yet implemented.
- `implemented (x.y.z)`: reflected in the specs and shipped in the named release.
- `in progress`: a batch whose rows have mixed statuses.
- `deferred`, `rejected`, `superseded`: parked, declined, or replaced by the entry named.

## Entries

Newest first.

| ID | Opened | Decision | Affected docs | Notion | Status |
| --- | --- | --- | --- | --- | --- |
| [D24](decisions/d24.md) | 2026-10-30 | A Pronunciation module speaks the main key and a Pronunciation facet on German and Chinese speaks its lines, through ElevenLabs as a second provider kind, with audio stored per component and never cached. | [modules](../specs/modules.md), [capture and generation](../specs/capture-and-generation.md), [pages and editing](../specs/pages-and-editing.md), [generation architecture](generation.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/409bb135020881e79d9aeb6198fb2f5d) | implemented (0.14.0) |
| [D23](decisions/d23.md) | 2026-10-30 | The facet window becomes a card with On this card and Add groups; the account menu sits compactly at the sidebar's foot; decks come above the recent captures. | [pages and editing](../specs/pages-and-editing.md), [decks and configuration](../specs/decks-and-configuration.md), [shared UI](../specs/shared-ui.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/409bb135020881d995bfe97351b98c73) | implemented (0.13.3) |
| [D22](decisions/d22.md) | 2026-10-29 | A Retry after the main key changed reads the new key, facet tags carry no interaction, deck settings have no preview, and deck-settings modules start folded. | [capture and generation](../specs/capture-and-generation.md), [pages and editing](../specs/pages-and-editing.md), [decks and configuration](../specs/decks-and-configuration.md), [modules](../specs/modules.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/408bb1350208815a9d32ca70c2c25437) | implemented (0.13.2) |
| [D21](decisions/d21.md) | 2026-10-29 | The family heading in the module window opens the family page, language names are native, Expertise samples follow the interface language, and Computer Science gains a Python facet. | [modules](../specs/modules.md), [shared UI](../specs/shared-ui.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/408bb135020881b4b2e8cac5754b92ea) | implemented (0.13.1) |
| [D20](decisions/d20.md) | 2026-10-29 | Explanations become family, module and facet pages in one side sheet with a path and samples a user can choose ([detail](decisions/d20-module-pages.md)). | [modules](../specs/modules.md), [shared UI](../specs/shared-ui.md), [pages and editing](../specs/pages-and-editing.md), [decks and configuration](../specs/decks-and-configuration.md), [generation](generation.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/408bb13502088178989be16624f29b14) | implemented (0.13.0) |
| [D19](decisions/d19.md) | 2026-10-29 | A Retry of a content card sends its saved core as the previous reading, so the reading stays unless the main key changed. | [capture and generation](../specs/capture-and-generation.md), [generation](generation.md), [modules](../specs/modules.md), [golden sets](../../tests/golden/), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/407bb135020881ddbb7ff37a32846f93) | implemented (0.12.2) |
| [D18](decisions/d18.md) | 2026-10-28 | A facet the flags rule out keeps an unavailable Retry instead of a note, and the module's ⓘ becomes a button. | [modules](../specs/modules.md), [pages-and-editing](../specs/pages-and-editing.md), [shared-ui](../specs/shared-ui.md) | [Notion](https://app.notion.com/p/407bb135020881a6af5aea33462d1314) | implemented (0.12.1) |
| [D17](decisions/d17.md) | 2026-10-27 | Each content module writes its card in one request, core with flags first, with no shared interpretation and no caching ([detail](decisions/d17-one-request.md)). | [modules](../specs/modules.md), [capture and generation](../specs/capture-and-generation.md), [pages and editing](../specs/pages-and-editing.md), [shared UI](../specs/shared-ui.md), [generation](generation.md), [golden sets](../../tests/golden/), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/407bb135020881ca86dbc12727814bf1) | implemented (0.12.0) |
| [D16](decisions/d16.md) | 2026-10-24 | The Expertise modules write for keys of their subject and say plainly when a key is outside it, with three relevance cases. | [modules](../specs/modules.md), [golden sets](../../tests/golden/), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/403bb135020881dc9900e1af062d1444) | implemented (0.11.0) |
| [D15](decisions/d15.md) | 2026-10-23 | The Expertise family writes in the interface language through a writing guide per language, with English the only prompt. | [modules](../specs/modules.md), [guards](generation.md), [shared-ui](../specs/shared-ui.md), [localisation plan](../history/plans/localisation.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/402bb1350208817bab51f8c34cc16bde) | implemented (0.10.0) |
| [D14](decisions/d14.md) | 2026-10-22 | The interface is English by default and localised into the major languages as a language preference independent of the modules. | [shared-ui](../specs/shared-ui.md), [scope](../product/scope.md), [modules](../specs/modules.md), [Q69 answer](questionnaire/answers/answers-13-ux-and-migration.md) | [Notion](https://app.notion.com/p/401bb135020881fc9109db55cdb88e68) | implemented (0.9.0) |
| [D13](decisions/d13.md) | 2026-10-22 | Facets are chosen in a facet window opened from the parent, not in the module window, and modules and facets get explanations. | [pages-and-editing](../specs/pages-and-editing.md), [shared-ui](../specs/shared-ui.md), [decks-and-configuration](../specs/decks-and-configuration.md), [modules](../specs/modules.md), [generation architecture](generation.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/401bb1350208811e8dc8d3a43ea8c82d) | implemented (0.8.1) |
| [D12](decisions/d12.md) | 2026-10-18 | Proposed folded empty components and a facet popover in the eject menu; rejected, partly revived by D13. | — (nothing applied) | [Notion](https://app.notion.com/p/3fdbb1350208812b8f0bc417a13de4b5) | rejected |
| [D11](decisions/d11.md) | 2026-10-18 | Every module is defined in one catalog of family folders with composed prompts, behind a swappable provider. | [model](../product/model.md), [modules](../specs/modules.md), [capture-and-generation](../specs/capture-and-generation.md), [shared-ui](../specs/shared-ui.md), [design tokens](../../extension/design/tokens.json), [observability](observability.md), [generation architecture](generation.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3fdbb1350208817fb21dee9df9b77d9f) | implemented (0.8.0) |
| [D10](decisions/d10.md) | 2026-10-17 | The parent editor formats through a toolbar and shows typed markdown characters literally. | [pages-and-editing](../specs/pages-and-editing.md), [capture-and-generation](../specs/capture-and-generation.md), [modules](../specs/modules.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3fcbb1350208816893e5c360ce20a4d1) | implemented (0.7.5) |
| [D09](decisions/d09.md) | 2026-10-16 | A parent's content is structured data, a core and one container per facet, generated as one JSON object per parent. | [model](../product/model.md), [modules](../specs/modules.md), [capture-and-generation](../specs/capture-and-generation.md), [pages-and-editing](../specs/pages-and-editing.md), [shared-ui](../specs/shared-ui.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3fbbb1350208815d824fdc86b10b1c34) | implemented (0.7.4) |
| [D08](decisions/d08.md) | 2026-10-14 | Content modules become parents with a required core and optional facets, and word/phrase or sentence changes how a module works. | [model](../product/model.md), [modules](../specs/modules.md), [capture-and-generation](../specs/capture-and-generation.md), [decks-and-configuration](../specs/decks-and-configuration.md), [pages-and-editing](../specs/pages-and-editing.md), [shared-ui](../specs/shared-ui.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f9bb1350208817aa875f24f9fa3c04e) | implemented (0.7.0) |
| [D07](decisions/d07.md) | 2026-10-12 | Cards and deck-settings modules drag by their label, and a card's actions eject from its tab instead of appearing on hover. | [pages-and-editing](../specs/pages-and-editing.md), [shared-ui](../specs/shared-ui.md), [decks-and-configuration](../specs/decks-and-configuration.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f7bb13502088136ae16f244b055cc74) | implemented (0.6.3) |
| [D06](decisions/d06.md) | 2026-10-12 | A deck's colour is chosen from the six family colours, and empty components are shown consistently. | [decks-and-configuration](../specs/decks-and-configuration.md), [pages-and-editing](../specs/pages-and-editing.md), [capture-and-generation](../specs/capture-and-generation.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f7bb13502088165a5cbf9c41f215f82) | implemented (0.6.2) |
| [D05](decisions/d05.md) | 2026-10-12 | The Sage identity: Index Tabs on a sage ground, a Moss night dark theme, six module families colouring the tabs, bundled fonts. | [shared-ui](../specs/shared-ui.md), [pages-and-editing](../specs/pages-and-editing.md), [decks-and-configuration](../specs/decks-and-configuration.md), [capture-and-generation](../specs/capture-and-generation.md), [modules](../specs/modules.md), [model](../product/model.md), [vision](../product/vision.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f6bb1350208816d9e9bfc91c7f1c77d) | implemented (0.6.0) |
| [D04](decisions/d04.md) | 2026-10-11 | Each card has Edit, Generate or Retry and Delete, the page is shaped by dragging, and Delete page moves to the header. | [pages-and-editing](../specs/pages-and-editing.md), [shared-ui](../specs/shared-ui.md), [decks-and-configuration](../specs/decks-and-configuration.md), [capture-and-generation](../specs/capture-and-generation.md), [modules](../specs/modules.md), [model](../product/model.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f6bb13502088109beeac9f9ab018f77) | implemented (0.5.1) |
| [D03](decisions/d03.md) | 2026-10-10 | The modules that repeated the main key are retired and their instances and components deleted on upgrade. | [modules](../specs/modules.md), [capture-and-generation](../specs/capture-and-generation.md), [pages-and-editing](../specs/pages-and-editing.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f5bb135020881d2912fc6c131f3b212) | implemented (0.5.0) |
| [D02](decisions/d02.md) | 2026-10-10 | The deck configuration is a template for page creation; afterwards each page owns, rearranges and extends its modules. | [model](../product/model.md), [pages-and-editing](../specs/pages-and-editing.md), [decks-and-configuration](../specs/decks-and-configuration.md), [capture-and-generation](../specs/capture-and-generation.md), [modules](../specs/modules.md), [shared-ui](../specs/shared-ui.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f5bb135020881069696d21721f0fabe) | implemented (0.5.0) |
| [D01](decisions/d01.md) | 2026-10-10 | Spec-changing decisions go through this map into iterations; specs describe accepted behaviour and scope is the status ledger. | [project-workflow](../guides/project-workflow.md), [AGENTS.md](../../AGENTS.md), [Change skill](../../.agents/skills/vocabularium-change/SKILL.md), [scope](../product/scope.md) | [Notion](https://app.notion.com/p/3f5bb1350208811eb979e191599f0e62) | partial |
| Q01–Q72 | 2026-10-04 | The 1.0 architecture, one answer per question, mapped in the [questionnaire pass](questionnaire/spec-mapping.md). | [map by document](questionnaire/spec-mapping.md#map-by-document) | [one record per answer file](questionnaire/spec-mapping.md#notion-context) | in progress (Q34, Q45, Q70, Q72 implemented in 0.4.0) |

## Conflicts

Contradictions between entries, or between an entry and the specs; all are resolved or not pursued. Numbering continues across entries; new conflicts go on top. The full contradiction and resolution of each are in [conflicts](decisions/conflicts.md).

| ID | Conflict and resolution |
| --- | --- |
| [C33](decisions/conflicts.md#c33) | Every facet is markdown versus audio — RESOLVED (D24: text stays markdown, audio attached) |
| [C32](decisions/conflicts.md#c32) | One pinned model versus a speech provider — RESOLVED (D24: one pinned model per provider kind) |
| [C31](decisions/conflicts.md#c31) | No partial success within a component versus audio that fills in later — RESOLVED (D24: per-clip success for audio only) |
| [C29](decisions/conflicts.md#c29) | Explanations in a dialog and beneath a facet-window row versus pages in one sheet — RESOLVED (D20: pages in one sheet) |
| [C30](decisions/conflicts.md#c30) | The deck-settings preview's sample versus the retired 幸福 sample — RESOLVED (D20: the new samples in the interface language) |
| [C28](decisions/conflicts.md#c28) | A Retry that keeps the card's reading versus D17's "nothing from an earlier attempt is reused" — RESOLVED (D19: the reading is a hint, never the text) |
| [C27](decisions/conflicts.md#c27) | A Formula facet versus D16's rejected formula control flow — RESOLVED (D17: an opt-in facet for subject keys) |
| [C26](decisions/conflicts.md#c26) | One interpretation per run versus a classification per Languages card — RESOLVED (D17: per card, in its header) |
| [C25](decisions/conflicts.md#c25) | A module already on the page marked in the window versus no mark — RESOLVED (D13: no mark) |
| [C24](decisions/conflicts.md#c24) | Facets in the module window versus facets chosen on the parent — RESOLVED (D13: a facet window on the parent; first raised by D12, rejected) |
| [C23](decisions/conflicts.md#c23) | An empty component as only its tab versus folded — NOT PURSUED (D12 rejected) |
| [C22](decisions/conflicts.md#c22) | Live markdown formatting versus a toolbar editor — RESOLVED (D10: toolbar, no markdown in the editor) |
| [C21](decisions/conflicts.md#c21) | Render-only parsing versus structured content — RESOLVED (D09: structured content) |
| [C20](decisions/conflicts.md#c20) | Generation inputs versus a second parent of the same type — RESOLVED (D08: independent generation) |
| [C19](decisions/conflicts.md#c19) | Module applicability versus the always-applicable core — RESOLVED (D08) |
| [C18](decisions/conflicts.md#c18) | Six module families versus the Translation family — RESOLVED (D08: Translation is a seventh family) |
| [C17](decisions/conflicts.md#c17) | Plain-text content versus rendered structure — RESOLVED (D05: render-only parsing); superseded for parent modules by D09 ([C21](#conflicts)) |
| [C16](decisions/conflicts.md#c16) | Capture with Context setting versus the Context module — RESOLVED (D02) |
| [C15](decisions/conflicts.md#c15) | Live deck configuration versus page-owned modules — RESOLVED (D02) |
| [C14](decisions/conflicts.md#c14) | Karte/seite model versus per-module generation — RESOLVED (Q72: deck → page → component) |
| [C13](decisions/conflicts.md#c13) | Diagnostic content retention — RESOLVED (full content is development-only) |
| [C1](decisions/conflicts.md#c1) | Rich rendering — RESOLVED (option B: blocks at 1.0) |
| [C2](decisions/conflicts.md#c2) | Identity provider — RESOLVED (OAuth + passkeys at 1.0) |
| [C3](decisions/conflicts.md#c3) | Client and platform list — RESOLVED (Chrome, Firefox, web app at 1.0) |
| [C4](decisions/conflicts.md#c4) | Version compatibility and updates — RESOLVED (N−1 window + store auto-update) |
| [C5](decisions/conflicts.md#c5) | Semantic referent — RESOLVED (string only by default; opt-in interpretation line) |
| [C6](decisions/conflicts.md#c6) | Automatic retry — RESOLVED (invisible infrastructure retry, explicit user retry) |
| [C7](decisions/conflicts.md#c7) | Accessibility and performance — RESOLVED (WCAG 2.2 AA + latency targets) |
| [C8](decisions/conflicts.md#c8) | Generation-quality evaluation — RESOLVED (owner-reviewed golden set per module) |
| [C9](decisions/conflicts.md#c9) | Quotas and metering — RESOLVED |
| [C10](decisions/conflicts.md#c10) | Sharing versus ordering and tenancy — RESOLVED (sharing deferred) |
| [C11](decisions/conflicts.md#c11) | Attempt history — RESOLVED (current content only + usage ledger) |
| [C12](decisions/conflicts.md#c12) | Compliance level — RESOLVED (store-minimum + GDPR baseline) |

## Clarifications

Smaller gaps. They do not block a spec, but the spec contains a placeholder until they are answered. Numbering continues across entries; K1–K15 came from the questionnaire pass. The question and answer of each are in [clarifications](decisions/clarifications.md).

**Open or deferred**

| ID | Source | Status | Missing |
| --- | --- | --- | --- |
| [K29](decisions/clarifications.md#k29) | D11 | deferred | Other modalities (images, notation) beyond text and audio. |
| [K1](decisions/clarifications.md#k1) | Q52 | open | Leitner review at 1.0, even though Q03 names capture + modules as the flagship and the vision rejects flashcard-centrism. Is review in 1.0 or only post-1.0? (Q71 puts it at step 6.) |
| [K2](decisions/clarifications.md#k2) | Q09 / Q14 | open | Offline: captures queue (Q09), but reads require the backend (Q14). Confirm the split: write queue offline, no offline reads. |
| [K3](decisions/clarifications.md#k3) | Q60 / Q08 | open | "External processing only when the user explicitly requests generation." Does a capture into a deck with generative content modules count as that request? |
| [K4](decisions/clarifications.md#k4) | Q46 | open | Which provider and model serve production? OpenCode Go is development-only (C12); the production provider must offer a DPA and terms that cover user content. |
| [K5](decisions/clarifications.md#k5) | Q62 / Q22 | open | Prometheus-style scraping does not fit scale-to-zero functions. Push-based metrics or the vendor's metrics instead? |
| [K6](decisions/clarifications.md#k6) | Q57 | open | Q02 (public internet) suggests the public-service threat model (CSRF, session theft, DDoS). Q58 already includes CSRF. Confirm the level. |
| [K7](decisions/clarifications.md#k7) | Q39 | open | Retention periods per data class (usage ledger, receipts, logs, backups). Q32 proposes 30 days for trash; C11 proposes ~13 months for the usage ledger. |
| [K8](decisions/clarifications.md#k8) | Q65 | open | Hosting budget at 100/1k/10k users. Monthly provider-call allowance per account (unit and rules fixed by C9). |
| [K9](decisions/clarifications.md#k9) | Q66 | open | RPO 24h / RTO 4h were given as examples ("e.g."). Confirm them. Neon point-in-time recovery (PITR, Q23) allows a much lower RPO. |
| [K11](decisions/clarifications.md#k11) | Q55 | open | "Low thousands" of pages per account. Confirm this is per account, with ~500 accounts in total (Q02). |
| [K12](decisions/clarifications.md#k12) | Q22 | open | Experiment still pending: cold start + 60s generation within the Vercel plan's function limit. |
| [K13](decisions/clarifications.md#k13) | Q17 / Q58 | open | Which OAuth providers (Google, Apple, GitHub…)? Does signing in with a new provider using the same verified email link to the existing account? How does a user recover an account after losing every passkey and provider access? |
| [K14](decisions/clarifications.md#k14) | Q30 | open | Interpretation setting: account-level or per deck? Length cap for the line? Is the line flagged as possibly stale after a main-key or Context edit? |

**Resolved:** [K10](decisions/clarifications.md#k10), [K15](decisions/clarifications.md#k15), [K16](decisions/clarifications.md#k16), [K17](decisions/clarifications.md#k17), [K18](decisions/clarifications.md#k18), [K19](decisions/clarifications.md#k19), [K20](decisions/clarifications.md#k20), [K21](decisions/clarifications.md#k21), [K22](decisions/clarifications.md#k22), [K23](decisions/clarifications.md#k23), [K24](decisions/clarifications.md#k24), [K25](decisions/clarifications.md#k25), [K26](decisions/clarifications.md#k26), [K27](decisions/clarifications.md#k27), [K28](decisions/clarifications.md#k28), [K30](decisions/clarifications.md#k30), [K31](decisions/clarifications.md#k31), [K32](decisions/clarifications.md#k32), [K33](decisions/clarifications.md#k33), [K34](decisions/clarifications.md#k34), [K35](decisions/clarifications.md#k35), [K36](decisions/clarifications.md#k36), [K37](decisions/clarifications.md#k37), [K38](decisions/clarifications.md#k38), [K39](decisions/clarifications.md#k39), [K40](decisions/clarifications.md#k40), [K41](decisions/clarifications.md#k41), [K42](decisions/clarifications.md#k42), [K43](decisions/clarifications.md#k43), [K44](decisions/clarifications.md#k44), [K45](decisions/clarifications.md#k45), [K46](decisions/clarifications.md#k46), [K47](decisions/clarifications.md#k47), [K48](decisions/clarifications.md#k48), [K49](decisions/clarifications.md#k49), [K50](decisions/clarifications.md#k50), [K52](decisions/clarifications.md#k52), [K53](decisions/clarifications.md#k53), [K54](decisions/clarifications.md#k54), [K55](decisions/clarifications.md#k55), [K56](decisions/clarifications.md#k56), [K57](decisions/clarifications.md#k57), [K58](decisions/clarifications.md#k58), [K59](decisions/clarifications.md#k59), [K60](decisions/clarifications.md#k60), [K61](decisions/clarifications.md#k61), [K62](decisions/clarifications.md#k62), [K63](decisions/clarifications.md#k63), [K64](decisions/clarifications.md#k64), [K65](decisions/clarifications.md#k65), [K66](decisions/clarifications.md#k66), [K68](decisions/clarifications.md#k68), [K69](decisions/clarifications.md#k69), [K70](decisions/clarifications.md#k70), [K71](decisions/clarifications.md#k71), [K72](decisions/clarifications.md#k72), [K73](decisions/clarifications.md#k73), [K74](decisions/clarifications.md#k74), [K75](decisions/clarifications.md#k75), [K76](decisions/clarifications.md#k76), [K77](decisions/clarifications.md#k77).
