# System-design questionnaire — from v0.3.0 baseline to mature Vocabularium

Use this as the research guideline for deciding what kind of system and architecture Vocabularium should become. For each question, the current baseline (from the repository), why it matters, and what to research are noted. Answers need not arrive in order — but answers in Section A constrain everything else.

Current baseline in one paragraph: Chrome MV3 extension (WXT + React) + local Fastify backend on `127.0.0.1:4318` + PostgreSQL 18 single-account (`account 1`, `admin/admin`), ordered single-process executor with advisory lock, five plain-text modules, generation via OpenCode Go (`deepseek-v4.1-flash`), no multi-user, no mobile/web client, no rich media, no spaced repetition, no public hosting. See [current scope](../product/scope.md), [product model](../product/model.md), [vision](../product/vision.md), [modules](../specs/modules.md), [local PostgreSQL guide](local-postgresql.md). Refs [#77](https://github.com/Guccimane44/Vocalbularium/issues/77).

Terminology: deck → karte → seite, per the [product model](../product/model.md) and [migration plan](../plans/v0.3.0-plus-terminology-migration.md).

## A. What does "mature" mean?

### Q1. What is the 1.0 maturity cut?
Which of these must be true for you to call it mature: (a) reliable daily-use capture for one owner, (b) shareable with family/small group, (c) public Chrome Web Store product, (d) multi-platform (web + iOS/Android), (e) revenue-sustaining? Pick the minimum gate.

### Q2. Who is the user?
Single owner-learner forever, or multiple end users? If multiple: strangers on the internet, or invited users (class, team)? This decides auth, tenancy, abuse, billing.

### Q3. What is the flagship job-to-be-done?
Rank these: language capture, general knowledge capture (people/places/concepts/passages), reference library, spaced memorization. The vision says "broader than language learning" ([competitor critique](../product/competitor-critique.md), section 4) but scope is currently language-only with five modules. Which use case must be excellent at 1.0 vs merely possible?

### Q4. What will you explicitly NOT build?
The vision warns against "feature accumulation" (competitor critique, section 7). List 3–5 things that stay out even at maturity (e.g. AI tutor, OCR, CEFR tests, social features). Research: which deferred items in [current scope](../product/scope.md#explicit-deferrals) are permanent no's?

## B. Clients and capture surfaces

Current: Chrome selection → context menu → default deck only, selected text only, no surrounding context.

### Q5. Which clients at maturity?
Chrome extension only, or also: hosted web app, Firefox/Safari, iOS share-sheet, Android share, desktop hotkey, audio/YouTube capture? For each: must-have / nice / out.

### Q6. What is "capture input"?
Today: selected text only, no page context ([modules](../specs/modules.md#current-input-and-applicability)). At maturity: include page URL/title, surrounding paragraph, source language hint, timestamp, user intent? How much context travels with a capture, and where is it stored vs sent to the LLM?

### Q7. Capture UX contract?
Should capture be fire-and-forget (background generation) or blocking with immediate karte open? Auto-open generated karte, whole-karte retry, per-module retry — which are required? (Currently deferred: auto-open, whole-karte retry, per-module retry.)

### Q8. Offline capture?
Must capture work with backend down / laptop offline / browser restarted? Current recovery is explicit manual retry, session-bound publication. Research browser `storage.local` limits, service-worker lifetime, and what "pending receipts survive restart" should mean at maturity.

## C. Identity, accounts, sync

Current: one built-in account, installations sharing one backend see the same account, login session 7 days, no registration.

### Q9. Account model?
Single local owner account forever (local-first), or real multi-user accounts with passwords/passkeys/OAuth? If multi-user: who can self-register, and what does onboarding create (default deck? sample kartes?)?

### Q10. Sync topology?
Options: (a) local-first single backend (current), (b) one hosted backend with many clients, (c) local + cloud sync with conflict resolution, (d) fully local with no server (IndexedDB/SQLite in extension). Which matches your privacy/hosting goals? What does "installations connected to same backend access same account" become with two phones + two browsers?

### Q11. Sync semantics?
Last-write-wins with explicit recovery (current), or CRDT/operational transform, or version vectors + merge UI? How should concurrent edits to the same karte/seite, deck layout change + karte edit, and layout shrink (seite deletion) resolve? Research: what conflict cases must never silently lose user text?

### Q12. Sharing / collaboration?
Any shared decks, public decks, export links? If no, state it — it removes a large authorization surface.

## D. Backend and deployment architecture

Current: single Fastify process, one-process advisory lock, at most five PostgreSQL connections, `GENERATION_MAX_ACTIVE=4` / `MAX_QUEUED=16`, loopback-only, `DATA_DIR` filesystem journal, no horizontal scale.

### Q13. Deployment shape at maturity?
(a) user self-hosts local backend (current), (b) you host one SaaS backend (Render/Fly/VPS/K8s), (c) both (local dev + hosted prod with same code). Who operates PostgreSQL, backups, TLS, updates? Is Render Free's non-durable persistence acceptable, or is durable journal + point-in-time recovery required?

### Q14. Scaling and multi-tenancy?
Must the backend handle more than one process (remove advisory single-process limit)? If yes: how are per-account ordering, generation locking, and idempotency (operation receipts, SHA-256 fingerprints) preserved across processes? What is the tenancy unit — one database per user, one schema, or shared tables with `account_id`?

### Q15. API stability?
Are `/api/kartes/...` + `karteId`/`seiteId`/`seites` the public v1 contract, or will it be versioned (`/v1/...`)? What is the deprecation policy for legacy `/api/cards` aliases and old extension builds? See [terminology compatibility](terminology-compatibility.md).

### Q16. Jobs and async work?
Does generation stay inline in the API process, or move to a queue + workers (BullMQ, pg-boss, Temporal)? Where do retries, timeouts (current 60s), token budgets (current 4096), rate limits per user/module live?

## E. Data model — deck / karte / seite + "semantic object"

Current model in the [product model](../product/model.md): Account → Decks (one default) → Kartes (one deck each, required editable main key on front seite) → Seites (ordered, defined by layout) → module instances → attempts/outcomes. The competitor critique wants persistent "semantic objects" (capture → semantic object → modules).

### Q17. What is stored vs generated?
Store: main key + per-seite text + layout + attempt metadata? Or also: interpretation (word/phrase/sentence + source language), per-module blocks, semantic referent ID (e.g. "Bismarck = Otto von Bismarck")? Research: does re-running a future new module on a two-year-old karte need anything beyond main key + language?

### Q18. How semantic should the object be?
Options: (a) main key string only (current direction), (b) main key + frozen interpretation, (c) main key + user-correctable meaning/referent + context snapshot. The model says "rules for richer interpretation remain open." Do you want users to correct "which meaning of X" and have future generations respect it? What happens when the main key is edited — keep old semantics or re-interpret?

### Q19. Layout evolution?
When deck layout changes (add/remove/reorder seites/modules), what happens to existing kartes: keep old seite content orphaned, migrate, empty-fill (current: new seites empty, retained seites keep text), or version layouts per karte? Do kartes ever diverge from deck layout, or always conform? Limits: 1–4 seites forever, or unbounded? Max modules per seite?

### Q20. Karte lifecycle?
Move/copy between decks (currently deferred) — copy semantics (deep copy + new ID + new attempts?) vs move (preserve ID/history)? Duplicates allowed forever? Soft-delete + trash + restore, or hard delete? Stable IDs across renames?

### Q21. History and provenance?
Store per-seite edit history, generation attempt log (prompt, model, timestamp, cost), source URL? How long, and who can see it? Needed for evals, debugging, "why does this say X?"

## F. Module system — the core differentiator

Current: five types, plain text joined with blank lines, applicability by word/phrase vs sentence + one source language, selective generation, no user-defined modules.

### Q22. Module catalog at 1.0?
Which modules are built-in and curated (translation, explanation, examples, pronunciation/audio, grammar, etymology, images, summary, timeline, ExplainSimply, HistoricalContext, Compare...)? Who decides the quality bar per module? What does "curated, not arbitrary prompts" mean operationally — product review + eval suite per module?

### Q23. Module configuration model?
Per-instance options: target language, tone/length, variant selection? Predefined variants vs free options? Can the same type repeat with different configs on one seite? How are defaults chosen? See the design contract in [modules](../specs/modules.md#design-contract-for-future-modules) — is that table the required spec template for every new module?

### Q24. Input sizes?
Word/phrase/sentence (current) vs passage/long-text modules (deferred). Max main-key length? Chunking strategy for passages? Different cost/latency/UX for long inputs?

### Q25. Multilingual core?
Keep "one source language per attempt" or support multiple interpretations per capture (deferred)? How to detect language — auto + user correction? Is translation still one module among many, or does any module need a target-language parameter?

### Q26. User-created modules / APIs?
The vision says "eventually APIs"; scope defers marketplace. At maturity: (a) no custom modules, (b) power-user prompt templates with guardrails, (c) full module SDK + marketplace with review? If (b)/(c): sandboxing, cost attribution, abuse, versioning, quality gates?

### Q27. Output representation?
Plain text forever, or rich blocks (headings, lists, ruby/pinyin, IPA, audio player, image, cloze)? If rich: Markdown subset, ProseMirror/TipTap JSON, or per-module schema? Editing granularity — whole seite text (current) vs per-module blocks? How does layout change preserve manual edits inside generated blocks?

## G. Generation pipeline and LLM strategy

Current: OpenCode Go subscription, `deepseek-v4.1-flash` default, JSON-in-instructions + local validation, one conversation ID per karte, provider calls outside DB executor, staged journal in `DATA_DIR/generation-outbox`, publish requires originating session, no auto-retry.

### Q28. Provider strategy?
Single provider/model pinned, multi-provider with fallback, or bring-your-own-key (user brings key)? OpenCode Go is "intended for coding-agent traffic" — is it the production path or a dev stand-in? Requirements: data retention / zero-retention, EU residency, logging, cost per karte, PII handling for captured text?

### Q29. Prompt and quality ownership?
Where do prompts live (code, DB, versioned registry)? How are they versioned, A/B tested, rolled back? What distinguishes inapplicable (valid empty) vs failure vs invalid output — who decides, and what does the user see for each? Current rules in [Select and Add](../MVP-Product-spec-select-and-add.md#seite-completion-and-failure) — keep or revise?

### Q30. Cost, limits, abuse?
Per-user rate limits, per-day generation quota, per-seite token budget, queue bounds (`GENERATION_MAX_ACTIVE`/`QUEUED`)? What happens at limit — degrade (save input only, current behavior) or block? Do you need usage metering + user-facing controls (deferred: "expanded generation-limit controls")?

### Q31. Evaluation?
"Systematic generation-quality evaluation" is deferred. At maturity: golden input set per module + language, human rubric, LLM-judge, regression on prompt change? What sample evidence (current style: `docs/history/evidence/deepseek-*.json`) is required before a module ships? Target languages for eval — which must pass?

### Q32. Reliability?
Retry policy: explicit user retry only (current), or auto-retry transient provider/DB failures? Idempotency across browser restart — can generation resume in a new session, or must it stay session-bound? Journal durability: is `DATA_DIR` on the same disk as PostgreSQL acceptable, or need object storage / WAL-level guarantee?

## H. Storage, sync, offline, and recovery

### Q33. Source of truth?
PostgreSQL only (current), or PostgreSQL + extension-local cache with sync protocol? What is cached (account, decks, kartes, drafts, receipts), for how long, and what happens on version skew (stale-client recovery — currently untested, see issue #24)?

### Q34. Drafts and saves?
Current: manual drafts intact across seite switch, save-all-seites-together, Cancel discards, failed saves retain draft + Try-again. Keep at maturity? Add autosave, dirty indicators, optimistic UI? What is the save unit — seite, karte, or deck layout transaction?

### Q35. Backup / export / import?
`db:backup`/`restore` exist for whole databases. At maturity: per-account export (JSON/SQLite), import (Anki/CSV?), account deletion + GDPR erasure? "Existing vocabulary import remains explicit future operation" — what formats must import support?

### Q36. Data retention?
How long are generation attempts, journals, logs, deleted kartes kept? When is something truly deleted from DB, backups, provider logs?

## I. Memorization (optional but architectural)

Scope: memorization optional at deck/karte level, no spaced repetition yet.

### Q37. Is review in 1.0?
If yes: SM-2/FSRS or simpler Leitner? Per-deck or per-karte opt-in? What is reviewable — front seite → rest, or per-seite? Does review need rich scheduling tables now (to avoid later migration), or can it be added without schema break?

### Q38. What is a "study interaction"?
The model says karte identity is independent of study interaction. Do you log reviews, lapses, latency? Does review mutate karte or separate progress tables? Research FSRS data requirements before locking schema.

## J. Organization, search, and scale

Current: karte list 30-at-a-time, four sort orders (Unicode NFKC + lowercase + code-unit + ID tiebreak), decks paged at 40, detail fetched on open.

### Q39. Organization primitives?
Decks only, or also tags, folders, search, filters (by module, language, failed generation, empty seite)? Full-text search in PostgreSQL (`tsvector` per language?) or external (Typesense/Meilisearch)? Sort orders to keep?

### Q40. Scale targets?
Design for: hundreds of kartes (current test scale), 10k, 100k per account? Bounded reads + pagination strategy for large decks? Performance budget for dashboard open, capture round-trip, generation p50/p95?

## K. Security, privacy, compliance

Current: `admin/admin`, loopback-only, sessions 7 days, polling 5s, health endpoints, no public auth.

### Q41. Threat model?
What is sensitive: captured text, source URLs, generated content, API keys? Risks: XSS via generated content (currently plain text — intentional?), CSRF, session hijack, prompt injection from captured page text into modules? Research: how is captured web text sanitized before prompt insertion?

### Q42. Secrets and auth?
`OPENCODE_API_KEY` server-only (current, never to extension) — keep? Real password hashing (argon2/scrypt), session store, CSRF tokens, rate-limit login? Host permission scoping (`VOCABULARIUM_API_URL` at build) — dynamic backend URL or build-time pinned?

### Q43. Compliance?
Need GDPR erasure/export, data processing addendum with LLM provider, age rating, Chrome Web Store privacy disclosures? Where is data hosted (jurisdiction)?

## L. Observability and operations

`docs/architecture/observability.md` and `overview.md` are currently empty; `local-postgresql.md` defines liveness/readiness.

### Q44. What must be observable?
Logs (per-request ID, per-generation attempt ID?), metrics (capture success, generation success/failure per module, latency, queue depth, cost), traces? `LOG_LEVEL` + `GET /health/*` enough, or need Sentry/OpenTelemetry/status page?

### Q45. Support and debugging?
How do you diagnose "my karte failed" without seeing user text? Redacted logs vs full-text debug mode with consent? Backend inspection tooling (admin view) — in scope?

## M. Distribution, monetization, and ops cost

Scope defers public hosting + Web Store distribution.

### Q46. Distribution?
Manual unpacked install forever, or Web Store + auto-update? Self-hosted backend per user vs one hosted backend you run? Update channel: how do DB migration (`db:migrate` with API stopped) + extension update ordering work for non-technical users? (Current policy: backend before extension.)

### Q47. Cost model?
Who pays for LLM: included in price, usage quota, bring-your-own-key? PostgreSQL hosting + backups + bandwidth budget at 100 / 1k / 10k users? Research actual per-karte cost from smoke samples before pricing.

### Q48. Support burden?
Single-owner debugging vs public issue triage, status communication, data-loss SLA? What "durable hosted persistence" guarantee do you promise (RPO/RTO)?

## N. UX identity and accessibility

Vision principle 12: distinctive, non-generic UI; shared UI rules belong in a shared UI spec (currently Light/Dark + keyboard + accessible cues only).

### Q49. Design language?
When is the expressive UI/UX direction decided — before or after architecture locks? Constraints architecture imposes: plain-text vs rich rendering, theming, navigation (`#karte/...` links), offline states, generation progress UI.

### Q50. Accessibility and i18n?
Target WCAG level, keyboard-only flows, screen-reader for seite navigation? UI languages: English-only or localized (German/Chinese...)? Generated content language vs UI language separation?

## O. Migration path from v0.3.0

### Q51. Compatibility horizon?
How long must v0.3.0 data, pending saves/receipts, `karte-draft`/`card-draft`, old `#card/` links, and `/api/cards` aliases keep working? What explicitly retires them (date/version/condition)? See [terminology compatibility](terminology-compatibility.md#upgrade-procedure-and-retirement).

### Q52. Sequencing?
What is the next increment after terminology migration — main-key implementation ([kartes and editing](../specs/kartes-and-editing.md#implementation-details-still-to-specify)), or hosting, or module expansion, or review? Which order minimizes rework (e.g. don't build spaced-repetition schema before semantic-object decision)?

## How to answer (so answers turn into architecture)

For each Q, give: decision / leaning + why + what would change your mind. Mark unknowns as `OPEN — need: [experiment/doc]`. Link any Notion decision records you want authoritative.

Suggested research order:

1. A + C + D (maturity, users, deployment) — locks ~80% of architecture.
2. E + F + G (semantic object, modules, LLM) — locks data + prompts.
3. H + K (sync/recovery, security) — locks correctness guarantees.
4. Rest as time allows.

Return answers as a numbered list (Q1–Q52, skip what you defer).
