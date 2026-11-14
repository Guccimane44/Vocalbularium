# Plan: step 1, delete the dead catalog fields

Drafted 10 November 2026 for the owner's review. Status: **draft, not approved**. No code has changed.

This is the first of the owner's three steps (clean up; move flags to Jev; look up instead of generate). It narrows and checks the step 1 section of [catalog-cleanup-and-flag-design.md](catalog-cleanup-and-flag-design.md) against the code. Background is in the [headers and flags map](../../maps/headers-and-flags-map.md) and the [handoff](headers-flags-classifier-handoff.md).

## Goal

Remove four catalog fields that nothing in the product reads, so the module, core and facet definitions only say what the product uses. No behaviour, stored data, API or prompt changes.

## What was checked

A search of `packages/`, `src/`, `extension/`, `scripts/` and `tests/` on 10 November (`main` at `761bfbd`, plus this branch's uncommitted work) found:

| Field | Type removed with it | Set in | Read by |
| --- | --- | --- | --- |
| Module `provider` | `ProviderKind` | all 11 content `module.ts` files | Nothing |
| Module `source` | `Source` | every `module.ts` | `tests/catalog.test.mjs` lines 35 and 46 only |
| Core `label` (always `'Core'`) | none | 11 core `facet.ts` files | Nothing |
| Core and facet `output` (always `'text'`) | `OutputType` | 46 `facet.ts` files | `tests/catalog.test.mjs` line 56 only |

The other `provider`, `source` and `output` names in `src/server/`, the logging tests and `scripts/silver-set.mjs` are unrelated (log events, provider responses) and stay.

Fields with similar names that are in use and stay: `core.labels` (the editor's names for the core), `core.headerLabels` (the card's heading), module `instances`, and the module's and facet's own `label`.

## Changes

1. **`packages/domain/src/catalog/define.ts`.** Remove `output` from `FacetDefinition` and `CoreDefinition`, `label` from `CoreDefinition`, `source` from `ModuleBase`, `provider` from `ContentModuleDefinition`, and the types `OutputType`, `Source` and `ProviderKind` with their comments. Keep the D24 comment on `Spoken`.
2. **The catalog.** Remove the fields from every `module.ts` and every core and facet `facet.ts`. A mechanical edit; TypeScript will refuse any one that is missed, since the define helpers take exact object types.
3. **`tests/catalog.test.mjs`.** Drop the two `source` assertions and the `output` assertion. Nothing replaces them: both tests already select modules by `kind`, which is what `source` restated.
4. **Documents.**
   - `docs/architecture/generation.md` line 45: drop "where its content comes from (captured, written by the user, or generated), the provider kind it needs".
   - Line 50: drop the sentences on the output type and the module's provider kind. Keep that a spoken part has its audio attached beside its text, and that other modalities are deferred (K29).
   - Line 96: drop "`ProviderKind` in the catalog is `text` or `speech`." The rest of the speech-provider paragraph stays.
   - `AGENTS.md` line 23: drop "provider kind" from the list of what `module.ts` holds.
   - Leave `maps/headers-and-flags-map.md` as it is: it describes `main` at `761bfbd`.

## What it does not touch

The flags, the header, `ParentHeaderSchema`, `romanization`, the prompts and anything in `src/`. Defining the flags is the next plan.

One thing is lost: today `source` is the only place that says Context is captured and Text is written by the user. Nothing reads it. If a dictionary source comes back in step 3, the handoff argues it belongs on a facet, not a module, so it would be a new field in any case.

## Checks

| Check | Expectation | What it catches |
| --- | --- | --- |
| `npm run build:packages`, then the extension build | No type errors | A field left behind, or a reader the search missed |
| `tests/catalog.test.mjs`, `tests/prompts.test.mjs`, `tests/localisation.test.mjs` | Pass | Catalog integrity |
| `git status tests/prompts/` | **No file changed** | Anything beyond a dead field reaching a prompt |
| `npm run openapi` | `docs/api/openapi.json` unchanged | An accidental contract change |
| `npm test` | Pass | Anything else |
| `git diff --stat` | Only `define.ts`, catalog files, the one test file, `generation.md`, `AGENTS.md` | Scope creep |

No migration, live generation or browser check is needed, because nothing stored, sent or shown changes. The report will say so.

## Branch and delivery

- A fresh branch from `main` (for example `claude/catalog-dead-fields`), in its own worktree. This branch, `claude/silver-set-reasoning`, has unrelated uncommitted edits to `tests/catalog.test.mjs` (15 added lines) and others, and they must not mix.
- One commit, one PR, when you ask for it. Notion needs no update: no decision changes.

## Questions for you

1. **Facet `output`.** You named `output` on the core. The facet's `output` is the same field with the same single value. Delete both? (Assumed yes.)
2. **`romanization` and Pinyin.** You gave this as an example of the schema being tangled. It is not a dead field: `romanization` is the reading of the key under the heading, Pinyin is the reading of the Chinese text in the card, and they repeat each other only when the key is Chinese. Changing it changes what the card shows and the Chinese prompt, so I would leave it out of step 1 and settle it with the flags. Agree?
3. **The untracked plan files** (the handoff, the plans, the held-out sets) sit on this branch. Copy them to the new branch, commit them separately, or leave them here for now?
