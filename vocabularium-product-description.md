# Vocabularium

## Product description

Vocabularium is a vocabulary capture and learning system designed to make collecting new language effortless. It lets users save unfamiliar language material—whether a word, phrase, or sentence—at the moment they encounter it, generates a useful contextual card, and places that card into a deck without interrupting the activity in which the vocabulary was discovered.

Vocabularium is built around the idea that vocabulary learning should adapt to the learner, the language, and the context—not force every learner into the same dictionary format or study workflow.

## The problem

Most flashcard and language-learning applications create friction in two ways:

1. **Manual card creation interrupts discovery.** When users encounter unfamiliar language while reading, browsing, watching, or listening, they often have to leave that activity, switch applications, copy information, and construct a card by hand. This context switching makes consistent vocabulary collection less likely.

2. **Fixed dictionary mappings are too limited.** A predefined word-to-word mapping cannot reliably cover expressions, slang, technical terminology, newly emerging usages, or words whose meaning depends heavily on context. This limitation is especially visible in languages such as Chinese, where meaning can be composed dynamically and the boundaries of a “word” are not always fixed.

Vocabularium addresses both problems by combining frictionless capture with generative, flexible cards.

## Core philosophy

### Capture vocabulary where it is discovered

Adding vocabulary should require as little interruption as possible. Depending on the platform, a user may select text, use a pop-up action, press a hotkey, or share text to Vocabularium on iOS and other devices.

The intended flow is:

```text
reading, browsing, watching, or listening
                ↓
       encounter unfamiliar language
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

The user should not need to think about constructing a card while they are discovering vocabulary.

### Generate contextual cards from any text

Vocabularium uses a generative card model. A card can be generated from a selected word, phrase, or sentence together with available context, source and target languages, and the page layout of the destination deck. The generated result is shaped by the input’s size and meaning: a word may call for translation and grammatical information, while a sentence may call for translation, explanation, vocabulary extraction, grammar analysis, or other modules placed on the card’s pages.

This makes it possible to create useful cards for language material that may not exist in a conventional dictionary, including:

- contextual meanings;
- multi-word expressions and idioms;
- slang and internet language;
- technical or specialized terminology;
- newly emerging usages;
- language-specific grammatical information;
- expressions whose meaning cannot be captured by a single fixed translation.

The result is not merely a lookup result. It is a generated card shaped for a particular learning purpose.

## Two card-creation modalities

Generated card creation supports two basic input modalities:

1. **Word or phrase input.** The user submits a single word, compound word, expression, or other short language unit. Vocabularium generates the information represented by the modules on the card’s pages.
2. **Sentence input.** The user submits a complete sentence. Vocabularium can generate a translation, contextual explanation, relevant vocabulary, grammar information, and any other modules placed on the destination deck’s pages.

These are input modes for generation. Manual creation and editing are separate ways to work with cards. Users can also:

- manually add a new card;
- manually edit a card created by generation;
- correct, remove, or supplement generated information;
- customize the pages and modules after generation.

Generated content should be treated as useful starting material that remains under the user’s control.

### Retry generation for one page

Users can explicitly regenerate one card page, replacing its content after confirmation. The [MVP Select and Add specification](docs/MVP-Product-spec-select-and-add.md#retry-the-current-page) defines the detailed retry behavior; its [page-completion rules](docs/MVP-Product-spec-select-and-add.md#page-completion-and-failure) distinguish failed generation from valid empty pages.

### Use language-aware modules

Different languages require different kinds of information. A German vocabulary card may benefit from an article, plural form, and conjugation. A Spanish card may need gender, pluralization, and conjugation. A Chinese card may benefit from pinyin, character decomposition, and a contextual explanation.

Vocabularium therefore treats language-aware information as independent modules rather than assuming one universal dictionary structure. Users assemble the modules they need; they do not need to construct a complex configuration system.

## Decks are the primary repository concept

A deck is the main place where vocabulary cards are collected, organized, and optionally studied. Users can create different decks for different languages, projects, sources, proficiency levels, or learning goals.

A deck defines the layout for its cards:

- how many pages every card has;
- which modules are placed on each page;
- whether memorization is enabled or disabled.

Every card belongs to exactly one deck. A card can be copied and pasted into another deck or moved into another deck, but it does not belong to multiple decks at the same time. The important principle is that the deck—not a fixed collection or study format—is the user’s primary vocabulary repository.

The deck layout is mostly a definition of pages and generation modules. If a deck defines three pages, every card in that deck has three pages, even if generation produces no content for one or more of them.

## Pages are containers; modules are Lego blocks

Each vocabulary card is presented as a sequence of pages. In the deck layout, a page is a simple container, and each module is an independent Lego-like generator that can be placed inside it. Pages and modules primarily exist in the layout definition; they are instructions for producing a card, not necessarily content that is stored or rendered by themselves.

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

Modules are the Lego-like generators of a card page. A module represents one piece of vocabulary information or one useful interaction and should function independently. A module exists in the deck layout and generates output only when it is triggered by the card’s input. Possible modules include:

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

This list is illustrative rather than exhaustive. The system should allow new module types to be introduced without changing the basic page model.

## Memorization is optional

Vocabularium can support memorization and spaced review, but memorization is not the definition of the product. Some users may want to collect and consult vocabulary without formal review. Others may want to turn selected decks or cards into a study routine.

The same deck and card model should support both use cases:

- vocabulary collection and reference;
- active memorization and review.

Memorization should be easy to enable or disable at the deck or card level rather than assumed for every saved card.

## Product principles

Vocabularium should remain guided by these principles:

1. **Minimize interruption.** Capturing vocabulary should fit into the user’s existing activity.
2. **Generate for context.** Cards should reflect the input, language, context, and learning purpose.
3. **Support any language.** The model should not depend on a closed set of fixed language-pair dictionaries.
4. **Respect language differences.** Different languages should be able to use different modules and information structures.
5. **Support different input sizes.** A word, phrase, or sentence can each become a meaningful generated card.
6. **Keep composition simple.** Pages are containers, and independent generator modules can be added, removed, and rearranged without complex configuration.
7. **Generate selectively.** Each module contributes only when it is relevant to the input; other modules may remain empty.
8. **Keep generated content editable.** Users should be able to manually add cards and revise anything generation produces.
9. **Use decks as the organizing foundation.** Every card belongs to one deck, and decks are where cards are collected, organized, and optionally studied.
10. **Keep memorization optional.** Learning through review should be available without making it mandatory.

## Summary

Vocabularium is a generative vocabulary system that is simple to assemble. It captures language material at the moment of discovery, creates contextual cards automatically, and organizes them in flexible decks. A word, phrase, or sentence can become a card through generation, while users can also add and edit cards manually. Each card consists of a mandatory front page followed by any number of pages, each acting as a container for independent language-aware modules that users can add, remove, and rearrange.

The product’s central promise is simple:

> Save language material without breaking your flow, and get a card shaped for how you want to learn it.
