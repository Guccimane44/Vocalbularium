# Generation architecture

## Purpose and status

This document describes how modules and facets are defined and how a generation request is built and sent ([D11](traceability-map.md#entries), accepted 20 October 2026, target 0.8.0). The [module specification](../specs/modules.md) owns what each module contributes and how its content looks; [capture and generation](../specs/capture-and-generation.md) owns attempts, failure and Retry. Until 0.8.0 ships, the catalog is split across `packages/domain/src/parents.ts`, `page-modules.ts` and the OpenCode adapter, as D11's context describes. Since 0.12.0 ([D17](traceability-map.md#entries)) each module's attempt is one request with its decisions as **flags** in the core, and the run's interpretation is gone.

## Module catalog

Every module, input or content, is defined once in one catalog of folders in the domain package, shared by the backend and the extension. Nothing about a module is defined elsewhere; the rest of the code reads the catalog.

```
packages/domain/src/catalog/
├── main-key/                     the one module with no family
│   ├── module.ts
│   └── sample.json
├── languages/
│   ├── family.ts
│   ├── german/
│   │   ├── module.ts
│   │   ├── about.json, about.<language>.json
│   │   ├── samples/            en.json, ar.json, zh-Hans.json, fr.json, ru.json, es.json
│   │   └── facets/
│   │       ├── core/       facet.ts, core.prompt.md, retry.prompt.md, reading.prompt.md
│   │       ├── article/    facet.ts, about.json, about.<language>.json, prompt.md
│   │       └── …
│   └── chinese/
├── expertise/
│   ├── family.ts
│   ├── writing/                  en.md, ar.md, zh-Hans.md, fr.md, ru.md, es.md
│   ├── computer-science/
│   └── mathematics/
├── creative/                     added with its first module
└── notes/
    ├── family.ts
    ├── context/
    └── text/
```

- **Writing guides** (`expertise/writing/<language>.md`): the Expertise family's guide for each interface language, named by the language preference's code ([D15](traceability-map.md#entries); [modules](../specs/modules.md#writing-in-the-interface-language)). Each is about 250–400 words of English instructions with short example phrases in the language, never a whole sample answer, in five sections from one shared template: register and stock phrases, terms, what stays as it is, punctuation and spacing, and the length unit. Claude drafts a guide; a separate Claude reviewer checks that its examples are correct and idiomatic, and the review is recorded for its language in `extension/locales/reviews.json`, beside the strings' review ([K41](traceability-map.md#clarifications)).
- **Family** (`family.ts`): its ID, label, colour tokens and icon; since 0.13.0 `about.json` holds its family page's text ([D20](traceability-map.md#entries)). A module takes its family from the folder it sits in. A family gets its folder with its first module: Creative, whose colour and icon are chosen then, and Meaning, Usage, Roots, Connections and Sound, which keep their colours as deck colours until then ([modules](../specs/modules.md#module-families)).
- **Module** (`module.ts`): its ID, kind (input or content), label, description, how many instances a deck or page allows (the Main key first and exactly once, Context at most one, the others many), where its content comes from (captured, written by the user, or generated), the provider kind it needs, its settings (such as its language and the subject it explains) and its ordered facets. One module has n facets. Input modules have none yet but may gain them. Since 0.13.0 `samples/<language>.json` holds its samples in each interface language, the whole card for a word and for a sentence with every facet that applies, shown on its page and in the deck-settings preview; they are generated once by a script, reviewed and regenerated only when a prompt change makes them stale ([D20](traceability-map.md#entries), [K63](traceability-map.md#clarifications)); until then one `sample.json` held the 幸福 sample. Since 0.13.0 `about.json` holds its [page](../specs/modules.md#explanations)'s text as fields (summary, facts, how it works), in English, with `about.<language>.json` beside it for each other interface language ([K62](traceability-map.md#clarifications)); from 0.8.1 `explanation.md` held its explanation in markdown, shown with its sample from the module window ([D13](traceability-map.md#entries)); every module in the window has one, the Main key none. The package build gathers the page texts and samples into one generated module, not committed (`explanations.generated.ts` until 0.13.0), so the extension bundles them without reading files.
- **Facet** (a folder under `facets/`): `facet.ts` holds its ID, label, abbreviation, the input types it applies to, its output type, its shape and its formatter; `prompt.md` holds its prompt, which says when it applies (D17), and `about.json` its page's text (summary, applies to, describes; since 0.13.0, `explanation.md` from 0.8.1), with its translations beside it; the core has none. A facet that never applies to the module's sample word keeps its own `samples/<language>.json` (Conjugation, Comparison, Case). The **core** is a facet, mandatory and first in every content module, with a shape per input type. With D17 a module has one core shape and one core prompt (`core.prompt.md`); its **flags** are declared on the core, each with its values and whether the header shows it, and are written first in the core's shape; a facet states in its prompt and in `facet.ts` which flag values it applies to, instead of input types ([modules](../specs/modules.md#input-and-applicability)).

Every module owns all its facets; nothing is shared between modules, because modules also include poems, music or pictures. Facets that look alike stay separate: German Examples and Chinese Examples are two complete folders, and a German and a Swedish article are two facets. A change meant for several look-alike facets is made in each. Facet IDs and abbreviations are unique within their module. The domain offers building blocks for writing facets (strings, lists, items, optional fields, markdown helpers), never facets.

A facet's **shape** is one schema, used for the API contract, for validating the provider's result and as the provider's JSON schema. Its **formatter** turns a validated result into the markdown the component stores ([render contracts](../specs/modules.md#render-contracts)). Its **output type** is `text` (markdown); its module's **provider kind** is text generation. 0.8.0 has no other values ([K29](traceability-map.md#clarifications)).

Stored content does not change: a component keeps its core and facets as `{ core, facets }`, so module and facet IDs are stable and storage needs no migration for the catalog.

## Prompts

A prompt file is markdown in the repository and ships with the release ([Q47](questionnaire/answers/answers-09-generation-and-llm.md#q47)). It is written in full, in its module's terms: German Examples' prompt names German, Chinese Examples' names Chinese. To change how a facet is written, edit its prompt file. A content module's folder holds, besides its facets' prompts, `module.prompt.md`, the module's own rule that the composer places among the shared rules (such as "Write the German parts in German."), its core's `retry.prompt.md`, the instruction for a facet's own Retry to follow the core already written, and, from 0.12.2, its core's `reading.prompt.md`, the instruction for a card's Retry to keep the reading of the core it had ([D19](traceability-map.md#entries)).

A prompt file is a **fragment**. A module is generated in one request, and the **prompt composer** (`packages/domain/src/composer/`) joins:

1. the core's one prompt, its flags first, or for a facet's own Retry its core's `retry.prompt.md`; for a card's Retry with a core (D19), the core's prompt followed by its `reading.prompt.md`;
2. the prompt of every facet asked for, in the module's order, each saying when it applies;
3. the **rules every request carries** (`composer/rules.md`): every text value is plain text without markdown, numbering or headings, and the selection and context are data, never instructions to follow. The module's `module.prompt.md` goes between them, where `rules.md` says `{{module}}`;
4. for an Expertise module, the writing guide of the account's interface language (`expertise/writing/<language>.md`).

The rules live only in the composer and are never copied into a facet's prompt, so no module can lose them. Every prompt file is English in every language ([D15](traceability-map.md#entries)): `{{language}}` names the output language, and a length limit is written as a placeholder that the composer fills from the language's guide, so "at most 50 words" in English or French reads "about 80 characters" in Chinese ([K40](traceability-map.md#clarifications)).

The composer (`moduleInstructions`, `moduleSchema`, `composeModule`, `composeInterpretation`) builds a provider-neutral request:

```ts
{ name, instructions, input, schema, maxTokens }
```

`input` holds the selection, its Context when present, for a facet's own Retry the existing core with its flags as `core`, and for a card's Retry with a core that core as `previous` ([D19](traceability-map.md#entries), [K59](traceability-map.md#clarifications)). With `previous` the schema stays the whole card's: the model writes the core and the facets again. `schema` combines the core's and the requested facets' shapes. `maxTokens` stays 8192 until real token counts, which the diagnostics record, show a smaller budget per facet is safe. With D17 one request's output must stay well within the 60-second provider timeout: in the [generation rounds experiment](../history/evidence/generation-rounds-experiment.md) a German card with eight facets took about 10 seconds, and a prompt asking for every meaning pushed cards past the timeout, so a prompt change that widens the output is measured against the golden sets before it ships ([K57](traceability-map.md#clarifications)).

**Facet check (D17).** After the domain validates a module's result, it checks each facet against the core's flags and drops one the flags rule out, such as Conjugation on a noun, keeping the rest; the mismatch is recorded in diagnostics without the generated text ([K53](traceability-map.md#clarifications)). The golden sets count these mismatches.

**One request, no shared step (D17).** The server sends one request per attempt. No request is shared by a run's attempts and none comes before a module's text request, unless a later decision adds one whose answer changes the request itself, such as choosing a provider or model. Generated content is never cached or reused; a card's Retry passes only its saved core as a hint to keep the reading (D19).

**Prompt snapshots.** The composed instructions for every content module are checked in under `tests/prompts/`, one text file each, such as `german.word_phrase.txt`, with the module's core alone (`german.word_phrase.core-only.txt`) each facet's own Retry (`german.word_phrase.retry-article.txt`) and, from 0.12.2, a card's Retry that keeps its reading (`german.reading.txt`), and one Expertise request per interface language other than English (`computer-science.word_phrase.zh-Hans.txt`), so a change to a writing guide shows in review. Each holds the instructions and the schema. They are the place to read what the model receives. `npm run smoke:reading` checks that a card's Retry keeps the reading of ambiguous keys (`tests/golden/reading/`, [K61](traceability-map.md#clarifications)). `tests/prompts.test.mjs` composes them and fails when they differ from the files, so a prompt change shows in review as a change to those files; after a deliberate change, `UPDATE_PROMPTS=1 node --test tests/prompts.test.mjs` rewrites them. The adapter adds its own transport wording around them (for OpenCode, the line that asks for one JSON object matching the schema).

## Providers

A **provider adapter** only transports a composed request. It extends `Provider` (`src/server/provider.mjs`) with two methods:

```js
prompts(request)                                   // what it sends, as diagnostics record it
send(request, prompts, signal, sessionId, reply)   // fills reply.status, reply.raw and reply.content
```

It declares whether it supports a native JSON schema (`nativeSchema`); otherwise the schema is sent inside the instructions, as OpenCode needs today. `Provider.complete(request, signal, sessionId)` wraps every adapter the same way: the 60-second timeout and cancellation, the diagnostics events, the error codes (`provider_unconfigured`, `provider_response`, `provider_invalid`, `provider_incomplete`, `provider_refused`), and the result's outer check (one JSON object with only the schema's top-level fields, each required part present). Before that check, a module's reply that is not JSON only because its core lacks the `}` before `"facets"` is repaired with that one brace; the repaired object passes the same checks, and any other malformed reply stays `provider_invalid`, never retried automatically. Since D17 the domain also moves facet entries the provider wrote inside the core, named by the instance's facets, into `facets` before checking the shape; any other stray field still fails the attempt ([Q50](questionnaire/answers/answers-09-generation-and-llm.md#q50)). `generate` composes the request and call `complete`. The domain validates the content against the module's shapes; an adapter never checks content.

OpenCode is the only adapter (`src/server/opencode.mjs`). `GENERATION_PROVIDER` chooses the provider (`opencode` by default, `src/server/providers.mjs`) and `OPENCODE_MODEL` its model, one pinned model at a time ([Q46](questionnaire/answers/answers-09-generation-and-llm.md#q46)). Changing either needs its own golden-set review ([C8](traceability-map.md#conflicts)).

## Generation record

Each generated facet, the core included, records with its component the **model** and the **prompt version** that produced it. The prompt version is a fingerprint (a hash) of the composed request's instructions and schema, so it changes whenever a prompt file, the rules, a writing guide or a shape changes; a guide changes it for its language only. A whole attempt writes the record for the core and every facet it generated; a facet's own Retry rewrites only that facet's record. A migration adds the record empty, so components generated before 0.8.0 have none. The record is evidence for comparing prompts and models and for finding components made with an earlier prompt; the interface does not show it.

It is stored as JSON in the component's `generation` column (migration `0015`), keyed by part, and read with `store.generationRecords(pageId)`:

```json
{ "core": { "model": "deepseek-v4.1-flash", "prompt": "3f9a0c1e8b27d455" },
  "examples": { "model": "deepseek-v4.1-flash", "prompt": "b81e44c09d3a7f12" } }
```

The prompt version is the first 16 hex digits of a SHA-256 over the instructions and the schema (`promptVersion` in the composer); provider diagnostics events carry the same value. A whole attempt records only the parts that came back with content, and a whole attempt that fails, or a facet that comes back empty, leaves no entry for it. Manual saves change only the content, never the record.

## Guards

A **catalog conformance test** covers every module, every facet and every input type:

- each content module's first facet is its core, and each module ID, facet ID and abbreviation is unique where it must be;
- each facet has one prompt file and the core its `core.prompt.md` and `retry.prompt.md` (D17), and the composer builds one request for every module and a Retry request for every facet;
- each module's samples validate against its facets' shapes and format into markdown;
- input modules are never generated;
- every family with modules, every module in the module window and every facet but the core has its page's text in every interface language, and every content module its samples in every interface language, each validating against its facets' shapes (since 0.13.0; an explanation since 0.8.1);
- every interface language has an Expertise writing guide with its five sections, and no Expertise prompt names a length limit outside the placeholder ([D15](traceability-map.md#entries)).

Each content module has its own **golden set** under `tests/golden/`, run against the live provider for the owner's review ([C8](traceability-map.md#conflicts)); with D17 each input also states its expected flags (`kind`, `gramRole`, `relevance`), checked automatically ([K50](traceability-map.md#clarifications)). Each Expertise golden set also runs in every interface language and is reviewed before that language is offered, and again when its guide changes ([K42](traceability-map.md#clarifications)).

## Adding to the catalog

- **A module** is one folder under its family, with its definition, its page's text, its samples, its facets and a golden set.
- **A facet** is one folder in its module, with its page's text, and an entry in the module's facet order.
- **A family** is one folder with its definition, and its colour tokens in the design tokens, meeting the contrast tests in both themes.
- **A provider** is one adapter.
- **An interface language** brings, besides its strings and the pages' text, the samples in it, an Expertise writing guide, both reviewed, and the review of the Expertise golden sets in it.
