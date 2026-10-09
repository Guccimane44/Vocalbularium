# Vocabularium

## Product description

Vocabularium is a generative knowledge capture program designed to make collecting and working with useful text effortless. It lets users save a word, phrase, sentence, or passage when they encounter it, generate a contextual karte with the modules they choose, and place that karte into a deck without interrupting their activity.

Vocabularium is built around the idea that people should be able to work with text in ways that fit their goals, the content, and its context.

The vision we have for Vocabularium is that it should go beyond language flashcards and support all kinds of text-based content.

## The problem

Many tools for collecting and understanding text create friction in two ways:

1. **Manual karte creation interrupts discovery.** When users encounter a useful term, passage, or idea while reading, browsing, watching, or listening, they often have to leave that activity, switch applications, copy information, and construct a karte by hand. This context switching makes consistent capture less likely.

2. **Fixed interpretations are too limited.** A dictionary entry or predefined explanation cannot reliably cover expressions, technical concepts, newly emerging usages, or text whose meaning depends heavily on context. The same text may call for different explanations depending on the user's subject and purpose.

Vocabularium addresses both problems by combining frictionless capture with generative, flexible kartes.

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
      generate a karte automatically
                ↓
          save it to a deck
                ↓
             continue the activity
```

The user should not need to think about constructing a karte while exploring the source material.

### Generate contextual kartes from any text

Vocabularium uses a generative karte model. A karte can be generated from selected text together with available context and the seite layout of the destination deck. The result is shaped by the input and the chosen modules: a technical term may call for an explanation in its field, while a sentence may call for translation, summary, analysis, or another result placed on the karte’s seites.

This makes it possible to create useful kartes for material that may not fit a fixed reference source, including:

- contextual meanings;
- multi-word expressions and idioms;
- slang and internet language;
- technical or specialized terminology;
- newly emerging usages;
- language-specific grammatical information;
- expressions whose meaning cannot be captured by a single fixed translation;
- passages that call for explanation, summary, or a perspective from a particular field.

The result is a generated karte shaped for the user's purpose.

### Choose and combine modules

One strength of Notion is that people can view the same information in different ways. Vocabularium follows a similar idea: users choose and combine modules to decide what a captured piece of text becomes, rather than accept one fixed karte format.

Vocabularium aims to offer a large and growing library of modules, many powered by generative AI. Each generative module has a focused prompt, so new modules can be introduced and improved quickly. Some modules support language learning; others can bring knowledge or perspectives from fields beyond it.

For example, a computer science module could explain a selected term such as `frontend` in its technical context. A module inspired by Einstein could offer a speculative perspective on a captured idea.

In the future, Vocabularium could also provide APIs that let users create and customize modules. The range of possible modules should grow with the interests and needs of its users.

## Karte input and creation

Generated karte creation supports two basic input modalities:

1. **Word or phrase input.** The user submits a term, compound word, expression, or other short piece of text. Vocabularium generates the information represented by the modules on the karte’s seites.
2. **Sentence input.** The user submits a complete sentence. Vocabularium can generate an explanation, translation, summary, analysis, or other content requested by modules on the destination deck’s seites.

These are input categories, not different kinds of karte. Capture and manual creation supply the same required, editable **main key**, which is the karte's text input for module generation and must appear on its front seite. Capture initializes it from the selection; manual creation requires the user to enter it.

Manual creation does not require generation. Users can save and write a karte manually, or explicitly request module generation from its main key. Editing the main key changes the input for subsequent generation without automatically changing existing generated content. Only explicitly generating again produces new content from the updated key. Editing other content does not change the main key.

These are accepted requirements [pending implementation](docs/product/scope.md#accepted-change-pending-implementation), detailed in [Kartes and editing](docs/specs/kartes-and-editing.md). Users can also:

- manually add a new karte;
- manually edit a karte created by generation;
- correct, remove, or supplement generated information;
- customize the seites and modules after generation.

Generated content should be treated as useful starting material that remains under the user’s control.

### Retry generation for one seite

Users can explicitly regenerate one karte seite, replacing its content after confirmation while retaining the main key. Generation uses the current saved main key regardless of whether capture or manual entry supplied it. The [MVP Select and Add specification](docs/MVP-Product-spec-select-and-add.md#retry-the-current-seite) defines detailed behavior and distinguishes the pending main-key change from the implemented baseline; its [seite-completion rules](docs/MVP-Product-spec-select-and-add.md#seite-completion-and-failure) distinguish failed generation from valid empty generated content.

## Decks are the primary repository concept

A deck is the main place where kartes made from captured text are collected, organized, and optionally studied. Users can create different decks for different subjects, languages, projects, sources, or goals.

A deck defines the layout for its kartes:

- how many seites every karte has;
- which modules are placed on each seite;
- whether memorization is enabled or disabled.

Every karte belongs to exactly one deck. A karte can be copied and pasted into another deck or moved into another deck, but it does not belong to multiple decks at the same time. In the karte workflow, the deck is the user's primary repository for captured text and its generated content.

The deck layout is mostly a definition of seites and generation modules. If a deck defines three seites, every karte in that deck has three seites, even if generation produces no content for one or more of them.

## Seites are containers; modules are Lego blocks

Each karte is presented as a sequence of seites. In the deck layout, a seite is a simple container, and each module is an independent Lego-like generator that can be placed inside it. Seites and modules primarily exist in the layout definition; they are instructions for producing a karte, not necessarily content that is stored or rendered by themselves.

The user should be able to assemble a deck layout by dragging modules into a seite, rearranging them, or removing them. The same simple interaction defines how generated kartes are produced.

Modules do not need to be triggered together. Generation evaluates each module independently and contributes only when that module is relevant to the input. A module that is not triggered produces no output and does not render anything on the karte. The exact karte is produced from the input and the modules placed on each seite.

Beyond the mandatory front seite, Vocabularium should impose as few structural rules as possible:

- the deck defines how many seites every karte has;
- each seite can contain any suitable combination of independent modules;
- modules can be added, removed, and rearranged by choice;
- a seite may contain no rendered content when none of its modules are triggered;
- seites do not have fixed meanings such as “translation,” “grammar,” or “examples”;
- languages can organize seites, but they do not have to.

This is a simple composition model, not a complex configuration model. Users define the seites and place independent generator modules on them. There is no need to define elaborate schemas or rules connecting modules together.

The front-seite invariant is:

> Every karte must have a front seite that displays its required main key.

The main key must appear there regardless of whether a print-input module is configured. Users may place additional generator modules there and add or edit other content.

### Flagship example: one expression, multiple language seites

A user learning several languages might assemble a karte like this:

```text
Vocabulary karte
│
├── Front seite — required
│   └── Word: house
│
├── German seite
│   ├── Translation: das Haus
│   ├── Article
│   ├── Plural: die Häuser
│   ├── Example
│   └── Other customized German modules
│
└── Spanish seite
    ├── Translation: la casa
    ├── Gender: feminine
    ├── Plural: las casas
    ├── Example
    └── Other customized Spanish modules
