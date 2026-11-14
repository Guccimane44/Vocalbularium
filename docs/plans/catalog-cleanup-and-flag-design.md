# Plan: delete the dead catalog fields, then define the flags

Drafted 10 November 2026 for a new session. Status: **draft, not approved**. Nothing here has been run or changed in code.

This plan covers the first two steps of the owner's rework. Background, findings and the open questions are in the [handoff](headers-flags-classifier-handoff.md); how flags and headers work today is in the owner's [headers and flags map](../../maps/headers-and-flags-map.md). Read both first.

The owner's order of work:

1. Delete the dead fields. *(this plan)*
2. Design the flags and give them clear definitions. *(this plan)*
3. Measure Jev on the flags, then build it in. *(not this plan; see the [Jev plan](jev-flags-experiment.md))*
4. Dictionary lookup and the decision that supersedes D17. *(not this plan)*

## Before starting

- **Use a fresh branch from `main`.** The branch `claude/silver-set-reasoning` carries unrelated uncommitted work, including edits to `tests/catalog.test.mjs`, which step 1 must also edit. Do not commit, revert or build on that work. The handoff, the held-out sets and this plan are untracked files on that branch; ask the owner how they want them carried over.
- Read the Notion hub and decisions D11, D17, D25, D28 and D29 before step 2. Check the [project workflow](../guides/project-workflow.md) for whether step 2 needs a decision of its own.
- The owner works in this order: refine, readiness analysis, plan, iterate, execute. Drafts go to the owner before anything is built. Ask about any ambiguity. Commit or push only when asked.

## Step 1: delete the dead fields

### What goes

All are defined in `packages/domain/src/catalog/define.ts`.

| Field | Type that goes with it | Set in | Read by |
| --- | --- | --- | --- |
| Module `provider` | `ProviderKind` | the 11 content modules' `module.ts` | Nothing |
| Module `source` | `Source` | all 14 modules' `module.ts` | `tests/catalog.test.mjs` lines 35 and 46, where it restates `kind` |
| Core `label` (`'Core'` everywhere) | none | the 11 cores' `facets/core/facet.ts` | Nothing |
| Core and facet `output` | `OutputType` | every core and facet | `tests/catalog.test.mjs` line 56, which asserts it equals `'text'` |

The owner named `output` on a core. The facet's `output` is the same field with the same single value and the same single reader, so this plan deletes both. Confirm with the owner if in doubt.

### What stays

These have similar names and are in use:

- `core.labels` (read by `extension/catalog-text.ts`)
- `core.headerLabels` (read by `render.ts`)
- module `instances` (read by `page-modules.ts`)
- the facet's own `label`, and the module's `label`

### How

1. Repeat the search before deleting. The table above was built on 10 November from `main` at `761bfbd`; confirm nothing new reads `.provider`, `.source`, `.output`, `ProviderKind`, `Source`, `OutputType` or a core's `label` in `packages/`, `src/`, `extension/`, `scripts/` and `tests/`. Note that `src/server/` has many unrelated things named `provider` and `source`; only catalog definitions count.
2. Remove the fields and the three types from `define.ts`, and fix the comments there that describe them.
3. Remove the fields from every `module.ts` and `facet.ts` in the catalog.
4. In `tests/catalog.test.mjs`, drop the three assertions. Keep what the two `source` assertions were really checking by asserting on `kind` instead, if `kind` is not already checked there.
5. In `docs/architecture/generation.md`, remove the sentence that says `ProviderKind` in the catalog is `text` or `speech` (around line 96), and any other mention of the four fields. The rest of that paragraph, about the speech provider, stays.
6. Leave the owner's map in `maps/` alone. It is a dated description of `main` at `761bfbd`.

### Done when

- `npm run build:packages` and the extension build pass with no type errors.
- `tests/catalog.test.mjs`, `tests/prompts.test.mjs` and `tests/localisation.test.mjs` pass, and **no file in `tests/prompts/` changed**. A changed snapshot means something other than a dead field was touched.
- `docs/api/openapi.json` is unchanged (`npm run openapi`).
- The diff touches only the catalog, `define.ts`, the one test file and the one architecture document.

