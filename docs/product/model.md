# Product model

## Objective: What do our terms mean?

This document defines Vocabularium's core concepts and their fundamental relationships. It is a conceptual model, not a database schema or a workflow specification. [Scope](scope.md) identifies current capability limits; [vision](vision.md) describes possible future uses.

The model below is the owner-approved deck → page → component model ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72), [refactor plan](../history/plans/page-component-refactor.md)), with page-owned modules ([D02](../architecture/traceability-map.md#entries)). Release 0.4.0 implements the model and 0.5.0 implements D02. [Current scope](scope.md) lists what is supported. Builds up to v0.3.0+ called pages *kartes* and stored their content in *seites*. [Earlier terms](#earlier-terms) maps the old vocabulary.

## Account

An **account** owns a collection of decks and pages and identifies which saved data belongs together. A Chrome installation is a client of that account, not a separate account or repository. The account has exactly one default deck.

## Deck and configuration

A **deck** is the primary collection of pages, organized for a subject, language, project, source, or other purpose. Every page belongs to exactly one deck.

A **deck configuration** defines the deck's settings: its name, its ordered **module instances** (the compulsory main key module, an optional Context module, and content module instances), and its view. The module instances are the template for new pages: creating a page gives it a copy of them. After that the page owns its modules, and the deck configuration no longer affects it. Changing the configuration changes only pages created afterwards.

**Deck settings** is the interface for editing the configuration. The [deck configuration specification](../specs/decks-and-configuration.md) owns its rules and limits.

The **default deck** is the account's designated destination for capture. Default is a role held by a deck, not a separate kind of deck.

## Page and main key

A **page** is an individually identifiable item in a deck. It holds an ordered list of components. It can originate from captured input or manual creation. Matching content does not make two pages the same page.

A page is a persistent item for working with text, independent of any particular generated contribution or study interaction. It need not represent a translation pair or participate in memorization. Its identity remains the same when its components are edited or generation is retried.

The **main key** is the required, editable text that supplies the page's generation input. Capture initializes it with the selected text; manual creation requires the user to enter it. It is not a unique identifier: distinct pages may have the same main key.

The main key and the optional Context are the only text inputs for module generation. Module configuration determines what to produce from them. Changing the main key changes the input for subsequent generation, but does not start generation or change existing generated content. Editing another component does not change the main key.

**Captured input** describes the text originally supplied through capture. Capture is an input origin, not a prerequisite for generation. The original selection does not override an edited main key on subsequent generation. Capture may also supply an optional **Context** (the surrounding block, capped): a stored input aid for re-deriving interpretation, not a semantic referent — see the direction note below.

An **input interpretation** identifies the input category and, where needed, its source language for the main key used in a generation run. Module applicability uses that interpretation. Interpretation must correspond to that run's input; it cannot reuse a stale classification or language from an earlier main key. Current classification and language choices are defined by the [module specification](../specs/modules.md#current-input-and-applicability).

### Direction: semantic continuity

The vision's persistent semantic object refers to the page as the lasting home for captured material and its useful representations. It does not introduce an additional entity between a deck and its pages, identify every matching text as the same concept, or require a particular storage design.

Preserving a chosen meaning or referent across future module runs is a product direction, not a current guarantee. Current interpretation does not establish a user-correctable, enduring semantic identity. Rules for richer contextual interpretation and semantic corrections remain open. A saved Context helps re-derive interpretation from the original surroundings but does not itself fix a referent. A manually created page has a main key even if it has no interpretation or generation attempt yet.

## Component

A **component** is one ordered piece of a page's content. Every module instance on a page owns one component. A new page starts with a copy of the deck's module instances, in configured order:

1. the **main key component**, owned by the main key module (required, editable, always first);
2. the **Context component**, owned by the Context module when the deck has one (editable);
3. one **content component** per content module instance.

After creation the user shapes the page freely. They can delete any component except the main key, rearrange every component below the main key, and add modules by dragging them from the module window onto the page. A module added this way belongs to that page only; it does not change the deck. A deleted component stays gone: generation never brings it back, and the user adds the module again to restore it.

A component records the page's module instance that owns it. That ownership, not its position, identifies which instance produces or replaces it.

A **Text component** is the user's own writing, owned by a Text module instance. Generation never creates, replaces, or removes it. Text modules replace the earlier manual components, which no module owned.

A component's content is a versioned block document ([Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13)). The current modules produce plain text, stored as paragraph blocks and shown as plain text. A component can be empty; emptiness alone does not indicate a failed generation attempt. Components have no inherent subject or language; their meaning comes from the module that owns them or from what the user writes.

## Module type, instance, and output

Modules have three kinds:

- **Input modules** hold what capture or the user supplies; generation never fills them. The **main key module** is compulsory: every deck and page has exactly one, always first, and it cannot be removed. The **Context module** is optional, at most one per deck or page. The main key and Context are the generation input. The **Text module** holds the user's own writing; it can repeat and is never a generation input.
- **Content modules** produce components from the main key and Context.
- **View modules** show pages (see [View](#view)).

A **module type** defines one focused way to contribute content, such as displaying the selected text or generating an explanation. Some types use generative AI; others display input directly.

A module's purpose, applicable inputs, supported options, and output behavior are product-defined. The [module specification](../specs/modules.md) describes the current catalog and the design contract for future additions. A module can serve different subjects or languages within its applicability; it need not apply to every input.

A **module instance** is one placement of an input or content module type, either in a deck configuration, where it is a template for new pages, or on a page, where it owns one component. A deck or page holds at most 12 module instances, counting every module, including the main key, Context, and Text. Text and content module types may have several instances.

**Applicability** means whether a module instance is relevant to the input interpretation. An inapplicable instance contributes no output; its component completes empty. Instances in one generation run share the input interpretation but evaluate their own applicability.

**Module output** is the content an applicable instance contributes to its own component. A content module never changes another component. The user may edit a generated component; the edit lasts until the next retry of that component.

## View

A page is data; a **view** is one way to show it, as in a Notion database. View modules provide views, and a page is always shown through one.

The **default view** module shows a page as its ordered component list. It needs no configuration and is always available, so every page has a view even when no other view module is used. It always shows the main key.

Other view modules, such as a **card** view module that recreates the earlier karte design with a configurable layout, are later work. No term is defined for parts of a view; each view module's specification names its own settings.

A **layout** is how a deck's page list shows its pages: List, Table, or Gallery ([pages and editing](../specs/pages-and-editing.md#page-list)). A layout lists many pages; a view shows one. Layouts are presentation choices remembered on each installation, not modules and not part of the deck configuration ([D05](../architecture/traceability-map.md#entries)).

A **module family** groups module types by what they contribute (Meaning, Usage, Roots, Connections, Sound, Notes) and gives them their colour and icon ([modules](../specs/modules.md#module-families)). It is a property of the module type; it does not change what a module does.

## Generation attempt and outcome

A **generation attempt** is one evaluation of one content module instance for one page. It produces or replaces that instance's component. It associates the target component, the main key and Context values and interpretation used, and the module configuration used.

A **generation run** is one user or capture request that starts one or more attempts on the same page: all content components on capture, or one component on its card's **Generate** or **Retry**. The API also accepts every not-yet-generated component or every content component of a page in one run. Attempts in one run share one input interpretation.

A **generation outcome** describes an attempt's state or result. Component content, generation outcome, and persistence are distinct: a saved page can have a failed component, a successfully evaluated component can be empty, and manually entered content does not establish generation success.

A component can have no generation attempt. Manual creation and editing, including a main key edit, do not start generation. A page's overall generation outcome is derived from its component outcomes according to [Select and Add](../specs/capture-and-generation.md). Existing content and outcomes continue to describe their prior attempts until the user explicitly requests generation again.

The [page input and editing specification](../specs/pages-and-editing.md) owns main key creation and editing. [Select and Add](../specs/capture-and-generation.md) owns attempt states, completion, publication, failure, interruption, and retry behavior. This model does not define their transitions or recovery workflow.

## Draft and saved content

A **draft** is a user's unsaved change to a page or deck configuration. **Saved content** is content acknowledged as persisted to the account. A draft is not synchronized account data merely because it is visible.

Saving content and generating content are different operations. The detailed save acknowledgment, draft preservation, and recovery rules belong in the capability specifications.

## Fundamental relationships

```text
Account
├── Decks, with exactly one designated default
│   ├── Configuration
│   │   ├── Ordered module instances           (main key, optional Context, content; copied onto each new page)
│   │   └── View: default view                 (how pages are shown)
│   └── Pages: each belongs to this deck only
│       ├── Module instances, each owning one component:
│       │   ├── Main key (required, first; from capture or manual entry)
│       │   ├── Context (optional)
│       │   ├── Text (any number; never touched by generation)
│       │   └── Content components
│       └── Generation attempts and outcomes, per component
```

These are product relationships, not a prescription for storing every concept as a separate database entity. Limits, supported module types, and available actions belong in [scope](scope.md) and the detailed specifications.

## Earlier terms

Use this mapping when reading history, releases, issues, and code that predate the refactor.

| Earlier term | Current term |
| --- | --- |
| card (before 0.3.0+), karte (0.3.0+) | page |
| card page, page (before 0.3.0+), seite (0.3.0+) | component, for content. Its grouping on a face of the karte is presentation, which belongs to a view; the later card view module covers it. |
| front page, front seite | main key component |
| deck layout, layout seites | deck configuration: ordered content module instances |
| pinned layout revision | none; a new page receives a copy of the deck's content module instances |
| deck configuration page | deck settings |
| card view page, karte view page | opening a page ("Open page") |
| card content page, karte content page | page editor |
| manual component (0.4.x) | Text component, owned by a Text module (0.5.0) |

The 0.3.0+ [terminology plan](../history/plans/v0.3.0-plus-terminology-migration.md) and [compatibility record](../history/architecture/terminology-compatibility.md) describe the earlier migration and are historical.
