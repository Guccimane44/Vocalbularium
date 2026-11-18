# Modules

## Purpose and authority

Modules provide focused capabilities that users choose and combine in a deck's configuration. A rich library of creative and useful modules is the central direction in the [product vision](../product/vision.md). The [product model](../product/model.md) defines module types, instances, outputs, pages, components, and views; [scope](../product/scope.md) identifies what is supported now.

This specification holds the rules **every** module follows: the module kinds, the family rules, the content and render contracts, and what a module's folder must contain. It names no individual module or facet. What one module does, its core, its facets, their shapes, flags, formatting, checks, samples and page text, is defined in its folder in the **module catalog**, `packages/domain/src/catalog/<family>/<module>/`, which is the only source for it ([D25](../decisions/d25.md)); the [generation architecture](../architecture/generation.md#module-catalog) describes the catalog, the prompt composer and the provider adapters.

Content modules are **parent modules** with a core and facets ([D08](../decisions/d08.md)). Each content module writes its card in one request, with the decisions that steer it recorded as **flags** in its core ([input and applicability](#input-and-applicability)). A module or facet can also be **spoken**: its audio comes from a speech provider in jobs of their own after the text ([audio](#audio)). [Capture and generation](capture-and-generation.md) owns generation completion, failure, interruption, publication, and retry behavior.

## Module kinds

Modules have three kinds (Q72, the owner's answer of 10 October 2026; [D02](../decisions/d02.md)):

- **Input modules** are filled by capture or by the user, never by generation. The **main key module** is compulsory, exactly one per deck and page, always first, and cannot be removed. The **Context module** is optional, at most one per deck or page; a deck with it captures the selection's surrounding block. The **Text module** holds the user's own writing and can repeat. The main key and Context are a content module's only inputs; Text never is.
- **Content modules** produce components from a page's main key and Context. Every content module type is a [parent module](#parent-modules-and-facets). Each instance owns one component per page.
- **View modules** show pages. The **default view** is the only view module.

## Parent modules and facets

A **parent module** contributes one focused kind of content, such as a translation into one language. It has:

- a required **core**, which applies to every word, phrase, and sentence, so a parent never completes empty because of the kind of input;
- **facets**, each adding one kind of content about the core. A facet type belongs to one parent type, and the parent type fixes the order its facets appear in, whatever order the user adds them in.

The catalog defines the core as the parent's first facet, one the user cannot add or delete, and each parent owns all its facets: facets that look alike in two parents are defined separately and may differ. Input modules have no facets.

<a id="context-meaning"></a>**The meaning in this Context** ([D29](../decisions/d29.md)). When the Context selects one sense of a word or phrase, a Languages core gives that sense first, under a label its module writes in its own language, and the key's other senses after it. The key's original meaning, its literal or most common sense, is always given, as one of those senses or as the Context's own; a key with several readings keeps to the reading the Context uses. Without a Context, with one that does not narrow the sense, and for a sentence, the core has no such line. The model never writes the label; a line that starts with it reads back as the meaning in this Context, so a facet's Retry and an edit keep it, and a user who deletes the label makes it an ordinary meaning. Pronunciation never speaks the label.

In a Languages parent, facets describe the core's translation, not the main key. When the main key is already in the parent's language, the core explains it in that language instead of translating it, and the translation the facets describe is the main key itself; this is how a user finds, for example, the article of a German noun.

Facets have no options. Variety comes from more parent types: two translations are two parent types, not one type with a language setting (partly answers Q41, which the owner answered on 7 October 2026). Varieties of one language are not told apart: one module per language, not one per variety ([D34](../decisions/d34.md)).

A parent and its facets are one component, produced by one generation attempt in one request, and **Retry** regenerates them together; a spoken part's audio follows in its own jobs ([audio](#audio)). Several instances of one parent type on a page generate independently, each from the main key and Context.

Each facet type has an abbreviation that marks its [tag](pages-and-editing.md#facet-tags) on a card. No two facets of one parent share an abbreviation; facets of different parents may.

### Choosing and changing facets

- **Adding a parent.** A parent is added like any module, by dragging it or with its **+**, with its core only, or with the facets its module brings to a new deck.
- **Adding a facet.** A parent's facets are chosen on the parent itself: **Facet** among its actions, on a page or in deck settings, opens its [facet window](pages-and-editing.md#facet-window), which lists every facet of the parent's module. An added facet waits, as its dimmed heading, until the user's next **Retry** regenerates the whole parent or the facet's own **Retry** generates it ([capture and generation](capture-and-generation.md#retry)); a parent already generating takes no facet until its attempt finishes.
- **Deleting a facet.** A facet is deleted from its parent the way a component is deleted from a page ([pages and editing](pages-and-editing.md#components-as-cards)). A deleted facet stays gone: Retry never brings it back, and the user adds it again in the facet window to restore it.

A deck configuration stores each parent instance with its facets, and a new page copies them ([decks and configuration](decks-and-configuration.md#configuration-and-pages)). Facets are not module instances and do not count toward the limit of 12. A parent holds at most 12 facets of its own (`MAX_FACETS`); a module may offer more, and once a parent holds 12 the facet window disables the rest, saying why.

## Module families

Every input and content module belongs to one **module family**, which gives it its colour and icon in the interface ([shared UI](shared-ui.md#visual-identity)). The family is part of the module type's definition, shared by every client. A parent module's family colours its whole card; its facets have no family of their own. A new module joins an existing family; a further family is added only when a group of modules fits none of these.

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

The main key module belongs to no family; it is shown as the page title. Languages is a family of its own because a translation's facets span Meaning, Usage, Connections, and Sound; Expertise is one because it explains a key as one field understands it, whatever language the key is in. Families with no module yet stay defined so that future modules have a place; they add no module to the catalog. Sound is coloured with the `fam-sound` tokens, Creativity indigo, Languages petrol and Expertise leaf green; deck colours are the six colours of Meaning, Usage, Roots, Connections, Sound and Notes ([decks and configuration](decks-and-configuration.md#navigation)).

**Family rules.**

- **Languages.** The core reads the key's `kind` (word or sentence) and `language`, and gives a word's meanings numbered, the meaning in this Context first, or a sentence's translation; for a key already in the module's language, an explanation in it. Facets describe the core's translation. Grammar facets that describe one word name in their folder which word that is; that word never narrows the meanings or the other facets.
- **Expertise.** The core records `relevance` first and [stays with its subject](#staying-with-the-subject); its prompt names the subject's neighbouring fields. Its facets apply only when `relevance` is `subject` and the core's own flag says the concept has what the facet shows; they are never constructed for a concept that has none.
- **Sound.** A spoken core or facet has no text of its own beyond the lines to speak ([audio](#audio)).
- **Creativity.** The core records the key's `language` first, as an ISO 639-1 code or `other`, and writes in it; it has no facets.

## Catalog

The catalog lists every module once, in the module window's order, in `packages/domain/src/catalog/index.ts`, each with its family. Which modules exist, their facets in order, which facets a new deck brings, and what each writes are read from the catalog, not from this specification; [scope](../product/scope.md) says what is supported now.

### What a module folder holds

Every module lives in one folder, `catalog/<family>/<module>/` (the main key, which has no family, in `catalog/main-key/`). `tests/catalog.test.mjs` fails when a folder lacks a required part.

| Part | Content modules | Input modules |
| --- | --- | --- |
| `module.ts`: ID, kind, label, one-line description, instances, core and facets in order | required | required |
| `names.<language>.json` for every interface language but English: its names in that language | required | required |
| `about.json` and `about.<language>.json` for every other interface language: its page's text ([explanations](#explanations)) | required | required, except the main key, which has no page |
| `samples/<language>.json` for every interface language: its sample cards | required | required, except Text, which starts empty |
| `module.prompt.md`: its rule inside the shared rules | required | none: an input module is never generated |
| `rubric.md`: what the judge scores its cards on | required, except a spoken module, whose card has no text to judge | none |
| `facets/core/`: `facet.ts` (shape, flags, formatter, top line), `core.prompt.md`, `reading.prompt.md`, and `retry.prompt.md` when the module has facets | required | none |
| `facets/<facet>/` per facet: `facet.ts` (label, abbreviation, description, `applies`, `when`, `spoken`, shape, formatter, `checks`), `prompt.md`, `about.json` and `about.<language>.json` | required | none |
| `sample-keys.json`, a facet's `sample-key.json` and `samples/` | optional, when the module or facet needs its own sample key | none |

A family folder holds `family.ts` and its page's `about.json` and `about.<language>.json`. Nothing else is shared between modules: two modules that need the same helper each import it, and a facet is never imported by another module.

## Explanations

Every module family with modules, every module in the module window and every facet but the core has a **page** that explains it, so a user can learn what it does without trying it: a **family page**, a **module page** and a **facet page**. This section and the screen catalogue (`npm run screens`, [screens](../guides/screens.md)) are the reference for their layout and wording; D20's design boards are history ([D20](../decisions/d20-module-pages.md)).

- **One sheet.** The pages open in one side sheet that slides in over the module window, the same for all three kinds. A **path** at its top links them, such as *Languages / German / Article*; a module page links to its facets, a facet page back to its module and on to the module's other facets. **Back** returns one step; **Escape** closes the sheet and returns the focus to what opened it. They open from the module window ([shared UI](shared-ui.md#module-window)), a facet window and a card ([pages and editing](pages-and-editing.md#facet-window)) and deck settings ([decks and configuration](decks-and-configuration.md#configuration)).
- **Static.** A page shows the same content wherever it opens: it takes nothing from the current card or deck and has no add button. Modules are added only from the module window.
- **A family page** shows the family's mark, name and colour, one sentence on what its modules do, what every module of the family does in three short steps, its modules, each opening its module page, and the other families. Every family with modules has one.
- **A Languages module page** has a header (the family, the module's mark and name, one sentence), three **facts** (what it reads, what it writes, what happens to a key already in its language), **How it looks**, **How it works** and its **facets**. How it looks shows a sample: a dropdown of the interface languages, each named in itself (*العربية*), chooses the key's language, starting at the interface language; **Word** or **Sentence** chooses the input; the key is set large above a card that shows the core only and ends in a hint that facets follow, a dashed **+ Facets** tab on a fading rule and "Add facets for more customised content." How it works is four lines on one rail: **Main key** (the key), **Read as** (the core's flags shown in its header), **Module core** (the meanings, one numbered per line, or a sentence's translation) and **Facets** (the module's facet marks, those that apply filled). The facets are listed in the module's order, each with its one-line description and what it applies to (*Nouns*, *Verbs*, *Words · sentences*), opening its facet page.
- **An Expertise module page** has the header, no facts, **See it on a card** with **Word** or **Sentence** on the subject's own term and no language dropdown, a card with the core and the same facet hint, and its facets, without what each applies to; it has no How it works. **Text** and **Context** have the header only.
- **A facet page** has a header (*Facet · German*, its mark and name, one sentence), **Applies to** (only what it applies to, such as *Nouns*) and **Describes** (what it is written from); **Samples** with the module page's controls, showing for an input it applies to the key, then the card the sample sits on: the core and the card's other facets dimmed, in the module's order, and the facet highlighted in full; for an input it does not apply to, "Left out" with the reason. The card is the facet's own sample's when it has one, otherwise its module's; a facet with two word samples names its tabs by their role. Every facet page has at least one sample in every interface language. Then the module's facets, the current one marked.
- **Core, not grammar word.** The pages call what the facets are written from the **core**; the word a grammar facet describes is not named as such.

**Samples.** The modules of a family share one sample set where they can: the Languages modules the word *language* and the sentence *Languages are the bridges connecting people and the world.*, in each interface language, as each module writes them; each Expertise module a term of its own subject, written in the interface language. A facet that never applies to the shared word has its own word in the same languages (its `sample-key.json`). Samples are generated once per interface language, reviewed and stored in the catalog, and regenerated only when a prompt change makes them stale; they are never generated when a page opens.

The one-line descriptions in the module window and the facet window stay beside the pages. The main key, which is not in the window, has no page, and the core has none of its own: its module's page explains it. The pages' text is written in English, the default interface language, and in each other interface language beside it; the sheet shows the one in the language preference.

## Writing in the interface language

The Expertise modules' output reads as written in the interface language, not translated into it ([D15](../decisions/d15.md)). A key in another language is still explained in the interface language, English by default ([shared UI](shared-ui.md#interface-language)). The Languages modules, which write in their own language, and the Creativity family, which writes in the key's language ([D30](../decisions/d30.md)), are not affected; a later family gets this only by its own decision.

- **A writing guide per language.** Every interface language has a short writing guide for the Expertise family (`catalog/expertise/writing/`), written in English with short example phrases in that language. It covers five things: the register (a clear explanation for a learner, written as the language is natively written) and the stock phrases to avoid; how a technical term is written at first use, the established term with the English in brackets, keeping the English where no translation is current, so an invented term shows; what stays as it is (code, formulas and symbols, identifiers, commands and the selection); the language's punctuation and spacing; and the unit a length limit is counted in. Every Expertise request carries the guide of the interface language; no module repeats it. Because the guide differs per language, so does the prompt version ([generation record](../architecture/generation.md#generation-record)).
- **English prompts only.** The Expertise modules' prompts and the rules every request carries stay in English in every language; no module has a translated prompt. A translated prompt would need a new decision with evidence for its language.
- **Length.** A module states a length limit in a form that holds in every language: the guide restates it in the unit the language counts in, such as 50 words in English or French and about 80 characters in Chinese.
- **Review per language.** A language is offered only once its strings, its guide and its Expertise generation have passed review: each Expertise module's golden set runs in it and is read by a reviewer separate from the drafter, for facts, invented terms and the guide's conventions ([shared UI](shared-ui.md#interface-language)).

## Staying with the subject

An Expertise module explains a key as its subject understands it and says so plainly when the key is outside it ([D16](../decisions/d16.md)). Its core takes one of three cases, which the model decides from the key, the Context and the neighbouring fields its prompt names. The core records the case as its first field, `relevance` (`subject`, `neighbouring` or `unrelated`), in the same request that writes it. `relevance` is not shown on the card, whose text already says when a key is outside the subject.

- **A key of the subject** is explained: what it means, why it matters, and an example. A term the subject itself defines and uses is the subject's own, even when another field uses it too.
- **A neighbouring technical term**, a term of one of the module's neighbouring fields, is named as not a concept of the subject and explained in one paragraph within the module's length, plainly and as that field uses it, with no remark on how it relates to the subject.
- **An unrelated key**, with no meaning in the subject or a neighbouring field, a term of any other field included, gets one honest sentence saying so, such as "Retinol is not a mathematics concept.", written naturally in the interface language with the key spelled as given; the key is not translated, glossed or explained, and the fields are not named. An established term of the subject built on the word or its English translation may follow in at most one more sentence. The card is shown like any core, not hidden or left empty, so the user sees that the module ran.

In every case:

- **No forced angles.** No answer builds a connection the subject does not routinely make: no formula, law or model of the subject is applied to a term of another field unless the subject's textbooks routinely apply it.
- **Context and everyday meanings.** The core never restates or explains the Context ([input and applicability](#input-and-applicability)); a Context that uses the key in the subject's sense is not mentioned at all, and one that uses it in an outside sense is pointed at only by the opening sentence that names that sense. An everyday meaning is any sense outside the subject; the core names one only when a supplied Context uses it, in one opening sentence followed by the subject's meaning. Without such a Context it explains only the subject's meaning, and a term's etymology only when the subject's textbooks give it.
- **Verification.** Each Expertise module's golden set covers the three cases, checks each key's `relevance`, runs in every interface language and is read by separate reviewers; the owner reviews representative changed cards side by side with the earlier output.

## Input and applicability

Modules receive the page's main key and, when present, its saved Context ([content module contract](#content-module-contract)). The Context only helps decide which meaning the main key has; modules never explain it.

Each content module decides for itself how to read the main key, in the same request that writes its card; no interpretation is shared across a run ([D17](../decisions/d17.md)). The decisions are the core's **flags**: structured fields the core writes first, before its text, so the facets in the same response follow them. Each module declares its flags in its core's `facet.ts`, with their values and whether the card's header shows them, and each must change something: whether a facet applies, how the core is written, or what the header states. A flag never shares a name with a facet. No flag is editable; to change one, the user edits the main key and retries.

Flags describe the key, not a source language chosen for the page: the language of a key is often ambiguous, and each parent reads it from the key and Context, so two parents may read an ambiguous key differently, and two cards on a page may differ in `kind`. A flag does not promise persistent meaning or referent resolution. A module has a flag only when one of its facets, its core or its header depends on it. A flag passed to a speech provider is a language code rather than a name. A flag the header does not show may be left unstored; a facet that depends on it is then offered for any card read back from storage, and its folder says so.

Applicability is judged per facet, by its `applies` (word or phrase, sentence) and its `when` over the core's flags, and stated again in its prompt. A parent's core always applies. A facet that does not apply contributes nothing and is not shown; this is not a failure. A facet the card has but its flags rule out keeps its dimmed heading with no note, and its **Retry** on its heading stays in place but is unavailable: the server would start no attempt for it. This holds for every facet of every module ([D18](../decisions/d18.md)). After generation the server checks each facet against the core's flags and drops one that contradicts them, keeping the rest of the card, and records the mismatch in diagnostics without the generated text. Failure to produce required content must not be disguised as inapplicability.

## Content module contract

[Pages and editing](pages-and-editing.md) owns the main key and Context; [capture and generation](capture-and-generation.md) owns attempt states, failure, and retry.

- **Input:** the page's current main key and its saved Context when present. These are a content module's only text inputs, whether capture or manual entry supplied them. The parent type and the instance's facets are the instructions governing the contribution.
- **One request:** a module's attempt is one text request that returns the core with its flags and every facet asked for. No request spans two modules, and none is shared by all of them; a module adds a request before its text request only when the answer must change the request itself, such as choosing another provider or model, and none does. One request's output stays well within the provider's timeout; a prompt change that widens it is measured against the golden sets first.
- **Unique:** generated content belongs to its page and run. It is not cached or reused across pages, users or runs, and Retry always generates anew. This holds for audio too: the same text on two pages is spoken twice.
- **Audio:** a spoken part starts its audio once its text request has saved the text to speak; the audio is not a request before the text, so the one-request rule stands ([audio](#audio)).
- **Output:** the block content of the instance's own component on that page: the core, then each applicable facet in the parent's order. An instance never changes an input module's component or another instance's component. Parents produce JSON, stored as markdown per facet in one typed block ([render contracts](#render-contracts)).
- **Applicability:** the core always applies; an inapplicable facet is left out ([input and applicability](#input-and-applicability)). A facet the provider leaves out, or returns empty, counts as an omitted facet. A field the core's shape does not name, left blank (null, empty text, an empty list or object), is dropped as if absent (owner, 6 November 2026: “B: ignore blank extras”); anything else outside the parent's shape fails the attempt.
- **Checks:** a facet's `checks` are deterministic tests of its JSON (a script, a form, a count) that the gate runs on every golden card; a facet invents nothing a dictionary does not give, and is left out rather than made up.
- **Editing:** editing the main key or the Context does not run modules or change saved output. Existing output reflects the main key and Context used in its attempt and may differ from the current values after an edit. The user may edit a generated component; the next retry of that component replaces the edit after confirmation.

## Render contracts

The provider returns a parent's content as JSON, and the app keeps it as **markdown per facet** ([D09](../decisions/d09.md)). Generation validates the JSON strictly against the parent's shape, then formats it into markdown as the card looks, and the component stores one typed block in its block document (Q13, the owner's answer of 5 October 2026): the core's top line, the core's markdown, and one markdown text per facet with content.

**Shapes and formatters.** Each core and facet defines its JSON shape and its formatter once, in its `facet.ts`, and they are fixed with its golden set. A shape is complete for every result, puts its flags first, and holds no line break inside a JSON string: a text of several paragraphs or lines is a list of strings. A core's shape is one shape for a word and a sentence. A formatter is a pure function from the shape to the markdown below; a list of items becomes a list, a set of forms one line joined by ` · `, a paradigm a markdown table with its row labels in the first column, a formula display math, code a fenced code block, a spoken facet one line per clip. A spoken core has no markdown; the card shows its top line and the player.

**The top line.** The core's top line stays structured: shown as a heading and never edited. Each core's `facet.ts` says which flags it shows. A Languages top line shows the key's language, the key and its romanization, word or sentence and any other flag its header shows; its labels are written in the module's language, like the rest of the card, never in the interface language: the model returns the flag's value and the catalog names it, and a value outside the catalog's list is shown as the model wrote it. An Expertise top line shows the key only. A Sound or Creativity top line shows the language it speaks or writes in, named in the interface language, and the key; for `other` it shows the key alone.

**Supported markdown:** bold, italic, bulleted and numbered lists, inline code and highlight (`==text==`); a text size and a font on a stretch of text, written as a bracketed span, `[text]{size=small}`, `[text]{size=large font=display}` (sizes `small` and `large`, fonts `display` and `mono`; normal size and the text font need no span); a highlight colour, `[text]{highlight=green}` (`green`, `blue`, `pink`, `orange`; the default yellow is written `==text==`); tables; display math in LaTeX (`$$…$$`, rendered with KaTeX, with mhchem for chemistry; a formula that fails to render shows its source); and fenced code blocks with syntax highlighting, edited as their source text in a facet's own Edit. Anything else is shown as typed. The markdown is internal to storage: the editor never shows it, and characters the user types are stored escaped, so they show as typed ([D10](../decisions/d10.md)).

**The main key's emphasis** is a stored highlight, the same yellow as the default highlight: when generated content is formatted, each whole-word occurrence of the main key in the core and every facet is written as `==…==` (not inside code or an existing highlight), so a key does not light up inside a longer word (*in* inside *einer*); a key in a script without spaces between words, such as Chinese, is marked wherever it occurs, and a table is highlighted cell by cell. The card draws no emphasis of its own, so the editor shows the same highlights and the user can remove or add them.

**Rendering.** The card renders each facet's markdown inside that facet's fixed container, under its label, in the card's own order ([D26](../decisions/d26.md)): the parent's order until the user rearranges it. A facet whose markdown is empty has no content: its container is not shown and its [tag](pages-and-editing.md#facet-tags) is blander. A core whose markdown is empty shows only its top line. Rendering is a pure function of the stored content, shared by every client; it produces HTML only through KaTeX, for a formula (owner, 28 October 2026, setting aside that part of Q59, the owner's answer of 7 October 2026).

## Audio

Audio is an output that is not markdown, and a **heavy facet** in the sense of [D17's direction](../decisions/d17-one-request.md#heavy-facets-direction) ([D24](../decisions/d24.md)).

- **What is spoken.** A spoken core speaks the page's saved main key in the language its flag names, never the key as the model wrote it; a spoken facet (`spoken` in its `facet.ts`) speaks each of its lines in its parent's language. The text stays markdown as every facet's does; the audio is attached to the component beside it, one **clip** per spoken line.
- **Where it comes from.** A speech provider, ElevenLabs, with one pinned speech model, Eleven v4 Turbo, beside the one pinned text model ([generation architecture](../architecture/generation.md#providers)), and a voice per language from `ELEVENLABS_VOICES`. Changing the model or a voice needs the owner's listening review.
- **When.** A clip is generated once its text is saved, in parallel with the card's other clips; the card shows its text first, and each clip fills in when it is ready. A clip succeeds or fails on its own, with its own **Retry**, and the text around it stays ([capture and generation](capture-and-generation.md#audio)).
- **Not spoken.** A language `other`, a language the pinned model does not speak, and a line over 500 characters start no audio; the card says why and offers **Retry**. These are not failures.
- **Format.** MP3 at 44.1 kHz and 128 kbit/s, played on the card ([pages and editing](pages-and-editing.md#spoken-parts)); there is no download or export.
- **Editing.** Spoken lines are shown but not editable, because an edited line would no longer match its audio.

## View module contract

A view module takes a page's components and decides what the user sees. It may depend on particular content components, and declares those dependencies. Views never change page data.

The **default view** module shows every component in page order: the main key first, then every other component, including the Context, in the page's order. It needs no configuration and always shows the main key. Other view modules, including a **card** view module, are later work and get their own specifications.

## Composition

Users add, remove, reorder, and repeat content module instances in deck settings, and add or remove the Context and Text modules, up to the [limit of 12 module instances](decks-and-configuration.md#configuration) counting every module, and the deck's instances become the starting modules of each new page. After creation, users add, delete, and rearrange modules on the page itself, and add or delete a parent's facets ([pages and editing](pages-and-editing.md#shaping-a-page)). Both use the module window for modules and a parent's facet window for its facets. Adding an instance does not remove its type from the library. Repeated instances of one parent type generate independently.

Each instance's output is its own component, and users edit each component separately. Deck configuration edits affect only pages created afterwards ([decks and configuration](decks-and-configuration.md#configuration-and-pages)).

## Design contract for future modules

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
