# Modules

## Purpose and authority

Modules provide focused capabilities that users choose and combine in a deck's configuration. A rich library of creative and useful modules is the central direction in the [product vision](../product/vision.md). The [product model](../product/model.md) defines module types, instances, outputs, pages, components, and views; [scope](../product/scope.md) identifies what is supported now.

The current rules below preserve the existing five-module baseline. Detailed catalog formats and examples remain authoritative in the [MVP module specification](../history/mvp/MVP-Product-spec-modules.md), which uses the earlier terms (read its *page* as component); its first-iteration rendering section, which joined outputs per page, no longer applies. [Capture and generation](capture-and-generation.md) owns generation completion, failure, interruption, publication, and retry behavior.

## Module kinds

Modules have three kinds ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72), [D02](../architecture/traceability-map.md#entries)):

- **Input modules** hold a page's generation input and are filled by capture or by the user, never by generation. The **main key module** is compulsory, exactly one per deck and page, always first, and cannot be removed. The **Context module** is optional, at most one per deck or page; a deck with it captures the selection's surrounding block. Accepted with D02, not built: 0.4.1 has the main key and Context as fixed page parts and a deck setting for Context.
- **Content modules** produce components from a page's main key and Context. Each instance owns one component per page. All five current types are content modules.
- **View modules** show pages. The **default view** is the only view module in the current refactor.

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

Modules receive the page's main key and, when present, its saved Context ([content module contract](#content-module-contract)). The Context only helps decide which meaning the main key has; modules never explain it. Required interpretation determines whether it is a word/phrase or a sentence and chooses one source language. Instances for a capture share that interpretation and evaluate applicability independently. These categories and language choices do not promise persistent meaning or referent resolution.

An inapplicable instance contributes no output and is not a generation failure. Failure to establish required interpretation or produce required content must not be disguised as inapplicability. See the [detailed applicability rules](../history/mvp/MVP-Product-spec-modules.md#shared-input-and-applicability-rules).

## Content module contract

This contract is implemented in release 0.4.0. [Pages and editing](pages-and-editing.md) owns the main key and Context; [Select and Add](capture-and-generation.md) owns attempt states, failure, and retry.

- **Input:** the page's current main key, its saved Context when present, and the input interpretation of the generation run. These are a content module's only text inputs, whether capture or manual entry supplied them. Module configuration remains the instructions governing the contribution.
- **Interpretation:** one interpretation per generation run, shared by every attempt in that run. It must correspond to the run's main key and Context; a changed key must not reuse a prior key's category or source language.
- **Output:** the block content of the instance's own component on that page. An instance never changes the main key, the Context, another instance's component, or a manual component. The current five types produce plain text, stored as paragraph blocks.
- **Applicability:** an inapplicable instance completes its component empty. Inapplicability is not failure.
- **Editing:** editing the main key or the Context does not run modules or change saved output. Existing output reflects the main key and Context used in its attempt and may differ from the current values after an edit. The user may edit a generated component; the next retry of that component replaces the edit after confirmation.

The five current types retain their output formats and applicability. References to selected text in their definitions mean the main key supplied to the attempt. Exact-input modules print that value, including a manually entered or edited main key.

## View module contract

A view module takes a page's components and decides what the user sees. It may depend on particular content components, and declares those dependencies. Views never change page data.

The **default view** module shows every component in page order: the main key first, then every other component, including the Context, in the page's order. Before [D02](../architecture/traceability-map.md#entries) ships, content components follow the deck's configured order, then components of instances no longer in the deck, then manual components. It needs no configuration and always shows the main key. Other view modules, including the **card** view module that recreates the earlier karte design, are later work and get their own specifications.

## Composition

Users add, remove, reorder, and repeat content module instances in deck settings, and add or remove the Context module, up to the [limit of 12 module instances](decks-and-configuration.md#configuration) including the main key and Context, and the deck's instances become the starting modules of each new page. After creation, users add, delete, and rearrange modules on the page itself ([D02](../architecture/traceability-map.md#entries), accepted, not built; [pages and editing](pages-and-editing.md#shaping-a-page)). Both use the module window. Adding an instance does not remove its type from the library. Repeated generative instances operate independently while sharing the run's interpretation; direct-input instances repeat the same input. Detailed repetition rules remain in the [existing specification](../history/mvp/MVP-Product-spec-modules.md#multiple-instances-of-a-module).

Each instance's output is its own component, and users edit each component separately. Deck configuration edits affect only pages created afterwards ([decks and configuration](decks-and-configuration.md#configuration-and-pages)).

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
| Composition and compatibility | Ordering, repetition, effects on saved components, and behavior when definitions change or older pages are used |

A module should interpret supported inputs according to their meaning rather than mechanically inserting text into a template. Not every module must work on every kind of text. Curated options should offer useful control without requiring users to define the module's behavior from scratch.

Systematic generation-quality evaluation, rich output, predefined variants beyond current choices, and advanced user-created modules remain subject to separate scope decisions.
