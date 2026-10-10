# Product model

## Objective: What do our terms mean?

This document defines Vocabularium's core concepts and their fundamental relationships. It is a conceptual model, not a database schema or a workflow specification. [Scope](scope.md) identifies current capability limits; [vision](vision.md) describes possible future uses.

The model below is the owner-approved deck → page → component model ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72), [refactor plan](../history/plans/page-component-refactor.md)). Release 0.4.0 implements it; [current scope](scope.md) lists what is supported. Builds up to v0.3.0+ called pages *kartes* and stored their content in *seites*. [Earlier terms](#earlier-terms) maps the old vocabulary.

## Account

An **account** owns a collection of decks and pages and identifies which saved data belongs together. A Chrome installation is a client of that account, not a separate account or repository. The account has exactly one default deck.

## Deck and configuration

A **deck** is the primary collection of pages, organized for a subject, language, project, source, or other purpose. Every page belongs to exactly one deck.

A **deck configuration** defines the deck's settings: its name, its ordered **content module instances**, and its view. Content module instances describe how generation produces components; they are distinct from the content already saved on an individual page. Generation always uses the deck's current configuration. Changing the configuration never changes existing pages until the user explicitly generates or retries on them. There is no pinned layout revision.

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

A **component** is one ordered piece of a page's content. By default a page grows top to bottom:

1. the **main key component** (required, editable);
2. the **Context component** (optional, editable);
3. one **content component** per content module instance in the deck configuration, in configured order.

A content component records the module instance that owns it. That ownership, not its position, identifies which instance produces or replaces it, so configuration edits never need positional remapping:

- **Instance added to the deck:** existing pages have no component for it until the user generates.
- **Instance removed from the deck:** components it produced stay as saved content, marked as no longer configured. Page retry does not touch them.
- **Instances reordered:** the page's component order follows the configuration.

A **manual component** is text the user adds that no module owns. Generation never creates, replaces, or removes it.

A component's content is a versioned block document ([Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13)). The current modules produce plain text, stored as paragraph blocks and shown as plain text. A component can be empty; emptiness alone does not indicate a failed generation attempt. Components have no inherent subject or language; their meaning comes from the module that owns them or from what the user writes.

Hiding or deleting individual components is not part of 1.0.

## Module type, instance, and output

Modules have two kinds:

- **Content modules** produce components from the main key and Context.
- **View modules** show pages (see [View](#view)).

A **module type** defines one focused way to contribute content, such as displaying the selected text or generating an explanation. Some types use generative AI; others display input directly.

A module's purpose, applicable inputs, supported options, and output behavior are product-defined. The [module specification](../specs/modules.md) describes the current catalog and the design contract for future additions. A module can serve different subjects or languages within its applicability; it need not apply to every input.

A **content module instance** is one placement of a content module type in the deck configuration. The same type may have several instances. Their configured order determines the order of their components.

**Applicability** means whether a module instance is relevant to the input interpretation. An inapplicable instance contributes no output; its component completes empty. Instances in one generation run share the input interpretation but evaluate their own applicability.

**Module output** is the content an applicable instance contributes to its own component. A content module never changes another component. The user may edit a generated component; the edit lasts until the next retry of that component.

## View

A page is data; a **view** is one way to show it, as in a Notion database. View modules provide views, and a page is always shown through one.

The **default view** module shows a page as its ordered component list. It needs no configuration and is always available, so every page has a view even when no other view module is used. It always shows the main key.

Other view modules, such as a **card** view module that recreates the earlier karte design with a configurable layout, are later work. No term is defined for parts of a view; each view module's specification names its own settings.

## Generation attempt and outcome

A **generation attempt** is one evaluation of one content module instance for one page. It produces or replaces that instance's component. It associates the target component, the main key and Context values and interpretation used, and the module configuration used.

A **generation run** is one user or capture request that starts one or more attempts on the same page: all content components on capture or **Generate**, only missing components on **Generate missing**, every configured content component on page **Retry**, or one component on component **Retry**. Attempts in one run share one input interpretation.

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
│   │   ├── Ordered content module instances   (what components generation produces)
│   │   └── View: default view                 (how pages are shown)
│   └── Pages: each belongs to this deck only
│       ├── Main key component (required; from capture or manual entry)
│       ├── Context component (optional)
│       ├── Content components, one per content module instance, owned by that instance
│       ├── Manual components, never touched by generation
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
| pinned layout revision | none; generation uses the current configuration |
| deck configuration page | deck settings |
| card view page, karte view page | opening a page ("Open page") |
| card content page, karte content page | page editor |

The 0.3.0+ [terminology plan](../history/plans/v0.3.0-plus-terminology-migration.md) and [compatibility record](../history/architecture/terminology-compatibility.md) describe the earlier migration and are historical.