```

This is a flagship use case, not a required template. Another user might create only two seites, place pronunciation on the front seite, combine definitions and examples on one seite, or create separate seites for grammar, etymology, and character analysis. Each of these layouts is assembled by adding and removing independent generator modules.

For example:

```text
Front seite
→ Chinese expression + audio

Seite 2
→ Pinyin + contextual explanation

Seite 3
→ Character decomposition

Seite 4
→ German translation
```

The seite and module system exists to support different purposes, not to enforce a universal karte format.

### Example: triggered modules determine the rendered karte

Consider a deck layout with two seites:

```text
Seite A
└── Print input module

Seite B
├── German translation module
└── German article module
```

If the user adds an English sentence, the result is:

```text
Seite A
└── The original sentence is printed

Seite B
└── The German translation is printed
```

The German article module is not triggered, so it produces no output and nothing else is rendered on the karte. Seite B still exists because the deck defines it, but it contains only the output of the module that applies to this input. The same layout can produce different content for another karte when different modules are relevant.

## Modules

Modules are independent building blocks that users choose and arrange on karte seites. Each module has a focused purpose. A generative module uses a prompt to produce one kind of result from the main key; another module may simply display that input. Capture and manual entry supply the same kind of module input. A module contributes output only when it applies to that input.

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

New modules should fit the same composition model so their prompts and outputs can be developed and improved without changing the basic seite structure. In future iterations, APIs could let users create or customize modules of their own.

## Memorization is optional

Vocabularium can support memorization and spaced review, but memorization is not the definition of the product. Some users may want to collect and consult captured material without formal review. Others may want to turn selected decks or kartes into a study routine.

The same deck and karte model should support both use cases:

- collection and reference;
- active memorization and review.

Memorization should be easy to enable or disable at the deck or karte level rather than assumed for every saved karte.

## Product principles

Vocabularium should remain guided by these principles:

1. **Minimize interruption.** Capturing text should fit into the user's existing activity.
2. **Generate for context.** Kartes should reflect the input, its context, and the user's purpose.
3. **Grow through modules.** Offer a broad, evolving library of independent modules that users can combine, including AI-powered modules beyond language learning and, eventually, modules customized through APIs.
4. **Support any language.** The model should not depend on a closed set of fixed language-pair dictionaries.
5. **Respect language differences.** Different languages should be able to use different modules and information structures.
6. **Support different input sizes.** A word, phrase, or sentence can each become a meaningful generated karte.
7. **Keep composition simple.** Seites are containers, and independent generator modules can be added, removed, and rearranged without complex configuration.
8. **Generate selectively.** Each module contributes only when it is relevant to the input; other modules may remain empty.
9. **Keep generated content editable.** Users should be able to manually add kartes and revise anything generation produces.
10. **Use decks as the organizing foundation for kartes.** Every karte belongs to one deck, where it can be collected, organized, and optionally studied.
11. **Keep memorization optional.** Learning through review should be available without making it mandatory.

## Summary

Vocabularium is a generative knowledge capture program for working with text. It saves material at the moment of discovery, creates contextual kartes automatically, and organizes them in flexible decks. Selected text can become a karte through generation, while users can also add and edit kartes manually. Each karte consists of a mandatory front seite followed by any number of seites, each acting as a container for independent modules that users can add, remove, and rearrange.

The product’s central promise is simple:

> Save text without breaking your flow, and get a karte shaped for what you want to do with it.
