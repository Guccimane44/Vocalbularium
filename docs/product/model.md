# Product model

## Objective: What do our terms mean?

This document defines Vocabularium's core concepts and their fundamental relationships. It is a conceptual model, not a database schema or a workflow specification. [Scope](scope.md) identifies current capability limits; [vision](vision.md) describes possible future uses.

## Account

An **account** owns a collection of decks and kartes and identifies which saved data belongs together. A Chrome installation is a client of that account, not a separate account or repository. The account has exactly one default deck.

## Deck and configuration

A **deck** is the primary collection of kartes, organized for a subject, language, project, source, or other purpose. Every karte belongs to exactly one deck.

A **deck configuration** defines the deck's settings, including its name, the ordered seites shared by its kartes, and the ordered module instances configured on each seite. Its seite and module settings describe how generation should produce content; they are distinct from the content already saved on an individual karte.

The **deck configuration page** is the interface for editing these settings. **Layout** refers specifically to the arrangement of seites and modules within the configuration.

The **default deck** is the account's designated destination for capture. Default is a role held by a deck, not a separate kind of deck.

## Karte and captured input

A **karte** is an individually identifiable item in a deck, containing content across the seites defined by that deck's configuration. It can originate from captured input or manual creation. Matching content does not make two kartes the same karte.

A karte is a persistent item for working with text, independent of any particular generated contribution or study interaction. It need not represent a translation pair or participate in memorization. Its identity remains the same when its seite content is edited or generation is retried.

**Captured input** is the original text submitted through capture. It is separate from displayed seite content, which may be generated or manually edited. Editing displayed content does not redefine the original generation input.

An **input interpretation** identifies the input category and, where needed, its source language. Module applicability uses that interpretation. Current classification and language choices are defined by the [module specification](../specs/modules.md#current-input-and-applicability).

### Direction: semantic continuity

The vision's persistent semantic object refers to the karte as the lasting home for captured material and its useful representations. It does not introduce an additional entity between a deck and its kartes, identify every matching text as the same concept, or require a particular storage design.

Preserving a chosen meaning or referent across future module runs is a product direction, not a current guarantee. Current interpretation does not establish a user-correctable, enduring semantic identity. Rules for contextual interpretation, corrections, and applying new modules to old captures remain open in the [modular product direction plan](../plans/modular-product-direction.md). Manually created kartes need not have captured input or an interpretation.

## Seite and front seite

A deck contains kartes. Each karte contains one or more seites. The deck’s layout defines the seites and their configured modules.

A **seite** is an ordered container within a karte. It corresponds to a seite defined in the deck configuration. That seite definition holds generation instructions; the karte seite holds that karte's content and generation outcome, where one exists.

The **front seite** is the first seite. Every karte must have one. It may contain the original input, generated information, manual content, or no content.

Seites have no inherent subject or language. A user may arrange them around translation, grammar, examples, or another purpose, but those meanings are choices made through the deck configuration.

An empty seite still exists and is part of the karte. Emptiness alone does not indicate a failed generation attempt.

## Module type, instance, and output

A **module type** defines one focused way to contribute content, such as displaying the selected text or generating an explanation. Some types use generative AI; others display input directly.

A module's purpose, applicable inputs, supported options, and output behavior are product-defined. The [module specification](../specs/modules.md) describes the current catalog and the design contract for future additions. A module can serve different subjects or languages within its applicability; it need not apply to every input.

A **module instance** is one placement of a module type on a seite defined in the deck configuration. The same type may have several instances on one seite or across seites. Their configured order determines the order of their contributed content.

**Applicability** means whether a module instance is relevant to the input interpretation. An inapplicable instance contributes no output. Instances share the input interpretation but evaluate their own applicability.

**Module output** is the content contributed by an applicable instance. Configured modules are instructions, not permanent boundaries around saved karte text. Current seite content can be edited independently of those instructions; editing need not preserve separate module blocks.

## Generation attempt and outcome

A **generation attempt** is one evaluation of the configured modules for a particular seite of a particular karte. It associates the target seite, captured input and interpretation, and the configuration used for that evaluation. Initial capture can involve attempts for several seites. A seite retry starts a new attempt on an existing karte seite.

A **generation outcome** describes the attempt's state or result. Seite content, generation outcome, and persistence are distinct: a saved karte can have failed generation, a successfully evaluated seite can be empty, and manually entered content does not establish generation success.

A seite can have no generation attempt. Manual creation and editing are content operations, not generation attempts. A karte's overall generation outcome is derived from its seite outcomes according to the capability specification.

The [Select and Add specification](../MVP-Product-spec-select-and-add.md) owns attempt states, seite completion, publication, failure, interruption, and retry behavior. This model does not define their transitions or recovery workflow.

## Draft and saved content

A **draft** is a user's unsaved change to a karte or deck configuration. **Saved content** is content acknowledged as persisted to the account. A draft is not synchronized account data merely because it is visible in a view.

Saving content and generating content are different operations. The detailed save acknowledgment, draft preservation, and recovery rules belong in the capability specifications.

## Fundamental relationships

```text
Account
├── Decks, with exactly one designated default
│   ├── Configuration: deck settings, ordered seites → ordered module instances
│   └── Kartes: each belongs to this deck only
│       ├── Captured input and interpretation, when applicable
│       └── Ordered karte seites defined by the deck configuration
│           ├── Content
│           └── Generation attempts and outcomes, when applicable
```

These are product relationships, not a prescription for storing every concept as a separate database entity. Seite-count limits, supported module types, and available actions belong in [scope](scope.md) and the detailed specifications.
