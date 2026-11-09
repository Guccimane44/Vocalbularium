# Codebase map

This page explains how Vocabularium is built: the main pieces, how they talk
to each other, and where each file lives. The two shared packages have their
own, more detailed map in [packages/README.md](../../packages/README.md).

## A few words used below

- **Deck, page, component**: a deck holds pages. A page is one card about one
  word or phrase. A page is made of components, one per module.
- **Main key**: the word or phrase a page is about.
- **Module**: one section of a page, such as "German" or "Mathematics". Some
  modules hold text you type or capture; the others ask an AI model to write
  their content.
- **Facet**: one part of a module, such as "Examples" or "Synonyms".
- **Capture**: selecting a word on any web page and saving it to a deck from
  the right-click menu.
- **Generation**: asking the AI model to write a page's content.
- **Operation ID**: a unique label every change carries. If the same change
  arrives twice (for example after a lost connection), it is only done once.
- **Migration**: a file that changes the database's layout. Once used, a
  migration is never edited; a new one is added instead.

## The big picture

Vocabularium runs entirely on your own computer. It has three main pieces:

```
 ┌──────────────────────────┐        ┌──────────────────────────┐        ┌──────────────┐
 │  Chrome extension        │  HTTP  │  Local server            │  SQL   │  PostgreSQL  │
 │  extension/              │ ─────► │  src/server/, src/core/  │ ─────► │  database    │
 │  what you see and click  │ ◄───── │  rules and saving        │ ◄───── │  migrations/ │
 └──────────────────────────┘        └────────────┬─────────────┘        └──────────────┘
              │                                   │
              │  both use                         │  calls out to
              ▼                                   ▼
 ┌──────────────────────────┐        ┌──────────────────────────┐
 │  Shared packages         │        │  Outside services        │
 │  packages/contracts      │        │  AI model (via OpenCode) │
 │  packages/domain         │        │  speech (ElevenLabs)     │
 └──────────────────────────┘        └──────────────────────────┘
```

1. **The Chrome extension** is the part you use: the right-click menu that
   captures a word, the dashboard, the deck and page screens, and settings.
2. **The local server** runs on your machine and only accepts connections from
   your machine. It checks every request, saves data, asks the AI model to
   write pages, and turns text into speech.
3. **The database** (PostgreSQL) keeps your account, decks, pages and audio.
4. **The shared packages** hold the rules both sides must agree on: the shape
   of every message, the list of modules, how requests to the AI are written,
   and how a page is drawn.

## What happens when you save a word

1. You select a word on a web page and choose a deck from the right-click
   menu. `extension/context-menu.js` and `extension/capture.js` take the
   word and the sentence around it.
2. `extension/background-runtime.js` sends it to the server and keeps a
   receipt, so the save is not lost if Chrome closes
   (`save-operations.js`, `recovery.js`).
3. The server's `src/server/routes.mjs` checks the message against
   `packages/contracts`, then asks the store (`src/core/store.mjs`) to save
   the new page.
4. `src/server/generation.mjs` writes each module's content. For each module
   it builds a request from that module's prompt files
   (`packages/domain/src/composer/compose.ts`), sends it to the AI model
   (`provider.mjs`, `opencode.mjs`), checks the answer has the right shape
   (`packages/domain/src/generated.ts`) and turns it into text
   (`packages/domain/src/content.ts`). The store then saves it into the page.
5. Lines that should be read aloud (`packages/domain/src/spoken.ts`) are sent
   to the speech service (`src/server/audio.mjs`, `speech.mjs`,
   `elevenlabs.mjs`), and each clip is saved.
6. The extension shows the finished page (`page-view.tsx`,
   `card-content.tsx`), using `packages/domain/src/render.ts` to decide what
   goes where.

## The file map

Folders not kept in git (`node_modules/`, `.data/`, `artifacts/`, `.wxt/`,
`packages/*/dist/`) are left out.

