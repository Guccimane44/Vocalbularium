# Traceability map: questionnaire answers to specs

This map tracks how each answer (Q01–Q71) changes the specifications. Use it to plan the spec refactor and to check the refactor afterwards. The answers live in [answers/](answers/) and the questions in the numbered files next to this one.

**Status values**

- `applied`: already reflected in the specs (commit `8767818`).
- `partial`: some of it is applied; the remainder is named in the row.
- `ready`: the answer is clear enough to write into the specs.
- `blocked Cn`: the answer conflicts with another answer; resolve conflict *Cn* first.
- `open`: the answer leaves a sub-question unanswered (see [Clarifications](#clarifications)).
- `deferred`: deliberately parked.
- `no change`: confirms current behavior.

---

## Refactor decisions

These decisions concern the structure of the docs, not the product. Settle them before editing specs.

**R1. How do specs describe the 1.0 target and the current implementation?**
Today, [scope](../../product/scope.md) separates "supported now", "accepted change pending implementation", and "explicit deferrals". The answers reverse almost every item in *Explicit deferrals* (multi-user accounts, web/Firefox/hotkey clients, deck moves, review, Web Store distribution, public hosting, quality evaluation, usage limits). As a result, the pending list would grow to cover most of the product.
*Proposal:* specs under `docs/specs/` and `docs/architecture/` describe **1.0 target behavior**. [scope](../../product/scope.md) becomes a status ledger: each capability is marked `implemented`, `accepted for 1.0`, `post-1.0`, or `out at maturity` (Q04).

**R2. What happens to [Select and Add](../../MVP-Product-spec-select-and-add.md)?**
The empty [capture-and-generation](../../specs/capture-and-generation.md) looks like its intended successor.
*Proposal:* move its content into `specs/capture-and-generation.md`, rewrite it against Q08/Q09/Q24/Q25/Q46–Q51/Q56, and leave a redirect stub (or move the old file to `docs/history/`).

**R3. Which new docs are needed?** Some answers have no home among the existing or placeholder docs:

- `specs/review.md`: Q52, Q53.
- `architecture/security-and-privacy.md`: Q57–Q61.
- Search and organization (Q37, Q54): fold into [decks-and-layouts](../../specs/decks-and-layouts.md), or create `specs/library.md`.
- Cost and quota (Q48, Q65): fold into capture-and-generation, or create `architecture/cost-and-limits.md`.

**R4. Should locked decisions become ADRs?** [decisions/](../decisions/README.md) is empty. Load-bearing choices could be recorded as ADRs: Q18 hosted hub, Q22 Vercel serverless, Q23 Neon, Q25 PG queue, Q35 shared-table tenancy. The specs would then link to the ADRs instead of restating the reasoning.

---

## Conflicts

All twelve conflicts are resolved. Each entry records the original contradiction and the decision; the affected answers were updated to match.

**C1. Rich rendering — RESOLVED (option B: blocks at 1.0).** Originally, Q13 chose *Block JSON*, while Q59 chose *text-only rendering* and Q29 stored *no per-module blocks*.
*Resolution:* Q13 stands. Q29 now stores seite content as a versioned block document. Q59 now uses per-module render contracts: allowlisted block types, with all text escaped. Existing plain-text seites migrate to a single paragraph block. Q71 step 5 ("rendering/editor") now means refining the block editor, not introducing blocks.

**C2. Identity provider — RESOLVED (OAuth + passkeys at 1.0).** Originally, Q17 chose *external identity*, while Q58 chose *passwords first, OAuth later*.
*Resolution:* Q17 stands. Q58 now uses delegated identity at 1.0 with no password store; server-side sessions, CSRF protection, and throttling stay. Providers, account linking, and recovery are open as K13.

**C3. Client and platform list — RESOLVED (Chrome, Firefox, web app at 1.0).** Originally, Q01 named Chrome, Firefox, and iOS, while Q06 named Chrome, web, Firefox/Safari, and a desktop hotkey. Q10 assumed the hotkey was out, and Q11 planned only two shells.
*Resolution:* 1.0 clients are the Chrome extension, the Firefox extension, and the hosted web app. Safari, iOS, and the desktop hotkey are post-1.0. Q01 and Q06 are updated. Q10 (capture tokens deferred) and Q11 (extension shell + web shell) are now consistent as written.

**C4. Version compatibility and updates — RESOLVED (N−1 window + store auto-update).** Originally, Q14 set a hard major.minor gate, while Q27 and Q64 set an N−1 window. Q15 chose a managed updater, while Q64 chose Web Store auto-update.
*Resolution:* the backend supports extension versions N and N−1 via `minCompatibleExtension`; older extensions see a "version too old, update from your store" message. The rest of Q14 stands: online-required, retired legacy terms, `incarnationId` reset detection. Q15 and Q64 now use browser-store auto-update for Chrome and Firefox, with no separate updater. The web app deploys with the backend and needs no window.

**C5. Semantic referent — RESOLVED (string only by default; opt-in interpretation line).** Originally, Q29/Q30 chose *string only*, while Q71 step 2 was *main-key + semantic referent*, and the [model](../../product/model.md) promises "semantic continuity".
*Resolution:* there is no referent at 1.0. String only (main key + Context) is the default. A setting, off by default, adds an editable interpretation line per karte that later generations use. Q71 step 2 is now "main key + Context (+ opt-in interpretation)". The model's continuity section becomes: interpretation line at 1.0, full referent post-1.0. Details are open as K14.

**C6. Automatic retry — RESOLVED (invisible infrastructure retry, explicit user retry).** Originally, Q50 chose *explicit retry only*, while Q25 had the worker retry transient failures up to 3 times.
*Resolution:* the worker silently retries transport and timeout failures up to 3 times with backoff; the Q24 idempotency key prevents double billing. Content-level failures are never auto-retried. After retries run out, the user sees one failure and an explicit Retry. Q25 and Q50 are updated.

**C7. Accessibility and performance — RESOLVED (WCAG 2.2 AA + latency targets).** Originally, Q16 chose *best-effort*, while Q68 chose *WCAG 2.2 AA audited per release*, and Q55 gave a size but no latency numbers.
*Resolution:* Q68 stands for accessibility. Q16 now sets release-check targets: capture receipt under 1 s p95 warm (cold start up to ~3 s, never blocking), dashboard interactive under 2 s at 5,000 kartes, no generation latency budget (60 s timeout + visible queue).

**C8. Generation-quality evaluation — RESOLVED (owner-reviewed golden set per module).** Originally, Q49 chose *ad-hoc sampling*, while Q05 required an *eval sample per module proposal* and Q71 required quality validation before expanding the catalog.
*Resolution:* each module has a golden set of about 20–30 inputs. It runs before a module ships and before any prompt change merges, and the owner reviews the output diff against a short checklist. It doubles as Q05's eval sample and as Q71's quality bar. No LLM judge at 1.0.

**C9. Quotas and metering — RESOLVED.** Q48, Q65, Q25, and Q56 fit together but left the quota undefined.
*Resolution:* the unit is one generated seite (one provider call), with token counts stored per attempt. User generation and explicit Retry count; invisible transport retries do not; a cancel counts only after the provider call started. The allowance is monthly per account (amount open, K8). At the limit, Q25's degrade rule applies with a "monthly quota reached" message. Metering and usage display ship at 1.0; enforcement follows once the amount is set.

**C10. Sharing versus ordering and tenancy — RESOLVED (sharing deferred).** Originally, Q20 added collaborator sharing, while Q26, Q19, Q35, and Q57 assumed every karte belongs to one account.
*Resolution:* sharing is deferred and left out of the product specs. Every deck and karte belongs to exactly one account, so Q19, Q26, Q35, and Q57 stand as written.

**C11. Attempt history — RESOLVED (current content only + usage ledger).** Originally, Q33 kept only the latest outcome per seite, while Q29, Q32, and Q48 needed records per attempt.
*Resolution:* at 1.0, seites store only current content and the latest outcome; there is no content or edit history. A separate append-only usage ledger records every provider call (model, prompt version, tokens, cost, outcome) for quota, cost, and debugging; it is not shown as karte history. Q29, Q32, and Q33 are updated.

**C12. Compliance level — RESOLVED (store-minimum + GDPR baseline).** Originally, Q61 chose *store-minimum*, although Q02 (public users, likely including the EU) and Q60 (captures sent to an LLM provider) bring GDPR into scope.
*Resolution:* Q61 now adds DPAs with every provider, a transfer basis for non-EU providers, a production LLM provider whose terms cover user content, account deletion that cascades and ages out of backups, a provider list in the privacy policy, a one-page breach process, and a legal review before public launch. This narrows K4: OpenCode Go is development-only.

---

## Clarifications

These are smaller gaps. They do not block a spec, but the spec will contain a placeholder until they are answered.

| ID | Answer | Missing |
| --- | --- | --- |
| K1 | Q52 | Leitner review at 1.0, even though Q03 names capture + modules as the flagship and the vision rejects flashcard-centrism. Is review in 1.0 or only post-1.0? (Q71 puts it at step 6.) |
| K2 | Q09 / Q14 | Offline: captures queue (Q09), but reads require the backend (Q14). Confirm the split: write queue offline, no offline reads. |
| K3 | Q60 / Q08 | "External processing only when the user explicitly requests generation." Does a capture with generative seites count as that request? |
| K4 | Q46 | Which provider and model serve production? OpenCode Go is development-only (C12); the production provider must offer a DPA and terms that cover user content. |
| K5 | Q62 / Q22 | Prometheus-style scraping does not fit scale-to-zero functions. Push-based metrics or the vendor's metrics instead? |
| K6 | Q57 | Q02 (public internet) suggests the public-service threat model (CSRF, session theft, DDoS). Q58 already includes CSRF. Confirm the level. |
| K7 | Q39 | Retention periods per data class (usage ledger, receipts, logs, backups). Q32 proposes 30 days for trash; C11 proposes ~13 months for the usage ledger. |
| K8 | Q65 | Hosting budget at 100/1k/10k users. Monthly seite allowance per account (unit and rules fixed by C9). |
| K9 | Q66 | RPO 24h / RTO 4h were given as examples ("e.g."). Confirm them. Neon point-in-time recovery (PITR, Q23) allows a much lower RPO. |
| K10 | Q69 | Is English-only UI permanent or 1.0-only? |
| K11 | Q55 | "Low thousands" of kartes per account. Confirm this is per account, with ~500 accounts in total (Q02). |
| K12 | Q22 | Experiment still pending: cold start + 60s generation within the Vercel plan's function limit. |
| K13 | Q17 / Q58 | Which OAuth providers (Google, Apple, GitHub…)? Does signing in with a new provider using the same verified email link to the existing account? How does a user recover an account after losing every passkey and provider access? |
| K14 | Q30 | Interpretation setting: account-level or per deck? Length cap for the line? Is the line flagged as possibly stale after a main-key or Context edit? |

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
| Q07 | Standard payload + editable Context (~500 chars), with a toggle | [kartes-and-editing](../../specs/kartes-and-editing.md) §Context, S&A §Capture scenario | Done in `8767818`. Remaining: storage of URL/title + timestamp, retention rule (K7) | partial |
| Q08 | Fire-and-forget default; opt-in popup on terminal state; 3s auto-dismiss; originating installation only; terminal-only progress | S&A §Capture-feedback popup → capture-and-generation, [shared-ui](../../specs/shared-ui.md) | Rewrite the popup rules | ready |
| Q09 | Best-effort queue: captures + saves survive restart; generation does not | capture-and-generation, [persistence-and-recovery](../persistence-and-recovery.md) | Define the client queue; reverses the "no automatic resubmission" deferral | ready (K2) |
| Q10 | Session + installation ID; no anonymous use; event-driven refresh; capture tokens deferred | accounts-and-sync, overview | Installation registry, results published to the originating installation, polling demoted to fallback | ready |

### 03 Frontend

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q11 | Shared packages + two shells; inline module descriptions | overview, shared-ui, modules | Package/shell boundary; module description surface | ready |
| Q12 | Explicit Save/Cancel | kartes-and-editing | Confirms current behavior | no change |
| Q13 | Block JSON at 1.0 | shared-ui, kartes-and-editing, modules, model §Seite | Seite becomes a versioned block document; block editor; modules emit typed blocks; plain-text migration | ready |
| Q14 | N−1 compatibility window, online-required, retire legacy terms, `incarnationId`, UX messages | [terminology-compatibility](../terminology-compatibility.md), shared-ui, overview | Compatibility rule, legacy retirement, reset detection, error messages | ready |
| Q15 | Browser-store auto-update (Chrome + Firefox) | [delivery](../../guides/delivery.md) | Replace manual unpacked delivery for users | ready |
| Q16 | WCAG 2.2 AA (Q68); capture receipt <1 s p95 warm; dashboard <2 s at 5k kartes | shared-ui, overview (budgets), [verification](../../guides/verification.md) | Accessibility floor and latency targets as release checks | ready |

### 04 Identity and sync

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q17 | OAuth + passkeys at 1.0; no passwords | accounts-and-sync, model §Account | Signup, sign-in, account linking, recovery | ready (K13) |
| Q18 | Hosted hub | overview, scope §Delivery boundary, [local-postgresql](../local-postgresql.md) | Hosted is the 1.0 topology; local Postgres becomes development-only | ready |
| Q19 | Serialized + explicit resubmission | accounts-and-sync, persistence-and-recovery | Pinned layouts (Q31) remove the layout-vs-karte conflict cases | ready |
| Q20 | Private only; sharing deferred and not specified | — | None; specs describe single-account ownership only | no change |
| Q21 | Long-lived multi-device sessions + explicit revoke | accounts-and-sync | Device list = installation registry (Q10) | ready |

### 05 Backend and cloud

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q22 | Vercel serverless, scale-to-zero, no disk, many copies | overview, persistence-and-recovery, ADR (R4) | Replaces the single-process local API | ready (K12) |
| Q23 | Neon (pooled, branching, PITR) | overview, persistence-and-recovery | — | ready |
| Q24 | PG as truth, no replay; idempotency key on paid provider calls | persistence-and-recovery, S&A §Chrome closing during generation | Retires the `DATA_DIR` journal for hosted use | ready |
| Q25 | PG queue + Vercel workers; retry ×3; 1 active + 5 queued per account; degrade at the limit | S&A §Generation capacity → capture-and-generation, overview | Replaces `GENERATION_MAX_ACTIVE/QUEUED`; transport-only auto-retry | ready |
| Q26 | Per-account PG serialization | persistence-and-recovery | Replaces the global advisory lock for a single process | ready |
| Q27 | `/v1/` + N−1 window via `minCompatibleExtension` | terminology-compatibility (→ API versioning), [openapi](../../api/openapi.json) | `/v1/` prefix; window rule | ready |
| Q28 | Vercel TLS, 1–2 connections per function, timeouts, health endpoints | overview | — | ready |

### 06 Data and semantics

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q29 | Store key + Context + current block content + pinned layout + latest outcome; optional interpretation line; no referent | model §Karte/§Generation attempt, kartes-and-editing | Done: Context, pinned layout. Remaining: block content, URL/title, interpretation line | partial |
| Q30 | String only by default; opt-in editable interpretation line | model §Direction: semantic continuity, kartes-and-editing, capture-and-generation, shared-ui (setting) | Rewrite the continuity direction; specify the interpretation line and setting | ready (K14) |
| Q31 | Kartes pin the layout revision; config edits affect new kartes only | kartes-and-editing, S&A → [decks-and-layouts](../../specs/decks-and-layouts.md) | Done in `8767818`; move ownership to decks-and-layouts | applied |
| Q32 | True move, full-carry copy, trash + restore + 30-day purge | decks-and-layouts, kartes-and-editing, scope, persistence-and-recovery | New capability; drop the move/copy deferral | ready |
| Q33 | Current content only; append-only usage ledger per provider call | model §Generation attempt, persistence-and-recovery, capture-and-generation | Remove attempt history; define the usage ledger | ready (K7) |
| Q34 | 1–4 seites + bounded modules | decks-and-layouts | Confirms current behavior | no change |

### 07 Database

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q35 | Shared tables + `account_id` | overview, persistence-and-recovery, ADR (R4) | — | ready |
| Q36 | Expand–migrate–contract | persistence-and-recovery, delivery | Replaces stop-the-world migrations | ready |
| Q37 | `pg_trgm` fuzzy search | home per R3 | New capability | ready |
| Q38 | Per-account JSON export + CSV/Anki import | accounts-and-sync or persistence-and-recovery | Interchange schema; on import, carry outcomes or start fresh attempts | ready |
| Q39 | Tiered retention | persistence-and-recovery, security-and-privacy (R3) | — | ready (K7) |

### 08 Modules

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q40–Q45 | Parked until the module brief | modules | Leave the catalog, inputs, multilingual, customization, and composition sections unchanged | deferred |

### 09 Generation and LLM

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q46 | Pinned single model | capture-and-generation, overview | — | ready (K4) |
| Q47 | Prompts in code, versioned with releases | capture-and-generation | — | ready |
| Q48 | Metered, with usage visible to the user | capture-and-generation, shared-ui | Usage counter and display; counting rules; "quota reached" message | ready |
| Q49 | Owner-reviewed golden set per module; runs before module ships and before prompt changes | modules §Design contract, [verification](../../guides/verification.md) | Golden-set fixture format, run script, review checklist | ready |
| Q50 | Explicit user retry; invisible bounded retry for transport/timeout only | S&A §Retry → capture-and-generation | Failure classes and which ones auto-retry | ready |
| Q51 | Delimit + validate | capture-and-generation, security-and-privacy | Fenced input, JSON schema, length caps | ready |

### 10 Review and scale

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q52 | Leitner boxes | `specs/review.md` (R3), scope, model | New capability | ready (K1) |
| Q53 | Separate progress tables | review spec, model | — | ready (K1) |
| Q54 | Decks + tags | decks-and-layouts (or library, R3), model | New capability | ready |
| Q55 | Low thousands of kartes | overview (budgets), shared-ui | — | ready (K11) |
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
| Q62 | Logs + metrics | [observability](../observability.md) | — | ready (K5) |
| Q63 | Redacted by default; text only with per-karte consent + expiry | observability, shared-ui | Consent flow | ready |
| Q64 | Browser-store auto-update (Chrome + Firefox), compatibility window, update and rollback procedures | delivery | Store release and rollback procedures | ready |
| Q65 | Monthly per-account allowance of generated seites | capture-and-generation or cost doc (R3) | Quota rules (from Q48) | ready (K8) |
| Q66 | Documented RPO/RTO with tested restores | persistence-and-recovery | — | ready (K9) |

### 13 UX and migration

| Q | Answer (short) | Target docs | Change | Status |
| --- | --- | --- | --- | --- |
| Q67 | Visual direction decided after the editor/state model locks | shared-ui, vision §UI/UX direction | — | ready |
| Q68 | WCAG 2.2 AA + keyboard parity, audited per release | shared-ui, verification | Audit step per release | ready |
| Q69 | English-only UI | shared-ui | — | ready (K10) |
| Q70 | Retire v0.3.0 compatibility immediately | terminology-compatibility, [AGENTS.md](../../../AGENTS.md) | Remove the "preserve recovery compatibility" instruction | ready |
| Q71 | Vertical slices on a contract-first foundation; 7-step order | [v0.4.0 plan](../../plans/v0.4.0.md) | Roadmap | ready |

---

## Map by document

Use this view to refactor one document at a time.

| Document | Questions | Notes |
| --- | --- | --- |
| [product/vision](../../product/vision.md) | Q01, Q03, Q04, Q67 | Out-at-maturity list |
| [product/scope](../../product/scope.md) | Q01, Q02, Q03, Q04, Q06, Q18, Q32, Q52 | Becomes a status ledger (R1) |
| [product/model](../../product/model.md) | Q02, Q17, Q29, Q30, Q33, Q53, Q54 | Account, attempt, tags, review |
| [specs/accounts-and-sync](../../specs/accounts-and-sync.md) *(empty)* | Q02, Q10, Q17, Q19, Q21, Q38, Q58 | |
| [specs/capture-and-generation](../../specs/capture-and-generation.md) *(empty)* | Q08, Q09, Q24, Q25, Q30, Q46–Q51, Q56, Q60, Q65 | Takes over from Select and Add (R2) |
| [specs/decks-and-layouts](../../specs/decks-and-layouts.md) *(empty)* | Q31, Q32, Q34, Q37?, Q54 | |
| [specs/kartes-and-editing](../../specs/kartes-and-editing.md) | Q07, Q12, Q13, Q29, Q30, Q32 | |
| [specs/modules](../../specs/modules.md) | Q05, Q11, Q13, Q49, Q40–Q45 (deferred) | |
| [specs/shared-ui](../../specs/shared-ui.md) *(empty)* | Q08, Q11, Q13, Q14, Q16, Q30, Q48, Q55, Q56, Q59, Q63, Q67, Q68, Q69 | |
| `specs/review` *(new, R3)* | Q52, Q53 | |
| [MVP Select and Add](../../MVP-Product-spec-select-and-add.md) | Q07, Q08, Q24, Q25, Q31, Q50 | Move or retire (R2) |
| [architecture/overview](../overview.md) *(empty)* | Q06, Q10, Q11, Q14, Q18, Q22, Q23, Q25, Q28, Q35, Q46, Q55 | |
| [architecture/persistence-and-recovery](../persistence-and-recovery.md) *(empty)* | Q09, Q19, Q22–Q24, Q26, Q32, Q33, Q35, Q36, Q38, Q39, Q66 | |
| [architecture/observability](../observability.md) *(empty)* | Q62, Q63 | |
| `architecture/security-and-privacy` *(new, R3)* | Q39, Q51, Q57–Q61 | |
| [architecture/terminology-compatibility](../terminology-compatibility.md) | Q14, Q27, Q70 | Becomes API versioning and compatibility |
| [architecture/local-postgresql](../local-postgresql.md) | Q18, Q22 | Development-only |
| [api/openapi.json](../../api/openapi.json) | Q27 | `/v1/` |
| [guides/delivery](../../guides/delivery.md) | Q15, Q36, Q64 | |
| [guides/verification](../../guides/verification.md) | Q49, Q68 | |
| [guides/project-workflow](../../guides/project-workflow.md) | Q05 | |
| [plans/v0.4.0](../../plans/v0.4.0.md) *(empty)* | Q71 | |
| [AGENTS.md](../../../AGENTS.md) | Q70 | |