No migration, no API change, no prompt change, no live run and no browser check are needed. This is one small PR.

## Step 2: design the flags

Step 2 has two parts with an approval between them. Part A is a document. Part B is a refactor that changes no behaviour.

### The problem being solved

A flag today is whatever a core's `header()` returns. No list says which flags a module has, which values each may take, what each is decided from, or what it decides. The consequences:

- `ruledOut()` in `parents.ts` tests `'relevance' in core` to guess the family.
- `modules.ts` line 143 takes the keys of `header(previous)` to find out which fields are flags.
- `content.ts` line 91 and `render.ts` lines 60 to 65 hard-code the five header kinds.
- `language` means three different things (see below).
- A classifier cannot be asked for a flag whose values and inputs are not written down. This is what step 3 needs from step 2.

### Part A: the definitions (a draft for the owner to approve)

Write one definition per flag, in a form the owner can read and correct. Each definition states:

| Part | Question it answers |
| --- | --- |
| Name and meaning | One sentence a person could label examples from |
| Values | A closed list, a language code, or free text |
| About | The key itself (the same answer for every module on the page) or this module's view of the key |
| Decided from | The key alone, the key and its Context, or the written core |
| Depends on | Another flag that must be known first |
| Decides | Which facets it rules in or out, what the card shows, what is spoken |
| Boundary cases | Worked examples for the hard cases |

The starting inventory, taken from the map. The last column is what the definition has to settle; each is the owner's call, with a recommendation.

| Flag | Modules | Today | To settle |
| --- | --- | --- | --- |
| `kind` | Languages | `word` or `sentence`, decided per module | Where a word ends and a sentence begins (*Danke!*, *Stop!*, *Rain expected tomorrow*). Whether it is one answer per page instead of one per module; today German and Chinese on one page can disagree. Recommended: one per page, since it describes the key. |
| `language` | Languages | Free text, the language's name in the module's language ("Chinesisch") | See the next section. |
| `language` | Pronunciation | One of 80 ISO 639-1 codes, or `other` | Same. |
| `language` | Creativity | Free text up to 8 characters, a code or `other` | Same. |
| `gramRole` | German | Free text, asked to be an English part of speech; describes the key if German, otherwise the German word for its first meaning | A closed list of values. And whose part of speech it is: the German translation's (today) or the key's own. Only the key's own can be known before generation; but Article, Declension and Conjugation are about the German word, so for a foreign key the German word's role is the one that decides them. This is the hardest definition and blocks step 3 for this flag. |
| `relevance` | Expertise | `subject`, `neighbouring`, `unrelated` | Probably nothing; confirm the three meanings with examples. |
| `hasCode`, `hasFormula`, `hasEquation` | one each per Expertise module | `yes` or `no`, only when `relevance` is `subject` | Whether they are three flags or one flag per module with a module-specific name. The dependency on `relevance` should be declared, not implied. |

Two header fields are not flags and should be named as such in the document: `key`, and `romanization`. The owner's open question 4 (on a Chinese card for a Chinese key, does the reading go under the key, in the Pinyin facet, or both) belongs here.

#### The `language` question

Today there are three flags with one name. They all answer the same question: what language is the key in. A single definition would be: **the key's language as an ISO 639-1 code, or `other`**, shown on the card by name in the module's language.

What that would change:

- Grammar Teacher's `when` compares a code instead of matching hard-coded localised names ("deutsch"; 中文, 汉语, 普通话; english, british english, american english).
- The Languages cores' prompts ask for a code. That moves the prompt snapshots and needs a golden-set run.
- Stored Languages headers hold names, so existing cards need a migration or a reader that accepts both.
- Like `kind`, it becomes one answer per page.

This is a change of meaning, not a refactor. Part A decides it; it is built as its own change after Part B (see "After Part B").

#### Where the definitions are written

Put the draft in a new document under `docs/plans/` for the owner to mark up. Once approved, the durable home is the generation architecture (`docs/architecture/generation.md`) and, for each changed meaning, a decision record. The held-out labels in `tests/golden/held-out/classification.json` must then be corrected to follow the approved definitions; their boundary stratum and their part-of-speech labels encode guesses at exactly these rules. The owner can review those labels alongside the definitions.

