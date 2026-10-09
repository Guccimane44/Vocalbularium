# 08 — Modules (Q40–Q45)

Modules are the product strategy: a large library of constrained, productized capabilities users compose, not a prompt box. Each question here protects that idea from degrading into "ChatGPT with saved prompts."

## Q40. What is the 1.0 module catalog?

**Decision:** Which modules ship built-in and curated (translation, explanation, examples, pronunciation/audio, grammar, etymology, summary, timeline, ExplainSimply, HistoricalContext, Compare...), each with its quality bar?

**Context:** Five provisional types exist with fixed output formats and applicability, defined across the current catalog and the linked MVP module spec ([modules](../specs/modules.md)). The vision's examples span text, audio, images, explanations, examples, facts, and structured views ([vision](../product/vision.md)). The design contract already lists what a new module spec must cover: purpose, input/semantics, configuration, generation, output/presentation, quality, failure/fallback, composition ([modules](../specs/modules.md#design-contract-for-future-modules)).

**Options:**
- Deepen the five (quality + variants, no new types) — smallest scope; proves the eval and versioning pipeline before breadth.
- Curated expansion (e.g. +pronunciation/audio, +etymology, +summary) — matches general-capture ambitions; each addition needs its spec row filled and eval samples passing.
- Broad launch (10+ types) — most impressive demo; spreads eval and prompt-maintenance thin and risks uneven quality.

**Answer prompt:** List the 1.0 types with one-line purpose each and the non-goals. Research task: fill the design-contract table for one candidate module end-to-end as a template.

## Q41. What can a module be configured with?

**Decision:** Per-instance options: target language, tone/length, predefined variants? Can the same type repeat with different configs on one seite?

**Context:** Users place, reorder, and repeat instances; repeats of generative instances operate independently while sharing the capture's interpretation, and direct-input instances repeat the same input ([modules](../specs/modules.md)). Outputs concatenate in configured order with blank-line separators; inapplicable instances add nothing. Vision says users enable/disable, reorder, pick collections and predefined variants — but generally do not write prompts ([competitor critique](../product/competitor-critique.md)).

**Options:**
- Fixed behavior per type (no options) — simplest to spec and eval; forces near-duplicate types for each variant.
- Predefined variants (e.g. explanation: concise/standard/deep) — curated control without prompt-writing; variant matrix must be tested.
- Free options (language picker, length slider) — most flexible; explodes the eval matrix and invites prompt-injection via options.

**Answer prompt:** Define the option schema per 1.0 type with defaults and observable effects. Research task: enumerate the variant matrix for the explanation module and count the eval cases it implies.

## Q42. What input sizes are supported?

**Decision:** Word/phrase/sentence only (today) vs passage/long-text modules? Max main-key length, chunking, and cost policy?

**Context:** Current applicability splits on word/phrase vs sentence plus one source language; passage generation and beyond-five-types modules are deferred ([scope](../product/scope.md), [modules](../specs/modules.md)). Long inputs change token budgets (4096 output today), latency (60s limit), cost, and the "selective generation" story (a module may cover only part of a passage).

**Options:**
- Short inputs only — keeps budgets and evals tight; passages stay out of scope with a clear error message.
- Passage summarization/key-ideas as dedicated modules — bounded expansion; needs chunking rules and per-chunk vs whole-text output contracts.
- Any length, any module — most general; every module needs a long-input behavior and the cost ceiling must be enforced per attempt.

**Answer prompt:** Set the max lengths and the over-limit behavior (reject, truncate with warning, chunk). Research task: run the current pipeline on a 2000-word passage and record tokens, latency, and output quality.

## Q43. How multilingual is the core?

**Decision:** Keep one source language per attempt, or support multiple interpretations per capture? How is language detected and corrected?

**Context:** Required interpretation picks word/phrase-vs-sentence and one source language; instances share it and judge applicability independently; inapplicable is not failure ([modules](../specs/modules.md)). Multiple source-language interpretations for one capture are deferred ([scope](../product/scope.md)). The vision rejects language-pair modeling while requiring translation when it serves the purpose ([vision](../product/vision.md)).

**Options:**
- One language per attempt (current) — simple, predictable; multilingual users recapture or pick one lens per karte.
- Auto-detect + user correction — better UX; needs a correction UI and a rule that regeneration uses the corrected language, never a stale one (accepted main-key contract).
- Multi-interpretation attempts — richest; multiplies cost and complicates applicability (which interpretation governs which module?).

**Answer prompt:** Pick the model and the correction flow. Research task: capture 10 mixed-language inputs and record where auto-detection would need correction.

## Q44. Can users create or customize modules?

**Decision:** (a) no custom modules, (b) power-user templates with guardrails, or (c) full SDK + marketplace with review?

**Context:** Future user-created modules and customization APIs are possibilities, explicitly deferred; ordinary users must not need them ([vision](../product/vision.md), [scope](../product/scope.md)). The critique warns that an open instruction box turns the product into saved prompts the user must design ([competitor critique](../product/competitor-critique.md)).

**Options:**
- (a) Curated only — protects quality and the "constrained primitives" identity; all demand flows through your module roadmap.
- (b) Guardrailed templates (fill-in slots, no free prompts) — some customization without prompt-writing; needs slot validation and eval per template.
- (c) SDK + marketplace — platform play; needs sandboxing, versioning, cost attribution, abuse review, and a quality gate before listing.

**Answer prompt:** Pick a–c and, if (b)/(c), define the review gate. Research task: write three user-requested modules and test whether each fits (a), needs (b), or truly needs (c).

## Q45. How do module outputs compose and survive edits?

**Decision:** Whole-seite text (today) vs per-module blocks? What happens to manual edits when layouts change or generation re-runs?

**Context:** Configured modules are instructions, not permanent boundaries: saved text need not retain module-output boundaries and edits happen per seite ([model](../product/model.md), [modules](../specs/modules.md)). Main-key edits never auto-regenerate or erase content; only explicit generation does ([kartes-and-editing](../specs/pages-and-editing.md)).

**Options:**
- Whole-seite text (current) — simplest editor; re-generation overwrites manual refinements unless the user copies them aside.
- Per-module blocks with manual overlays — preserves hand-edits across re-runs; needs block identity, merge rules, and a conflict UI.
- Append-only generations (history of runs per seite) — nothing lost; seites accumulate runs and need a "current" picker.

**Answer prompt:** Pick the composition model and write the re-generation rule (what is replaced, what is kept, what needs confirmation). Research task: hand-edit a generated seite, re-run generation, and record what a careful user would expect to survive.
