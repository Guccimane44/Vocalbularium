# Vocabularium

## Product description

Vocabularium is a generative knowledge capture program designed to make collecting and working with useful text effortless. It lets users save a word, phrase, sentence, or passage when they encounter it, generate a contextual card with the modules they choose, and place that card into a deck without interrupting their activity.

Vocabularium is built around the idea that people should be able to work with text in ways that fit their goals, the content, and its context.

The vision we have for Vocabularium is that it should go beyond language flashcards and support all kinds of text-based content.

## The problem

Many tools for collecting and understanding text create friction in two ways:

1. **Manual card creation interrupts discovery.** When users encounter a useful term, passage, or idea while reading, browsing, watching, or listening, they often have to leave that activity, switch applications, copy information, and construct a card by hand. This context switching makes consistent capture less likely.

2. **Fixed interpretations are too limited.** A dictionary entry or predefined explanation cannot reliably cover expressions, technical concepts, newly emerging usages, or text whose meaning depends heavily on context. The same text may call for different explanations depending on the user's subject and purpose.

Vocabularium addresses both problems by combining frictionless capture with generative, flexible cards.

## Core philosophy

### Capture text where it is discovered

Capturing text should require as little interruption as possible. Depending on the platform, a user may select text, use a pop-up action, press a hotkey, or share text to Vocabularium on iOS and other devices.

The intended flow is:

```text
reading, browsing, watching, or listening
                ↓
     encounter useful or unfamiliar text
                ↓
             select or share it
                ↓
       add it to Vocabularium
                ↓
      generate a card automatically
                ↓
          save it to a deck
                ↓
             continue the activity
```

The user should not need to think about constructing a card while exploring the source material.

### Generate contextual cards from any text

Vocabularium uses a generative card model. A card can be generated from selected text together with available context and the page layout of the destination deck. The result is shaped by the input and the chosen modules: a technical term may call for an explanation in its field, while a sentence may call for translation, summary, analysis, or another result placed on the card’s pages.

This makes it possible to create useful cards for material that may not fit a fixed reference source, including:

- contextual meanings;
- multi-word expressions and idioms;
- slang and internet language;
- technical or specialized terminology;
- newly emerging usages;
- language-specific grammatical information;
- expressions whose meaning cannot be captured by a single fixed translation;
- passages that call for explanation, summary, or a perspective from a particular field.

The result is a generated card shaped for the user's purpose.

### Choose and combine modules

One strength of Notion is that people can view the same information in different ways. Vocabularium follows a similar idea: users choose and combine modules to decide what a captured piece of text becomes, rather than accept one fixed card format.

Vocabularium aims to offer a large and growing library of modules, many powered by generative AI. Each generative module has a focused prompt, so new modules can be introduced and improved quickly. Some modules support language learning; others can bring knowledge or perspectives from fields beyond it.

For example, a computer science module could explain a selected term such as `frontend` in its technical context. A module inspired by Einstein could offer a speculative perspective on a captured idea.

In the future, Vocabularium could also provide APIs that let users create and customize modules. The range of possible modules should grow with the interests and needs of its users.

## Two card-creation modalities

Generated card creation supports two basic input modalities:

1. **Word or phrase input.** The user submits a term, compound word, expression, or other short piece of text. Vocabularium generates the information represented by the modules on the card’s pages.
2. **Sentence input.** The user submits a complete sentence. Vocabularium can generate an explanation, translation, summary, analysis, or other content requested by modules on the destination deck’s pages.

These are input modes for generation. Manual creation and editing are separate ways to work with cards. Users can also:

- manually add a new card;
- manually edit a card created by generation;
- correct, remove, or supplement generated information;
- customize the pages and modules after generation.

Generated content should be treated as useful starting material that remains under the user’s control.

### Retry generation for one page

