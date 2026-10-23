# Modules

## Purpose and authority

Modules provide focused capabilities that users choose and combine in a deck's configuration. A rich library of creative and useful modules is the central direction in the [product vision](../product/vision.md). The [product model](../product/model.md) defines module types, instances, outputs, pages, components, and views; [scope](../product/scope.md) identifies what is supported now.

The rules below describe content modules as **parent modules** with a core and facets ([D08](../architecture/traceability-map.md#entries)). Release 0.7.0 implements them. Until 0.6.3, the extension offered the three retired types, `German explanation`, `German explanation + examples`, and `Sentence usage`, as the [0.6.3 version of this specification](https://github.com/Guccimane44/Vocalbularium/blob/97ff10f/docs/specs/modules.md) describes, with formats in the [MVP module specification](../history/mvp/MVP-Product-spec-modules.md). [Capture and generation](capture-and-generation.md) owns generation completion, failure, interruption, publication, and retry behavior. From 0.8.0 every module is defined once in the **module catalog**, grouped by family, with its facets, their shapes and their prompts ([D11](../architecture/traceability-map.md#entries)); the [generation architecture](../architecture/generation.md) describes the catalog, the prompt composer and the provider adapters.

## Module kinds

Modules have three kinds ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72), [D02](../architecture/traceability-map.md#entries)):

- **Input modules** are filled by capture or by the user, never by generation. The **main key module** is compulsory, exactly one per deck and page, always first, and cannot be removed. The **Context module** is optional, at most one per deck or page; a deck with it captures the selection's surrounding block. The **Text module** holds the user's own writing and can repeat. The main key and Context are a content module's only inputs; Text never is. Implemented in 0.5.0 (D02); earlier releases had the main key and Context as fixed page parts, a deck setting for Context, and manual components instead of Text.
- **Content modules** produce components from a page's main key and Context. Every content module type is a [parent module](#parent-modules-and-facets). Each instance owns one component per page.
- **View modules** show pages. The **default view** is the only view module in the current refactor.

## Parent modules and facets

A **parent module** contributes one focused kind of content, such as a translation into one language. It has:

- a required **core**, which applies to every word, phrase, and sentence, so a parent never completes empty because of the kind of input;
- **facets**, each adding one kind of content about the core, such as an article, examples, or pinyin. A facet type belongs to one parent type, and the parent type fixes the order its facets appear in, whatever order the user adds them in.

From 0.8.0 the catalog defines the core as the parent's first facet, one the user cannot add or delete, and each parent owns all its facets: facets that look alike in two parents, such as German and Chinese Examples, are defined separately and may differ ([D11](../architecture/traceability-map.md#entries)). Input modules have no facets yet.

In a Languages parent, facets describe the core's translation, not the main key. When the main key is already in the parent's language, the core explains it in that language instead of translating it, and the translation the facets describe is the main key itself; this is how a user finds, for example, the article of a German noun.

Facets have no options. Variety comes from more parent types: a German and a Spanish translation are two parent types, not one type with a language setting ([D08](../architecture/traceability-map.md#entries); partly answers [Q41](../architecture/questionnaire/08-modules.md#q41-what-can-a-module-be-configured-with)).

A parent and its facets are one component, produced by one generation attempt, and **Retry** regenerates them together. Several instances of one parent type on a page generate independently, each from the main key and Context.

### Choosing and changing facets

- **Adding a parent.** A parent is added like any module, by dragging it or with its **+**, with its core only.
- **Adding a facet.** Since 0.8.1 a parent's facets are chosen on the parent itself: **Facet** among its actions, on a page or in deck settings, opens its [facet window](pages-and-editing.md#facet-window), which lists every facet of the parent's module ([D13](../architecture/traceability-map.md#entries)). Until 0.8.1 facets were listed in the module window beneath their parent type and dragged onto a parent of their own type or added with their **+** ([D08](../architecture/traceability-map.md#entries)). An added facet waits, shown as its tag only, until the user's next **Retry** regenerates the whole parent ([capture and generation](capture-and-generation.md#retry)); a parent already generating takes no facet until its attempt finishes.
- **Deleting a facet.** A facet is deleted from its parent the way a component is deleted from a page ([pages and editing](pages-and-editing.md#components-as-cards)). A deleted facet stays gone: Retry never brings it back, and the user ticks it again in the facet window to restore it.

A deck configuration stores each parent instance with its facets, and a new page copies them ([decks and configuration](decks-and-configuration.md#configuration-and-pages)). Facets are not module instances and do not count toward the limit of 12.

## Module families

Every input and content module belongs to one **module family**, which gives it its colour and icon in the interface ([D05](../architecture/traceability-map.md#entries); [shared UI](shared-ui.md#visual-identity)). The family is part of the module type's definition, shared by every client. A parent module's family colours its whole card; its facets have no family of their own. A new module joins an existing family; a further family is added only when a group of modules fits none of these.

| Family | Icon | What belongs here |
| --- | --- | --- |
| Languages | two speech bubbles | a translation into one language, with facets about it ([D08](../architecture/traceability-map.md#entries)); called Translation until 0.8.0 |
| Expertise | graduation cap | an explanation of a technical term or a difficult concept in one subject's context ([D11](../architecture/traceability-map.md#entries)) |
| Meaning | open book | explanations, definitions |
| Usage | quotation marks | example sentences, usage notes, collocations |
| Roots | sprouting stem | etymology, character parts, word history |
| Connections | linked nodes | related words, synonyms, comparisons, concepts |
| Sound | sound bars | pronunciation, audio, tones, stress |
| Notes | pencil | the user's own input: Context and Text |

The main key module belongs to no family; it is shown as the page title. Languages is a family of its own because a translation's facets span Meaning, Usage, Connections, and Sound; Expertise is one because it explains a key as one field understands it, whatever language the key is in. Families with no module yet (Meaning, Usage, Roots, Connections, Sound) stay defined so that future modules have a place; they add no module to the catalog. A Creative family, for parents that write something new from the key such as a poem, is added with its first parent. Languages is coloured petrol ([K26](../architecture/traceability-map.md#clarifications)) and Expertise leaf green ([K30](../architecture/traceability-map.md#clarifications)); deck colours stay the six earlier family colours ([decks and configuration](decks-and-configuration.md#navigation)).

## Catalog

| Parent module | Family | Core | Facets, in order |
| --- | --- | --- | --- |
| `German` | Languages | A word or phrase: an explanation in German, in the layout of the retired `German explanation`. A sentence: its German translation. | Article, Examples, Synonyms, Antonyms |
| `Chinese` | Languages | A word or phrase: an explanation in Chinese, in the same layout. A sentence: its Chinese translation. Simplified characters. | Examples, Pinyin |
| `Computer Science` | Expertise | A short explanation of the word, phrase or sentence for a learner, in the language preference, as computer science understands it ([writing in the interface language](#writing-in-the-interface-language)). Provisional (0.8.0). | none yet |
| `Mathematics` | Expertise | The same, as mathematics understands it. Provisional (0.8.0). | none yet |

| Facet | Tag | Word or phrase | Sentence |
| --- | --- | --- | --- |
| Article (German) | Ar | The translation's article, gender and plural; shown for nouns only | Not shown |
| Examples | Ex | Example sentences using the translation, each with its translation into the main key's language | One similar sentence, with its translation |
| Synonyms (German) | Sy | Words with the same meaning as the translation | Not shown |
| Antonyms (German) | An | Words with the opposite meaning | Not shown |
| Pinyin (Chinese) | Py | The pinyin of the Chinese translation | The pinyin of the Chinese translation |

Each facet type has an abbreviation that marks its [tag](pages-and-editing.md#facet-tags) on a card (since 0.7.1). From 0.8.0 no two facets of one parent share an abbreviation; facets of different parents may (until 0.8.0 no two facet types shared one, which a growing catalog cannot keep). The facets above keep their abbreviations.

When the main key is already in the parent's language, examples have no translation line. The Expertise modules write in the account's language preference, as the interface does, English by default ([D14](../architecture/traceability-map.md#entries); [shared UI](shared-ui.md#interface-language)); a key in another language is still explained in that language. How they write in it is set out in [writing in the interface language](#writing-in-the-interface-language). Their prompts name the language and carry its writing guide, so the prompt version differs per language ([generation record](../architecture/generation.md#generation-record)). The input modules belong to these families: Context and Text to Notes; the main key to none. Names remain provisional.

`German explanation`, `German explanation + examples`, and `Sentence usage` are retired ([D08](../architecture/traceability-map.md#entries)), as `<The selected>` and `<The selected + original language tag>` were before them ([D03](../architecture/traceability-map.md#entries)). Release 0.7.0 deletes their deck instances and the components they produced along with every deck and page (migration `0011`, [scope](../product/scope.md#upgrade-from-earlier-builds)).

## Explanations

Since 0.8.1 every module in the module window and every facet has an **explanation**, so a user can learn what it does without trying it ([D13](../architecture/traceability-map.md#entries)). It has:

- **a few sentences** on what the module or facet contributes and when to use it; a facet's also says which inputs it applies to, such as words only;
- **a sample** of its output for a word and for a sentence, rendered as its card renders it. A content module's sample is its preview sample, the one the deck-settings preview shows; a facet's is its own part of that sample, and a facet that applies to one input type only shows that one. Context shows its sample text; Text, which starts empty, has none. The core has no explanation of its own: its parent's explains it.

A module's explanation opens from its module window entry ([shared UI](shared-ui.md#module-window)); a facet's from its row in the [facet window](pages-and-editing.md#facet-window). The one-line descriptions stay. The main key, which is not in the window, has no explanation. Explanations are written in English, the default interface language, and in each other interface language beside it (`explanation.<language>.md`); the window shows the one in the language preference ([D14](../architecture/traceability-map.md#entries)). Each lives in its module's or facet's folder in the catalog ([generation architecture](../architecture/generation.md#module-catalog)).

## Writing in the interface language

The Expertise modules' output reads as written in the interface language, not translated into it ([D15](../architecture/traceability-map.md#entries)). The Languages modules, which write in their own language, and the Creative family, whose language requirements will differ, are not affected; a later family gets this only by its own decision ([K39](../architecture/traceability-map.md#clarifications)).

- **A writing guide per language.** Every interface language has a short writing guide for the Expertise family, written in English with short example phrases in that language. It covers five things: the register (a clear explanation for a learner, written as the language is natively written) and the stock phrases to avoid; how a technical term is written at first use, the established term with the English in brackets, keeping the English where no translation is current, so an invented term shows; what stays as it is (code, formulas and symbols, identifiers, commands and the selection); the language's punctuation and spacing; and the unit a length limit is counted in ([K41](../architecture/traceability-map.md#clarifications)). Every Expertise request carries the guide of the interface language; no module repeats it.
- **English prompts only.** The Expertise modules' prompts and the rules every request carries stay in English in every language; no module has a translated prompt. A translated prompt would need a new decision with evidence for its language.
- **Length.** A module states a length limit in a form that holds in every language: the guide restates it in the unit the language counts in, such as 50 words in English or French and about 80 characters in Chinese ([K40](../architecture/traceability-map.md#clarifications)).
- **Review per language.** Expertise generation in a language is checked before that language is offered: each Expertise module's golden set runs in it and is read by a reviewer separate from the drafter, for facts, invented terms and the guide's conventions ([K42](../architecture/traceability-map.md#clarifications)). The six languages offered since 0.9.0 are reviewed in the release that adds the guides and keep following the preference meanwhile; a language added later is offered only once its strings, its guide and its Expertise generation have passed review ([shared UI](shared-ui.md#interface-language)).
- **Before the guides are built**, a short run of Computer Science in Chinese and French compares a guide written in English with one written in the language; the English guide is adopted unless clearly worse, and otherwise the owner decides ([K43](../architecture/traceability-map.md#clarifications); [prompt test](../history/evidence/writing-guide-prompt-test.md)).

## Input and applicability

Modules receive the page's main key and, when present, its saved Context ([content module contract](#content-module-contract)). The Context only helps decide which meaning the main key has; modules never explain it.

The run's **interpretation** decides only whether the main key is a word or phrase, or a sentence. It selects the core's behavior and which facets apply. It does not choose a source language, because the language of a key is often ambiguous: each parent's generation reads the language from the key and Context, so two parents may read an ambiguous key differently. The classification is shown under the main key and cannot be corrected; to change it, the user edits the key ([pages and editing](pages-and-editing.md#required-main-key)). Instances for a run share the interpretation. It does not promise persistent meaning or referent resolution.

Applicability is judged per facet. A parent's core always applies. A facet that does not apply to the input, such as Article for a verb or Synonyms for a sentence, contributes nothing and is not shown; this is not a failure. Failure to establish the interpretation or produce required content must not be disguised as inapplicability.

## Content module contract

[Pages and editing](pages-and-editing.md) owns the main key and Context; [Select and Add](capture-and-generation.md) owns attempt states, failure, and retry.

- **Input:** the page's current main key, its saved Context when present, and the run's interpretation. These are a content module's only text inputs, whether capture or manual entry supplied them. The parent type and the instance's facets are the instructions governing the contribution.
- **Interpretation:** one interpretation per generation run, shared by every attempt in that run. It must correspond to the run's main key and Context; a changed key must not reuse a prior key's classification.
- **Output:** the block content of the instance's own component on that page: the core, then each applicable facet in the parent's order. An instance never changes an input module's component or another instance's component. Parents produce JSON, stored as markdown per facet in one typed block ([render contracts](#render-contracts); D09).
- **Applicability:** the core always applies; an inapplicable facet is left out ([input and applicability](#input-and-applicability)). A facet the provider leaves out, or returns empty, counts as an omitted facet; anything else outside the parent's shape fails the attempt.
- **Editing:** editing the main key or the Context does not run modules or change saved output. Existing output reflects the main key and Context used in its attempt and may differ from the current values after an edit. The user may edit a generated component; the next retry of that component replaces the edit after confirmation.

## Render contracts

Since 0.7.4 the provider returns a parent's content as JSON, and the app keeps it as **markdown per facet** ([D09](../architecture/traceability-map.md#entries), amended; [C21](../architecture/traceability-map.md#conflicts)). Generation validates the JSON strictly against the parent's shape, then formats it into markdown as the card looks, and the component stores one typed block in its block document ([Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13)): the core's top line, the core's markdown, and one markdown text per facet with content.

**The provider's JSON**, complete for every result:

- **Core, word or phrase:** the key's language, the key, an optional romanization, and a list of meanings in the parent's language, at least one.
- **Core, sentence:** its translation, or for a sentence already in the parent's language, an explanation of its meaning.
- **Core, Expertise:** for a word or phrase, the key and an explanation; for a sentence, an explanation. The explanation is a list of one to three paragraphs, one string each, so no line break has to travel inside a JSON string (fixed with the golden sets, 0.8.0). Its top line shows the key, or that the core is a sentence's, without a language or romanization.
- **Article:** `{ singular, plural }`, the plural optional, such as `das Ufer` and `die Ufer`.
- **Examples:** a list of `{ sentence, translation }`, the translation optional, not tied to meanings.
- **Synonyms**, **Antonyms:** lists of words.
- **Pinyin:** a list of `{ text, pinyin }`, one per meaning for a word and one for a sentence.

**Formatted into markdown** when it is stored:

| Part | Markdown |
| --- | --- |
| Core, word | the meanings as a numbered list |
| Core, sentence | the translation as text |
| Core, Expertise | the explanation as text, in paragraphs |
| Article | one line, `das Ufer · die Ufer` (the singular alone without a plural) |
| Examples | a numbered list, each item the sentence with its translation on the next line in italics |
| Synonyms, Antonyms | one line, the words separated by commas |
| Pinyin | a line each, `河岸 hé'àn` |

The core's **top line** (the key's language, the key and its romanization, or that the core is a sentence's) stays structured: shown as a heading and never edited. The supported markdown is bold, italic, bulleted and numbered lists, inline code and highlight (`==text==`), and since 0.7.5 a text size and a font on a stretch of text, written as a bracketed span, `[text]{size=small}`, `[text]{size=large font=display}` (sizes `small` and `large`, fonts `display` and `mono`; normal size and the text font need no span), and since the third amendment a highlight colour, `[text]{highlight=green}` (`green`, `blue`, `pink`, `orange`; the default yellow is written `==text==`); anything else is shown as typed. The default highlight is the same yellow as the main key's emphasis. Since the fourth amendment the main key's emphasis is itself a stored highlight: when generated content is formatted, each occurrence of the main key in the core and every facet is written as `==…==` (not inside code or an existing highlight), and the card draws no emphasis of its own, so the editor shows the same highlights and the user can remove or add them. Since 0.7.5 the markdown is internal to storage: the editor never shows it, and characters the user types are stored escaped, so they show as typed ([D10](../architecture/traceability-map.md#entries)). The card renders each facet's markdown inside that facet's fixed container, under its label, in the parent's order, and emphasises the main key in it. A facet whose markdown is empty has no content: its container is not shown and its [tag](pages-and-editing.md#facet-tags) is blander. A core whose markdown is empty shows only its top line. Rendering is a pure function of the stored content, shared by every client; it never produces HTML ([Q59](../architecture/questionnaire/answers/answers-11-security-privacy.md#q59)). The iteration plan fixes each parent's JSON shape with its golden set ([C8](../architecture/traceability-map.md#conflicts)); from 0.8.0 each shape is defined once, in its facet's folder in the catalog ([D11](../architecture/traceability-map.md#entries)). Each future module's specification states its shape, its formatting and its containers under *Output and presentation*.

## View module contract

A view module takes a page's components and decides what the user sees. It may depend on particular content components, and declares those dependencies. Views never change page data.

The **default view** module shows every component in page order: the main key first, then every other component, including the Context, in the page's order. It needs no configuration and always shows the main key. Other view modules, including the **card** view module that recreates the earlier karte design, are later work and get their own specifications.

## Composition

Users add, remove, reorder, and repeat content module instances in deck settings, and add or remove the Context and Text modules, up to the [limit of 12 module instances](decks-and-configuration.md#configuration) counting every module, and the deck's instances become the starting modules of each new page. After creation, users add, delete, and rearrange modules on the page itself, and add or delete a parent's facets ([D02](../architecture/traceability-map.md#entries); [pages and editing](pages-and-editing.md#shaping-a-page)). Both use the module window for modules and, since 0.8.1, a parent's facet window for its facets. Adding an instance does not remove its type from the library. Repeated instances of one parent type generate independently while sharing the run's interpretation.

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
