# D17: one text request per module

Accepted by the owner in chat on 28 October 2026. The detail of the [traceability map](traceability-map.md#entries)'s D17 entry; its clarifications and conflicts are also listed in the map ([conflicts](traceability-map.md#conflicts), [clarifications](traceability-map.md#clarifications)). Evidence: the [generation rounds experiment](../history/evidence/generation-rounds-experiment.md).

## Decision

**Each content module writes its card in one text request, and no request is shared by all modules.** Today every run starts with one shared request that classifies the main key as a word or phrase, or a sentence ([D08](traceability-map.md#entries)), and every content module receives it. That request is removed.

- **One request per module.** It returns the core, the core's **flags** (the decisions that steer the card) and every text facet of the parent. The flags come first in the core, so the model decides before it writes, and the facets in the same response follow them.
- **Modules are independent.** No request spans two modules, and one module's failure does not fail another.
- **No first round.** A module adds a request before its text request only when the answer must change the request itself, such as choosing another provider or model. No module needs one in D17: the [experiment](../history/evidence/generation-rounds-experiment.md) found a separate relevance gate and a separate core round no better than one request, and the core round slower.
- **Heavy facets later.** Audio, images and other modalities will run as their own jobs after the text, in parallel ([direction](#heavy-facets-direction)); D17 builds none.
- **Every generation is unique.** Generated content belongs to its page and run. It is not cached or reused across pages, users or runs; Retry always generates anew.

**Per family:**

- **Languages (German, Chinese).** One merged prompt for a word or a sentence. The core is the same shape for both: `kind` (word or sentence), `language` (the key's language, as today), `key`, `romanization` when useful, and `meanings`; for a sentence, `meanings` holds one item, its translation, or for a sentence already in the parent's language an explanation of its meaning, including its figurative meaning when it is idiomatic. **German only** adds `gramRole` for a word, because only German has facets that depend on it. `gramRole` and the German grammar facets describe one **grammar word**: the key when it is German, otherwise the German word for its first meaning; it never narrows the meanings or the other facets. Chinese has no `gramRole`.
- **Expertise (Computer Science, Mathematics).** One prompt whose core starts with `relevance`: D16's three cases, **subject**, **neighbouring** or **unrelated**, each written as D16 defines. Expertise no longer uses word-or-sentence: one core shape, a top line with only the key.
- **Notes and input modules.** Main key, Context and Text are not generated. The main key and the Context stay the only text inputs to every request.

**Facets apply by their own prompts.** A facet's prompt states when it applies in terms of the core's flags ("only when gramRole is noun"), and is left out otherwise, as Article already is. After generation the server checks each facet against the flags, drops one that contradicts them and records the mismatch (K53).

**New facets** ([below](#new-facets)): Conjugation, Declension, Comparison and Case for German, decided by `gramRole`; Formula for Mathematics and Code example for Computer Science, only for keys in the subject.

**A fresh start.** The upgrade discards every deck and page, with their components, generation runs and attempts, because the earlier data was for testing and development (owner, 28 October 2026), as 0.4.0, 0.5.0, 0.7.0 and 0.7.4 did ([scope](../product/scope.md#upgrade-from-earlier-builds)). Accounts, sign-in and the account's language preference stay, and the account starts again with one My Deck holding the main key, Context, and `German` with Article, Examples, Synonyms and Antonyms. No stored component needs to read in the old run-level shape afterwards.

**Unchanged:** D16's three cases and what each writes; the writing guides ([D15](traceability-map.md#entries)); the composer's shared rules; D08's parent model (one component, Retry regenerates the whole parent, a facet's own Retry only that facet).

**Out of scope:** subfields (dropped by the owner, 27 October 2026), graphs and any heavy facet, each a later decision.

### Core header

- **Where it shows.** The label under the main key title is removed. Each Languages card's header shows word or sentence beside the key's language and the key with its romanization, and on a German word its `gramRole`; a sentence's core gets the same header as a word's. The labels are written in the module's language, like the rest of the card (*Englisch · run · Wort · Verb* on German, *英语 · run · 词语* on Chinese), not in the interface language.
- **Not editable.** Like the language and the key, the labels are generated and cannot be edited. To change them, the user edits the main key and retries, as D08 already says.
- **Why per card.** Each card decides its labels in its own request, so two cards can differ, and one page-level label would be wrong for one of them.
- **Main key title.** Its size tier comes from the key's length alone (K52).

### Heavy facets (direction)

Recorded so later decisions build on it; D17 builds none of it.

- A heavy facet is its own job with its own provider, loading and failure state, Retry, queue and limits.
- It starts once the text it needs exists; a card's heavy facets run in parallel, so a new modality adds a branch, not a round.
- The card shows its text first and fills heavy facets as they finish. This relaxes D08's "no partial success within a component" for heavy facets only, and needs its own decision with new output types (K29).
- Unique generation applies: heavy output is not cached.

## Flags per module

Every flag is part of the module's core, declared in the catalog with its values and whether the header shows it. Each must change something: whether a facet applies, how the core is written, or what the header states. No flag is editable.

| Module | Flag | Values | Drives | Shown |
| --- | --- | --- | --- | --- |
| German, Chinese | `kind` | `word`, `sentence` | Article, Synonyms, Antonyms and the grammar facets for a word only; Examples and Pinyin for both | Core header |
| German, Chinese | `language` | the key's language, named in the parent's language (*Englisch*, 英语); today's word core already returns it, now a sentence's too | The header; the language Examples translate into | Core header |
| German | `gramRole` | open label (noun, verb, adjective, adverb, preposition, …); word only | Article and Declension for a noun; Conjugation for a verb; Declension and Comparison for an adjective; Case for a preposition | Core header |
| Computer Science, Mathematics | `relevance` | `subject`, `neighbouring`, `unrelated` | How the core is written; Formula and Code example only for `subject` | No |
| Mathematics | `formula` | yes / no, only when `relevance` is `subject` | Whether Formula applies | No |
| Computer Science | `code` | yes / no, only when `relevance` is `subject` | Whether Code example applies | No |

`relevance` is not shown: the card's own text already says when a key is outside the subject (D16's honest line).

## New facets

Each is a facet of its parent like the existing ones: added on a page or in deck settings, chosen in the facet window, generated in the parent's one request, shown only when it applies, with an explanation in every interface language ([D13](traceability-map.md#entries)).

| Parent | Facet | Tag | Applies when | Content |
| --- | --- | --- | --- | --- |
| German | Conjugation | Co | `gramRole` is verb | From the infinitive: present, simple past and perfect (with *haben* or *sein*) in six persons; separable and reflexive forms as the verb has them |
| German | Declension | De | `gramRole` is noun or adjective | A noun: four cases, singular and plural, with the article. An adjective: strong, weak and mixed, four cases by gender and plural |
| German | Comparison | Cm | `gramRole` is an adjective that can be compared | Positive, comparative, superlative (*gut, besser, am besten*); left out for one without (*tot*) |
| German | Case | Ca | `gramRole` is preposition | The case or cases it governs, each with a short example |
| Mathematics | Formula | Fo | `relevance` is `subject` and the concept's standard definition includes a formula | The defining formula, each symbol named in the interface language |
| Computer Science | Code example | Cd | `relevance` is `subject` and the concept is usually shown in code | One short, commented code example |

The German facets describe the grammar word, as Article does. Formula and Code example never apply to a neighbouring or unrelated key, so they cannot apply a subject's formula to another field's term (D16's no forced angles), and they are never constructed for a concept that has none.

**Rendering.** Tables are markdown tables; formulas are LaTeX rendered with KaTeX; code examples are fenced, highlighted code blocks (K54).

## Why

- The shared word-or-sentence request runs for every page, including pages without a Languages module, and holds every attempt until it returns. The core can return the same answer: in the experiment the merged prompt matched today's classification on all 24 keys in both Languages modules.
- Providers limit requests per minute. One request per card is half the requests of a page with one Languages module today.
- A request that decides and writes needs no gate: for Expertise, one request chose D16's case on all 39 golden keys exactly as a separate gate did, never wrote text that contradicted its case, and was faster.
- Splitting the core from the facets did not help: it was twice as slow and dropped six facets its own flags required.
- Labels describe a card, not the page, so they belong in the card's header.
- Heavy facets would slow every card if they shared the text request; separate, parallel jobs keep text fast.

## Relation to D08 and D16

**D08** decided that one interpretation per run, shown under the main key and not correctable, chooses each parent's core and facets. D17 removes it: each Languages core decides word or sentence in its own request and shows it in its header, still not correctable (C26). D08's parent model stays.

**D16** keeps one request per module, and D17 keeps that too: the Expertise core now records its case as `relevance`, but nothing is added before it. The D16 ranking rejected a control flow that serves subject angles, with "a formula only when the concept has one" as its example; D17's Formula facet is a separate, opt-in facet for keys in the subject that leaves the core as D16 defines it (C27).

## Affected documents

| Document | Change |
| --- | --- |
| [modules](../specs/modules.md#input-and-applicability) | The run's interpretation is removed; one request per module; flags; the merged Languages core; facets apply by their own prompts; Expertise `relevance`; content module contract inputs; render contracts (Languages core header; Expertise core without word/sentence); unique generation |
| [modules: catalog](../specs/modules.md#catalog) | The six new facets, their tags, when they apply and their render contracts |
| [capture and generation](../specs/capture-and-generation.md#input-interpretation) | No run-level interpretation; a module's attempt is its one request; Retry generates anew |
| [pages and editing](../specs/pages-and-editing.md#required-main-key) | The label under the main key is removed; the title tier comes from length alone; the core header shows its labels, not editable |
| [shared UI](../specs/shared-ui.md) | Markdown tables, KaTeX formulas and highlighted code in a card |
| [generation architecture](generation.md) | Flag declarations; one Languages prompt instead of one per input type; one Expertise prompt with `relevance`; the facet check; prompt snapshots; catalog conformance test |
| [golden sets](../../tests/golden/) | Expected `kind`, `gramRole` and `relevance` per input; the new facets' cases (K55) |
| [scope](../product/scope.md#upgrade-from-earlier-builds) | The capability rows; the upgrade discards every deck and page and keeps accounts, sign-in and the language preference |
| [capture and generation](../specs/capture-and-generation.md#initial-default-deck-example) | The fresh My Deck after the upgrade (unchanged modules) |

## Implementation sketch (for sizing, not part of the decision)

- `packages/domain/src/catalog/define.ts`: flags declared on the core (values, `shown`); one core shape per module; facets' `applies` stated in terms of flags instead of `InputType`.
- `main-key/interpretation.prompt.md` is removed; `languages/*/facets/core/{word,sentence}.prompt.md` merge into the prompt [as tested](../history/evidence/generation-rounds-experiment.md); `expertise/*/facets/core/{word,sentence}.prompt.md` merge into one prompt with `relevance` first; facet prompts state when they apply.
- `src/server/generation.mjs`: `interpretation()` and the per-run sharing are removed; an attempt is its module's one request, then the facet check.
- Storage: `generation_runs.interpretation` is no longer written; the component's header already stores `kind`, and a German header gains `gramRole`; and the Expertise core stores `relevance`. `Page.interpretation` in the contract and the `Interpretation` label in `extension/page-view.tsx` are removed.
- `packages/domain/src/render.ts`: the Languages heading shows its labels for a word and a sentence.
- New facet folders under `languages/german/facets/` (conjugation, declension, comparison, case), `expertise/mathematics/facets/formula` and `expertise/computer-science/facets/code`, each with shape, formatter, prompt and explanations in six languages.
- The extension's markdown renderer gains tables (if not yet supported), KaTeX and code highlighting; the live editor keeps them editable.
- A reviewed migration (`0017`) discards decks, pages, components, generation runs and attempts, and drops `generation_runs.interpretation`; the account's first load creates the fresh My Deck. An upgrade test covers it, and the release notes give the backup step (`npm run db:backup`) before `npm run db:migrate`.
- The extension clears cached content, unsent captures and pending saves from earlier builds on its first start and keeps sign-in; the backend and extension upgrade together.

## Clarifications and conflicts

| ID | Question | Proposed default |
| --- | --- | --- |
| K49 | What does the upgrade keep? | Accounts, sign-in and the language preference. Every deck, page, component, run and attempt is discarded (owner, 28 October 2026); the account starts with a fresh My Deck. Pending saves from earlier builds fail as deleted, so they are finished or discarded before upgrading. |
| K50 | How is it verified? | Languages and Expertise golden sets in every interface language, with `kind`, `gramRole` and `relevance` checked as expectations and facet-check mismatches counted; the owner reviews representative changed cards against 0.11.0 side by side; a browser E2E test checks the core header labels and their absence under the main key. |
| K51 | Do the header labels show on every Languages card, and are they translated? Yes: word or sentence on every Languages card, and `gramRole` on a German word, written in the module's language like the rest of the card (*Wort*, *Satz*, *Verb* on German; *词语*, *句子* on Chinese), never in the interface language. The labels are fixed text per module and value, not generated: the model returns the value, the catalog names it (*verb* → *Verb*). A `gramRole` outside the catalog's list is shown as the model wrote it. |
| K52 | What sets the main key title's size tier without a page-level classification? | The key's length alone; the "a sentence may move up one tier" rule in [pages and editing](../specs/pages-and-editing.md#required-main-key) is dropped. |
| K53 | What does the facet check do when a facet contradicts the core's flags? | Drops the facet, keeps the rest of the card, and records the mismatch in diagnostics without the generated text. |
| K54 | How are tables, formulas and code shown and edited? | Rendered on the card and edited as their source text in a facet's own Edit; a formula that fails to render shows its LaTeX source. |
| K55 | How are the new facets verified? | Golden cases for error-prone forms: *sein*, *gehen*, *aufstehen*, *sich freuen* (Conjugation); *Junge*, *gut* (Declension, Comparison); *tot* (no Comparison); *in*, *wegen* (Case); a concept with and without a standard formula; a CS concept with and without code; in every interface language, reviewed by the owner with K50. |
| K56 | Are the new facets in the default deck? | No: users add them from the facet window. The default deck keeps German with its current four facets. |
| K57 | How long may one request's output grow? | Within the provider timeout with margin: the experiment's German card with eight facets took about 10 s against a 60 s limit. A prompt change that widens the output (such as asking for every meaning, which caused timeouts) is measured against the golden sets before it ships. |
| C26 | D08 has one interpretation per run, shown under the main key, that chooses each parent's core and facets; D17 lets each Languages core decide word or sentence and show it in its header. | D17 supersedes D08's interpretation. It stays not correctable, as in D08. |
| C27 | The D16 ranking found no support for a control flow that adds a formula when the concept has one; D17 adds a Formula facet decided by a flag. | The Formula facet is opt-in, applies only to keys in the subject, and leaves the core as D16 defines it; the owner's review (K55) decides whether it stays. |