Users can explicitly regenerate one card page, replacing its content after confirmation. The [MVP Select and Add specification](docs/MVP-Product-spec-select-and-add.md#retry-the-current-page) defines the detailed retry behavior; its [page-completion rules](docs/MVP-Product-spec-select-and-add.md#page-completion-and-failure) distinguish failed generation from valid empty pages.

## Decks are the primary repository concept

A deck is the main place where cards made from captured text are collected, organized, and optionally studied. Users can create different decks for different subjects, languages, projects, sources, or goals.

A deck defines the layout for its cards:

- how many pages every card has;
- which modules are placed on each page;
- whether memorization is enabled or disabled.

Every card belongs to exactly one deck. A card can be copied and pasted into another deck or moved into another deck, but it does not belong to multiple decks at the same time. In the card workflow, the deck is the user's primary repository for captured text and its generated content.

The deck layout is mostly a definition of pages and generation modules. If a deck defines three pages, every card in that deck has three pages, even if generation produces no content for one or more of them.

## Pages are containers; modules are Lego blocks

Each card is presented as a sequence of pages. In the deck layout, a page is a simple container, and each module is an independent Lego-like generator that can be placed inside it. Pages and modules primarily exist in the layout definition; they are instructions for producing a card, not necessarily content that is stored or rendered by themselves.

The user should be able to assemble a deck layout by dragging modules into a page, rearranging them, or removing them. The same simple interaction defines how generated cards are produced.

Modules do not need to be triggered together. Generation evaluates each module independently and contributes only when that module is relevant to the input. A module that is not triggered produces no output and does not render anything on the card. The exact card is produced from the input and the modules placed on each page.

Beyond the mandatory front page, Vocabularium should impose as few structural rules as possible:

- the deck defines how many pages every card has;
- each page can contain any suitable combination of independent modules;
- modules can be added, removed, and rearranged by choice;
- a page may contain no rendered content when none of its modules are triggered;
- pages do not have fixed meanings such as “translation,” “grammar,” or “examples”;
- languages can organize pages, but they do not have to.

This is a simple composition model, not a complex configuration model. Users define the pages and place independent generator modules on them. There is no need to define elaborate schemas or rules connecting modules together.

The only fundamental invariant is:

> Every card must have a front page.

The front page will usually contain the original input or expression through a print-input module, but users may place any additional generator modules there.

### Flagship example: one expression, multiple language pages

A user learning several languages might assemble a card like this:

```text
Vocabulary card
│
├── Front page — required
│   └── Word: house
│
├── German page
│   ├── Translation: das Haus
│   ├── Article
│   ├── Plural: die Häuser
│   ├── Example
│   └── Other customized German modules
│
└── Spanish page
    ├── Translation: la casa
    ├── Gender: feminine
    ├── Plural: las casas
    ├── Example
    └── Other customized Spanish modules
```

This is a flagship use case, not a required template. Another user might create only two pages, place pronunciation on the front page, combine definitions and examples on one page, or create separate pages for grammar, etymology, and character analysis. Each of these layouts is assembled by adding and removing independent generator modules.

For example:

```text
Front page
→ Chinese expression + audio

Page 2
→ Pinyin + contextual explanation

Page 3
→ Character decomposition

Page 4
→ German translation
```

The page and module system exists to support different purposes, not to enforce a universal card format.

### Example: triggered modules determine the rendered card

Consider a deck layout with two pages:

```text
Page A
└── Print input module

Page B
├── German translation module
└── German article module
```

If the user adds an English sentence, the result is:

```text
Page A
└── The original sentence is printed

Page B
└── The German translation is printed
```

The German article module is not triggered, so it produces no output and nothing else is rendered on the card. Page B still exists because the deck defines it, but it contains only the output of the module that applies to this input. The same layout can produce different content for another card when different modules are relevant.

## Modules

Modules are independent building blocks that users choose and arrange on card pages. Each module has a focused purpose. A generative module uses a prompt to produce one kind of result from the captured text; another module may simply display the original input. A module contributes output only when it applies to that input.

Language-learning modules could include:

- the original input, word, phrase, or sentence;
- translation;
- definition or contextual explanation;
- pronunciation and audio;
- article, gender, or noun class;
- plural and other inflected forms;
- conjugation;
- example sentences;
- synonyms and antonyms;
- usage notes and register;
- etymology;
- character or component decomposition;
- images or other contextual material.

The library can also grow beyond language learning. Possible modules could explain terms in a particular field, summarize a passage, extract key ideas, or offer a clearly speculative perspective on the text. These examples are illustrative.

New modules should fit the same composition model so their prompts and outputs can be developed and improved without changing the basic page structure. In future iterations, APIs could let users create or customize modules of their own.

## Memorization is optional

Vocabularium can support memorization and spaced review, but memorization is not the definition of the product. Some users may want to collect and consult captured material without formal review. Others may want to turn selected decks or cards into a study routine.

The same deck and card model should support both use cases:

- collection and reference;
- active memorization and review.

Memorization should be easy to enable or disable at the deck or card level rather than assumed for every saved card.

## Product principles

Vocabularium should remain guided by these principles:

1. **Minimize interruption.** Capturing text should fit into the user's existing activity.
2. **Generate for context.** Cards should reflect the input, its context, and the user's purpose.
3. **Grow through modules.** Offer a broad, evolving library of independent modules that users can combine, including AI-powered modules beyond language learning and, eventually, modules customized through APIs.
4. **Support any language.** The model should not depend on a closed set of fixed language-pair dictionaries.
5. **Respect language differences.** Different languages should be able to use different modules and information structures.
6. **Support different input sizes.** A word, phrase, or sentence can each become a meaningful generated card.
7. **Keep composition simple.** Pages are containers, and independent generator modules can be added, removed, and rearranged without complex configuration.
8. **Generate selectively.** Each module contributes only when it is relevant to the input; other modules may remain empty.
9. **Keep generated content editable.** Users should be able to manually add cards and revise anything generation produces.
10. **Use decks as the organizing foundation for cards.** Every card belongs to one deck, where it can be collected, organized, and optionally studied.
11. **Keep memorization optional.** Learning through review should be available without making it mandatory.

## Summary

Vocabularium is a generative knowledge capture program for working with text. It saves material at the moment of discovery, creates contextual cards automatically, and organizes them in flexible decks. Selected text can become a card through generation, while users can also add and edit cards manually. Each card consists of a mandatory front page followed by any number of pages, each acting as a container for independent modules that users can add, remove, and rearrange.

The product’s central promise is simple:

> Save text without breaking your flow, and get a card shaped for what you want to do with it.
