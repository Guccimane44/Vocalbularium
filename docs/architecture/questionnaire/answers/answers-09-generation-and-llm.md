### Q46

Pinned single model — predictable cost/quality/evals; single point of failure and price change.

### Q47

- Prompts in code, versioned with releases — simplest review and rollback; prompt tweaks ride the release train.

### Q48

- Metered with user-visible usage — most transparent; needs metering pipeline and UI before enforcement.
- Quota details (resolves C9, with Q25, Q56, Q65):
  - Unit: one provider call, whether it succeeds or fails: each component generation and each run's interpretation call count (amended 10 October 2026 by the owner, after Q72; a run makes one interpretation call plus one call per generative component). Token counts are also stored per call for cost tracking (see C11).
  - Counts: user-initiated generation and explicit Retry. The invisible transport/timeout retries (Q50) do not count. A cancel counts only if the provider call had already started (narrows Q56).
  - Period: a monthly allowance per account. The amount is a placeholder until cost per provider call is measured on the production model (K8).
  - At the limit: the Q25 degrade rule applies. The capture is saved, and generative components fail with "monthly quota reached" and the reset date.
  - Order: metering and the usage display ship at 1.0; enforcement turns on once the amount is set.

### Q49

Golden set per module, reviewed by the owner (revised from ad-hoc sampling to resolve C8).
- Each module has a fixed golden set of about 20–30 inputs: words, phrases, sentences, several languages, and ambiguous or tricky cases.
- The set runs before a module ships and before any prompt change merges (prompts live in code, Q47, so every prompt change goes through a PR). A script prints the new outputs next to the previous run.
- The owner reviews the diff against a short checklist: correct, applicable, well-formed blocks (Q13).
- The golden set is the "eval sample" required by a module proposal (Q05).
- No LLM judge at 1.0. Ad-hoc sampling continues after release to catch what the set misses. Revisit automated evaluation if the catalog outgrows manual review.

### Q50

- Explicit for users; bounded automatic retry for transient infrastructure errors only (revised to resolve C6 with Q25).
  - The worker silently retries provider transport errors and timeouts, up to 3 times with backoff + jitter (Q25). The Q24 idempotency key prevents paying twice for a completed provider response.
  - Content-level outcomes (invalid output, inapplicable/valid-empty) are never retried automatically.
  - After retries are exhausted, the user sees one failed component with an explicit Retry (Q08). Regenerating content is always the user's decision.

### Q51

- Delimit + validate (fenced input blocks, strict JSON schema, length caps, markup stripping) — baseline hygiene; needs tests per module.