```
Vocabularium/
├── README.md                    first stop: what the project is and how to start it
├── AGENTS.md, CLAUDE.md         instructions for AI coding assistants working on this code
├── package.json                 the project's commands (npm run …) and the libraries it uses
├── package-lock.json            the exact library versions installed
├── tsconfig.json                TypeScript settings for the whole project
├── wxt.config.mjs               settings for WXT, the tool that builds the Chrome extension
├── drizzle.config.ts            settings for Drizzle, the tool that writes new migrations
├── opencode.jsonc               settings for OpenCode, the tool used to reach the AI model
├── .env.example                 example settings file; copy it to .env and fill it in
├── .node-version                the Node.js version the project expects
│
├── extension/                   THE CHROME EXTENSION: everything you see and click
│   ├── manifest.json            tells Chrome what the extension is and what it may do
│   ├── entrypoints/             the extension's starting files
│   │   ├── background.js        the background worker that runs without a window open
│   │   ├── app.html             the main screen (dashboard, decks, pages)
│   │   └── feedback.html        the small popup shown after a capture
│   │
│   │   ── Background work (runs behind the scenes) ──
│   ├── background-runtime.js    the background worker's main logic: sign-in session,
│   │                            sending saves, keeping receipts
│   ├── context-menu.js          the right-click "save to deck" menu
│   ├── capture.js               sends a captured word to the server
│   ├── context-extraction.js    picks out the sentence or paragraph around the word
│   ├── save-operations.js       receipts for saves, so none are lost if Chrome closes
│   ├── recovery.js              finishes or reports saves that were interrupted
│   ├── badge.js                 the number shown on the extension's toolbar icon
│   ├── config.js                the server address and other fixed settings
│   ├── api-failure.js           turns server errors into messages
│   ├── diagnostics.js           collects technical events for troubleshooting
│   ├── diagnostic-settings.js   the troubleshooting settings screen
│   │
│   │   ── Capture feedback popup ──
│   ├── feedback.js, feedback-view.js, feedback-popup.js, feedback-dashboard.js
│   │                            the "saved" / "failed" message shown after a capture,
│   │                            on the web page and in the popup
│   │
│   │   ── Main screen ──
│   ├── app.js                   starts the main screen
│   ├── shell.js                 the frame around every screen: deck sidebar, account menu
│   ├── dashboard.tsx            the home screen and page summaries
│   ├── page-list.tsx            the list of pages in a deck, in its different layouts
│   ├── page-view.tsx            one page, with all its modules
│   ├── card-content.tsx         the content of one module's card
│   ├── rich-blocks.tsx          maths formulas and code on a card
│   ├── live-editor.tsx          editing a card's text in place
│   ├── facet-tags.tsx           the tabs on a card, one per part (facet)
│   ├── facet-window.tsx         the window for choosing which parts a card shows
│   ├── facet-limit.ts           the most parts one card may hold
│   ├── shaping.tsx              adding, removing and reordering modules and parts
│   ├── configuration.tsx        deck settings: which modules new pages get
│   ├── about-sheet.tsx          the side panel that explains a family, module or part
│   ├── catalog-text.ts          module names and descriptions in your language
│   ├── audio.tsx                playing a page's recorded speech
│   ├── pages.js                 unsaved drafts of pages
│   ├── main-key.ts              how the page's word is shown, depending on whether it is
│   │                            a word, phrase, sentence or passage
│   ├── sorting.ts               the ways a page list can be ordered
│   ├── crumbs.tsx, crumb-text.ts   the "Home › Deck › Page" trail at the top
│   ├── dialog.ts                confirmation dialogs ("Delete this page?")
│   ├── button-icon.tsx, button-icons.ts   the small icons on buttons
│   ├── families.tsx             the small icon for each module family
│   ├── deck-colour.ts           the colour a deck is shown in
│   ├── i18n.ts                  picks the interface text for your language
│   ├── theme.js                 light, dark or follow-the-system appearance
│   │
│   │   ── Look and feel ──
│   ├── design/tokens.json       the design's colours, sizes and spacing in one file
│   ├── theme.css                made from tokens.json by scripts/build-theme.mjs
│   ├── app.css, shell.css, page-view.css, page-list.css, deck-settings.css,
│   │   feedback.css, motion.css, fonts.css   styles for each screen
│   ├── fonts/                   the fonts shipped with the extension, with their licence
│   │
│   └── locales/                 all interface text
│       ├── en/messages.json     English, the source for every other language
│       ├── ar/ es/ fr/ ru/ zh-Hans/   translations (Arabic is shown right-to-left)
│       └── reviews.json         a record of when each writing guide was reviewed, and by whom
│
├── src/                         THE LOCAL SERVER
│   ├── server/                  receiving requests and talking to outside services
│   │   ├── start.mjs            starts the server (npm start)
│   │   ├── app.mjs              sets up the web server (Fastify) and its safety checks
│   │   ├── config.mjs           reads settings from .env
│   │   ├── routes.mjs           every address the extension can call, and what each does
│   │   ├── contract-validation.mjs   checks incoming messages against packages/contracts
│   │   ├── auth.mjs             sign-in, and the sign-in token the extension then uses
│   │   ├── api-failure.mjs      builds the error replies the extension receives
│   │   ├── generation.mjs       runs the writing of a page's content, module by module,
│   │   │                        including Retry
│   │   ├── providers.mjs        picks which AI service to use from the settings
│   │   ├── provider.mjs         what every AI service connection must do (time limits, errors)
│   │   ├── opencode.mjs         the connection to the AI model through OpenCode
│   │   ├── audio.mjs            the queue of lines waiting to be turned into speech
│   │   ├── speech-providers.mjs picks which speech service to use
│   │   ├── speech.mjs           what every speech service connection must do
│   │   ├── elevenlabs.mjs       the connection to ElevenLabs, the speech service
│   │   ├── diagnostics.mjs      stores troubleshooting events
│   │   └── diagnostic-routes.mjs   the addresses for reading those events
│   │
│   ├── core/                    the store: the only code that reads and writes saved data
│   │   ├── store.mjs            puts the parts below together into one store
│   │   ├── store-sessions.mjs   the database link, browser sessions, and operation receipts
│   │   ├── store-decks.mjs      decks and their settings
│   │   ├── store-pages.mjs      pages and every edit a user makes to one
│   │   ├── store-generation.mjs saving captures, AI attempts and their results
│   │   ├── store-audio.mjs      saving speech clips
│   │   ├── store-common.mjs     small pieces the parts above share (errors, list paging)
│   │   ├── store-records.ts     the shape of each saved record
│   │   ├── sort-key.mjs         makes words sort alphabetically in the database
│   │   └── data-migrations.mjs  one-off conversions of saved data during an upgrade
│   │
│   └── persistence/             the database connection
│       ├── postgres.ts          opens the database and runs changes one at a time, safely
│       └── schema.ts            the database tables, written in code
│
├── packages/                    SHARED BY EXTENSION AND SERVER (see packages/README.md)
│   ├── contracts/               the shape of every message between extension and server
│   └── domain/                  the rules, every module, the AI request builder, drawing rules
│
├── shared/
│   └── diagnostics.mjs          troubleshooting events, used by both extension and server
│
├── types/                       extra TypeScript type descriptions (Chrome, Fastify, drafts)
│
├── migrations/                  THE DATABASE LAYOUT, one numbered step at a time
│   ├── 0000_account.sql … 0018_speech_audio.sql   each step, in order; never edited once used
│   └── meta/                    Drizzle's record of the steps
│
├── scripts/                     COMMANDS for building, checking and running tools
│   ├── build-packages.mjs       builds the two shared packages (npm run build:packages)
│   ├── build.mjs                builds the extension (npm run build)
│   ├── build-theme.mjs          makes extension/theme.css from the design tokens
│   ├── check.mjs                quick checks on the source files (npm run check)
│   ├── generate-openapi.mjs     writes docs/api/openapi.json, the list of server addresses
│   ├── migrate.mjs              applies the database steps (npm run db:migrate)
│   ├── setup-postgres.mjs       creates the local database (npm run db:setup)
│   ├── database-backup.mjs      backs up or restores the database
│   ├── logs.mjs                 reads troubleshooting events (npm run logs)
│   ├── extension-origin.mjs     checks the server address the extension is built to talk to
│   ├── golden-set.mjs           has the AI write a fixed set of test words, for review
│   ├── judge.mjs, judge.md      an AI reviewer that scores those cards against each
│   │                            module's rubric
│   ├── gate.mjs                 one pass/fail verdict for a module: tests, test words,
│   │                            checks and the reviewer (npm run gate -- <module>)
│   ├── check-tools.mjs          extra tools the quality checks may need
│   ├── reading-check.mjs        checks that Retry keeps the same meaning of a word
│   ├── samples.mjs              writes the example cards shown on the "about" pages
│   └── package.py               packages the extension into a ZIP for delivery
│
├── tests/                       AUTOMATIC TESTS
│   ├── *.test.mjs               fast tests without a browser (npm test): server, store,
│   │                            database, modules, prompts, translations, upgrades, …
│   ├── browser/                 tests that drive the real extension in Chrome
│   │                            (npm run test:browser), one file per user journey
│   ├── screens/                 screenshots of every screen, compared with main
│   │                            (npm run screens -- --base main)
│   ├── prompts/                 the exact text sent to the AI for each module; a prompt
│   │                            change shows up as a change here
│   ├── golden/                  the fixed test words for each module
│   ├── fixtures/                saved sample data the tests read
│   └── helpers/                 shared setup for tests (test database, fake AI, fake speech)
│
├── docs/                        WRITTEN DOCUMENTATION
│   ├── product/                 what the product is: vision, model (deck → page → component),
│   │                            scope of each release
│   ├── specs/                   how each feature should behave
│   ├── architecture/            how it is built (this page, generation, database,
│   │                            logging, past decisions)
│   ├── guides/                  how-tos: installing, the project workflow, screenshots,
│   │                            troubleshooting
│   ├── plans/                   plans for recent and upcoming releases
│   ├── api/openapi.json         the list of every server address (made automatically)
│   └── history/                 older records, kept for reference
│
├── .github/workflows/verify.yml the checks GitHub runs on every pull request
├── .agents/skills/              step-by-step workflows for AI assistants: making a change,
│                                verifying it, delivering a release
└── .claude/settings.json        settings for Claude Code in this project
```

