# Product vision

## Objective: Where are we going?

This document describes Vocabularium's purpose, guiding principles, and long-term possibilities. An idea here is a direction to explore, not a commitment to implement it. [Scope](scope.md) identifies current capabilities; the [product model](model.md) defines the shared concepts.

## Purpose

Vocabularium helps people collect and work with useful text at the moment they encounter it. Captured material becomes a persistent karte, organized in a deck and developed through the user's chosen modules. A word, expression, sentence, passage, or text referring to a person, place, or concept can be a starting point.

The core is a rich, extensible library of creative and useful modules for text-related work across subjects, languages, projects, and purposes. Each module offers a deliberately designed capability; users can choose and combine these capabilities to shape what a karte provides.

The central promise is:

> Capture text without breaking your flow, and develop it through useful modules into a karte shaped for your purpose.

Language learning is one natural application of this generative knowledge-capture system. Translation is one possible contribution, and flashcard review is one possible interaction with a karte. Neither language pairs nor memorization define the underlying product model.

The [owner's competitor critique](competitor-critique.md) records the rationale behind this direction.

## Problems to solve

Manual karte creation interrupts discovery. People have to leave what they are reading, copy text, switch tools, and construct a karte. Vocabularium should reduce the effort between encountering useful material and keeping it.

Fixed interpretations are often too limited. A dictionary entry or predefined explanation may miss an expression, technical meaning, emerging usage, or context-dependent idea. Vocabularium should produce useful starting material that fits the input and the user's purpose, while leaving the user in control of the result.

Writing and managing prompts should not be the price of useful composition. Users should be able to discover understandable modules, choose suitable options, and combine them without designing every transformation themselves.

Feature accumulation can obscure a product's value. Vocabularium should grow through capabilities that deepen its capture and module system, with each addition serving a clear text-related purpose.

## Principles

1. **Minimize interruption.** Capture should fit into reading, browsing, watching, or listening with as little disruption as possible.
2. **Generate for context and purpose.** Use the captured material, relevant available context, and chosen modules to create a useful result.
3. **Build depth through modularity.** Develop a large library of creative, useful modules. Breadth is valuable when each module strengthens the same foundation for working with captured text; unrelated feature expansion is not a goal.
4. **Respect language differences.** Support varied languages, meanings, and information structures without making fixed source-to-target language pairs the central model. Translation should be available when it serves the user's purpose.
5. **Support different input sizes.** Short expressions and longer text should each have useful ways to become kartes.
6. **Use constrained primitives for expressive composition.** Modules are product capabilities with defined purposes, options, outputs, and quality expectations. Users should not need to write prompts. Seites are containers; modules determine what they produce, without requiring elaborate rules connecting modules.
7. **Generate selectively.** A module contributes when it applies to the input. A seite can validly contain no generated content.
8. **Keep content under user control.** Users can create kartes manually and correct, supplement, or remove generated material.
9. **Organize around decks.** Decks give captured material a home and define the layouts used by their kartes.
10. **Keep memorization optional.** Collection and reference should remain useful on their own. Review can serve users who want to study their material.
11. **Preserve material for future use.** A karte should remain useful beyond its initial generation. Develop ways for new modules to work with earlier captures while respecting their meaning and the user's saved content.
12. **Develop a distinctive interface.** Avoid generic SaaS layouts and interchangeable, AI-generated visual conventions. Visual and interaction choices should give Vocabularium a recognizable, deliberately crafted character while keeping its workflows clear and usable.

## UI/UX direction

The visual identity remains open. Current interfaces are a functional foundation, not the final design language. A unique and expressive UI/UX direction will be developed separately; this vision does not prescribe a palette, typography, component system, or screen layout. Concrete shared design rules will belong in the [shared UI specification](../specs/shared-ui.md).

## Long-term possibilities

Capture could extend beyond browser selection to hotkeys, sharing, and mobile devices. Where appropriate, source context could help interpret captured text.

Developing the module library is a primary product direction. Possibilities include technical explanations, simple explanations, historical context, timelines, related concepts, comparisons, summaries, key ideas, analysis, and clearly identified creative or speculative perspectives. Language modules could include pronunciation, audio, grammar, etymology, contextual examples, and character decomposition. Images, diagrams, and audio could provide further representations where they are useful.

The standard experience should offer curated modules and suitable predefined variants. Advanced module creation or customization APIs remain separate possibilities; ordinary users should not need them to get useful results. The [module specification](../specs/modules.md) separates current behavior from the design contract for future additions.

New modules could operate on previously captured material. Richer interpretation could retain a chosen meaning or referent across generations and let users correct it.

Users could assemble layouts for several languages or subjects, move or copy kartes between decks, and choose whether particular material participates in memorization or spaced review. Richer presentation and editing could make generated material easier to work with.

These possibilities require separate scope decisions and capability specifications before becoming implementation requirements.
