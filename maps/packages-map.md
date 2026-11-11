# Packages: file structure map

This folder holds code that both halves of Vocabularium use: the Chrome
extension (`extension/`) and the local server (`src/server/`). Keeping it in
one place means both sides follow the same rules.

There are two packages:

- **contracts**: describes the exact shape of every message the extension and
  the server send each other, so both sides agree on what the data looks like.
- **domain**: everything else that both sides share: what each module is, how
  the request to the AI model is written, how its answer is checked, and how a
  card is turned into text on screen.

Both are written in TypeScript in `src/`. Running `npm run build:packages`
turns them into JavaScript in `dist/`, which is what the extension and server
actually load. `node_modules/` is not shown below.

## A few words used below

- **Deck, page, component**: a deck holds pages. A page is one card about one
  word or phrase. A page is made of components, one per module.
- **Main key**: the word or phrase the page is about.
- **Module**: one section of a page, such as "German" or "Mathematics". Some
  modules only hold what you type or capture (main key, Context, Text). The
  others ask the AI model to write their content.
- **Family**: a group of related modules, such as "Languages". A family gives
  its modules a colour and an icon.
- **Facet**: one part of a module, such as "Examples" or "Synonyms" in German.
  Each module has its own facets; German Examples and Chinese Examples are
  separate folders.
- **Core**: the main explanation every module writes first, before its facets.
- **Retry**: asking the AI model to write a card, or one part of it, again.
- **Interface language**: the language the app's own buttons and text are in:
  English, Arabic, Spanish, French, Russian or Chinese (Simplified). Files
  ending in `.ar`, `.es`, `.fr`, `.ru` or `.zh-Hans` are translations; files
  without a language code are English.

## The map

```
packages/
├── contracts/                      shape of the data sent between extension and server
│   ├── package.json                package name and what it makes available
│   ├── tsconfig.json               TypeScript settings
│   ├── dist/                       made automatically from src/ (not kept in git): a .js file
│   │                               to run and a .d.ts file describing its types, for each file
│   └── src/
│       ├── index.ts                starting point: decks, sign-in sessions, interface languages;
│       │                           also passes on everything from the files below
│       ├── base.ts                 small shared pieces: the ID each change carries,
│       │                           and the browser session that is signed in
│       ├── pages.ts                pages, their components and the modules each page uses
│       └── audio.ts                recorded speech for a card: one clip per spoken line
│
└── domain/                         shared rules and the list of all modules
    ├── package.json                package name and which files others may load
    ├── tsconfig.json               TypeScript settings
    ├── dist/                       made automatically from src/ (not kept in git): the same folders
    │                               as src/, with a .js and a .d.ts file for each .ts file, and the
    │                               prompt and text files copied across. Never edit it: change src/
    │                               and run npm run build:packages
    └── src/
        ├── modules.ts              what a module that the AI writes looks like, and checks on its answer
        ├── parents.ts              how a module's core and facets fit together, in a fixed order,
        │                           and which facets suit a word, a phrase or a sentence
        ├── page-modules.ts         rules for which modules a page may have, used by both sides
        ├── pages.ts                turns typed or captured text into stored text and back
        ├── generated.ts            checks the AI's answer is complete and has the right shape
        ├── content.ts              turns the AI's answer into the text that is saved for each part
        ├── markdown.ts             writes that saved text, and reads it back for drawing on screen
        │                           (paragraphs, lists, tables, maths, code)
        ├── render.ts               what the screen should show for each module, in order
        ├── spoken.ts               which lines of a card are read aloud, and in which language
        ├── checks.ts               runs every quality check on a card (used in testing only,
        │                           never when a user makes a card)
        ├── about.ts                the "about" pages that explain each family, module and facet
        │
        ├── composer/               writes the request sent to the AI model
        │   ├── compose.ts          puts one module's prompt files together into one request
        │   └── rules.md            instructions included in every request
        │
        └── catalog/                every module, each defined once in its own folder
            ├── index.ts            the list of all modules, in the order the app shows them;
            │                       a new module is added here
            ├── define.ts           the fields every module, family and facet must fill in
            ├── shape.ts            building blocks that describe the shape of an AI answer;
            │                       each one both checks the answer and tells the AI what to return
            ├── blocks.ts           the building blocks facets are written with, in one place
            ├── scripts.ts          tells which alphabet a text uses (Latin, Chinese, …), for checks
            ├── tools.ts            what happens when a check needs a tool that is not available
            │                       (the check is skipped)
            ├── about.generated.ts  all "about" page text bundled into one file, made automatically,
            │                       because the extension cannot read separate files
            │
            ├── main-key/           the word or phrase itself (belongs to no family)
            │   ├── module.ts       its definition
            │   ├── names.<lang>.json  its name in each interface language
            │   └── samples/        example cards, one file per interface language
            │
            ├── notes/              family: text you type or capture yourself
            │   ├── family.ts       the family's definition
            │   ├── about*.json     the family's "about" page, with translations
            │   ├── context/        the sentence or paragraph the word was found in
            │   └── text/           free text you write on the page
            │
            ├── languages/          family: explaining a word in one language
            │   ├── family.ts, about*.json
            │   ├── german/            parts: core, antonyms, article, case, comparison, conjugation,
            │   │                      declension, etymology (word origin), examples, grammar teacher,
            │   │                      pronunciation, simple translation, synonyms
            │   ├── chinese/           parts: core, etymology, examples, grammar teacher, pinyin,
            │   │                      pronunciation, simple translation
            │   ├── english-british/   parts: core, antonyms, etymology, examples, grammar teacher,
            │   │                      pronunciation, simple translation, synonyms
            │   └── english-american/  parts: the same as British English
            │
            ├── expertise/          family: explaining a term from a subject
            │   ├── family.ts, about*.json
            │   ├── computer-science/  parts: core, code
            │   ├── mathematics/       parts: core, formula
            │   ├── chemistry/         parts: core, equation
            │   └── writing/           not a module: a writing-style guide per language,
            │                          added to the request for these subjects
            │
            ├── sound/              family: how a word sounds
            │   ├── family.ts, about*.json
            │   └── pronunciation/     parts: core
            │
            └── creativity/         family: playful writing about the word
                ├── family.ts, about*.json
                ├── traditional-haiku/ parts: core
                ├── modern-haiku/      parts: core
                └── joke/              parts: core
```

