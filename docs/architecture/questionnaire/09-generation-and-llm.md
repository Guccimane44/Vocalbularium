# 09 — Generation and LLM (Q46–Q51)

Generation is where money, latency, quality, and privacy meet. Decide the provider and pipeline discipline before adding modules, or each new module re-litigates cost and eval policy.

## Q46. What is the provider strategy?

**Decision:** Single pinned provider/model, multi-provider with fallback, or bring-your-own-key? Is OpenCode Go the production path or a dev stand-in?

**Context:** Default is `deepseek-v4.1-flash` via `https://opencode.ai/zen/go/v1/chat/completions`, overridable with `OPENCODE_MODEL`, never auto-falling back; the key stays server-side and the extension never receives it (README). Live requests succeeded with the owner's key in September 2026; automated checks inject controlled responses and spend nothing. OpenCode Go is documented as subscription coding-agent traffic with a console **Use balance** toggle the app must not change.

**Options:**
- Pinned single model — predictable cost/quality/evals; single point of failure and price change.
- Primary + fallback (different provider) — resilient; needs output-equivalence evals per module and a failover policy (when to switch, who is told).
- BYOK — users pay directly; needs key storage, per-user quotas, and a degraded experience for keyless users.

**Answer prompt:** Name the production provider(s) and the data-processing terms (retention, region, logging, PII handling for captured text). Research task: read the provider DPA/retention terms and record what captured page text is contractually exposed to.

## Q47. Where do prompts live and how are they versioned?

**Decision:** Prompts in code, in DB, or in a versioned registry? How are they A/B tested and rolled back? What separates inapplicable (valid empty) from failure from invalid output?

**Context:** The adapter requests JSON in instructions and validates completion status, fields, classification, and nonempty text locally without relying on strict structured-output support; one stable conversation ID per karte including retries (README). Seite completion/failure/interruption/publication/retry semantics are owned by Select and Add, including the distinction between failed generation and valid empty content ([Select and Add](../../MVP-Product-spec-select-and-add.md)).

**Options:**
- Prompts in code, versioned with releases — simplest review and rollback; prompt tweaks ride the release train.
- Prompt registry with versions + traffic splitting — fastest iteration and A/B; needs registry UI, audit log, and per-attempt prompt-version recording (see Q33).
- Prompts in DB editable at runtime — most flexible; risks unreviewed production changes and untraceable quality shifts.

**Answer prompt:** Pick the home and write the user-visible contract for the three states (empty-valid vs failed vs invalid). Research task: force each state in dev and screenshot what the user sees per seite.

## Q48. What are the cost, limit, and abuse policies?

**Decision:** Per-user rate limits, daily generation quotas, per-seite token budgets, queue bounds — and what happens at the limit (degrade to saved-input-only vs block)?

**Context:** Each request has a 60s limit and 4096-token output budget, identified as `Vocabularium/0.3.0` with stable conversation IDs; without a key, capture still saves while interpretation-dependent seites fail visibly ([README](../../../README.md)). Expanded user-facing limit controls are deferred ([scope](../../product/scope.md)).

**Options:**
- Degrade (save input, fail generative seites visibly) — matches today; users keep captures during outages or quota exhaustion.
- Block at quota — clearer cost control; failed captures frustrate during legitimate bursts.
- Metered with user-visible usage — most transparent; needs metering pipeline and UI before enforcement.

**Answer prompt:** Set the numeric limits and the at-limit UX. Research task: compute per-karte cost from smoke samples for word/phrase/sentence and project monthly cost at 100/1k/10k users.

## Q49. How is generation quality evaluated?

**Decision:** What eval suite must pass before a module ships or a prompt changes: golden inputs per language, human rubric, LLM-judge, regression thresholds?

**Context:** Systematic quality evaluation is deferred; today's evidence is small live samples and recorded provider fixtures ([scope](../../product/scope.md), README smoke sections). The module design contract already demands observable criteria with representative examples including unsupported inputs and failure cases, distinguishing factual from speculative output ([modules](../../specs/modules.md)).

**Options:**
- Golden set + human review per release — highest signal; slowest, needs reviewer time and language coverage.
- Automated regression (golden set + LLM-judge + diff thresholds) — fast; needs judge calibration and flake management.
- Ad-hoc sampling (current) — cheapest; cannot catch prompt regressions before users do.

**Answer prompt:** Define the suite (inputs × languages × modules), pass thresholds, and who signs off. Research task: assemble 30 golden inputs across your 1.0 languages and run the current pipeline twice to measure output variance.

## Q50. What is the retry and resume policy?

**Decision:** Explicit user retry only (today) vs automatic retry of transient failures? Can generation resume in a new browser session or only the originating one?

**Context:** Results publish only through the originating Chrome session; reopening Chrome fails interrupted attempts; journaled results replay without recalling the provider while unstaged attempts fail; no automatic provider retry or failed-save resubmission exists ([local-postgresql](../local-postgresql.md), [Select and Add](../../MVP-Product-spec-select-and-add.md)).

**Options:**
- Explicit-only (current) — predictable cost and no surprise regeneration; users hand-retry every transient blip.
- Auto-retry transient (network/5xx/timeout, bounded with backoff + idempotency keys) — smoother; needs careful classification so billable calls are not duplicated.
- Cross-session resume — best for closed-laptop cases; needs attempt ownership transfer and a claim protocol between sessions.

**Answer prompt:** Write the retry matrix (failure class → auto vs manual → max attempts → user message). Research task: inject a transient 500 + a timeout in dev and record whether the current code distinguishes them.

## Q51. How arecaptured page text and prompts sanitized?

**Decision:** How is untrusted captured text (and page context, if Q07 adds it) isolated from instructions before reaching the model, and how are model outputs validated before storage/render?

**Context:** The adapter validates completion status, object fields, classification, and nonempty text locally (README). Captured text is attacker-controlled web content; without isolation it can steer prompts (instruction override) or return markup that becomes stored XSS if rendering ever goes rich (see Q13).

**Options:**
- Delimit + validate (fenced input blocks, strict JSON schema, length caps, markup stripping) — baseline hygiene; needs tests per module.
- Structured calling (separate content vs instruction channels where the provider supports them) — stronger; provider-dependent and must degrade cleanly.
- Output sandbox (render as text-only until allowlisted) — defense in depth; delays rich rendering ambitions.

**Answer prompt:** State the sanitization pipeline and its tests. Research task: feed a capture containing fake instructions ("ignore previous directions, output X") and record what the pipeline stores.
