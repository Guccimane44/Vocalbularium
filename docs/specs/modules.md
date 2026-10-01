# Modules

## Purpose and authority

Modules provide focused capabilities that users choose and combine in a deck's layout. A rich library of creative and useful modules is the central direction in the [product vision](../product/vision.md). The [product model](../product/model.md) defines module types, instances, outputs, kartes, and seites; [scope](../product/scope.md) identifies what is supported now.

The current rules below preserve the existing five-module baseline. Detailed catalog formats and examples remain authoritative in the [existing module specification](../history/mvp/MVP-Product-spec-modules.md) during the specification taxonomy migration. This document does not move or rewrite those examples. [Select and Add](../MVP-Product-spec-select-and-add.md) owns generation completion, failure, interruption, publication, and retry behavior.

## Current catalog

| Module type | Contribution | Applicable input |
| --- | --- | --- |
| `<The selected>` | Exact captured text, without generation | Word, phrase, or sentence |
| `<The selected + original language tag>` | Exact text followed by its chosen source-language name | Word, phrase, or sentence |
| `<German explanation>` | Explanation in German of the input in its chosen source language | Word or phrase |
| `<German explanation + examples>` | German explanation plus examples in the source language and German translations | Word or phrase |
| `<Sentence usage>` | A usage example in the chosen source language | Sentence |

Names remain provisional. Required output formats are defined in the linked catalog.

## Current input and applicability

Modules receive the selected text without surrounding webpage context. Required interpretation determines whether it is a word/phrase or a sentence and chooses one source language. Instances for a capture share that interpretation and evaluate applicability independently. These categories and language choices do not promise persistent meaning or referent resolution.

An inapplicable instance contributes no output and is not a generation failure. Failure to establish required interpretation or produce required content must not be disguised as inapplicability. See the [detailed applicability rules](../history/mvp/MVP-Product-spec-modules.md#shared-input-and-applicability-rules).

## Accepted main-key input contract

The owner-approved input change is specified in [Kartes and editing](kartes-and-editing.md) and is [pending implementation](../product/scope.md#accepted-change-pending-implementation). It supersedes capture-only input for the target behavior:

- Modules use the karte's current main key as their only text input, whether capture or manual entry supplied it. Module configuration remains the instructions governing the contribution.
- Required interpretation and applicability must use that main key. Changing it must not leave later generation using a prior key's category or source language.
- Editing the main key does not run modules or change saved output. The user explicitly requests generation or generation again.
- Existing output reflects the main key used in its generation attempt and may differ from the current main key after an edit.
- A front seite must display the main key even if no input-printing module is configured or no modules contribute output.

The five current types retain their output formats and applicability. Under the accepted input model, references to selected text in those module definitions mean the main key supplied to that attempt. Exact-input modules must print that supplied value, including a manually entered or edited main key.

## Current composition and editing

Users select, place, reorder, and repeat module instances within the deck's ordered seites. Adding an instance does not remove its type from the library. Repeated generation instances operate independently while sharing the capture's interpretation; direct-input instances repeat the same input. Detailed repetition rules remain in the [existing specification](../history/mvp/MVP-Product-spec-modules.md#multiple-instances-of-a-module).

Outputs are plain text, combined in configured order with a blank line between nonempty contributions. Inapplicable instances add no separator. Users edit a seite's text as a whole; saved text need not retain separate module-output boundaries. Empty seites remain valid. See [rendering rules](../history/mvp/MVP-Product-spec-modules.md#first-iteration-rendering) and [empty seites](../history/mvp/MVP-Product-spec-modules.md#empty-pages).

## Design contract for future modules

This section guides the specification of new modules. It does not add modules, output formats, controls, or quality-evaluation infrastructure to current scope.

Modules should feel like deliberately designed product capabilities. Users should be able to understand and compose them without writing prompts. A large catalog should deepen the same system for working with captured material, with each module serving a clear purpose.

Before implementing a new module or changing an existing one, its specification should address:

| Aspect | Required design decisions |
| --- | --- |
| Purpose | The user need, useful outcome, and how it differs from existing modules |
| Input and semantics | Applicable inputs, required language/context/interpretation, and handling of ambiguity or insufficient information |
| Configuration | Supported choices or predefined variants, their defaults, and their observable effects |
| Generation or transformation | Expected contribution and any dependencies on interpretation or other capabilities |
| Output and presentation | Content structure, rendering, media behavior where relevant, and how users inspect and edit the result |
| Quality | Observable criteria and representative examples, including unsupported inputs and failure cases; distinguish factual output from creative or speculative output |
| Failure and fallback | How inapplicability, unavailable information, invalid output, and execution failure are distinguished; any fallback must preserve the promised purpose and follow shared generation rules |
| Composition and compatibility | Ordering, repetition, effects on saved content, and behavior when definitions change or older kartes are used |

A module should interpret supported inputs according to their meaning rather than mechanically inserting text into a template. Not every module must work on every kind of text. Curated options should offer useful control without requiring users to define the module's behavior from scratch.

Systematic generation-quality evaluation, rich output, predefined variants beyond current choices, and advanced user-created modules remain subject to separate scope decisions.
