# Modular product direction

## Status and boundaries

The owner-approved direction is to develop Vocabularium around a large, curated library of creative and useful modules for working with text. This plan identifies future decisions and dependencies; it does not authorize their implementation or assign them to a release. [Current scope](../product/scope.md) remains the five-module, plain-text baseline.

The [vision](../product/vision.md) owns the purpose and UI/UX direction, the [model](../product/model.md) owns deck → karte → seite and shared concepts, and the [module specification](../specs/modules.md) owns the current module map and the design contract for additions.

## Product rationale

The [owner's competitor critique](../product/competitor-critique.md) motivates this direction: translation-centered, fixed-language-pair, flashcard-first workflows can constrain broader uses of captured text. Accumulating unrelated AI features can obscure the central value. Vocabularium instead aims for persistent kartes and constrained primitives that users can compose expressively, with translation and memorization available when useful.

Competitor quality, adoption, and market-saturation claims are owner observations or hypotheses, not verified research or acceptance criteria. The resulting requirements should describe Vocabularium's own behavior.

## Proposed sequence

### 1. Define semantic continuity

Clarify what a chosen interpretation needs to retain beyond the current input category and source language:

- Distinguish identical text used with different meanings or referents, without merging distinct kartes.
- Decide what context is captured, retained, and available to later modules.
- Decide whether and how users select or correct an interpretation.
- Specify how a correction affects saved outputs and subsequent generation.
- Define provenance and what happens when interpretation is uncertain or unavailable.

Acceptance scenarios should demonstrate that modules intended to address the same subject do so, and that corrections do not silently overwrite saved content. The plan does not yet choose a semantic storage schema or promise automatic understanding of arbitrary concepts.

### 2. Specify applying modules to earlier captures

Before offering new modules on old kartes, define:

- How users choose a karte, seite, and module, within the deck-layout model.
- Which captured input, interpretation, and configuration the operation uses.
- Whether output is appended, replaces content, or requires a layout change.
- How edited content is protected and replacements are confirmed.
- What is possible for manually created kartes without captured input.
- How changed module definitions, failures, interruptions, and retry interact with existing recovery rules.

Acceptance scenarios should cover an older capture, manually edited content, ambiguous input, and failure recovery. This capability is distinct from the current confirmed seite retry.

### 3. Expand through complete modules

Select additions by the value they contribute to text-related work. Specify each using the [module design contract](../specs/modules.md#design-contract-for-future-modules), with representative inputs from different subjects or languages where applicable. Possible families include explanations, context, comparisons, timelines, examples, pronunciation, and related concepts; these are candidates rather than an accepted catalog.

Structured text, images, diagrams, and audio require their own presentation, editing, persistence, and recovery decisions before a module relies on them. Advanced prompt customization or module APIs should be evaluated separately from the standard curated experience.

### 4. Develop the distinctive UI/UX

Explore a visual and interaction language that helps users discover, understand, preview, and compose modules. Avoid generic SaaS layouts and interchangeable AI-generated styling. The owner will develop the expressive design direction later; do not infer a palette, typography, or layout from this plan.

Record agreed common interaction and accessibility rules in the [shared UI specification](../specs/shared-ui.md), and workflow-specific behavior in its capability specification. Detailed design may proceed alongside module work once its direction is agreed.

## Advancing a capability

For each selected increment, resolve its relevant questions, define observable acceptance criteria, and update scope and affected specifications as the capability is agreed and implemented. Preserve existing data, edits, and recovery behavior. Record actual verification in the increment's evidence rather than treating this direction as proof of support.
