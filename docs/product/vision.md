# Product vision

## Objective: Where are we going?

This document describes Vocabularium's purpose, guiding principles, and long-term possibilities. An idea here is a direction to explore, not a commitment to implement it. [Scope](scope.md) identifies current capabilities; the [product model](model.md) defines the shared concepts.

## Purpose

Vocabularium helps people collect and work with useful text at the moment they encounter it. A word, phrase, sentence, or passage can become a contextual card shaped by the user's chosen modules and organized in a deck.

The central promise is:

> Save text without breaking your flow, and get a card shaped for what you want to do with it.

Language learning is a natural use case. The broader ambition is a tool for capturing and understanding text across subjects, languages, projects, and interests.

## Problems to solve

Manual card creation interrupts discovery. People have to leave what they are reading, copy text, switch tools, and construct a card. Vocabularium should reduce the effort between encountering useful material and keeping it.

Fixed interpretations are often too limited. A dictionary entry or predefined explanation may miss an expression, technical meaning, emerging usage, or context-dependent idea. Vocabularium should produce useful starting material that fits the input and the user's purpose, while leaving the user in control of the result.

## Principles

1. **Minimize interruption.** Capture should fit into reading, browsing, watching, or listening with as little disruption as possible.
2. **Generate for context and purpose.** Use the captured material, relevant available context, and chosen modules to create a useful result.
3. **Grow through independent modules.** Expand what cards can express through focused building blocks that users can choose and combine.
4. **Respect language differences.** Support varied languages and their information structures without depending on a closed set of language-pair dictionaries.
5. **Support different input sizes.** Short expressions and longer text should each have useful ways to become cards.
6. **Keep composition simple.** Pages are containers; modules determine what they produce. Users should not need elaborate rules connecting modules.
7. **Generate selectively.** A module contributes when it applies to the input. A page can validly contain no generated content.
8. **Keep content under user control.** Users can create cards manually and correct, supplement, or remove generated material.
9. **Organize around decks.** Decks give captured material a home and define the layouts used by their cards.
10. **Keep memorization optional.** Collection and reference should remain useful on their own. Review can serve users who want to study their material.

## Long-term possibilities

Capture could extend beyond browser selection to hotkeys, sharing, and mobile devices. Where appropriate, source context could help interpret captured text.

The module library could grow beyond language learning into technical explanations, summaries, key ideas, analysis, and clearly speculative perspectives. Language modules could include pronunciation, audio, grammar, etymology, images, and character decomposition. APIs could eventually let users create or customize modules.

Users could assemble layouts for several languages or subjects, move or copy cards between decks, and choose whether particular material participates in memorization or spaced review. Richer presentation and editing could make generated material easier to work with.

These possibilities require separate scope decisions and capability specifications before becoming implementation requirements.