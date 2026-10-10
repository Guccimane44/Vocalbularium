# Questionnaire pass: answers to specs

This file maps each answer of the [system-design questionnaire](00-overview.md) (Q01–Q72) to the specifications it changes. It is one batch in the [traceability map](../traceability-map.md#entries): the map holds the batch's entry, the conflicts and the clarifications; this file holds the per-question detail. Once every row is applied, implemented, deferred or superseded, the file is history like the answers. It reflects release 0.4.1 (10 October 2026). The answers live in [answers/](answers/).

**Status values**

- `implemented (0.4.x)`: reflected in the specs and shipped in the named release.
- `applied`: reflected in the specs, not yet implemented.
- `partial`: some of it is applied; the remainder is named in the row.
- `ready`: the answer is clear enough to write into the specs.
- `blocked Cn`: the answer conflicts with another answer; resolve [conflict](../traceability-map.md#conflicts) *Cn* first.
- `open`: the answer leaves a sub-question unanswered (see [clarifications](../traceability-map.md#clarifications)).
- `deferred`: deliberately parked.
- `no change`: confirms current behavior.
- `superseded`: replaced by a later answer named in the row.

---

## Notion context

Checked 9 October 2026 and again on 10 October 2026, after release 0.4.1, against the [Vocabularium Notion hub](https://app.notion.com/p/3e3bb1350208800f9b5ad907c80156d2). Notion holds decision status and approval history; this map and the specs hold the content.

**Decision records for the answers.** Each answer file has one record in [Decision logs](https://app.notion.com/p/3eabb13502088075bd17d8278a9346a7), created 9 October 2026 as `Proposed` (modules as `Deferred`). On 10 October 2026 all of them were still `Proposed` or `Deferred`; only the Q72 record is `Implemented`. Moving a record to `Accepted` with a decision date is what lets its answers enter the specs as accepted behavior (see R1).

| Answers | Decision record |
| --- | --- |
| 01 (Q01–Q05) | [1.0 maturity gate and scope](https://app.notion.com/p/3f4bb1350208815fafb8f856f1a185d1) |
| 02 (Q06–Q10) | [Clients and capture contract at 1.0](https://app.notion.com/p/3f4bb13502088120a994cb6ab8fe6d5c) |
| 03 (Q11–Q16) | [Frontend architecture, block rendering and compatibility](https://app.notion.com/p/3f4bb13502088117b4cbf12e01f915ff) |
| 04 (Q17–Q21) | [Accounts on a hosted hub with OAuth and passkeys](https://app.notion.com/p/3f4bb135020881ec85beca3cd7941578) |
| 05 (Q22–Q28) | [Serverless backend on Vercel and Neon](https://app.notion.com/p/3f4bb135020881229bcedba0bd6dce7c) |
| 06 (Q29–Q34) | [Karte data model](https://app.notion.com/p/3f4bb13502088159bf3fef8135989e73) (title still uses karte terms; see [pending Notion updates](#pending-notion-updates)) |
| 06 (Q72) | [Replace deck → karte → seite with deck → page → component](https://app.notion.com/p/3f4bb1350208812e8085ffd751302842) (Accepted 9 October 2026; revision approved 10 October 2026; Implemented in 0.4.0, [#81](https://github.com/Guccimane44/Vocalbularium/issues/81)) |
| 07 (Q35–Q39) | [Database tenancy, migrations, search, portability and retention](https://app.notion.com/p/3f4bb1350208815ca1bbef7c49b681fe) |
| 08 (Q40–Q45) | [Module catalog and customization](https://app.notion.com/p/3f4bb1350208813ab814f53fd24d5021) (Deferred; Q45 is answered by Q72) |
| 09 (Q46–Q51) | [Generation](https://app.notion.com/p/3f4bb135020881acb220c5a11218f727) |
| 10 (Q52–Q56) | [Leitner review, tags, scale targets and visible queue](https://app.notion.com/p/3f4bb1350208815d9354dc184a658a37) |
| 11 (Q57–Q61) | [Security and privacy baseline](https://app.notion.com/p/3f4bb13502088130b5d8d4e1f1c40cc3) |
| 12 (Q62–Q66) | [Operations](https://app.notion.com/p/3f4bb13502088125bf60fffb37849daa) |
| 13 (Q67–Q71) | [UX direction, accessibility, UI language, legacy retirement and build order](https://app.notion.com/p/3f4bb135020881de8fe7ceab72600210) |

**Existing records that affect this map**

- [Organize specifications by stable capabilities and document authority](https://app.notion.com/p/3eabb1350208813d8d43de81415c5ab0) (In Review). It defines the target taxonomy (the empty placeholder files come from it) and its authority rules. R1–R3 below amend this record rather than start fresh.
- [Retain correlated local diagnostics until explicit cleanup](https://app.notion.com/p/3ecbb1350208818b8156f754e52d4e4a) (Implemented, 2 October 2026). It conflicted with Q39/Q63; C13 narrows it to development diagnostics. Its spec and code from `codex/logging-system` are merged into this branch.
- [Adopt deck → karte → seite](https://app.notion.com/p/3eabb1350208813da027f7ea00548851) (Superseded) and the 0.3.0+ milestone promise replay and recovery compatibility. Q70 retires that promise. The record is Superseded by the [Q72 decision](https://app.notion.com/p/3f4bb1350208812e8085ffd751302842).
- System Q&A [hash vs path routing](https://app.notion.com/p/3eabb1350208818fa8f2f53955da5d71) applies to the Q11 web shell; its note on preserving old links becomes stale under Q70.
- Milestone [System design questionnaire](https://app.notion.com/p/3efbb135020881e7a6e7d72f4199ab64) tracks this work.

### Pending Notion updates

Proposed on 10 October 2026, to apply after the owner approves the pull request that brings this map to 0.4.1:

- Retitle the Q29–Q34 record to page/component terms and note that Q31 is superseded and Q29, Q32 and Q34 are amended by Q72.
- Point each answer record's Specification link at `main` instead of commit `79238de`.
- On the modules record, note that Q45 is answered by Q72 while Q40–Q44 stay deferred.


---

## Refactor decisions

These decisions concern the structure of the docs, not the product. They amend the [taxonomy record](https://app.notion.com/p/3eabb1350208813d8d43de81415c5ab0); settle them, then move that record out of In Review before editing specs.

**R1. How do specs describe the 1.0 target and the current implementation?** *Settled 10 October 2026 (option A: specs describe accepted behavior; scope is the status ledger). See [from decisions to iterations](../../guides/project-workflow.md#from-decisions-to-iterations) and the [Notion decision record](https://app.notion.com/p/3f5bb1350208811eb979e191599f0e62).*
The taxonomy record says current specs describe *accepted* behavior, [scope](../../product/scope.md) lists supported and deferred capabilities, and proposals stay in plans or issues. The answers reverse almost every item in scope's *Explicit deferrals* (multi-user accounts, web/Firefox clients, deck moves, review, store distribution, public hosting, quality evaluation, usage limits).
*Decision:* once a decision record above is `Accepted`, its answers count as accepted behavior and enter the specs, even before implementation. [scope](../../product/scope.md) becomes a status ledger: each capability is marked `implemented`, `accepted for 1.0`, `post-1.0`, or `out at maturity` (Q04). Records still `Proposed` stay out of the specs.

**R2. What happens to [Select and Add](../../MVP-Product-spec-select-and-add.md)?** *Settled by the taxonomy record.*
Move it into [capture-and-generation](../../specs/capture-and-generation.md), keeping its authority over generation, failure, interruption and retry rules; other specs link to those rules instead of repeating them. Then rewrite it against Q08/Q09/Q24/Q25/Q46–Q51/Q56. Remaining choice: leave a redirect stub or move the old file to `docs/history/`.

**R3. Which new docs are needed?** The taxonomy record allows a new document only when it has real content. These answers have no home in it:

- `specs/review.md`: Q52, Q53.
- `architecture/security-and-privacy.md`: Q57–Q61.
- Search and organization (Q37, Q54): fold into [decks-and-configuration](../../specs/decks-and-configuration.md), or create `specs/library.md`.
- Cost and quota (Q48, Q65): fold into capture-and-generation, or create `architecture/cost-and-limits.md`.

**R4. Should locked decisions become ADRs?** [decisions/](../decisions/README.md) is empty. Load-bearing choices could be recorded as ADRs: Q18 hosted hub, Q22 Vercel serverless, Q23 Neon, Q25 PG queue, Q35 shared-table tenancy. The specs would then link to the ADRs instead of restating the reasoning.


---

## Map by question

Link paths are relative to this file. *S&A* is [Select and Add](../../MVP-Product-spec-select-and-add.md).

### 01 Maturity and scope

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q01 | Mature on Chrome + Firefox extensions and the hosted web app | [vision](../../product/vision.md), [scope](../../product/scope.md) | Replace the owner-test delivery boundary with the 1.0 gate | ready |
| Q02 | Public strangers, ~500 users, must scale easily, no anonymous use | scope, [model](../../product/model.md) §Account, [accounts-and-sync](../../specs/accounts-and-sync.md) | Drop the multi-account deferral; every feature requires an account | ready |
| Q03 | Flagship: smooth select-and-capture; diverse modules | vision §Objective/§Principles, scope | Name the two flagship jobs | partial (modules deferred) |
| Q04 | No social feed, OCR, AI tutor, CEFR tester, chatbot wrapper | vision, scope | Add a list of features excluded at maturity, separate from deferrals | ready |
| Q05 | Lightweight module proposal (spec + eval sample) | [modules](../../specs/modules.md) §Design contract, [project-workflow](../../guides/project-workflow.md) | Proposal template (spec + golden set); how it relates to owner approval | ready |

### 02 Clients and capture

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q06 | 1.0: Chrome, Firefox, hosted web. Post-1.0: Safari, iOS, desktop hotkey. Out: audio/YouTube | scope, [architecture overview](../overview.md) | 1.0 client list; lift the web-client deferral, keep mobile and hotkey deferred | ready |
| Q07 | Standard payload (selected text + editable Context, ~500 chars, deck toggle); URL/title dropped | [pages-and-editing](../../specs/pages-and-editing.md) §Context, S&A §Capture scenario | Done: capture with Context as a deck setting, implemented in 0.4.1. The owner dropped URL/title (no generation value); the page's `createdAt` is the timestamp (10 October 2026). Remaining: retention rule (K7) | partial (K7) |
| Q08 | Fire-and-forget default; terminal-only progress. The opt-in result popup is deferred (owner, 10 October 2026) | S&A §Capture-feedback popup → capture-and-generation, [shared-ui](../../specs/shared-ui.md) | Fire-and-forget matches 0.4.1 (Capture received popup, Retry in the page editor). The result popup waits for its own design | partial (popup deferred) |
| Q09 | Best-effort queue: captures + saves survive restart; generation does not | capture-and-generation, [persistence-and-recovery](../persistence-and-recovery.md) | Define the client queue; reverses the "no automatic resubmission" deferral | ready (K2) |
| Q10 | Session + installation ID; no anonymous use; event-driven refresh; capture tokens deferred | accounts-and-sync, overview | Installation registry, results published to the originating installation, polling demoted to fallback | ready |

### 03 Frontend

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q11 | Shared packages + two shells; inline module descriptions | overview, shared-ui, modules | Package/shell boundary; module description surface; web-shell routing (see the Notion routing Q&A). Per-component generation already lives in `packages/domain` (0.4.0) | ready |
| Q12 | Explicit Save/Cancel | pages-and-editing | Confirms current behavior | no change |
| Q13 | Block JSON at 1.0, per component (Q72) | shared-ui, pages-and-editing, modules, model §Component | Done in 0.4.0: each component's content is stored as a versioned block document (plain-text paragraph blocks). Remaining: block editor; modules emit typed blocks | partial |
| Q14 | N−1 compatibility window, online-required, retire legacy terms, `incarnationId`, UX messages; Q72 retires both card/page and karte/seite | [terminology-compatibility](../terminology-compatibility.md) (historical; becomes API versioning and compatibility), shared-ui, overview | Done in 0.4.0: legacy dialects, `X-Vocabularium-Terminology` and old draft fallbacks retired. Remaining: `GET /api/meta` gate, N−1 window, `incarnationId` reset detection, error messages | partial |
| Q15 | Browser-store auto-update (Chrome + Firefox) | [delivery](../../guides/delivery.md) | Replace manual unpacked delivery for users | ready |
| Q16 | WCAG 2.2 AA (Q68); capture receipt <1 s p95 warm; dashboard <2 s at 5k pages | shared-ui, overview (budgets), [verification](../../guides/verification.md) | Accessibility floor and latency targets as release checks | ready |

### 04 Identity and sync

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q17 | OAuth + passkeys at 1.0; no passwords | accounts-and-sync, model §Account | Signup, sign-in, account linking, recovery | ready (K13) |
| Q18 | Hosted hub | overview, scope §Delivery boundary, [local-postgresql](../local-postgresql.md) | Hosted is the 1.0 topology; local Postgres becomes development-only | ready |
| Q19 | Serialized + explicit resubmission | accounts-and-sync, persistence-and-recovery | The live configuration (Q72) never rewrites pages, which removes the configuration-vs-page conflict cases | ready |
| Q20 | Private only; sharing deferred and not specified | — | None; specs describe single-account ownership only | no change |
| Q21 | Long-lived multi-device sessions + explicit revoke | accounts-and-sync | Device list = installation registry (Q10) | ready |

### 05 Backend and cloud

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q22 | Vercel serverless, scale-to-zero, no disk, many copies | overview, persistence-and-recovery, ADR (R4) | Replaces the single-process local API | ready (K12) |
| Q23 | Neon (pooled, branching, PITR) | overview, persistence-and-recovery | — | ready |
| Q24 | PG as truth, no replay; idempotency key on paid provider calls | persistence-and-recovery, S&A §Chrome closing during generation | Retires the `DATA_DIR` journal for hosted use | ready |
| Q25 | PG queue + Vercel workers; retry ×3; 1 active + 5 queued generation runs per account; degrade at the limit | S&A §Generation capacity → capture-and-generation, overview | Replaces `GENERATION_MAX_ACTIVE/QUEUED` (per component attempt today); the limit counts runs, not component attempts (amended 10 October 2026 after Q72); transport-only auto-retry | ready |
| Q26 | Per-account PG serialization | persistence-and-recovery | Replaces the global advisory lock for a single process | ready |
| Q27 | `/v1/` + N−1 window via `minCompatibleExtension` | terminology-compatibility (→ API versioning), [openapi](../../api/openapi.json) | `/v1/` prefix; window rule | ready |
| Q28 | Vercel TLS, 1–2 connections per function, timeouts, health endpoints | overview | — | ready |

### 06 Data and semantics

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q29 | Store key + Context + current block content and latest outcome per component (Q72); optional interpretation line; no referent | model §Page and main key/§Component/§Generation attempt, pages-and-editing | Done: Context (0.4.1); block content and latest outcome per component, no pinned layout (0.4.0). Remaining: interpretation line (Q30) | partial |
| Q30 | String only by default; opt-in editable interpretation line | model §Direction: semantic continuity, pages-and-editing, capture-and-generation, shared-ui (setting) | Rewrite the continuity direction; specify the interpretation line and setting | ready (K14) |
| Q31 | Superseded by Q72: no pinned layouts; generation and retry use the live configuration | pages-and-editing, S&A → [decks-and-configuration](../../specs/decks-and-configuration.md) | Pinned-layout rules removed from the specs (refactor increment 1) | superseded |
| Q32 | True move, full-carry copy, trash + restore + 30-day purge; carries components, next retry uses the target deck's configuration (Q72) | decks-and-configuration, pages-and-editing, scope, persistence-and-recovery | New capability; drop the move/copy deferral | ready (K15) |
| Q33 | Current content only; append-only usage ledger per provider call (component generation or interpretation) | model §Generation attempt, persistence-and-recovery, capture-and-generation | Remove attempt history; define the usage ledger | ready (K7) |
| Q34 | At most 12 content modules per deck (Q72); view limits with view modules | decks-and-configuration | 12-instance limit in decks-and-configuration and the schema | implemented (0.4.0) |
| Q72 | Deck → page → component; live configuration; default view only; content discarded on upgrade | model, pages-and-editing, decks-and-configuration, modules, capture-and-generation, S&A, scope, [AGENTS.md](../../../AGENTS.md) | Specs in [increment 1](../../plans/page-component-refactor.md#1-product-language-and-specifications-docs-only); code in increments 2–6 ([#81](https://github.com/Guccimane44/Vocalbularium/issues/81)). Later work: card and other view modules | implemented (0.4.0) |

### 07 Database

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q35 | Shared tables + `account_id` | overview, persistence-and-recovery, ADR (R4) | — | ready |
| Q36 | Expand–migrate–contract | persistence-and-recovery, delivery | Replaces stop-the-world migrations | ready |
| Q37 | `pg_trgm` fuzzy search | home per R3 | New capability | ready |
| Q38 | Per-account JSON export + CSV/Anki import | accounts-and-sync or persistence-and-recovery | Interchange schema; on import, carry outcomes or start fresh attempts | ready |
| Q39 | Tiered retention | persistence-and-recovery, security-and-privacy (R3) | Hosted log retention per C13; development diagnostics keep manual cleanup | ready (K7) |

### 08 Modules

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q40–Q44 | Parked until the module brief | modules | Leave the catalog, inputs, multilingual, and customization sections unchanged | deferred |
| Q45 | Answered by Q72: one component per instance; retry replaces targeted components after confirmation; main key, Context and manual components are never touched | [modules](../../specs/modules.md) §Composition, pages-and-editing | Composition section rewritten in increment 1 | implemented (0.4.0) |

### 09 Generation and LLM

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q46 | Pinned single model | capture-and-generation, overview | — | ready (K4) |
| Q47 | Prompts in code, versioned with releases | capture-and-generation | — | ready |
| Q48 | Metered, with usage visible to the user; unit is one provider call, interpretation included | capture-and-generation, shared-ui | Usage counter and display; counting rules; "quota reached" message | ready |
| Q49 | Owner-reviewed golden set per module; runs before module ships and before prompt changes | modules §Design contract, [verification](../../guides/verification.md) | Golden-set fixture format, run script, review checklist | ready |
| Q50 | Explicit user retry of a component or page; invisible bounded retry for transport/timeout only | S&A §Retry → capture-and-generation | Failure classes and which ones auto-retry | ready |
| Q51 | Delimit + validate | capture-and-generation, security-and-privacy | Fenced input, JSON schema, length caps | ready |

### 10 Review and scale

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q52 | Leitner boxes | `specs/review.md` (R3), scope, model | New capability | ready (K1) |
| Q53 | Separate progress tables; reference page and component IDs (Q72) | review spec, model | — | ready (K1) |
| Q54 | Decks + tags | decks-and-configuration (or library, R3), model | New capability | ready |
| Q55 | Low thousands of pages | overview (budgets), shared-ui | — | ready (K11) |
| Q56 | Visible queue (position, ETA, cancel); cancel counts only after the provider call started | capture-and-generation, shared-ui | Reverses the silent queue | ready |

### 11 Security and privacy

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q57 | Multi-user threat model | security-and-privacy (R3) | IDOR, quota abuse, prompt abuse | ready (K6) |
| Q58 | Delegated identity at 1.0; server sessions, CSRF, throttling | security-and-privacy, accounts-and-sync | Secrets placement; OAuth state and passkey challenge checks | ready (K13) |
| Q59 | Per-module render contracts (allowlisted block types, escaped text) | security-and-privacy, shared-ui, modules | Render allowlist and block schemas | ready |
| Q60 | Generation-only external processing; minimal data; user deletion | security-and-privacy, capture-and-generation | Privacy promise | ready (K3) |
| Q61 | Store-minimum + GDPR baseline | security-and-privacy, [delivery](../../guides/delivery.md) (pre-launch checklist) | DPAs, provider list, cascading deletion, breach process, legal review | ready (K4, K7) |

### 12 Operations

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q62 | Logs + metrics | [observability](../observability.md) | Add metrics to the approved diagnostics spec | ready (K5) |
| Q63 | Redacted by default; text only with per-page consent + expiry | observability, shared-ui | Consent flow; hosted rules alongside the development-only full-content mode (C13) | ready |
| Q64 | Browser-store auto-update (Chrome + Firefox), compatibility window, update and rollback procedures | delivery | Store release and rollback procedures | ready |
| Q65 | Monthly per-account allowance of provider calls | capture-and-generation or cost doc (R3) | Quota rules (from Q48) | ready (K8) |
| Q66 | Documented RPO/RTO with tested restores | persistence-and-recovery | — | ready (K9) |

### 13 UX and migration

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q67 | Visual direction decided after the editor/state model locks | shared-ui, vision §UI/UX direction | — | ready |
| Q68 | WCAG 2.2 AA + keyboard parity, audited per release | shared-ui, verification | Audit step per release | ready |
| Q69 | English-only UI | shared-ui | — | ready (K10) |
| Q70 | Retire v0.3.0 compatibility immediately | terminology-compatibility (historical), [AGENTS.md](../../../AGENTS.md) | Done in 0.4.0 with Q72: v0.3.0+ content, receipts, dialects and draft fallbacks removed; AGENTS.md keeps recovery for data created after the refactor only. Notion terminology decision Superseded | implemented (0.4.0) |
| Q71 | Vertical slices on a contract-first foundation; 7-step order (step 2's main key + Context shipped in 0.4.x) | [v0.5.0 plan](../../plans/v0.5.0.md) | Roadmap after 0.4.x | ready |


---

## Map by document

Use this view to refactor one document at a time.

| Document | Questions | Notes |
| --- | --- | --- |
| [product/vision](../../product/vision.md) | Q01, Q03, Q04, Q67 | Out-at-maturity list |
| [product/scope](../../product/scope.md) | Q01, Q02, Q03, Q04, Q06, Q18, Q32, Q52, Q72 | Becomes a status ledger (R1) |
| [product/model](../../product/model.md) | Q02, Q17, Q29, Q30, Q33, Q53, Q54, Q72 | Account, attempt, tags, review; page/component/view model (done, 0.4.0) |
| [specs/accounts-and-sync](../../specs/accounts-and-sync.md) *(empty)* | Q02, Q10, Q17, Q19, Q21, Q38, Q58 | |
| [specs/capture-and-generation](../../specs/capture-and-generation.md) *(empty)* | Q08, Q09, Q24, Q25, Q30, Q46–Q51, Q56, Q60, Q65, Q72 | Takes over from Select and Add (R2) |
| [specs/decks-and-configuration](../../specs/decks-and-configuration.md) | Q31 (superseded), Q32, Q34, Q37?, Q54, Q72 | Renamed from `decks-and-layouts.md` (Q72) |
| [specs/pages-and-editing](../../specs/pages-and-editing.md) | Q07, Q12, Q13, Q29, Q30, Q32, Q72 | Renamed from `kartes-and-editing.md` (Q72) |
| [specs/modules](../../specs/modules.md) | Q05, Q11, Q13, Q45, Q49, Q72, Q40–Q44 (deferred) | Content and view module kinds and composition (Q45, Q72; done) |
| [specs/shared-ui](../../specs/shared-ui.md) *(empty)* | Q08, Q11, Q13, Q14, Q16, Q30, Q48, Q55, Q56, Q59, Q63, Q67, Q68, Q69 | |
| `specs/review` *(new, R3)* | Q52, Q53 | |
| [MVP Select and Add](../../MVP-Product-spec-select-and-add.md) | Q07, Q08, Q24, Q25, Q31 (superseded), Q50, Q72 | Move or retire (R2) |
| [architecture/overview](../overview.md) *(empty)* | Q06, Q10, Q11, Q14, Q18, Q22, Q23, Q25, Q28, Q35, Q46, Q55 | |
| [architecture/persistence-and-recovery](../persistence-and-recovery.md) *(empty)* | Q09, Q19, Q22–Q24, Q26, Q32, Q33, Q35, Q36, Q38, Q39, Q66 | |
| [architecture/observability](../observability.md) | Q39, Q62, Q63 | Approved local diagnostics spec; split into development mode and hosted rules (C13) |
| `architecture/security-and-privacy` *(new, R3)* | Q39, Q51, Q57–Q61 | |
| [architecture/terminology-compatibility](../terminology-compatibility.md) | Q14, Q27, Q70 | Historical since Q72; its successor documents API versioning and compatibility |
| [architecture/local-postgresql](../local-postgresql.md) | Q18, Q22 | Development-only |
| [api/openapi.json](../../api/openapi.json) | Q27 | `/v1/` |
| [guides/delivery](../../guides/delivery.md) | Q15, Q36, Q64 | |
| [guides/verification](../../guides/verification.md) | Q49, Q68 | |
| [guides/project-workflow](../../guides/project-workflow.md) | Q05 | |
| [plans/v0.5.0](../../plans/v0.5.0.md) *(empty)* | Q71 | Renamed from `v0.4.0.md`, since 0.4.0 shipped the page/component refactor |
| [AGENTS.md](../../../AGENTS.md) | Q70, Q72 | Terminology section |
| [plans/page-component-refactor](../../plans/page-component-refactor.md) | Q72 | Approved plan and increments |
