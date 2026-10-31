# Modules

## Purpose and authority

Modules provide focused capabilities that users choose and combine in a deck's configuration. A rich library of creative and useful modules is the central direction in the [product vision](../product/vision.md). The [product model](../product/model.md) defines module types, instances, outputs, pages, components, and views; [scope](../product/scope.md) identifies what is supported now.

The rules below describe content modules as **parent modules** with a core and facets ([D08](../architecture/traceability-map.md#entries)). Release 0.7.0 implements them. Until 0.6.3, the extension offered the three retired types, `German explanation`, `German explanation + examples`, and `Sentence usage`, as the [0.6.3 version of this specification](https://github.com/Guccimane44/Vocalbularium/blob/97ff10f/docs/specs/modules.md) describes, with formats in the [MVP module specification](../history/mvp/MVP-Product-spec-modules.md). [Capture and generation](capture-and-generation.md) owns generation completion, failure, interruption, publication, and retry behavior. From 0.8.0 every module is defined once in the **module catalog**, grouped by family, with its facets, their shapes and their prompts ([D11](../architecture/traceability-map.md#entries)); the [generation architecture](../architecture/generation.md) describes the catalog, the prompt composer and the provider adapters. Since 0.12.0 ([D17](../architecture/traceability-map.md#entries)) each content module writes its card in one request, with the decisions that steer it recorded as **flags** in its core, and the run's shared interpretation is removed ([input and applicability](#input-and-applicability)). From 0.14.0 ([D24](../architecture/traceability-map.md#entries)) a module or facet can also be **spoken**: its audio comes from a speech provider in jobs of their own after the text ([audio](#audio)).

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

A parent and its facets are one component, produced by one generation attempt in one request, and **Retry** regenerates them together; a spoken part's audio follows in its own jobs ([audio](#audio)). Several instances of one parent type on a page generate independently, each from the main key and Context.

### Choosing and changing facets

- **Adding a parent.** A parent is added like any module, by dragging it or with its **+**, with its core only.
- **Adding a facet.** Since 0.8.1 a parent's facets are chosen on the parent itself: **Facet** among its actions, on a page or in deck settings, opens its [facet window](pages-and-editing.md#facet-window), which lists every facet of the parent's module ([D13](../architecture/traceability-map.md#entries)). Until 0.8.1 facets were listed in the module window beneath their parent type and dragged onto a parent of their own type or added with their **+** ([D08](../architecture/traceability-map.md#entries)). An added facet waits, shown as its tag only, until the user's next **Retry** regenerates the whole parent ([capture and generation](capture-and-generation.md#retry)); a parent already generating takes no facet until its attempt finishes.
- **Deleting a facet.** A facet is deleted from its parent the way a component is deleted from a page ([pages and editing](pages-and-editing.md#components-as-cards)). A deleted facet stays gone: Retry never brings it back, and the user adds it again in the facet window to restore it.

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

The main key module belongs to no family; it is shown as the page title. Languages is a family of its own because a translation's facets span Meaning, Usage, Connections, and Sound; Expertise is one because it explains a key as one field understands it, whatever language the key is in. Families with no module yet (Meaning, Usage, Roots, Connections) stay defined so that future modules have a place; they add no module to the catalog. Sound's first module is Pronunciation (0.14.0, [D24](../architecture/traceability-map.md#entries)), coloured with the family's existing `fam-sound` tokens. A Creative family, for parents that write something new from the key such as a poem, is added with its first parent. Languages is coloured petrol ([K26](../architecture/traceability-map.md#clarifications)) and Expertise leaf green ([K30](../architecture/traceability-map.md#clarifications)); deck colours stay the six earlier family colours ([decks and configuration](decks-and-configuration.md#navigation)).

## Catalog

| Parent module | Family | Core | Facets, in order |
| --- | --- | --- | --- |
| `German` | Languages | A word or phrase: an explanation in German, in the layout of the retired `German explanation`. A sentence: its German translation, or for a German sentence an explanation of its meaning, with its figurative meaning when it is idiomatic. | Article, Examples, Synonyms, Antonyms, Conjugation, Declension, Comparison, Case, Pronunciation |
| `Chinese` | Languages | A word or phrase: an explanation in Chinese, in the same layout. A sentence: its Chinese translation, or for a Chinese sentence an explanation of its meaning. Simplified characters. | Examples, Pinyin, Pronunciation |
| `Pronunciation` | Sound | The page's main key, spoken in its own language as the page saved it; at most one per page, and a main key of up to 500 characters ([D24](../architecture/traceability-map.md#entries), 0.14.0). The card has no text of its own. | — |
| `Computer Science` | Expertise | A short explanation of the word, phrase or sentence for a learner, in the language preference, as computer science understands it ([writing in the interface language](#writing-in-the-interface-language); [staying with the subject](#staying-with-the-subject)). Its neighbouring fields: mathematics, electronics, linguistics and information science. Provisional (0.8.0). | Python (Code example until 0.13.1, [D21](../architecture/traceability-map.md#entries)) |
| `Mathematics` | Expertise | The same, as mathematics understands it. Its neighbouring fields: computer science, physics, statistics, economics and engineering. Provisional (0.8.0). | Formula |

| Facet | Tag | Applies when | Content |
| --- | --- | --- | --- |
| Article (German) | Ar | a word whose `gramRole` is noun | The grammar word's article, gender and plural |
| Examples | Ex | always | A word: example sentences using the translation, each with its translation into the main key's language. A sentence: one similar sentence, with its translation |
| Synonyms (German) | Sy | a word | Words with the same meaning as the translation |
| Antonyms (German) | An | a word | Words with the opposite meaning |
| Conjugation (German) | Co | a word whose `gramRole` is verb | From the grammar word's infinitive: present, simple past and perfect (with *haben* or *sein*) in six persons; separable and reflexive forms as the verb has them ([D17](../architecture/traceability-map.md#entries)) |
| Declension (German) | De | a word whose `gramRole` is noun or adjective | A noun: four cases, singular and plural, with the article. An adjective: strong, weak and mixed declension, four cases by gender and plural (D17) |
| Comparison (German) | Cm | a word whose `gramRole` is an adjective that can be compared | Positive, comparative and superlative (*gut, besser, am besten*); left out for an adjective without comparison (*tot*) (D17) |
| Case (German) | Ca | a word whose `gramRole` is preposition | The case or cases it governs, each with a short example (D17) |
| Pinyin (Chinese) | Py | always | The pinyin of the Chinese translation |
| Pronunciation (German, Chinese) | Pr | always | The translation, spoken: a word's word or phrase for each meaning in the parent's language, a German noun with its article in the nominative singular (*das Ufer*), repeats left out; a sentence's translation; a key already in the parent's language, the key itself. Chinese in Simplified Hanzi, never Pinyin. Each line is one clip (D24) |
| Formula (Mathematics) | Fo | `relevance` is `subject` and the concept's standard definition includes a formula | The defining formula, each symbol named in the interface language (D17) |
| Python (Computer Science) | Py | `relevance` is `subject` and the concept is usually shown in code | One short, commented Python example of the concept (D17; until 0.13.1 Code example, Cd, in any language, [D21](../architecture/traceability-map.md#entries)) |

A facet applies by its own prompt, stated in terms of its core's [flags](#input-and-applicability), and is left out otherwise. The German grammar facets (Article, Conjugation, Declension, Comparison, Case) describe one **grammar word**: the main key when it is German, otherwise the German word for its first meaning; the grammar word never narrows the meanings or the other facets. Formula and Python never apply to a neighbouring or unrelated key, so they cannot apply a subject's formula to another field's term ([staying with the subject](#staying-with-the-subject); [C27](../architecture/traceability-map.md#conflicts)), and they are never constructed for a concept that has none. None of the facets added by D17 is in the default deck; users add them from the facet window ([K56](../architecture/traceability-map.md#clarifications)).

Each facet type has an abbreviation that marks its [tag](pages-and-editing.md#facet-tags) on a card (since 0.7.1). From 0.8.0 no two facets of one parent share an abbreviation; facets of different parents may (until 0.8.0 no two facet types shared one, which a growing catalog cannot keep). The facets above keep their abbreviations; D17's facets take Co, De, Cm, Ca, Fo and Cd.

When the main key is already in the parent's language, examples have no translation line. The Expertise modules write in the account's language preference, as the interface does, English by default ([D14](../architecture/traceability-map.md#entries); [shared UI](shared-ui.md#interface-language)); a key in another language is still explained in that language. How they write in it is set out in [writing in the interface language](#writing-in-the-interface-language). Their prompts name the language and carry its writing guide, so the prompt version differs per language ([generation record](../architecture/generation.md#generation-record)). The input modules belong to these families: Context and Text to Notes; the main key to none. Names remain provisional.

`German explanation`, `German explanation + examples`, and `Sentence usage` are retired ([D08](../architecture/traceability-map.md#entries)), as `<The selected>` and `<The selected + original language tag>` were before them ([D03](../architecture/traceability-map.md#entries)). Release 0.7.0 deletes their deck instances and the components they produced along with every deck and page (migration `0011`, [scope](../product/scope.md#upgrade-from-earlier-builds)).

## Explanations

Every module family with modules, every module in the module window and every facet but the core has a **page** that explains it, so a user can learn what it does without trying it: a **family page**, a **module page** and a **facet page** ([D20](../architecture/traceability-map.md#entries), from 0.13.0). The owner's settled design is the reference for their layout and wording ([D20's reference design](../architecture/d20-module-pages.md)). From 0.8.1 until 0.13.0 they were **explanations**: a module's in a dialog from the module window, a facet's beneath its row in the facet window and, since 0.12.1, in a dialog from its **About** on a card ([D13](../architecture/traceability-map.md#entries), [D18](../architecture/traceability-map.md#entries)).

- **One sheet.** The pages open in one side sheet that slides in over the module window, the same for all three kinds. A **path** at its top links them, such as *Languages / German / Article*; a module page links to its facets, a facet page back to its module and on to the module's other facets. **Back** returns one step; **Escape** closes the sheet and returns the focus to what opened it. They open from the module window ([shared UI](shared-ui.md#module-window)), a facet window and a card ([pages and editing](pages-and-editing.md#facet-window)) and deck settings ([decks and configuration](decks-and-configuration.md#configuration)).
- **Static.** A page shows the same content wherever it opens: it takes nothing from the current card or deck and has no add button. Modules are added only from the module window.
- **A family page** shows the family's mark, name and colour, one sentence on what its modules do, what every module of the family does in three short steps (Languages: reads your key in any language, writes the core in its language, facets describe its translation), its modules, each opening its module page, and the other families. Every family with modules has one ([K67](../architecture/traceability-map.md#clarifications)).
- **A Languages module page** has a header (the family, the module's mark and name, one sentence), three **facts** (what it reads, what it writes, what happens to a key already in its language), **How it looks**, **How it works** and its **facets**. How it looks shows a sample: a dropdown of the interface languages, each named in itself (*العربية*; [D21](../architecture/traceability-map.md#entries)), chooses the key's language, starting at the interface language ([K64](../architecture/traceability-map.md#clarifications), [K66](../architecture/traceability-map.md#clarifications)); **Word** or **Sentence** chooses the input; the key is set large above a card that shows the core only and ends in a hint that facets follow, a dashed **+ Facets** tab on a fading rule and "Add facets for more customised content." How it works is four lines on one rail: **Main key** (the key), **Read as** (the core's flags, such as *Wort · Nomen* or *Satz*), **Module core** (the meanings, one numbered per line, or a sentence's translation) and **Facets** (the module's facet marks, those that apply filled). The facets are listed in the module's order, each with its one-line description and what it applies to (*Nouns*, *Verbs*, *Words · sentences*), opening its facet page. Chinese reads as *kind* only.
- **An Expertise module page** has the header, no facts (until 0.13.1 what it reads, that it writes in the interface language and what it is best for, [D21](../architecture/traceability-map.md#entries)), **See it on a card** with **Word** or **Sentence** on the subject's own term and no language dropdown, a card with the core and the same facet hint, and its facets, without what each applies to (until 0.13.1 shown, such as *Concepts shown in code*); it has no How it works. **Text** and **Context** have the header only (until 0.13.1 three facts, and Text an example note and Context its sample text under **For example**, [D21](../architecture/traceability-map.md#entries)).
- **A facet page** has a header (*Facet · German*, its mark and name, one sentence), **Applies to** (only what it applies to, such as *Nouns*) and **Describes** (what it is written from, such as the German noun in the core's first meaning, or the key itself when it is German); **Samples** with the module page's controls, showing for an input it applies to the key, then the card the sample sits on: the core and the card's other facets dimmed, in the module's order, and the facet highlighted in full; for an input it does not apply to, "Left out" with the reason. The card is the facet's own sample's when it has one (Conjugation's core is *sprechen*), otherwise its module's; a facet with two word samples names its tabs by their role, Declension's **Noun**, **Adjective** and **Sentence**. Every facet page has at least one sample in every interface language. Until 0.13.1 a separate **Where it sits** followed the samples, and a flow from the key to the core stood above the card ([D21](../architecture/traceability-map.md#entries)). Then the module's facets, the current one marked.
- **Core, not grammar word.** The pages call what the facets are written from the **core**; *grammar word* ([catalog](#catalog)) is not shown.

**Samples.** The Languages modules share one sample set: the word *language* and the sentence *Languages are the bridges connecting people and the world.*, in each interface language, as each module writes them; the set grows with the interface languages ([K64](../architecture/traceability-map.md#clarifications)). A facet that never applies to a noun has its own word beside *language* in the same languages: Conjugation *speak*, Comparison *clear*, Case *between* ([K65](../architecture/traceability-map.md#clarifications)). Synonyms and Antonyms, which *language* has none of, use *good* (*gut*), and Declension has *good* as an adjective beside the noun *language* ([D21](../architecture/traceability-map.md#entries)). The Expertise modules use a term of their own subject, written in the interface language: Mathematics *quadratic equation* (一元二次方程 in Chinese) and the sentence *A quadratic equation has at most two real solutions.*; Computer Science *Hello, world*, kept in English in every language, and the sentence *Every programmer's first program prints “Hello, world”.* ([D21](../architecture/traceability-map.md#entries); until 0.13.1 *eigenvalue* and *Frontend* in English). Samples are generated once per interface language, reviewed and stored in the catalog, and regenerated only when a prompt change makes them stale; they are never generated when a page opens ([K63](../architecture/traceability-map.md#clarifications)). The deck-settings preview used the same samples in the interface language until 0.13.2, when it was removed ([C30](../architecture/traceability-map.md#conflicts), [D22](../architecture/traceability-map.md#entries)). The 幸福 sample used until 0.13.0 is retired.

The one-line descriptions in the module window and the facet window stay. The main key, which is not in the window, has no page, and the core has none of its own: its module's page explains it. The pages' text is written in English, the default interface language, and in each other interface language beside it; the sheet shows the one in the language preference ([D14](../architecture/traceability-map.md#entries); [K62](../architecture/traceability-map.md#clarifications)). Each lives in its family's, module's or facet's folder in the catalog ([generation architecture](../architecture/generation.md#module-catalog)).

## Writing in the interface language

The Expertise modules' output reads as written in the interface language, not translated into it ([D15](../architecture/traceability-map.md#entries)). The Languages modules, which write in their own language, and the Creative family, whose language requirements will differ, are not affected; a later family gets this only by its own decision ([K39](../architecture/traceability-map.md#clarifications)).

- **A writing guide per language.** Every interface language has a short writing guide for the Expertise family, written in English with short example phrases in that language. It covers five things: the register (a clear explanation for a learner, written as the language is natively written) and the stock phrases to avoid; how a technical term is written at first use, the established term with the English in brackets, keeping the English where no translation is current, so an invented term shows; what stays as it is (code, formulas and symbols, identifiers, commands and the selection); the language's punctuation and spacing; and the unit a length limit is counted in ([K41](../architecture/traceability-map.md#clarifications)). Every Expertise request carries the guide of the interface language; no module repeats it.
- **English prompts only.** The Expertise modules' prompts and the rules every request carries stay in English in every language; no module has a translated prompt. A translated prompt would need a new decision with evidence for its language.
- **Length.** A module states a length limit in a form that holds in every language: the guide restates it in the unit the language counts in, such as 50 words in English or French and about 80 characters in Chinese ([K40](../architecture/traceability-map.md#clarifications)).
- **Review per language.** Expertise generation in a language is checked before that language is offered: each Expertise module's golden set runs in it and is read by a reviewer separate from the drafter, for facts, invented terms and the guide's conventions ([K42](../architecture/traceability-map.md#clarifications)). The six languages offered since 0.9.0 are reviewed in the release that adds the guides and keep following the preference meanwhile; a language added later is offered only once its strings, its guide and its Expertise generation have passed review ([shared UI](shared-ui.md#interface-language)).
- **Before the guides are built**, a short run of Computer Science in Chinese and French compares a guide written in English with one written in the language; the English guide is adopted unless clearly worse, and otherwise the owner decides ([K43](../architecture/traceability-map.md#clarifications); [prompt test](../history/evidence/writing-guide-prompt-test.md)).

## Staying with the subject

An Expertise module explains a key as its subject understands it and says so plainly when the key is outside it ([D16](../architecture/traceability-map.md#entries); [ranking](../history/evidence/expertise-insight-ranking.md)). Its core takes one of three cases, which the model decides from the key, the Context and the neighbouring fields its prompt names ([K44](../architecture/traceability-map.md#clarifications)). Since D17 the core records the case as its first field, `relevance` (`subject`, `neighbouring` or `unrelated`), in the same request that writes it; no separate classification request is added ([D17](../architecture/traceability-map.md#entries); [experiment](../history/evidence/generation-rounds-experiment.md)). `relevance` is not shown on the card, whose text already says when a key is outside the subject.

- **A key of the subject** is explained as before: what it means, why it matters, and an example. A term the subject itself defines and uses is the subject's own, even when another field uses it too (Big O notation in Mathematics).
- **A neighbouring technical term**, a term of one of the module's neighbouring fields (multi-core or cache in Mathematics), is named as not a concept of the subject and explained in one paragraph within the module's length, plainly and as that field uses it, with no remark on how it relates to the subject ([K46](../architecture/traceability-map.md#clarifications)).
- **An unrelated key**, with no meaning in the subject or a neighbouring field, a term of any other field such as chemistry, biology or medicine included (retinol, or 幸福 in Computer Science), gets one honest sentence saying so, such as "Retinol is not a mathematics concept.", written naturally in the interface language with the key spelled as given; the key is not translated, glossed or explained, and the fields are not named. An established term of the subject built on the word or its English translation may follow in at most one more sentence (happy numbers for 幸福 in Mathematics). The card is shown like any core, not hidden or left empty, so the user sees that the module ran ([K45](../architecture/traceability-map.md#clarifications)).

In every case:

- **No forced angles.** No answer builds a connection the subject does not routinely make: no formula, law or model of the subject is applied to a term of another field unless the subject's textbooks routinely apply it.
- **Context and everyday meanings.** The core never restates or explains the Context ([input and applicability](#input-and-applicability)); a Context that uses the key in the subject's sense is not mentioned at all, and one that uses it in an outside sense is pointed at only by the opening sentence that names that sense ("Here ring means a piece of jewellery."). An everyday meaning is any sense outside the subject, a computing sense in Mathematics included; the core names one only when a supplied Context uses it, in one opening sentence followed by the subject's meaning. Without such a Context it explains only the subject's meaning, and a term's etymology only when the subject's textbooks give it ([K47](../architecture/traceability-map.md#clarifications)).
- **Verification.** The Computer Science and Mathematics golden sets cover the three cases, including retinol, multi-core and cache in Mathematics, run in every interface language and are read by separate reviewers ([K42](../architecture/traceability-map.md#clarifications)); the owner ranks the cards this changes, blind, against the earlier output, on a page of at most eight cards ([K48](../architecture/traceability-map.md#clarifications)). From D17 the golden sets also check each key's `relevance`, and the owner reviews representative changed cards side by side with the earlier output instead of a blind ranking ([K50](../architecture/traceability-map.md#clarifications)).

## Input and applicability

Modules receive the page's main key and, when present, its saved Context ([content module contract](#content-module-contract)). The Context only helps decide which meaning the main key has; modules never explain it.

Each content module decides for itself how to read the main key, in the same request that writes its card ([D17](../architecture/traceability-map.md#entries)). Until 0.12.0 one **interpretation** per run decided whether the main key is a word or phrase, or a sentence, shared by every attempt in the run and shown under the main key ([D08](../architecture/traceability-map.md#entries)); D17 removed it ([C26](../architecture/traceability-map.md#conflicts)).

The decisions are the core's **flags**: structured fields the core writes first, before its text, so the facets in the same response follow them. Each module declares its flags in the catalog with their values and whether the card's header shows them, and each must change something: whether a facet applies, how the core is written, or what the header states. No flag is editable; to change one, the user edits the main key and retries.

| Module | Flag | Values | Drives | Shown |
| --- | --- | --- | --- | --- |
| German, Chinese | `kind` | `word`, `sentence` | Which facets apply: Article, Synonyms, Antonyms and the German grammar facets for a word only; Examples and Pinyin for both | Core header |
| German, Chinese | `language` | the key's language, named in the parent's language (*Englisch*, 英语) | The header; the language Examples translate into | Core header |
| German | `gramRole` | an open label for the grammar word: noun, verb, adjective, adverb, preposition, … ; a word only | Article and Declension for a noun; Conjugation for a verb; Declension and Comparison for an adjective; Case for a preposition | Core header |
| Computer Science, Mathematics | `relevance` | `subject`, `neighbouring`, `unrelated` | How the core is written ([staying with the subject](#staying-with-the-subject)); Formula and Code example only for `subject` | No |
| Mathematics | `hasFormula` | yes or no, only when `relevance` is `subject` | Whether Formula applies | No |
| Computer Science | `hasCode` | yes or no, only when `relevance` is `subject` | Whether Python applies | No |
| Pronunciation | `language` | the main key's ISO 639-1 code, from the languages the pinned speech model speaks, or `other` | The language the key is spoken in; `other` starts no audio ([D24](../architecture/traceability-map.md#entries)) | Core header, named in the interface language (*German*, *Deutsch*, *德语*) |

`kind` and `language` describe the key, not a source language chosen for the page: the language of a key is often ambiguous, and each parent reads it from the key and Context, so two parents may read an ambiguous key differently, and two cards on a page may differ in `kind`. A flag does not promise persistent meaning or referent resolution. Chinese has no `gramRole`, because no Chinese facet depends on it. Pronunciation's `language` is a code rather than a name, since it is passed to the speech provider; it is read from the key's spelling, words and script, and from the Context when the spelling fits more than one language (*Gift*, *Chef*).

Applicability is judged per facet. A parent's core always applies. A facet that does not apply, such as Article for a verb or Synonyms for a sentence, contributes nothing and is not shown; this is not a failure. A facet the card has but its flags rule out keeps its dimmed heading with no note, and its **Retry** on its heading stays in place but is unavailable (until 0.13.2 also the one on its tag): the server starts no attempt for it, which before made a Retry flash or do nothing visible (owner, 28 October 2026). This holds for every facet of every module ([D18](../architecture/traceability-map.md#entries); in 0.12.0 the heading showed a short note of why and the Retry was hidden). After generation the server checks each facet against the core's flags and drops one that contradicts them, keeping the rest of the card, and records the mismatch in diagnostics without the generated text ([K53](../architecture/traceability-map.md#clarifications)). Failure to produce required content must not be disguised as inapplicability.

## Content module contract

[Pages and editing](pages-and-editing.md) owns the main key and Context; [Select and Add](capture-and-generation.md) owns attempt states, failure, and retry.

- **Input:** the page's current main key and its saved Context when present. These are a content module's only text inputs, whether capture or manual entry supplied them. The parent type and the instance's facets are the instructions governing the contribution.
- **One request:** a module's attempt is one text request that returns the core with its flags and every facet asked for. No request spans two modules, and none is shared by all of them; a module adds a request before its text request only when the answer must change the request itself, such as choosing another provider or model, and none does ([D17](../architecture/traceability-map.md#entries)). One request's output stays well within the provider's timeout; a prompt change that widens it is measured against the golden sets first ([K57](../architecture/traceability-map.md#clarifications)).
- **Unique:** generated content belongs to its page and run. It is not cached or reused across pages, users or runs, and Retry always generates anew (D17). This holds for audio too: the same text on two pages is spoken twice ([D24](../architecture/traceability-map.md#entries)).
- **Audio:** a spoken part, the Pronunciation core or a Pronunciation facet, starts its audio once its text request has saved the text to speak; the audio is not a request before the text, so the one-request rule stands ([audio](#audio)).
- **Output:** the block content of the instance's own component on that page: the core, then each applicable facet in the parent's order. An instance never changes an input module's component or another instance's component. Parents produce JSON, stored as markdown per facet in one typed block ([render contracts](#render-contracts); D09).
- **Applicability:** the core always applies; an inapplicable facet is left out ([input and applicability](#input-and-applicability)). A facet the provider leaves out, or returns empty, counts as an omitted facet; anything else outside the parent's shape fails the attempt.
- **Editing:** editing the main key or the Context does not run modules or change saved output. Existing output reflects the main key and Context used in its attempt and may differ from the current values after an edit. The user may edit a generated component; the next retry of that component replaces the edit after confirmation.

## Render contracts

Since 0.7.4 the provider returns a parent's content as JSON, and the app keeps it as **markdown per facet** ([D09](../architecture/traceability-map.md#entries), amended; [C21](../architecture/traceability-map.md#conflicts)). Generation validates the JSON strictly against the parent's shape, then formats it into markdown as the card looks, and the component stores one typed block in its block document ([Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13)): the core's top line, the core's markdown, and one markdown text per facet with content.

**The provider's JSON**, complete for every result:

- **Core, Languages:** one shape for a word and a sentence (D17): `kind` first, the key's `language`, the `key`, an optional `romanization`, for German a word's `gramRole`, and `meanings`, a list in the parent's language with at least one item; a sentence's holds one item, its translation or explanation.
- **Core, Expertise:** `relevance` first (D17), the key and an explanation. The explanation is a list of one to three paragraphs, one string each, so no line break has to travel inside a JSON string (fixed with the golden sets, 0.8.0). Its top line shows the key only.
- **Article:** `{ singular, plural }`, the plural optional, such as `das Ufer` and `die Ufer`.
- **Examples:** a list of `{ sentence, translation }`, the translation optional, not tied to meanings.
- **Synonyms**, **Antonyms:** lists of words.
- **Pinyin:** a list of `{ text, pinyin }`, one per meaning for a word and one for a sentence.
- **Conjugation**, **Declension:** a table, `{ columns, rows }`, each row `{ label, cells }` (D17).
- **Comparison:** `{ positive, comparative, superlative }` (D17).
- **Case:** a list of `{ case, use, example }` (D17).
- **Formula:** `{ latex, symbols }`, the formula in LaTeX and a list of `{ symbol, meaning }`, each symbol in LaTeX (D17). The flags are named `hasFormula` and `hasCode`, so they do not share a name with their facets.
- **Python:** `{ language, code }`, `language` always `python`, the code commented (D17, [D21](../architecture/traceability-map.md#entries)).
- **Core, Pronunciation:** `{ language, key }`, `language` first ([D24](../architecture/traceability-map.md#entries)); the key is echoed for the top line, as every core's is, but what is spoken is the page's saved main key, never the key as the model wrote it.
- **Pronunciation (facet):** a list of lines to speak, one string each.

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
| Conjugation, Declension | a markdown table, the row labels in its first column |
| Comparison | one line, `gut · besser · am besten` |
| Case | a bulleted list, each item the case with its use and example |
| Formula | the formula as display math, then the symbols as a bulleted list |
| Python | a fenced Python code block |
| Core, Pronunciation | none; the card shows its top line and the player |
| Pronunciation (facet) | a line each, the text to speak |

The core's **top line** stays structured: shown as a heading and never edited. A Languages top line shows the key's language, the key and its romanization, and since D17 also word or sentence and, on a German word, its `gramRole`; a sentence's core gets the same top line as a word's. Its labels are written in the module's language, like the rest of the card (*Englisch · run · Wort · Verb*; *英语 · run · 词语*), never in the interface language: the model returns the flag's value and the catalog names it, and a `gramRole` outside the catalog's list is shown as the model wrote it ([K51](../architecture/traceability-map.md#clarifications)). An Expertise top line shows the key only. The supported markdown is bold, italic, bulleted and numbered lists, inline code and highlight (`==text==`), and since 0.7.5 a text size and a font on a stretch of text, written as a bracketed span, `[text]{size=small}`, `[text]{size=large font=display}` (sizes `small` and `large`, fonts `display` and `mono`; normal size and the text font need no span), and since the third amendment a highlight colour, `[text]{highlight=green}` (`green`, `blue`, `pink`, `orange`; the default yellow is written `==text==`), and with D17 tables, display math in LaTeX (`$$…$$`, rendered with KaTeX; a formula that fails to render shows its source) and fenced code blocks with syntax highlighting, edited as their source text in a facet's own Edit ([K54](../architecture/traceability-map.md#clarifications)); anything else is shown as typed. The default highlight is the same yellow as the main key's emphasis. Since the fourth amendment the main key's emphasis is itself a stored highlight: when generated content is formatted, each occurrence of the main key in the core and every facet is written as `==…==` (not inside code or an existing highlight); since D17 only a whole-word occurrence, so a key does not light up inside a longer word (*in* inside *einer*), while a key in a script without spaces between words, such as Chinese, is marked wherever it occurs, and a table is highlighted cell by cell, and the card draws no emphasis of its own, so the editor shows the same highlights and the user can remove or add them. Since 0.7.5 the markdown is internal to storage: the editor never shows it, and characters the user types are stored escaped, so they show as typed ([D10](../architecture/traceability-map.md#entries)). The card renders each facet's markdown inside that facet's fixed container, under its label, in the parent's order, and emphasises the main key in it. A facet whose markdown is empty has no content: its container is not shown and its [tag](pages-and-editing.md#facet-tags) is blander. A core whose markdown is empty shows only its top line. Rendering is a pure function of the stored content, shared by every client. With D17 a formula is rendered by KaTeX, which may produce HTML; the rule that rendering never produces HTML ([Q59](../architecture/questionnaire/answers/answers-11-security-privacy.md#q59), a questionnaire answer the owner treats as historical) no longer applies (owner, 28 October 2026). The iteration plan fixes each parent's JSON shape with its golden set ([C8](../architecture/traceability-map.md#conflicts)); from 0.8.0 each shape is defined once, in its facet's folder in the catalog ([D11](../architecture/traceability-map.md#entries)). Each future module's specification states its shape, its formatting and its containers under *Output and presentation*.

A Pronunciation top line shows the key's language, named in the interface language, and the key (*German · Gift*); for `other` it shows the key alone.

## Audio

From 0.14.0 ([D24](../architecture/traceability-map.md#entries)) audio is the first output that is not markdown, and the first **heavy facet** of [D17's direction](../architecture/d17-one-request.md#heavy-facets-direction).

- **What is spoken.** The Pronunciation core speaks the page's main key in its `language`; a Pronunciation facet speaks each of its lines in its parent's language, German or Chinese. The text stays markdown as every facet's does; the audio is attached to the component beside it, one **clip** per spoken line ([C33](../architecture/traceability-map.md#conflicts)).
- **Where it comes from.** A speech provider, ElevenLabs, with one pinned speech model, Eleven v4 Turbo, beside the one pinned text model ([C32](../architecture/traceability-map.md#conflicts); [generation architecture](../architecture/generation.md#providers)). Changing the model or a voice needs the owner's listening review.
- **When.** A clip is generated once its text is saved, in parallel with the card's other clips; the card shows its text first, and each clip fills in when it is ready. A clip succeeds or fails on its own, with its own **Retry**, and the text around it stays ([C31](../architecture/traceability-map.md#conflicts); [capture and generation](capture-and-generation.md#audio)).
- **Not spoken.** Pronunciation with `language` `other`, or a language the pinned model does not speak, and a main key over 500 characters start no audio; the card says why and offers **Retry**. These are not failures.
- **Format.** MP3 at 44.1 kHz and 128 kbit/s, played on the card ([pages and editing](pages-and-editing.md#spoken-parts)); 0.14.0 offers no download or export.
- **Editing.** Spoken lines are shown but not editable in 0.14.0, because an edited line would no longer match its audio.

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
