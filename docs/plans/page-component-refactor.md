# Refactor: deck → page → component

Proposed: 9 October 2026 (Europe/Berlin). Revised 10 October 2026: views follow the Notion model, the old karte design becomes a future **card** view module, and view modules are out of scope (D3, D7). Status: **draft for owner review**. No Notion record or implementation yet.

Supersedes the deck → karte → seite hierarchy in the [0.3.0+ terminology plan](v0.3.0-plus-terminology-migration.md) and the answers that depend on it (see [superseded decisions](#superseded-and-affected-decisions)).

## Decision

1. **A page is an ordered list of components.** A deck contains pages. By default a page grows top to bottom:
   - main key (required, editable)
   - Context (optional, editable)
   - one component per content module instance in the deck configuration, in configured order
2. **Generation is incremental and per component.** A content module produces or replaces its own component, never the whole page. Retry works on one component or on the whole page (every content component).
3. **Generation always follows the deck's current configuration.** A new page and every retry use the live deck configuration. Changing the configuration never changes existing pages until the user retries. There is no pinned layout revision.
4. **A page is data; views visualize it.** As in a Notion database, the page holds the data and a view is one way to show it. View modules provide views. The old karte design becomes the **card** view module: it shows a page as a card, and its configuration sets how many sides the card has and which components go on each side.
5. **Modules have kinds.** *Content modules* generate components from the main key and Context. *View modules* show pages. This refactor builds content modules only.
6. **Capture and manual creation share one input.** Select and Add creates a page from the selected text and Context, then generates its content components automatically. Manual creation needs the user to enter the main key (Context optional) and never generates by itself. The user clicks Generate. After creation the two are indistinguishable in behavior.
7. **Retry ignores what is on the page.** A retry uses only the main key, the Context and the current module configuration. It replaces the targeted component content, including the user's edits to it, after confirmation.
8. **Terminology.** The terms *karte* and *seite* are dropped. Use **deck / decks**, **page / pages**, **component / components**, **content module**, and, for later work, **view / views**, **view module**, **card** (a view module) and **side / sides** (a face of the card view).

## Scope

In this refactor: pages, components, content modules, per-component generation and retry, the data migration, and the page editor.

Out of scope, with no design or implementation work until the owner starts it:
- **View modules**, including the card view module, several views per deck, switching views, and a views editor. Until they exist, the extension shows a page as its ordered component list.
- Hiding or deleting individual components on a page.

The refactor keeps what the card view module will need: the migration preserves each deck's old seite grouping (which module instances were on which seite, in order) as data that nothing reads yet.

## Superseded and affected decisions

| Record | Current text | Change |
| --- | --- | --- |
| Q31 pinned layouts ([answers-06](../architecture/questionnaire/answers/answers-06-data-and-semantics.md), Notion "Karte data model", Proposed) | each karte pins its layout revision | Superseded by decision 3 |
| Q29 stored data | seite content as a block document; latest outcome per seite; pinned revision | Component content as a block document; latest outcome per component; no pinned revision |
| Q32 lifecycle | move/copy carry seites; no seite remap | Move/copy carry components. A moved page's next retry uses the target deck's configuration |
| Q34 limits | 1–4 seites per deck | Replace with a cap on content modules per deck (D6). Side limits move to the card view module |
| Q13 rendering (Notion "Frontend architecture", Proposed) | seite content is a versioned block document | Each component's content is a versioned block document |
| Q14 compatibility | legacy terminology retired at 1.0.0 | Now covers both old dialects (card/page and karte/seite). See D1 |
| Q53 study records | reference karte/seite IDs | Reference page IDs and component IDs; references to card sides wait for the card view module (decide in Q53) |
| Q40–Q45 modules (deferred) | waiting for the module brief | Decisions 4–5 are the first part of that brief |
| Notion "Adopt deck → karte → seite" (Accepted, Implemented) | canonical hierarchy | Mark Superseded when this plan is approved |
| [model](../product/model.md), [kartes-and-editing](../specs/kartes-and-editing.md), [decks-and-layouts](../specs/decks-and-layouts.md), [modules](../specs/modules.md), [capture-and-generation](../specs/capture-and-generation.md), [Select and Add](../MVP-Product-spec-select-and-add.md), [scope](../product/scope.md), [AGENTS.md](../../AGENTS.md) | seite-based rules | Rewritten in increment 1 |

## Open decisions (owner)

Answer these before the increments they block. The recommendation is listed first.

- **D1 — Compatibility and the reuse of "page"** (blocks 3–5). Before 0.3.0+, `page` / `pageId` meant what is now a seite, and the compatibility layer still accepts that dialect. Reusing `page` for the whole item makes the same legacy field mean two things. The same applies to `card` / `cardId`, which meant the whole item and will later name the card view module.
  *Recommendation:* make this a breaking contract version. Retire the card/page dialect in this release, which brings Q14's 1.0.0 retirement forward. Upgrade backend and extension in lockstep using `minCompatibleExtension`. Keep only receipt-fingerprint compatibility, because historical receipts must replay. Alternative: version the API (`/api/v2`) and keep both dialects until 1.0.0.
- **D2 — Other UI uses of "page"** (blocks 1, 5). *Recommendation:* "deck configuration page" → **deck settings**; "karte view page" → opening a **page** ("Open page"), not "page view", because "view" is reserved for view modules; "karte content page" → **page editor**; browser pages → **web page** / **site** in copy. Paginated query results are internal only and keep their names.
- **D3 — Name for one face of a card** (blocks 1). *Answered 10 October 2026:* **side**. Sides belong to the card view module and its configuration, like columns belong to a Notion board view. They are not part of the page's data. Specified with the card view module, not in this refactor.
- **D4 — Manual content components in 1.0** (blocks 1–2). Can a user add their own text or image component that no module owns? *Recommendation:* yes for text, as a component kind that retry never touches. Images follow Q59 / rich-media scope.
- **D5 — Editing generated components.** *Recommendation:* allowed. The edit lasts until the next retry of that component, which asks for confirmation first because it replaces the edit (decision 7).
- **D6 — Limits replacing Q34.** *Recommendation:* at most 12 content modules per deck. Confirm, or set your own number. View and side limits are decided with view modules.
- **D7 — How views are chosen.** *Answered 10 October 2026:* deferred with view modules. Direction for that work: the Notion model, with views as alternative ways to show a deck's pages and one default per deck.
- **D8 — Release vehicle.** *Recommendation:* its own milestone (e.g. 0.4.0) before the other 1.0 work in the traceability map, since most 1.0 answers build on this model. Sequence after the open logging stack ([#71](https://github.com/Guccimane44/Vocalbularium/pull/71)–[#76](https://github.com/Guccimane44/Vocalbularium/pull/76)) merges, because both touch the backend executor and extension.

## Target model

```text
Account
└── Deck
    ├── Configuration
    │   ├── ordered content module instances   (generation: what components exist)
    │   └── preserved seite grouping           (migrated; unused until the card view module)
    └── Pages: each belongs to this deck only
        ├── main key component     (required; from capture or manual entry)
        ├── Context component      (optional)
        ├── content components     (one per content module instance; owned by that instance)
        ├── manual components      (D4; never touched by generation)
        └── generation attempts and outcomes, per component
```

A component's identity is `(page_id, component_id)`. A content component records the module instance ID that owns it, so configuration edits never need positional remapping:
- Module instance added to the deck: existing pages have no component for it until the user generates. "Generate missing" fills it, and page retry fills it.
- Module instance removed from the deck: existing components it produced stay as saved content, marked as no longer configured. Page retry doesn't touch them.
- Module instances reordered: the page's component order follows the configuration.

## Increments

Each increment is runnable and reviewable on its own and follows the [Change](../../.agents/skills/vocabularium-change/SKILL.md) / [Verify](../../.agents/skills/vocabularium-verify/SKILL.md) skills. Track them in one GitHub issue.

### 0. Record the decision (docs, Notion)
- Add the decision and owner answers to the questionnaire (new section in [06-data-and-semantics](../architecture/questionnaire/06-data-and-semantics.md) plus answers). Mark Q31 superseded and amend Q29, Q32, Q34, Q13 and Q53 as in the table above.
- Update the [traceability map](../architecture/questionnaire/traceability-map.md) so 1.0 items trace to the page/component model.
- Notion, with owner approval: a new decision record, Proposed → Accepted. Mark "Adopt deck → karte → seite" Superseded. Amend the Q29–Q34 and Q11–Q16 records.

### 1. Product language and specifications (docs only)
- Rewrite [model.md](../product/model.md) around deck → page → component and content modules. Name views, view modules and the card view module as later work.
- Rename `kartes-and-editing.md` → `pages-and-editing.md` and `decks-and-layouts.md` → `decks-and-configuration.md`, updating all incoming links in the same change.
- [modules.md](../specs/modules.md): module kinds; the content-module contract (input: main key + Context + interpretation; output: one component's block content). View modules get a placeholder section only.
- [capture-and-generation](../specs/capture-and-generation.md) and [Select and Add](../MVP-Product-spec-select-and-add.md): attempts per component, page retry = all content components, "generate missing", confirmation before replacing edited content, failure and recovery per component.
- [scope.md](../product/scope.md), [AGENTS.md](../../AGENTS.md) terminology section, project skills, README.
- Write a new terminology mapping for history: karte → page; seite → component for content, and a side of the future card view for presentation; front seite → main key component.
- The existing [terminology plan](v0.3.0-plus-terminology-migration.md) and [compatibility record](../architecture/terminology-compatibility.md) become historical. Add a pointer at the top; don't rewrite them.

### 2. Domain and contracts (`packages/domain`, `packages/contracts`)
- Replace `renderSeite` (which joins module outputs into one text) with per-instance component generation. One interpretation per generation run is shared across the components it produces.
- Types: `Page`, `Component` (`main_key | context | module | manual | legacy`), `ContentModuleInstance`, `ComponentAttempt`.
- Register the existing five modules as content modules.
- New contract dialect for routes and messages (shape depends on D1). Regenerate OpenAPI.
- Unit tests: generation per instance, applicability skips, distinct-example retry (`claimOutput`) per component.

### 3. Persistence and data migration (`migrations/0003_*`, `src/persistence`)
New schema (names indicative):
- `pages` (from `kartes`; same IDs, `created_at`, sort keys; `selected_text` retained as capture origin)
- `components` (`page_id`, `id`, `kind`, `module_instance_id` nullable, `position`, `content` block JSON, `status`, `attempt_id`)
- `deck_modules` (ordered content module instances per deck)
- `deck_seite_groupings` (preserved old seite grouping per deck; read only by the future card view module)
- `attempts` keyed by `(page_id, component_id)`

Migrating existing data, without loss:
- Each karte → a page with the same ID. Main key component from `selected_text`. Existing manual kartes without input get an empty main key flagged as needing input (the open item in [kartes-and-editing](../specs/kartes-and-editing.md#implementation-details-still-to-specify)).
- Each old seite's text is one joined string of several module outputs and can't be split reliably. It becomes **one legacy component** per old seite (paragraph block, no module owner, retry never touches it, labelled with its old seite number), so no text is lost or misattributed.
- Old `layout_seites` modules → the deck's ordered content module list (seite order, then module order; instance IDs kept) and the preserved seite grouping.
- Attempts and outcomes map to the legacy component of their seite. The generation journal's attempt IDs and `{ok,text}` results don't change.
- Receipts are untouched. Replay converts results on read, as 0002 does.
- Don't edit applied migrations 0000–0002.
- Tests: populated 0.3.0+ fixture → 0003 → table digests, content equality and grouping equality (extend `tests/postgres.test.mjs` and the legacy-database helper).

### 4. Backend (`src/core`, `src/server`)
- Executor: one attempt per component, still ordered and guarded by the advisory lock. Page retry enqueues every content component. "Generate missing" enqueues only components without content.
- Routes: page create/save/delete/move/copy, `generate` (page or component target), `retry` (page or component target, with content-loss confirmation digest per component). Compatibility per D1.
- Capture: create the page, then generate all content components (same receipt / outbox recovery guarantees as today).
- Manual create: never enqueues generation.
- Tests: backend suite extended for per-component attempts, interruption and recovery, retry after a configuration change, moving a page between decks.

### 5. Extension (`extension/`)
- Page editor: main key and Context editors, the ordered component list (replacing the Seite tabs), Generate / Generate missing / Retry page / Retry component, existing Save/Cancel and draft rules.
- Deck settings: content module list (add/remove/reorder). No views editor.
- Capture and manual creation entry points produce pages. Copy follows D2.
- Recovery: cached account, pending captures and drafts per D1. The draft key moves to `page-draft` with a fallback read.

### 6. Verification and delivery
- E2E harness: capture → page with generated components → edit → retry one component → change deck configuration → retry the whole page. Manual create without generation → Generate.
- Upgrade scenario: a populated 0.3.0+ database and extension build → new backend + extension; check that every page keeps its content, in old seite order, and that each deck's seite grouping is preserved.
- Browser smoke in the approved local environment, then [Deliver](../../.agents/skills/vocabularium-deliver/SKILL.md): back up the owner database, migrate, verify digests, package, and hand off. Owner acceptance is a separate step.

## Risks

- **Pages lose their card look until the card view module ships.** Today the editor shows a karte as Seite tabs. After this refactor it shows one component list. Content and grouping are kept, but the change is visible to the owner and must be in the release notes.
- **Legacy components stay opaque.** Migrated pages keep their old seite text as one unowned component each, and the first retry adds new per-module components next to it rather than replacing it. The UI needs a clear way to remove the legacy component after regenerating, or this needs an owner decision (it touches the deferred component-delete question).
- **Contract break.** If D1 chooses a clean break, any extension older than this release stops working against the new backend. Acceptable with a single owner install, but must be explicit in the release notes.
