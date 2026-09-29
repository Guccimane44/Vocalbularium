# Product model

## Objective: What do our terms mean?

This document defines Vocabularium's core concepts and their fundamental relationships. It is a conceptual model, not a database schema or a workflow specification. [Scope](scope.md) identifies current capability limits; [vision](vision.md) describes possible future uses.

## Account

An **account** owns a collection of decks and cards and identifies which saved data belongs together. A Chrome installation is a client of that account, not a separate account or repository. The account has exactly one default deck.

## Deck and configuration

A **deck** is the primary collection of cards, organized for a subject, language, project, source, or other purpose. Every card belongs to exactly one deck.

A **deck configuration** defines the deck's settings, including its name, the ordered pages shared by its cards, and the ordered module instances configured on each page. Its page and module settings describe how generation should produce content; they are distinct from the content already saved on an individual card.

The **deck configuration page** is the interface for editing these settings. **Layout** refers specifically to the arrangement of pages and modules within the configuration.

The **default deck** is the account's designated destination for capture. Default is a role held by a deck, not a separate kind of deck.

## Card and captured input

A **card** is an individually identifiable item in a deck, containing content across the pages defined by that deck's configuration. It can originate from captured input or manual creation. Matching content does not make two cards the same card.

**Captured input** is the original text submitted through capture. It is separate from displayed page content, which may be generated or manually edited. Editing displayed content does not redefine the original generation input.

An **input interpretation** identifies the input category and, where needed, its source language. Module applicability uses that interpretation. Current classification and language choices are defined by the [module specification](../history/mvp/MVP-Product-spec-modules.md#shared-input-and-applicability-rules).

## Page and front page

A **page** is an ordered container within a card. It corresponds to a page defined in the deck configuration. That page definition holds generation instructions; the card page holds that card's content and generation outcome, where one exists.

The **front page** is the first page. Every card must have one. It may contain the original input, generated information, manual content, or no content.

Pages have no inherent subject or language. A user may arrange them around translation, grammar, examples, or another purpose, but those meanings are choices made through the deck configuration.

An empty page still exists and is part of the card. Emptiness alone does not indicate a failed generation attempt.

## Module type, instance, and output

A **module type** defines one focused way to contribute content, such as displaying the selected text or generating an explanation. Some types use generative AI; others display input directly.

A **module instance** is one placement of a module type on a page defined in the deck configuration. The same type may have several instances on one page or across pages. Their configured order determines the order of their contributed content.

**Applicability** means whether a module instance is relevant to the input interpretation. An inapplicable instance contributes no output. Instances share the input interpretation but evaluate their own applicability.

**Module output** is the content contributed by an applicable instance. Configured modules are instructions, not permanent boundaries around saved card text. Current page content can be edited independently of those instructions; editing need not preserve separate module blocks.

## Generation attempt and outcome

A **generation attempt** is one evaluation of the configured modules for a particular page of a particular card. It associates the target page, captured input and interpretation, and the configuration used for that evaluation. Initial capture can involve attempts for several pages. A page retry starts a new attempt on an existing card page.

A **generation outcome** describes the attempt's state or result. Page content, generation outcome, and persistence are distinct: a saved card can have failed generation, a successfully evaluated page can be empty, and manually entered content does not establish generation success.

A page can have no generation attempt. Manual creation and editing are content operations, not generation attempts. A card's overall generation outcome is derived from its page outcomes according to the capability specification.

The [Select and Add specification](../MVP-Product-spec-select-and-add.md) owns attempt states, page completion, publication, failure, interruption, and retry behavior. This model does not define their transitions or recovery workflow.

## Draft and saved content

A **draft** is a user's unsaved change to a card or deck configuration. **Saved content** is content acknowledged as persisted to the account. A draft is not synchronized account data merely because it is visible in a view.

Saving content and generating content are different operations. The detailed save acknowledgment, draft preservation, and recovery rules belong in the capability specifications.

## Fundamental relationships

```text
Account
├── Decks, with exactly one designated default
│   ├── Configuration: deck settings, ordered pages → ordered module instances
│   └── Cards: each belongs to this deck only
│       ├── Captured input and interpretation, when applicable
│       └── Ordered card pages defined by the deck configuration
│           ├── Content
│           └── Generation attempts and outcomes, when applicable
```

These are product relationships, not a prescription for storing every concept as a separate database entity. Page-count limits, supported module types, and available actions belong in [scope](scope.md) and the detailed specifications.
