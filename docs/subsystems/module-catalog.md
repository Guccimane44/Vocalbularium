# Module catalog

The catalog defines every module (input or content) and every facet in one folder each, in the domain package that the API and the extension share. It holds each module's shapes, flags, formatters, checks, prompts, samples, page text and names in every interface language. The prompt composer builds a module's request from it, and the guards and golden sets hold each module to it. How an attempt runs is in [generation](generation.md); what a module's page shows is in [module pages](../screens/module-pages.md#the-pages).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Registration | One import and one entry per module; nothing outside the catalog names a module or facet. | [`catalog/index.ts`](../../packages/domain/src/catalog/index.ts) |
| A module | Its ID, kind, label, description, instances, core and ordered facets; its rule inside the shared rules; its judge rubric. | `<family>/<module>/module.ts`, `module.prompt.md`, `rubric.md` under [`catalog/`](../../packages/domain/src/catalog) |
| A facet | Label, abbreviation, `applies`, `when`, `spoken`, shape, formatter and `checks`; its prompt and page text. | `facets/<facet>/facet.ts`, `prompt.md`, `about*.json`; the core's `core.prompt.md`, `retry.prompt.md`, `reading.prompt.md` |
| Composer | Joins the core's prompt, the facets' prompts, the shared rules and, for Expertise, the writing guide, into one provider-neutral request; fingerprints it as the prompt version. | `moduleInstructions`, `moduleSchema`, `composeModule`, `promptVersion` in [`compose.ts`](../../packages/domain/src/composer/compose.ts); [`rules.md`](../../packages/domain/src/composer/rules.md) |
| Shapes and formatting | A reply checked against the module's shapes, formatted into stored markdown per facet, and read back for rendering. | [`generated.ts`](../../packages/domain/src/generated.ts), [`content.ts`](../../packages/domain/src/content.ts), [`render.ts`](../../packages/domain/src/render.ts), [`parents.ts`](../../packages/domain/src/parents.ts) |
| Checks | Deterministic checks of a card's parts, run by the golden sets and the gate, never for a user. | `checkCard` in [`checks.ts`](../../packages/domain/src/checks.ts) |
| Page text for the extension | The about texts, samples and names, gathered at build time into one module, because the extension can't read files at run time. | [`build-packages.mjs`](../../scripts/build-packages.mjs) → `catalog/about.generated.ts` (not committed) |
| Golden sets and the gate | Live runs of each module for review, its content checks, and the judge calibrated against its rubric. | [`tests/golden/`](../../tests/golden); [`golden-set.mjs`](../../scripts/golden-set.mjs), [`judge.mjs`](../../scripts/judge.mjs), [`gate.mjs`](../../scripts/gate.mjs), [`samples.mjs`](../../scripts/samples.mjs) |

## Runtime path