## Where to make a change

| I want to… | Look in | Tests that protect it |
| --- | --- | --- |
| Add or change a module, part or prompt | `packages/domain/src/catalog/` | `tests/catalog.test.mjs`, `tests/prompts.test.mjs`, then `npm run gate -- <module>` |
| Change what is saved, or a message's shape | `packages/contracts/`, `src/core/`, a new file in `migrations/` | `tests/postgres.test.mjs`, `tests/upgrade.test.mjs`, `tests/server.test.mjs` |
| Change how content is written or retried | `src/server/generation.mjs`, `src/core/store-generation.mjs` | `tests/generation.test.mjs`, `tests/generation-recovery.test.mjs` |
| Change a screen or what a click does | `extension/` | `tests/extension.test.mjs`, `tests/browser/`, `npm run screens -- --base main` |
| Change interface text | `extension/locales/` | `tests/localisation.test.mjs` |
| Change the server addresses | `src/server/routes.mjs` | then run `npm run openapi` to update `docs/api/openapi.json` |

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run db:setup` | create the local database |
| `npm run db:migrate` | bring the database layout up to date |
| `npm start` | start the local server |
| `npm run build` | build the extension |
| `npm test` | run the fast tests |
| `npm run test:browser` | run the tests in Chrome |
| `npm run check` | quick source checks and type checks |