## What is inside one module's folder

Every module that the AI writes follows the same layout. Here is German:

```
languages/german/
├── module.ts                   the module's definition: its name, description, family,
│                               how many times a page may hold it, and its parts in order
├── module.prompt.md            the instruction for this module, added to the shared rules
├── rubric.md                   how an automatic reviewer scores this module's cards in testing
├── about.json                  text for the module's "about" page
├── about.<lang>.json           the same text in other interface languages
├── names.<lang>.json           the module's name in other interface languages
├── samples/<lang>.json         example cards shown on the "about" page
└── facets/                     one folder for each part of the card
    ├── core/                   the main explanation
    │   ├── facet.ts            what the answer must contain and how it is turned into text
    │   ├── core.prompt.md      the instruction for writing the main explanation
    │   ├── retry.prompt.md     the instruction for writing it again (only some modules have it)
    │   └── reading.prompt.md   the instruction for writing the card again while keeping
    │                           the same meaning of the word
    └── case/                   one part (each part has a folder like this)
        ├── facet.ts            its name, short label, which words it suits, whether it is
        │                       read aloud, what the answer must contain, how it becomes text,
        │                       and its quality checks
        ├── prompt.md           the instruction for writing this part
        ├── about.json          text for the part's "about" page, plus translations
        ├── sample-key.json     optional: the word its examples are about
        └── samples/<lang>.json optional: examples of this part, per interface language
```

## Adding a new module

1. Make a folder for it inside its family, `catalog/<family>/<module>/`, with
   the files shown above.
2. Add it to the list in `catalog/index.ts`: one import line and one line in
   the list.
3. Run the tests that check modules, prompts and translations:
   `tests/catalog.test.mjs`, `tests/prompts.test.mjs`,
   `tests/localisation.test.mjs` and `tests/content-checks.test.mjs`. Then run
   `npm run gate -- <module>`, which has the AI write real cards and scores
   them.

More detail: [how generation works](../docs/architecture/generation.md#module-catalog).
