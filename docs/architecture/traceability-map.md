# Traceability map

This map is the entry gate for every decision that changes a specification, whatever its source: a new idea, a direct owner decision, an issue or feature request, a verification or delivery finding, or the [system-design questionnaire](questionnaire/00-overview.md). It follows [from decisions to iterations](../guides/project-workflow.md#from-decisions-to-iterations). Routine fixes that change no specification skip it.

## Adding an entry

1. **Describe the decision** in one line and link where it came from (chat summary, issue, finding, or questionnaire answer). Give it the next D-number.
2. **Name the affected documents** and what changes in each.
3. **Check it against the existing entries and the specs.** Record a contradiction as a [conflict](#conflicts) and a missing detail as a [clarification](#clarifications), continuing their numbering, and list them under the entry's open items.
4. **Create its Notion decision record** as `Proposed`, and link it.
5. Once the open items are resolved and the owner accepts the record, **update the specs**, then the entry's status.

A batch of related decisions, such as the questionnaire pass, gets one entry here and keeps its per-decision detail in its own file.

**Status values**

- `proposed`: recorded, not yet accepted.
- `accepted`: the owner accepted the Notion record; the specs are not updated yet.
- `partial`: some of the changes are applied; the remainder is named in the entry.
- `applied`: reflected in the specs, not yet implemented.
- `implemented (x.y.z)`: reflected in the specs and shipped in the named release.
- `in progress`: a batch whose rows have mixed statuses.
- `deferred`, `rejected`, `superseded`: parked, declined, or replaced by the entry named.

## Entries

Newest first.

| ID | Opened | Source | Decision | Affected docs | Open items | Notion | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D02 | 2026-10-10 | Owner decision in chat | Page-owned modules: the deck configuration is only the template for page creation. Afterwards the user deletes any component except the main key (immediately, after a warning; a deleted component stays gone), rearranges components, and drags modules onto one page from a module window shown beside the page view and deck settings. Deck changes affect only new pages. The main key and Context become input modules: the main key is compulsory and always first, the Context is optional (at most one, movable) and replaces the Capture with Context setting, and the limit of 12 module instances per deck or page includes both. A module dragged onto a page waits as "Not generated yet". Amends Q72's live configuration (C15) and Q07's deck setting (C16); settles K15–K18 | [model](../product/model.md), [pages-and-editing](../specs/pages-and-editing.md#shaping-a-page), [decks-and-configuration](../specs/decks-and-configuration.md#configuration-and-pages), [capture-and-generation](../specs/capture-and-generation.md#generation-actions), [modules](../specs/modules.md#composition), [shared-ui](../specs/shared-ui.md#module-window), [scope](../product/scope.md) | Module window design (UI redesign) | Pending | applied (not implemented) |
| D01 | 2026-10-10 | Owner decision in chat | Route spec-changing decisions through this map into iterations; specs describe accepted behavior and scope is the status ledger (settles R1, option A) | [project-workflow](../guides/project-workflow.md#from-decisions-to-iterations), [AGENTS.md](../../AGENTS.md), [Change skill](../../.agents/skills/vocabularium-change/SKILL.md), this map, [scope](../product/scope.md) | Scope restructured as the status ledger | [Accepted 2026-10-10](https://app.notion.com/p/3f5bb1350208811eb979e191599f0e62) | partial (workflow in [#93](https://github.com/Guccimane44/Vocalbularium/pull/93), map in [#94](https://github.com/Guccimane44/Vocalbularium/pull/94); scope ledger pending) |
| Q01–Q72 | 2026-10-04 | [System-design questionnaire](questionnaire/00-overview.md) | The 1.0 architecture, one answer per question; detail in [questionnaire pass](questionnaire/spec-mapping.md) | See the pass's [map by document](questionnaire/spec-mapping.md#map-by-document) | K1–K15; R2–R4; most Notion records still `Proposed` | [One record per answer file](questionnaire/spec-mapping.md#notion-context) | in progress (Q34, Q45, Q70, Q72 implemented in 0.4.0) |

---

## Conflicts

Contradictions between entries, or between an entry and the specs. Numbering continues across entries; new conflicts go on top. C1–C14 came from the questionnaire pass and are all resolved: each records the original contradiction and the decision, and the affected answers were updated to match.

**C16. Capture with Context setting versus the Context module — RESOLVED (D02).** Q07, implemented in 0.4.1, made Capture with Context an on/off deck setting. D02 makes the Context a movable, deletable module.
*Resolution:* the owner decided on 10 October 2026 that the Context module replaces the setting: a deck captures Context when its configuration has the Context module. Release 0.4.1 keeps the setting until D02 is built.

**C15. Live deck configuration versus page-owned modules — RESOLVED (D02).** Q72 had generation and retry use the deck's live configuration, so deck changes reached existing pages: added instances appeared as missing components and removed ones stayed marked as no longer configured. The owner wants each page shaped freely after creation, including deleting components for good.
*Resolution:* the owner decided on 10 October 2026 (D02). The deck configuration is copied onto a page when it is created and never affects it afterwards; generation and retry use the page's own module instances. Q72's page → component structure stands. Release 0.4.1 still implements the live configuration until D02 is built.

**C14. Karte/seite model versus per-module generation — RESOLVED (Q72: deck → page → component).** Originally, Q29, Q31, Q32 and Q34 assumed a karte made of seites, each seite joining several module outputs, with a pinned layout revision per karte. Q13 versioned content per seite and Q53 referenced karte/seite IDs. Per-module retry and editing had no place in that model.
*Resolution:* the owner decided on 10 October 2026 ([plan](../history/plans/page-component-refactor.md)). A page is an ordered list of components, one per content module instance; generation and retry use the deck's live configuration; views present pages, with only the default view in scope. Q31 is superseded; Q13, Q14, Q29, Q32, Q34 and Q53 are amended, and Q45 is answered. Existing content is discarded on upgrade, so C1's plain-text migration of existing seites no longer applies. Release 0.4.0 implements the model ([#81](https://github.com/Guccimane44/Vocalbularium/issues/81)); the specs, questions and answers now use page and component.

**C13. Diagnostic content retention — RESOLVED (full content is development-only).** Originally, the [local diagnostics decision](https://app.notion.com/p/3ecbb1350208818b8156f754e52d4e4a) (Implemented, 2 October 2026) kept selected text, prompts and model outputs by default with no automatic expiry, while Q63 required redacted-by-default logs with per-page consent and expiry, Q39 time-limited logs, and C12 committed to GDPR deletion.
*Resolution:* full-content diagnostics remain a development-only mode (local backend, the owner's own data). The hosted product follows Q63 and Q39: redacted by default, user text only with per-page consent and expiry, time-limited retention. The local diagnostics decision is narrowed to development diagnostics. `codex/logging-system`, including the approved `observability.md` spec, is merged into this branch, so the refactor starts from that spec.

**C1. Rich rendering — RESOLVED (option B: blocks at 1.0).** Originally, Q13 chose *Block JSON*, while Q59 chose *text-only rendering* and Q29 stored *no per-module blocks*.
*Resolution:* Q13 stands. Q29 now stores component content as a versioned block document (per component since Q72). Q59 now uses per-module render contracts: allowlisted block types, with all text escaped. The plain-text migration of existing seites was dropped when Q72 discarded that content. Q71 step 5 ("rendering/editor") now means refining the block editor, not introducing blocks.

**C2. Identity provider — RESOLVED (OAuth + passkeys at 1.0).** Originally, Q17 chose *external identity*, while Q58 chose *passwords first, OAuth later*.
*Resolution:* Q17 stands. Q58 now uses delegated identity at 1.0 with no password store; server-side sessions, CSRF protection, and throttling stay. Providers, account linking, and recovery are open as K13.

**C3. Client and platform list — RESOLVED (Chrome, Firefox, web app at 1.0).** Originally, Q01 named Chrome, Firefox, and iOS, while Q06 named Chrome, web, Firefox/Safari, and a desktop hotkey. Q10 assumed the hotkey was out, and Q11 planned only two shells.
*Resolution:* 1.0 clients are the Chrome extension, the Firefox extension, and the hosted web app. Safari, iOS, and the desktop hotkey are post-1.0. Q01 and Q06 are updated. Q10 (capture tokens deferred) and Q11 (extension shell + web shell) are now consistent as written.

**C4. Version compatibility and updates — RESOLVED (N−1 window + store auto-update).** Originally, Q14 set a hard major.minor gate, while Q27 and Q64 set an N−1 window. Q15 chose a managed updater, while Q64 chose Web Store auto-update.
*Resolution:* the backend supports extension versions N and N−1 via `minCompatibleExtension`; older extensions see a "version too old, update from your store" message. The rest of Q14 stands: online-required, retired legacy terms, `incarnationId` reset detection. Q15 and Q64 now use browser-store auto-update for Chrome and Firefox, with no separate updater. The web app deploys with the backend and needs no window.

**C5. Semantic referent — RESOLVED (string only by default; opt-in interpretation line).** Originally, Q29/Q30 chose *string only*, while Q71 step 2 was *main-key + semantic referent*, and the [model](../product/model.md) promises "semantic continuity".
*Resolution:* there is no referent at 1.0. String only (main key + Context) is the default. A setting, off by default, adds an editable interpretation line per page that later generations use. Q71 step 2 is now "main key + Context (+ opt-in interpretation)". The model's continuity section becomes: interpretation line at 1.0, full referent post-1.0. Details are open as K14.

**C6. Automatic retry — RESOLVED (invisible infrastructure retry, explicit user retry).** Originally, Q50 chose *explicit retry only*, while Q25 had the worker retry transient failures up to 3 times.
*Resolution:* the worker silently retries transport and timeout failures up to 3 times with backoff; the Q24 idempotency key prevents double billing. Content-level failures are never auto-retried. After retries run out, the user sees one failure and an explicit Retry. Q25 and Q50 are updated.

**C7. Accessibility and performance — RESOLVED (WCAG 2.2 AA + latency targets).** Originally, Q16 chose *best-effort*, while Q68 chose *WCAG 2.2 AA audited per release*, and Q55 gave a size but no latency numbers.
*Resolution:* Q68 stands for accessibility. Q16 now sets release-check targets: capture receipt under 1 s p95 warm (cold start up to ~3 s, never blocking), dashboard interactive under 2 s at 5,000 pages, no generation latency budget (60 s timeout + visible queue).

**C8. Generation-quality evaluation — RESOLVED (owner-reviewed golden set per module).** Originally, Q49 chose *ad-hoc sampling*, while Q05 required an *eval sample per module proposal* and Q71 required quality validation before expanding the catalog.
*Resolution:* each module has a golden set of about 20–30 inputs. It runs before a module ships and before any prompt change merges, and the owner reviews the output diff against a short checklist. It doubles as Q05's eval sample and as Q71's quality bar. No LLM judge at 1.0.

**C9. Quotas and metering — RESOLVED.** Q48, Q65, Q25, and Q56 fit together but left the quota undefined.
*Resolution:* the unit is one provider call: each component generation and each run's interpretation call (amended 10 October 2026 after Q72, when one generation run became one interpretation call plus one call per generative component), with token counts stored per call. User generation and explicit Retry count; invisible transport retries do not; a cancel counts only after the provider call started. The allowance is monthly per account (amount open, K8). At the limit, Q25's degrade rule applies with a "monthly quota reached" message. Metering and usage display ship at 1.0; enforcement follows once the amount is set.

**C10. Sharing versus ordering and tenancy — RESOLVED (sharing deferred).** Originally, Q20 added collaborator sharing, while Q26, Q19, Q35, and Q57 assumed every karte (now page) belongs to one account.
*Resolution:* sharing is deferred and left out of the product specs. Every deck and page belongs to exactly one account, so Q19, Q26, Q35, and Q57 stand as written.

**C11. Attempt history — RESOLVED (current content only + usage ledger).** Originally, Q33 kept only the latest outcome per seite (now component), while Q29, Q32, and Q48 needed records per attempt.
*Resolution:* at 1.0, components store only current content and the latest outcome; there is no content or edit history. A separate append-only usage ledger records every provider call (model, prompt version, tokens, cost, outcome) for quota, cost, and debugging; it is not shown as page history. Q29, Q32, and Q33 are updated.

**C12. Compliance level — RESOLVED (store-minimum + GDPR baseline).** Originally, Q61 chose *store-minimum*, although Q02 (public users, likely including the EU) and Q60 (captures sent to an LLM provider) bring GDPR into scope.
*Resolution:* Q61 now adds DPAs with every provider, a transfer basis for non-EU providers, a production LLM provider whose terms cover user content, account deletion that cascades and ages out of backups, a provider list in the privacy policy, a one-page breach process, and a legal review before public launch. This narrows K4: OpenCode Go is development-only.


---

## Clarifications

Smaller gaps. They do not block a spec, but the spec will contain a placeholder until they are answered. Numbering continues across entries; K1–K15 came from the questionnaire pass.

| ID | Source | Missing |
| --- | --- | --- |
| K1 | Q52 | Leitner review at 1.0, even though Q03 names capture + modules as the flagship and the vision rejects flashcard-centrism. Is review in 1.0 or only post-1.0? (Q71 puts it at step 6.) |
| K2 | Q09 / Q14 | Offline: captures queue (Q09), but reads require the backend (Q14). Confirm the split: write queue offline, no offline reads. |
| K3 | Q60 / Q08 | "External processing only when the user explicitly requests generation." Does a capture into a deck with generative content modules count as that request? |
| K4 | Q46 | Which provider and model serve production? OpenCode Go is development-only (C12); the production provider must offer a DPA and terms that cover user content. |
| K5 | Q62 / Q22 | Prometheus-style scraping does not fit scale-to-zero functions. Push-based metrics or the vendor's metrics instead? |
| K6 | Q57 | Q02 (public internet) suggests the public-service threat model (CSRF, session theft, DDoS). Q58 already includes CSRF. Confirm the level. |
| K7 | Q39 | Retention periods per data class (usage ledger, receipts, logs, backups). Q32 proposes 30 days for trash; C11 proposes ~13 months for the usage ledger. |
| K8 | Q65 | Hosting budget at 100/1k/10k users. Monthly provider-call allowance per account (unit and rules fixed by C9). |
| K9 | Q66 | RPO 24h / RTO 4h were given as examples ("e.g."). Confirm them. Neon point-in-time recovery (PITR, Q23) allows a much lower RPO. |
| K10 | Q69 | Is English-only UI permanent or 1.0-only? |
| K11 | Q55 | "Low thousands" of pages per account. Confirm this is per account, with ~500 accounts in total (Q02). |
| K12 | Q22 | Experiment still pending: cold start + 60s generation within the Vercel plan's function limit. |
| K13 | Q17 / Q58 | Which OAuth providers (Google, Apple, GitHub…)? Does signing in with a new provider using the same verified email link to the existing account? How does a user recover an account after losing every passkey and provider access? |
| K14 | Q30 | Interpretation setting: account-level or per deck? Length cap for the line? Is the line flagged as possibly stale after a main-key or Context edit? |
| K15 | Q32 / Q72 | **Resolved by D02:** a page owns its module instances, so a moved page keeps its modules and components, and its next retry uses them. *Original question:* Content module instances belong to one deck. After a move, do the page's components count as no longer configured in the target deck, so its next retry adds new components beside them, or are they matched to the target deck's instances (by module type and order)? |
| K16 | D02 | **Resolved by D02:** the Context and manual components can move anywhere below the main key; the main key and Context become input modules, the main key compulsory and always first. *Original question:* can the Context move, and can manual components sit between content components? |
| K17 | D02 | **Resolved by D02:** it waits as "Not generated yet". *Original question:* does dragging a module onto a page generate it at once? |
| K18 | D02 | **Resolved by D02:** 12 module instances per page, including the main key and Context. *Original question:* is there a per-page limit? |
