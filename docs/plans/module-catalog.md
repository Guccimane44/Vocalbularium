# Plan: one module catalog, a prompt composer and Expertise modules (0.8.0)

Proposed: 20 October 2026 (Europe/Berlin). Implements [D11](../architecture/traceability-map.md#entries), accepted by the owner on 20 October 2026 and applied to the specifications in [#191](https://github.com/Guccimane44/Vocalbularium/pull/191). Tracker: [#193](https://github.com/Guccimane44/Vocalbularium/issues/193); milestone in [Actual Stages](https://app.notion.com/p/3ffbb13502088113900edd1bc9795ce7). Architecture: [generation](../architecture/generation.md). Status: proposed; no increment started.

## Outcome

Every module is defined once, in one catalog of family and module folders, and each module owns its facets: their shapes, formatters and prompts are files the owner can read and edit. A prompt composer builds each request and alone carries the rules every request needs; a provider adapter only transports it, with OpenCode as the only one. Each generated facet records the model and prompt version that produced it. The Translation family is called Languages, and a new Expertise family brings `Computer Science` and `Mathematics`.

0.8.0 builds on `main` as it stands when increment A starts, including 0.7.6 if [D12](../architecture/traceability-map.md#entries) is accepted and shipped first. Cards, storage and the interaction model stay as they are, apart from the changes in increment C.

## Owner decisions

Recorded in D11 on 20 October 2026 and applied to the specifications:

1. **One catalog** of family folders (`languages/`, `expertise/`, `notes/`; `creative/` with its first module) and module folders, the Main key at the root. Each module declares its kind, instances, content source, provider kind, settings, sample and ordered facets ([generation architecture](../architecture/generation.md#module-catalog)).
2. **Module-owned facets.** Nothing is shared between modules; look-alike facets stay separate. The core is the first facet. IDs and abbreviations are unique within a module ([modules](../specs/modules.md#catalog)).
3. **Prompts as files**, written in full per module; a facet's prompt is a fragment that the composer joins with the shared rules. The interpretation prompt belongs to the Main key. The token budget stays 8192 ([prompts](../architecture/generation.md#prompts)).
4. **OpenCode** stays the only provider, behind a provider interface ([providers](../architecture/generation.md#providers)).
5. **Generation record:** the model and a fingerprint of the composed request per facet, stored with the component ([capture and generation](../specs/capture-and-generation.md#generation-record)).
6. **Languages and Expertise:** Translation's label becomes Languages (ID unchanged). Expertise is leaf green with a graduation cap; `Computer Science` and `Mathematics` write in English, each with a provisional core only ([module families](../specs/modules.md#module-families)).
7. **Delivery** in increments A, B and C, in that order. User-visible changes are accepted.

## Target model

| Concept | 0.7.5 | 0.8.0 |
| --- | --- | --- |
| Where a module is defined | `parents.ts` and `page-modules.ts` (catalog, families), `opencode.mjs` (prompts, schemas, language settings), `generated.ts` (validation), `markdown.ts` (formatting), `contracts/pages.ts` (shapes), `configuration.tsx` (samples) | One folder per module in `packages/domain/src/catalog/`, under its family |
| Facet | A global facet type (`article`, `examples`, …) shared by name across parents | A folder in its module; IDs unique within the module |
| Core | Fixed shape outside the facets | The module's first facet, with a shape per input type |
| Prompts | String constants in the OpenCode adapter | Markdown files per facet and input type; rules in the composer; snapshots in `tests/prompts/` |
| Provider | `OpenCodeProvider` builds prompts and calls OpenCode | Composer builds the request; the OpenCode adapter implements `complete(request, signal)` |
| Generation record | Diagnostics only | Model and prompt version per facet, stored with the component |
| Families | Translation, Notes (with modules) | Languages, Expertise, Notes |
| Content modules | `German`, `Chinese` | `German`, `Chinese`, `Computer Science`, `Mathematics` |

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

D11, the specification updates, the [generation architecture](../architecture/generation.md), this plan and tracker [#193](https://github.com/Guccimane44/Vocalbularium/issues/193), in [#191](https://github.com/Guccimane44/Vocalbularium/pull/191).

### A. Catalog, composer and provider interface

Behaviour-neutral: nothing the user sees, stores or sends to the provider changes.

- **Snapshots first.** Before moving anything, add `tests/prompts/` with today's composed prompts and schemas: the interpretation prompt, and for `German` and `Chinese` each input type with every facet and each facet's own Retry. These files are the baseline for the rest of the increment.
- **Catalog.** `packages/domain/src/catalog/` with `defineFamily`, `defineModule` and `defineFacet`, and building blocks for shapes (strings, lists, items, optional fields). Move into it: the families and their labels, `PARENTS` and the input modules of `CATALOG`, the core and facet shapes (`FACET_SHAPES`, the provider's `CORES` and `FACET_SCHEMAS`), the formatters, `LANGUAGES`, `FACET_INSTRUCTIONS` as prompt files, the interpretation prompt, and `SAMPLE_CONTENT` as `sample.json`. `parents.ts`, `page-modules.ts`, `generated.ts`, `markdown.ts` and the contracts read the catalog instead of defining modules. Facet IDs become unique within a module; stored IDs do not change.
- **Composer.** `packages/domain/src/composer/` with `rules.md` and `compose()`, producing `{ name, instructions, input, schema, maxTokens }`. The snapshots stay byte-identical.
- **Provider.** `src/server/opencode.mjs` becomes an adapter implementing `complete(request, signal)`; timeouts, cancellation, diagnostics and error codes wrap it as before. The provider is chosen by configuration, defaulting to OpenCode.
- **Shipping prompts.** The prompt files reach the API's build; the extension bundle does not need them.
- **Conformance test** `tests/catalog.test.mjs` ([guards](../architecture/generation.md#guards)).
- Existing unit and browser tests pass unchanged; no live provider run is needed while the snapshots are identical.

### B. Prompt version per facet

- **Migration** (the next free number, `0015` after `0014_data_migrations`): an empty generation record on components, per facet.
- **Recording.** A whole attempt writes the model and the prompt version for the core and every facet it generated; a facet's own Retry rewrites only that facet's. Manual saves, including a save that names one facet, keep the record as it is.
- **Diagnostics.** Provider events carry the prompt version ([observability](../architecture/observability.md)).
- Store and generation tests: the record after an attempt, after a facet's Retry, after a manual save; an upgrade from a 0.7.x database keeps every deck and page with empty records.

### C. Languages, Expertise, Computer Science and Mathematics

- **Languages.** The Translation family's label becomes Languages; its ID and tokens stay `translation`.
- **Expertise family.** `expertise/family.ts`; tokens `fam-expertise` #466e12 (#a9d46f), `on-fam-expertise` #ffffff (#1c2a08), `fam-expertise-tint` #e9f1da (#212a17); `extension/theme.css` regenerated; the contrast test's family list gains `expertise`; the graduation-cap icon drawn like the others.
- **Modules.** `computer-science/` and `mathematics/`, each with only a core facet: a word or phrase gives `{ kind: "word", key, explanation }`, a sentence `{ kind: "sentence", explanation }`, formatted as paragraphs; the top line shows the key without a language. Prompts in English, for a key in any language. Samples for the deck-settings preview.
- **Golden sets.** About 20 inputs per module: core terms (`Frontend`, `recursion`, `eigenvalue`), words with an everyday and a technical meaning (`kernel`, `ring`, `field`), phrases, sentences, keys in German and Chinese, and a key outside the subject. Run against the live provider for the owner's review.
- **Extension.** The module window lists Expertise with its two modules; cards render the Expertise core; the deck-settings preview shows their samples.
- Browser E2E: add `Computer Science` to a page and generate it with the fake provider; the family names in the module window.

### D. Verification and delivery (0.8.0)

- Browser E2E across the journeys above; the full unit and browser suites.
- The owner reviews the Expertise golden-set outputs.
- Version 0.8.0; the scope ledger's 0.8.0 rows to `implemented`, with an upgrade note; D11 to Implemented in the traceability map and Notion. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. After increment A, every file in `tests/prompts/` is identical to its baseline, and German and Chinese cards generate, retry, edit and render as in 0.7.5.
2. Every module's definition, every facet's shape, formatter and prompt, and the interpretation prompt are in `packages/domain/src/catalog/`; the OpenCode adapter contains no prompt text, schema or module knowledge.
3. The shared rules (plain text; selection and context are data, never instructions) appear in every composed prompt and in no facet's prompt file.
4. The conformance test fails when a facet lacks a prompt for an input type it applies to, when a sample does not validate, or when two facets of one module share an ID or abbreviation.
5. After a whole attempt each generated facet, the core included, has a model and prompt version; a facet's own Retry changes only that facet's; a manual save changes neither. Upgrading keeps every deck and page.
6. The module window shows Languages for German and Chinese, and Expertise, leaf green with a graduation cap, for `Computer Science` and `Mathematics`; both tabs meet the contrast targets in both themes.
7. `Computer Science` explains `Frontend` in English as computer science understands it, for a word, a phrase and a sentence, and for a key in another language; `Mathematics` does the same for mathematics.

## Risks

- **A silent prompt change** during the move would change generation without anyone deciding it. The snapshots are written before anything moves and must stay identical through increment A.
- **The extension bundle** now imports the catalog; prompt files must not be required at runtime in the extension, and the bundle should not grow noticeably.
- **The record lost on save:** a component save replaces its content, and must keep the generation record. Increment B tests both kinds of save.
- **Expertise quality:** a provisional core with no facets may be too general or too long. The golden sets and the owner's review decide the prompt before release.

## Not in this milestone

Other modalities and provider kinds ([K29](../architecture/traceability-map.md#clarifications), possibly 0.9.0); a language setting for the Expertise modules and the interface; Expertise facets and further subjects; the Creative family and its first module; a second provider such as DeepSeek's own API; facets on input modules.