1. `npm run build:packages` compiles the domain package and writes `about.generated.ts` from every module's page text, samples and names.
2. A generation attempt names a module type and its facets. `composeModule` reads them from the catalog and builds `{ name, instructions, input, schema, maxTokens }` ([prompts](#prompts)).
3. The provider's reply is checked against the module's shapes and formatted per facet ([generation](generation.md#runtime-path)).
4. The extension renders a card through `renderParent` and draws module pages from `about.generated.ts`.

## Behaviour

### Module kinds

Modules have three kinds (Q72, the owner's answer of 10 October 2026; [D02](../decisions/d02.md)):

- **Input modules** are filled by capture or by the user, never by generation. The **main key module** is compulsory, exactly one per deck and page, always first, and cannot be removed. The **Context module** is optional, at most one per deck or page; a deck with it captures the selection's surrounding block. The **Text module** holds the user's own writing and can repeat. The main key and Context are a content module's only inputs; Text never is.
- **Content modules** produce components from a page's main key and Context. Every content module type is a [parent module](#parent-modules-and-facets). Each instance owns one component per page.
- **View modules** show pages. The **default view** is the only view module.

### Parent modules and facets

A **parent module** contributes one focused kind of content, such as a translation into one language. It has:

- a required **core**, which applies to every word, phrase, and sentence, so a parent never completes empty because of the kind of input;
- **facets**, each adding one kind of content about the core. A facet type belongs to one parent type, and the parent type fixes the order its facets appear in, whatever order the user adds them in.

The catalog defines the core as the parent's first facet, one the user cannot add or delete, and each parent owns all its facets: facets that look alike in two parents are defined separately and may differ. Input modules have no facets.

<a id="context-meaning"></a>**The meaning in this Context** ([D29](../decisions/d29.md)). When the Context selects one sense of a word or phrase, a Languages core gives that sense first, under a label its module writes in its own language, and the key's other senses after it. The key's original meaning, its literal or most common sense, is always given, as one of those senses or as the Context's own; a key with several readings keeps to the reading the Context uses. Without a Context, with one that does not narrow the sense, and for a sentence, the core has no such line. The model never writes the label; a line that starts with it reads back as the meaning in this Context, so a facet's Retry and an edit keep it, and a user who deletes the label makes it an ordinary meaning. Pronunciation never speaks the label.

In a Languages parent, facets describe the core's translation, not the main key. When the main key is already in the parent's language, the core explains it in that language instead of translating it, and the translation the facets describe is the main key itself; this is how a user finds, for example, the article of a German noun.

Facets have no options. Variety comes from more parent types: two translations are two parent types, not one type with a language setting (partly answers Q41, which the owner answered on 7 October 2026). Varieties of one language are not told apart: one module per language, not one per variety ([D34](../decisions/d34.md)).

A parent and its facets are one component, produced by one generation attempt in one request, and **Retry** regenerates them together; a spoken part's audio follows in its own jobs ([audio](audio.md#spoken-parts)). Several instances of one parent type on a page generate independently, each from the main key and Context.

Each facet type has an abbreviation that marks its [tag](../screens/page.md#facet-tags) on a card. No two facets of one parent share an abbreviation; facets of different parents may.

#### Choosing and changing facets

- **Adding a parent.** A parent is added like any module, by dragging it or with its **+**, with its core only, or with the facets its module brings to a new deck.
- **Adding a facet.** A parent's facets are chosen on the parent itself: **Facet** among its actions, on a page or in deck settings, opens its [facet window](../screens/facet-window.md#the-window), which lists every facet of the parent's module. An added facet waits, as its dimmed heading, until the user's next **Retry** regenerates the whole parent or the facet's own **Retry** generates it ([Retry](generation.md#retry)); a parent already generating takes no facet until its attempt finishes.
- **Deleting a facet.** A facet is deleted from its parent the way a component is deleted from a page ([components as cards](../screens/page.md#components-as-cards)). A deleted facet stays gone: Retry never brings it back, and the user adds it again in the facet window to restore it.

A deck configuration stores each parent instance with its facets, and a new page copies them ([configuration and pages](store.md#configuration-and-pages)). Facets are not module instances and do not count toward the limit of 12. A parent holds at most 12 facets of its own (`MAX_FACETS`); a module may offer more, and once a parent holds 12 the facet window disables the rest, saying why.

### Module families

Every input and content module belongs to one **module family**, which gives it its colour and icon in the interface ([visual identity](interface.md#visual-identity)). The family is part of the module type's definition, shared by every client. A parent module's family colours its whole card; its facets have no family of their own. A new module joins an existing family; a further family is added only when a group of modules fits none of these.

| Family | Icon | What belongs here | Writes in |
| --- | --- | --- | --- |
| Languages | two speech bubbles | a translation into one language, with facets about it | the module's language |
| Expertise | graduation cap | an explanation of a technical term or a difficult concept in one subject's context | the interface language ([writing in the interface language](#writing-in-the-interface-language)) |
| Meaning | open book | explanations, definitions | — |
| Usage | quotation marks | example sentences, usage notes, collocations | — |
| Roots | sprouting stem | etymology, character parts, word history | — |
| Connections | linked nodes | related words, synonyms, comparisons, concepts | — |
| Sound | sound bars | pronunciation, audio, tones, stress | spoken, in the key's language |
| Creativity | a sparkle | something new written from the key in its language: a haiku, a joke ([D30](../decisions/d30.md)) | the key's language |
| Notes | pencil | the user's own input: Context and Text | — |

The main key module belongs to no family; it is shown as the page title. Languages is a family of its own because a translation's facets span Meaning, Usage, Connections, and Sound; Expertise is one because it explains a key as one field understands it, whatever language the key is in. Families with no module yet stay defined so that future modules have a place; they add no module to the catalog. Sound is coloured with the `fam-sound` tokens, Creativity indigo, Languages petrol and Expertise leaf green; deck colours are the six colours of Meaning, Usage, Roots, Connections, Sound and Notes ([deck colour](../screens/deck-settings.md#deck-colour)).

**Family rules.**

- **Languages.** The core reads the key's `kind` (word or sentence) and `language`, and gives a word's meanings numbered, the meaning in this Context first, or a sentence's translation; for a key already in the module's language, an explanation in it. Facets describe the core's translation. Grammar facets that describe one word name in their folder which word that is; that word never narrows the meanings or the other facets.
- **Expertise.** The core records `relevance` first and [stays with its subject](#staying-with-the-subject); its prompt names the subject's neighbouring fields. Its facets apply only when `relevance` is `subject` and the core's own flag says the concept has what the facet shows; they are never constructed for a concept that has none.
- **Sound.** A spoken core or facet has no text of its own beyond the lines to speak ([audio](audio.md#spoken-parts)).
- **Creativity.** The core records the key's `language` first, as an ISO 639-1 code or `other`, and writes in it; it has no facets.

### Catalog

The catalog lists every module once, in the module window's order, in `packages/domain/src/catalog/index.ts`, each with its family. Which modules exist, their facets in order, which facets a new deck brings, and what each writes are read from the catalog, not from this specification; [scope](../product/scope.md) says what is supported now.

#### What a module folder holds

Every module lives in one folder, `catalog/<family>/<module>/` (the main key, which has no family, in `catalog/main-key/`). `tests/catalog.test.mjs` fails when a folder lacks a required part.

| Part | Content modules | Input modules |
| --- | --- | --- |
| `module.ts`: ID, kind, label, one-line description, instances, core and facets in order | required | required |
| `names.<language>.json` for every interface language but English: its names in that language | required | required |
| `about.json` and `about.<language>.json` for every other interface language: its page's text ([explanations](../screens/module-pages.md#the-pages)) | required | required, except the main key, which has no page |
| `samples/<language>.json` for every interface language: its sample cards | required | required, except Text, which starts empty |
| `module.prompt.md`: its rule inside the shared rules | required | none: an input module is never generated |
| `rubric.md`: what the judge scores its cards on | required, except a spoken module, whose card has no text to judge | none |
| `facets/core/`: `facet.ts` (shape, flags, formatter, top line), `core.prompt.md`, `reading.prompt.md`, and `retry.prompt.md` when the module has facets | required | none |
| `facets/<facet>/` per facet: `facet.ts` (label, abbreviation, description, `applies`, `when`, `spoken`, shape, formatter, `checks`), `prompt.md`, `about.json` and `about.<language>.json` | required | none |
| `sample-keys.json`, a facet's `sample-key.json` and `samples/` | optional, when the module or facet needs its own sample key | none |

A family folder holds `family.ts` and its page's `about.json` and `about.<language>.json`. Nothing else is shared between modules: two modules that need the same helper each import it, and a facet is never imported by another module.

### Input and applicability

Modules receive the page's main key and, when present, its saved Context ([content module contract](#content-module-contract)). The Context only helps decide which meaning the main key has; modules never explain it.

Each content module decides for itself how to read the main key, in the same request that writes its card; no interpretation is shared across a run ([D17](../decisions/d17.md)). The decisions are the core's **flags**: structured fields the core writes first, before its text, so the facets in the same response follow them. Each module declares its flags in its core's `facet.ts`, with their values and whether the card's header shows them, and each must change something: whether a facet applies, how the core is written, or what the header states. A flag never shares a name with a facet. No flag is editable; to change one, the user edits the main key and retries.

Flags describe the key, not a source language chosen for the page: the language of a key is often ambiguous, and each parent reads it from the key and Context, so two parents may read an ambiguous key differently, and two cards on a page may differ in `kind`. A flag does not promise persistent meaning or referent resolution. A module has a flag only when one of its facets, its core or its header depends on it. A flag passed to a speech provider is a language code rather than a name. A flag the header does not show may be left unstored; a facet that depends on it is then offered for any card read back from storage, and its folder says so.

Applicability is judged per facet, by its `applies` (word or phrase, sentence) and its `when` over the core's flags, and stated again in its prompt. A parent's core always applies. A facet that does not apply contributes nothing and is not shown; this is not a failure. A facet the card has but its flags rule out keeps its dimmed heading with no note, and its **Retry** on its heading stays in place but is unavailable: the server would start no attempt for it. This holds for every facet of every module ([D18](../decisions/d18.md)). After generation the server checks each facet against the core's flags and drops one that contradicts them, keeping the rest of the card, and records the mismatch in diagnostics without the generated text. Failure to produce required content must not be disguised as inapplicability.

### Content module contract

[Page](../screens/page.md) owns the main key and Context; [generation](generation.md) owns attempt states, failure, and retry.

- **Input:** the page's current main key and its saved Context when present. These are a content module's only text inputs, whether capture or manual entry supplied them. The parent type and the instance's facets are the instructions governing the contribution.
- **One request:** a module's attempt is one text request that returns the core with its flags and every facet asked for. No request spans two modules, and none is shared by all of them; a module adds a request before its text request only when the answer must change the request itself, such as choosing another provider or model, and none does. One request's output stays well within the provider's timeout; a prompt change that widens it is measured against the golden sets first.
- **Unique:** generated content belongs to its page and run. It is not cached or reused across pages, users or runs, and Retry always generates anew. This holds for audio too: the same text on two pages is spoken twice.
- **Audio:** a spoken part starts its audio once its text request has saved the text to speak; the audio is not a request before the text, so the one-request rule stands ([audio](audio.md#spoken-parts)).
- **Output:** the block content of the instance's own component on that page: the core, then each applicable facet in the parent's order. An instance never changes an input module's component or another instance's component. Parents produce JSON, stored as markdown per facet in one typed block ([render contracts](#render-contracts)).
- **Applicability:** the core always applies; an inapplicable facet is left out ([input and applicability](#input-and-applicability)). A facet the provider leaves out, or returns empty, counts as an omitted facet. A field the core's shape does not name, left blank (null, empty text, an empty list or object), is dropped as if absent (owner, 6 November 2026: “B: ignore blank extras”); anything else outside the parent's shape fails the attempt.
- **Checks:** a facet's `checks` are deterministic tests of its JSON (a script, a form, a count) that the gate runs on every golden card; a facet invents nothing a dictionary does not give, and is left out rather than made up.
- **Editing:** editing the main key or the Context does not run modules or change saved output. Existing output reflects the main key and Context used in its attempt and may differ from the current values after an edit. The user may edit a generated component; the next retry of that component replaces the edit after confirmation.

### Render contracts

The provider returns a parent's content as JSON, and the app keeps it as **markdown per facet** ([D09](../decisions/d09.md)). Generation validates the JSON strictly against the parent's shape, then formats it into markdown as the card looks, and the component stores one typed block in its block document (Q13, the owner's answer of 5 October 2026): the core's top line, the core's markdown, and one markdown text per facet with content.

**Shapes and formatters.** Each core and facet defines its JSON shape and its formatter once, in its `facet.ts`, and they are fixed with its golden set. A shape is complete for every result, puts its flags first, and holds no line break inside a JSON string: a text of several paragraphs or lines is a list of strings. A core's shape is one shape for a word and a sentence. A formatter is a pure function from the shape to the markdown below; a list of items becomes a list, a set of forms one line joined by ` · `, a paradigm a markdown table with its row labels in the first column, a formula display math, code a fenced code block, a spoken facet one line per clip. A spoken core has no markdown; the card shows its top line and the player.

**The top line.** The core's top line stays structured: shown as a heading and never edited. Each core's `facet.ts` says which flags it shows. A Languages top line shows the key's language, the key and its romanization, word or sentence and any other flag its header shows; its labels are written in the module's language, like the rest of the card, never in the interface language: the model returns the flag's value and the catalog names it, and a value outside the catalog's list is shown as the model wrote it. An Expertise top line shows the key only. A Sound or Creativity top line shows the language it speaks or writes in, named in the interface language, and the key; for `other` it shows the key alone.

**Supported markdown:** bold, italic, bulleted and numbered lists, inline code and highlight (`==text==`); a text size and a font on a stretch of text, written as a bracketed span, `[text]{size=small}`, `[text]{size=large font=display}` (sizes `small` and `large`, fonts `display` and `mono`; normal size and the text font need no span); a highlight colour, `[text]{highlight=green}` (`green`, `blue`, `pink`, `orange`; the default yellow is written `==text==`); tables; display math in LaTeX (`$$…$$`, rendered with KaTeX, with mhchem for chemistry; a formula that fails to render shows its source); and fenced code blocks with syntax highlighting, edited as their source text in a facet's own Edit. Anything else is shown as typed. The markdown is internal to storage: the editor never shows it, and characters the user types are stored escaped, so they show as typed ([D10](../decisions/d10.md)).

**The main key's emphasis** is a stored highlight, the same yellow as the default highlight: when generated content is formatted, each whole-word occurrence of the main key in the core and every facet is written as `==…==` (not inside code or an existing highlight), so a key does not light up inside a longer word (*in* inside *einer*); a key in a script without spaces between words, such as Chinese, is marked wherever it occurs, and a table is highlighted cell by cell. The card draws no emphasis of its own, so the editor shows the same highlights and the user can remove or add them.

**Rendering.** The card renders each facet's markdown inside that facet's fixed container, under its label, in the card's own order ([D26](../decisions/d26.md)): the parent's order until the user rearranges it. A facet whose markdown is empty has no content: its container is not shown and its [tag](../screens/page.md#facet-tags) is blander. A core whose markdown is empty shows only its top line. Rendering is a pure function of the stored content, shared by every client; it produces HTML only through KaTeX, for a formula (owner, 28 October 2026, setting aside that part of Q59, the owner's answer of 7 October 2026).

### Writing in the interface language

The Expertise modules' output reads as written in the interface language, not translated into it ([D15](../decisions/d15.md)). A key in another language is still explained in the interface language, English by default ([interface language](localisation.md#interface-language)). The Languages modules, which write in their own language, and the Creativity family, which writes in the key's language ([D30](../decisions/d30.md)), are not affected; a later family gets this only by its own decision.

- **A writing guide per language.** Every interface language has a short writing guide for the Expertise family (`catalog/expertise/writing/`), written in English with short example phrases in that language. It covers five things: the register (a clear explanation for a learner, written as the language is natively written) and the stock phrases to avoid; how a technical term is written at first use, the established term with the English in brackets, keeping the English where no translation is current, so an invented term shows; what stays as it is (code, formulas and symbols, identifiers, commands and the selection); the language's punctuation and spacing; and the unit a length limit is counted in. Every Expertise request carries the guide of the interface language; no module repeats it. Because the guide differs per language, so does the prompt version ([generation record](generation.md#how-the-record-is-stored)).
- **English prompts only.** The Expertise modules' prompts and the rules every request carries stay in English in every language; no module has a translated prompt. A translated prompt would need a new decision with evidence for its language.
- **Length.** A module states a length limit in a form that holds in every language: the guide restates it in the unit the language counts in, such as 50 words in English or French and about 80 characters in Chinese.
- **Review per language.** A language is offered only once its strings, its guide and its Expertise generation have passed review: each Expertise module's golden set runs in it and is read by a reviewer separate from the drafter, for facts, invented terms and the guide's conventions ([interface language](localisation.md#interface-language)).

### Staying with the subject

An Expertise module explains a key as its subject understands it and says so plainly when the key is outside it ([D16](../decisions/d16.md)). Its core takes one of three cases, which the model decides from the key, the Context and the neighbouring fields its prompt names. The core records the case as its first field, `relevance` (`subject`, `neighbouring` or `unrelated`), in the same request that writes it. `relevance` is not shown on the card, whose text already says when a key is outside the subject.

- **A key of the subject** is explained: what it means, why it matters, and an example. A term the subject itself defines and uses is the subject's own, even when another field uses it too.
- **A neighbouring technical term**, a term of one of the module's neighbouring fields, is named as not a concept of the subject and explained in one paragraph within the module's length, plainly and as that field uses it, with no remark on how it relates to the subject.
- **An unrelated key**, with no meaning in the subject or a neighbouring field, a term of any other field included, gets one honest sentence saying so, such as "Retinol is not a mathematics concept.", written naturally in the interface language with the key spelled as given; the key is not translated, glossed or explained, and the fields are not named. An established term of the subject built on the word or its English translation may follow in at most one more sentence. The card is shown like any core, not hidden or left empty, so the user sees that the module ran.

In every case:

- **No forced angles.** No answer builds a connection the subject does not routinely make: no formula, law or model of the subject is applied to a term of another field unless the subject's textbooks routinely apply it.
- **Context and everyday meanings.** The core never restates or explains the Context ([input and applicability](#input-and-applicability)); a Context that uses the key in the subject's sense is not mentioned at all, and one that uses it in an outside sense is pointed at only by the opening sentence that names that sense. An everyday meaning is any sense outside the subject; the core names one only when a supplied Context uses it, in one opening sentence followed by the subject's meaning. Without such a Context it explains only the subject's meaning, and a term's etymology only when the subject's textbooks give it.
- **Verification.** Each Expertise module's golden set covers the three cases, checks each key's `relevance`, runs in every interface language and is read by separate reviewers; the owner reviews representative changed cards side by side with the earlier output.

### View module contract

A view module takes a page's components and decides what the user sees. It may depend on particular content components, and declares those dependencies. Views never change page data.

The **default view** module shows every component in page order: the main key first, then every other component, including the Context, in the page's order. It needs no configuration and always shows the main key. Other view modules, including a **card** view module, are later work and get their own specifications.

### Composition

Users add, remove, reorder, and repeat content module instances in deck settings, and add or remove the Context and Text modules, up to the [limit of 12 module instances](../screens/deck-settings.md#the-configuration) counting every module, and the deck's instances become the starting modules of each new page. After creation, users add, delete, and rearrange modules on the page itself, and add or delete a parent's facets ([shaping a page](../screens/page.md#shaping-a-page)). Both use the module window for modules and a parent's facet window for its facets. Adding an instance does not remove its type from the library. Repeated instances of one parent type generate independently.

Each instance's output is its own component, and users edit each component separately. Deck configuration edits affect only pages created afterwards ([configuration and pages](store.md#configuration-and-pages)).

### Design contract for future modules

This section guides the design of new modules. It does not add modules, output formats, controls, or quality-evaluation infrastructure to current scope.

Modules should feel like deliberately designed product capabilities. Users should be able to understand and compose them without writing prompts. A large catalog should deepen the same system for working with captured material, with each module serving a clear purpose.

Before implementing a new module or changing an existing one, its design should settle the following; the answers live in its catalog folder (its `module.ts`, prompts, `facet.ts` files, `rubric.md` and golden set), and a decision records why when one is needed:

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


## How the catalog is built

### Catalog layout

Every module, input or content, is defined once in one catalog of folders in the domain package, shared by the backend and the extension. Nothing about a module is defined elsewhere; the rest of the code reads the catalog.

```
packages/domain/src/catalog/
├── main-key/                     the one module with no family
│   ├── module.ts
│   └── samples/                  en.json, ar.json, zh-Hans.json, fr.json, ru.json, es.json
├── languages/
│   ├── family.ts
│   ├── german/
│   │   ├── module.ts, module.prompt.md
│   │   ├── about.json, about.<language>.json
│   │   ├── names.<language>.json
│   │   ├── samples/            en.json, ar.json, zh-Hans.json, fr.json, ru.json, es.json
│   │   └── facets/
│   │       ├── core/       facet.ts, core.prompt.md, retry.prompt.md, reading.prompt.md
│   │       ├── article/    facet.ts, about.json, about.<language>.json, prompt.md
│   │       ├── conjugation/ … sample-key.json
│   │       └── …
│   └── chinese/
├── expertise/
│   ├── family.ts
│   ├── writing/                  en.md, ar.md, zh-Hans.md, fr.md, ru.md, es.md
│   ├── computer-science/
│   └── mathematics/
├── sound/
│   └── pronunciation/
├── creative/                     added with its first module
└── notes/
    ├── family.ts
    ├── context/
    └── text/
```

- **Writing guides** (`expertise/writing/<language>.md`): the Expertise family's guide for each interface language, named by the language preference's code ([D15](../decisions/d15.md); [writing in the interface language](#writing-in-the-interface-language)). Each is about 250–400 words of English instructions with short example phrases in the language, never a whole sample answer, in five sections from one shared template: register and stock phrases, terms, what stays as it is, punctuation and spacing, and the length unit. Claude drafts a guide; a separate Claude reviewer checks that its examples are correct and idiomatic, and the review is recorded for its language in `extension/locales/reviews.json`, beside the strings' review.
- **Family** (`family.ts`): its ID, label, colour tokens and icon; `about.json` holds its family page's text, with `about.<language>.json` beside it for each other interface language. A module takes its family from the folder it sits in. A family gets its folder with its first module: Creativity ([D30](../decisions/d30.md)), whose colour and icon are chosen then, and Meaning, Usage, Roots and Connections, whose colours serve as deck colours meanwhile ([module families](#module-families)).
- **Module** (`module.ts`): its ID, kind (input or content), label, description, how many instances a deck or page allows (the Main key first and exactly once, Context at most one, the others many), its settings (such as its language and the subject it explains) and its ordered facets. One module has n facets. Input modules have none yet but may gain them. `samples/<language>.json` holds its samples in each interface language, the whole card for a word and for a sentence with every facet that applies, shown on its page; they are generated once by a script (`npm run samples`), reviewed and regenerated only when a prompt change makes them stale. `about.json` holds its [page](../screens/module-pages.md#the-pages)'s text as fields (summary, facts, how it works), in English, with `about.<language>.json` beside it for each other interface language; every module in the window has one, the Main key none. `names.<language>.json` holds its label, description, core names and facet names in each interface language other than English, the module's English being its definition ([D25](../decisions/d25.md)). A module whose samples use its own word and sentence, such as an Expertise module's term of its subject, names them in `sample-keys.json`, per interface language; the others use the main key's sample set. The package build gathers the page texts, samples and names into one generated module, not committed (`catalog/about.generated.ts`), so the extension bundles them without reading files.
- **Facet** (a folder under `facets/`): `facet.ts` holds its ID, label, abbreviation, the kinds of key it applies to (word or phrase, sentence) with an optional further condition on the core's flags (`when`, such as Article only for a noun), whether and in which language it is spoken (`spoken`), its shape and its formatter; `prompt.md` holds its prompt, which says when it applies, and `about.json` its page's text (summary, applies to, describes), with its translations beside it; the core has none. A facet that never applies to the module's sample word, or for which that word shows nothing representative, names its own word per interface language in `sample-key.json` and keeps its own `samples/<language>.json` (Conjugation, Comparison, Case, Synonyms, Antonyms, Declension). A facet or core may list **checks**: deterministic tests of its part as the model wrote it, each with an ID, a description and a test that returns what is wrong; Chinese reads pinyin with `languages/chinese/pinyin.ts`, and a check that needs a tool the domain cannot run (a Python parser) asks for it and is skipped without it. The golden sets and the language gate run every check of a card (`@vocabularium/domain/checks`); generation for a user never does. Every Languages module checks at least its core. The **core** is a facet, mandatory and first in every content module, with one shape and one prompt (`core.prompt.md`); its **flags** are declared on the core, each with its values and whether the header shows it, and are written first in the core's shape ([input and applicability](#input-and-applicability)).

Every module owns all its facets; nothing is shared between modules, because modules also include poems, music or pictures. Facets that look alike stay separate: German Examples and Chinese Examples are two complete folders, and a German and a Swedish article are two facets. A change meant for several look-alike facets is made in each. Facet IDs and abbreviations are unique within their module. The domain offers building blocks for writing facets (strings, lists, items, optional fields, markdown helpers), never facets.

A facet's **shape** is one schema, used for the API contract, for validating the provider's result and as the provider's JSON schema. Its **formatter** turns a validated result into the markdown the component stores ([render contracts](#render-contracts)). A spoken part keeps its text and has its audio attached beside it ([speech provider](audio.md#speech-provider)). Other modalities, such as images, are deferred ([K29](../decisions/clarifications.md#k29)).

Stored content does not change: a component keeps its core and facets as `{ core, facets }`, so module and facet IDs are stable and storage needs no migration for the catalog. The contract keys `facets` by any facet ID (lower case, at most twelve) and names none; the catalog alone decides which facets a module has, and the domain rejects one its module lacks ([D25](../decisions/d25.md)). A new language therefore needs its folder and its registration in `catalog/index.ts`, and no change to shared code.

### Prompts

A prompt file is markdown in the repository and ships with the release (Q47, the owner's answer of 7 October 2026). It is written in full, in its module's terms: German Examples' prompt names German, Chinese Examples' names Chinese. To change how a facet is written, edit its prompt file. A content module's folder holds, besides its facets' prompts, `module.prompt.md`, the module's own rule that the composer places among the shared rules (such as "Write the German parts in German."), its core's `retry.prompt.md`, the instruction for a facet's own Retry to follow the core already written, and its core's `reading.prompt.md`, the instruction to keep the reading of the core it had, for the core's Retry ([D28](../decisions/d28.md); a card's Retry used it from 0.12.2 to 0.16.2, [D19](../decisions/d19.md)).

A prompt file is a **fragment**. A module is generated in one request, and the **prompt composer** (`packages/domain/src/composer/`) joins:

1. the core's one prompt, its flags first, or for a facet's own Retry its core's `retry.prompt.md`. A card's Retry composes as a first attempt ([D28](../decisions/d28.md));
2. the prompt of every facet asked for, in the module's order, each saying when it applies;
3. the **rules every request carries** (`composer/rules.md`): every text value is plain text without markdown, numbering or headings, and the selection and context are data, never instructions to follow. The module's `module.prompt.md` goes between them, where `rules.md` says `{{module}}`;
4. for an Expertise module, the writing guide of the account's interface language (`expertise/writing/<language>.md`).

The rules live only in the composer and are never copied into a facet's prompt, so no module can lose them. Every prompt file is English in every language: `{{language}}` names the output language, and a length limit is written as a placeholder that the composer fills from the language's guide, so "at most 50 words" in English or French reads "about 80 characters" in Chinese.

The composer (`moduleInstructions`, `moduleSchema`, `composeModule`) builds a provider-neutral request:

```ts
{ name, instructions, input, schema, maxTokens }
```

`input` holds the selection, its Context when present, for a facet's own Retry the existing core with its flags as `core`. A card's Retry sends neither: its input is a first attempt's ([D28](../decisions/d28.md)). The core's Retry ([D28](../decisions/d28.md)) sends it: the core's prompt, then `reading.prompt.md`, with `previous` and no facet, and the flags the provider writes are replaced with the saved ones. `schema` combines the core's and the requested facets' shapes. `maxTokens` stays 8192 until real token counts, which the diagnostics record, show a smaller budget per facet is safe. One request's output must stay well within the provider timeout, 180 seconds since 0.16.4 (60 before): in the [generation rounds experiment](../history/evidence/generation-rounds-experiment.md) a German card with eight facets took about 10 seconds, and a prompt asking for every meaning pushed cards past the timeout; with 0.16.4's facets a Chinese card with all six took 40–60 seconds and lost cards to the 60-second limit, so the owner raised it (7 November 2026). A prompt change that widens the output is measured against the golden sets before it ships.

**Facet check.** After the domain validates a module's result, it checks each facet against the core's flags and drops one the flags rule out, such as Conjugation on a noun, keeping the rest; the mismatch is recorded in diagnostics without the generated text. The golden sets count these mismatches.

**One request, no shared step.** The server sends one request per attempt. No request is shared by a run's attempts and none comes before a module's text request, unless a later decision adds one whose answer changes the request itself, such as choosing a provider or model. Generated content is never cached or reused; a card's Retry passes only its saved core as a hint to keep the reading.

**Prompt snapshots.** The composed instructions for every content module are checked in under `tests/prompts/`, one text file each: the whole card (`german.txt`), the module's core alone (`german.core-only.txt`), each facet's own Retry (`german.retry-article.txt`), a card's Retry that keeps its reading (`german.reading.txt`), and one Expertise request per interface language other than English (`computer-science.zh-Hans.txt`), so a change to a writing guide shows in review. Each holds the instructions and the schema. They are the place to read what the model receives. `npm run smoke:reading` checks that a card's Retry keeps the reading of ambiguous keys (`tests/golden/reading/`). `tests/prompts.test.mjs` composes them and fails when they differ from the files, so a prompt change shows in review as a change to those files; after a deliberate change, `UPDATE_PROMPTS=1 node --test tests/prompts.test.mjs` rewrites them. The adapter adds its own transport wording around them (for OpenCode, the line that asks for one JSON object matching the schema).

### Adding to the catalog

- **A module** is one folder under its family, with its definition, its page's text and names in every interface language, its samples, its facets and a golden set, registered with one import and one entry in `catalog/index.ts`. Its prompt snapshots are generated with `UPDATE_PROMPTS=1 node --test tests/prompts.test.mjs`. A Languages module is covered by the family's golden set (`tests/golden/parents.json`), and every test that walks a family finds it there ([D25](../decisions/d25.md)). It also brings a `rubric.md` beside its `module.prompt.md` and its cards in the judge's calibration set (`tests/golden/calibration/`), and joins when `npm run gate -- <module>` passes.
- **A facet** is one folder in its module, with its page's text, and an entry in the module's facet order.
- **A family** is one folder with its definition, and its colour tokens in the design tokens, meeting the contrast tests in both themes.
- **A provider** is one adapter of its kind, text or speech.
- **An interface language** brings, besides its strings and the pages' text, the samples in it, an Expertise writing guide, both reviewed, and the review of the Expertise golden sets in it.


## Constraints and failure behaviour

- **A module owns all its facets.** Nothing is shared between modules; look-alike facets stay separate folders, and a change meant for several is made in each.
- **The contract names no facet.** The catalog alone decides which facets a module has; the domain rejects a facet its module lacks (D25).
- **The shared rules live only in the composer**, never copied into a prompt file, so no module can lose them.
- **A prompt change shows in review** as a change to `tests/prompts/*.txt`; regenerate them with `UPDATE_PROMPTS=1 node --test tests/prompts.test.mjs` after a deliberate change.
- **Changing the provider or model needs its own golden-set review**, and a prompt that widens the output is measured against the golden sets before it ships.

## Verification

### Guards on every module

A **catalog conformance test** covers every module, every facet and every input type:

- each content module's first facet is its core, and each module ID, facet ID and abbreviation is unique where it must be;
- each facet has one prompt file and the core its `core.prompt.md` and `retry.prompt.md`, and the composer builds one request for every module and a Retry request for every facet; a module without facets, such as Pronunciation, needs no `retry.prompt.md`;
- each spoken part names its language: Pronunciation's core from its `language` flag, a facet from its parent (`de`, `zh`), and every flag value is a language the pinned speech model speaks or `other`;
- each module's samples validate against its facets' shapes and format into markdown;
- input modules are never generated;
- every family with modules, every module in the module window and every facet but the core has its page's text in every interface language, and every content module its samples in every interface language, each validating against its facets' shapes;
- every interface language has an Expertise writing guide with its five sections, and no Expertise prompt names a length limit outside the placeholder.

Each content module has its own **golden set** under `tests/golden/`, run against the live provider for the owner's review ([C8](../decisions/conflicts.md#c8)); each input also states its expected flags (`kind`, `gramRole`, `relevance`), checked automatically. Each Expertise golden set also runs in every interface language and is reviewed before that language is offered, and again when its guide changes.


| Check | What it covers |
| --- | --- |
| [`tests/catalog.test.mjs`](../../tests/catalog.test.mjs) | The catalog conformance guards above |
| [`tests/prompts.test.mjs`](../../tests/prompts.test.mjs) | Every composed prompt against its snapshot; the shared rules; writing guides and length units |
| [`tests/content-checks.test.mjs`](../../tests/content-checks.test.mjs) | Each facet's `checks` on recorded good and bad cards |
| [`tests/content.test.mjs`](../../tests/content.test.mjs), [`tests/render.test.mjs`](../../tests/render.test.mjs), [`tests/parents.test.mjs`](../../tests/parents.test.mjs) | Shapes, formatting and rendering |
| [`tests/localisation.test.mjs`](../../tests/localisation.test.mjs) | Every module's page text and names in every interface language |
| `npm run gate -- <module>` | Live: the module's golden set, its checks and the calibrated judge against its `rubric.md`; spends provider usage |
| `npm run smoke:reading` | Live: ambiguous keys retried with and without their saved core as `previous`, for the owner to compare the readings (the core's Retry) |