### Part B: declare the flags in the catalog (no behaviour change)

After the owner approves Part A, make the catalog state what Part A wrote down, with the text model still writing every flag exactly as today.

A sketch of the declaration, as a starting point to refine and not a decided shape:

```ts
export type FlagDefinition = Readonly<{
  id: string;                                   // 'kind', 'gramRole', 'relevance', …
  values: readonly string[] | 'language' | 'text';
  about: 'key' | 'module';
  from: 'key' | 'key-and-context' | 'core';     // the earliest point it can be known
  requires?: Readonly<Record<string, string>>;  // hasCode only when relevance is 'subject'
  shown: boolean;                               // whether the card's top line shows it
}>;

// on CoreDefinition:
flags: readonly FlagDefinition[];
```

What the refactor does:

1. Add `FlagDefinition` and `core.flags` to `define.ts`, and declare the flags in each of the 11 cores, mirroring today's behaviour exactly (so `language` is still declared three ways, and `gramRole` is still free text, until their changes of meaning are built).
2. Replace the guesses with the declarations: `ruledOut()` no longer tests `'relevance' in core`; the core's Retry in `modules.ts` reads the declared flags instead of the keys of `header(previous)`.
3. Add a catalog test: every field a `when` reads is a declared flag of its module; every declared flag is in the core's shape; every flag `header()` returns is declared.
4. Decide with the owner whether `header()` and `read()` stay hand-written per core or are derived from the declarations. Deriving them removes the parser copied across the four Languages cores, but it is more risk in a change that promises no behaviour change. Recommended: keep them hand-written in Part B and guard them with the test in item 3.
5. Update `docs/architecture/generation.md`.

**Out of scope for Part B:** the stored header shape. `ParentHeaderSchema` in `packages/contracts/src/pages.ts` keeps its five variants. Replacing it with a general record of flags is right in the long run (it brings the contract in line with D25), but it changes stored data and the API, and step 4 changes the header again when a classifier writes it first. Do it once, with the decision that supersedes D17.

### Done when (Part B)

- No file in `tests/prompts/` changed, `docs/api/openapi.json` is unchanged, and there is no new migration.
- `tests/catalog.test.mjs` (with the new test), `tests/parents.test.mjs`, `tests/content.test.mjs`, `tests/generation.test.mjs` and `tests/upgrade.test.mjs` pass.
- A stored card from before the change renders the same and its facet Retry and core Retry still keep its flags. `tests/generation.test.mjs` covers Retry with a mocked provider; say in the report that no live generation was run, or run `npm run gate -- german` if the owner wants live evidence.

### After Part B

Each change of meaning the owner approved in Part A is its own change, planned separately: `language` as a code, `gramRole` as a closed list with its settled meaning, `kind` and `language` decided once per page. Each one moves prompt snapshots, needs a golden-set run, and may need a migration. Whether they are built before step 3 or together with it is for the owner to decide once the Jev experiment has a result.

## Questions for the owner

Step 1 needs none of these. Part A is where they are answered.

1. Delete the facet's `output` together with the core's? (Assumed yes.)
2. Is `kind` one answer per page or one per module? The same for the key's language.
3. Should `language` become one flag holding a code, replacing the three meanings?
4. Whose part of speech is `gramRole` for a foreign key, and what is its closed list of values?
5. Where does the reading of a Chinese key go: under the key (`romanization`), in the Pinyin facet, or both? (Open question 4 in the handoff.)
6. Should the reshape of the stored header wait for the decision that supersedes D17, as this plan assumes? (Open question 3 in the handoff.)
7. Will the owner review the held-out labels alongside the definitions? (Open question 2 in the handoff.)

## Order of work

1. Step 1 on a fresh branch, as one PR.
2. Part A: draft the definitions, with the questions above put to the owner.
3. Owner approves the definitions; correct the held-out labels to match.
4. Part B on its own branch, as one PR.
5. Hand over to step 3: point the [Jev plan](jev-flags-experiment.md) at the held-out set and the approved definitions.
