# Refactor: deck → page → component

Proposed: 9 October 2026 (Europe/Berlin). Revised 10 October 2026: views follow the Notion model, the old karte design becomes a future **card** view module, and view modules other than the **default view** are out of scope. The owner accepted every recommendation (D1–D8) and waived preservation of existing content: decks and kartes are discarded and the product starts empty. Status: **approved by the owner on 10 October 2026**. Notion: [decision record](https://app.notion.com/p/3f4bb1350208812e8085ffd751302842) (Accepted). No implementation yet.

Supersedes the deck → karte → seite hierarchy in the [0.3.0+ terminology plan](v0.3.0-plus-terminology-migration.md) and the answers that depend on it (see [superseded decisions](#superseded-and-affected-decisions)).

## Decision

1. **A page is an ordered list of components.** A deck contains pages. By default a page grows top to bottom:
   - main key (required, editable)
   - Context (optional, editable)
   - one component per content module instance in the deck configuration, in configured order
2. **Generation is incremental and per component.** A content module produces or replaces its own component, never the whole page. Retry works on one component or on the whole page (every content component).
3. **Generation always follows the deck's current configuration.** A new page and every retry use the live deck configuration. Changing the configuration never changes existing pages until the user retries. There is no pinned layout revision.
4. **A page is data; views visualize it.** As in a Notion database, the page holds the data and a view is one way to show it. View modules provide views, and a page is always shown through one. The **default view** module shows the page as its ordered component list and needs no configuration, so every page has a view even when no other view module is used. The old karte design becomes the **card** view module: it shows a page as a card, and its configuration sets how the card is laid out and which components it shows where.
5. **Modules have kinds.** *Content modules* generate components from the main key and Context. *View modules* show pages. This refactor builds the content modules and the default view module only.
6. **Capture and manual creation share one input.** Select and Add creates a page from the selected text and Context, then generates its content components automatically. Manual creation needs the user to enter the main key (Context optional) and never generates by itself. The user clicks Generate. After creation the two are indistinguishable in behavior.
7. **Retry ignores what is on the page.** A retry uses only the main key, the Context and the current module configuration. It replaces the targeted component content, including the user's edits to it, after confirmation.
8. **Terminology.** The terms *karte* and *seite* are dropped. Use **deck / decks**, **page / pages**, **component / components**, **content module**, **view / views**, **view module**, **default view** (the default view module), and, for later work, **card** (a view module). No separate term is introduced for parts of a view (D3).

## Scope

In this refactor: pages, components, content modules, per-component generation and retry, a fresh content schema, the page editor, and the default view module.

Out of scope, with no design or implementation work until the owner starts it:
- **View modules other than the default view**, including the card view module, several views per deck, switching views, and a views editor. Until they exist, every page is shown in the default view.
- Hiding or deleting individual components on a page.

**Existing content is not preserved.** The owner decided on 10 October 2026 that the decks and kartes created so far have no value. The upgrade discards all content (decks, kartes, seites, layouts, attempts, receipts) and the product starts empty. Accounts, credentials, installations and sign-in stay, so the owner doesn't sign up again. This overrides the data-preservation rule in [AGENTS.md](../../AGENTS.md) for this refactor only.

## Superseded and affected decisions

| Record | Current text | Change |
| --- | --- | --- |
| Q31 pinned layouts ([answers-06](../architecture/questionnaire/answers/answers-06-data-and-semantics.md), Notion "Karte data model", Proposed) | each karte pins its layout revision | Superseded by decision 3 |
| Q29 stored data | seite content as a block document; latest outcome per seite; pinned revision | Component content as a block document; latest outcome per component; no pinned revision |
| Q32 lifecycle | move/copy carry seites; no seite remap | Move/copy carry components. A moved page's next retry uses the target deck's configuration |
| Q34 limits | 1–4 seites per deck | Replace with a cap on content modules per deck (D6). Layout limits move to the card view module |
| Q13 rendering (Notion "Frontend architecture", Proposed) | seite content is a versioned block document | Each component's content is a versioned block document |
| Q14 compatibility | legacy terminology retired at 1.0.0 | Now covers both old dialects (card/page and karte/seite). See D1 |
| Q53 study records | reference karte/seite IDs | Reference page IDs and component IDs; references to parts of a card wait for the card view module (decide in Q53) |
| Q40–Q45 modules (deferred) | waiting for the module brief | Decisions 4–5 are the first part of that brief |
| Notion "Adopt deck → karte → seite" (Accepted, Implemented) | canonical hierarchy | Mark Superseded when this plan is approved |
| [model](../product/model.md), [kartes-and-editing](../specs/pages-and-editing.md), [decks-and-layouts](../specs/decks-and-configuration.md), [modules](../specs/modules.md), [capture-and-generation](../specs/capture-and-generation.md), [Select and Add](../MVP-Product-spec-select-and-add.md), [scope](../product/scope.md), [AGENTS.md](../../AGENTS.md) | seite-based rules | Rewritten in increment 1 |

## Owner decisions

All answered 10 October 2026. The owner accepted each recommendation; D3 and D7 were answered directly.

- **D1 — Compatibility and the reuse of "page"** (blocks 3–5). Before 0.3.0+, `page` / `pageId` meant what is now a seite, and the compatibility layer still accepts that dialect. Reusing `page` for the whole item makes the same legacy field mean two things. The same applies to `card` / `cardId`, which meant the whole item and will later name the card view module.
  *Answered 10 October 2026:* make this a breaking contract version. Retire the card/page dialect in this release, which brings Q14's 1.0.0 retirement forward. Upgrade backend and extension in lockstep using `minCompatibleExtension`. No receipt or replay compatibility is needed, because old receipts are discarded with the content. Rejected alternative: version the API (`/api/v2`) and keep both dialects until 1.0.0.
- **D2 — Other UI uses of "page"** (blocks 1, 5). *Answered 10 October 2026:* "deck configuration page" → **deck settings**; "karte view page" → opening a **page** ("Open page"), not "page view", because "view" is reserved for view modules; "karte content page" → **page editor**; browser pages → **web page** / **site** in copy. Paginated query results are internal only and keep their names.
- **D3 — Term for part of a view** (blocks 1). *Answered 10 October 2026:* no separate term. How a card is laid out is part of the card view module's configuration, like columns are part of a Notion board view, and is not part of the page's data. The card view module's own specification names its settings when that work starts.
- **D4 — Manual content components in 1.0** (blocks 1–2). Can a user add their own text or image component that no module owns? *Answered 10 October 2026:* yes for text, as a component kind that retry never touches. Images follow Q59 / rich-media scope.
- **D5 — Editing generated components.** *Answered 10 October 2026:* allowed. The edit lasts until the next retry of that component, which asks for confirmation first because it replaces the edit (decision 7).
- **D6 — Limits replacing Q34.** *Answered 10 October 2026:* at most 12 content modules per deck. View limits are decided with the view modules that need them.
- **D7 — How views are chosen.** *Answered 10 October 2026:* only the default view exists in this refactor, so there is nothing to choose yet. Direction for later view modules: the Notion model, with views as alternative ways to show a deck's pages and one default per deck.
- **D8 — Release vehicle.** *Answered 10 October 2026:* its own milestone (e.g. 0.4.0) before the other 1.0 work in the traceability map, since most 1.0 answers build on this model. Sequence after the open logging stack ([#71](https://github.com/Guccimane44/Vocalbularium/pull/71)–[#76](https://github.com/Guccimane44/Vocalbularium/pull/76)) merges, because both touch the backend executor and extension.

## Target model

```text
Account
└── Deck
    ├── Configuration
    │   ├── ordered content module instances   (generation: what components exist)
    │   └── view: default view                 (the only view module in this refactor)
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
- Rewrite [model.md](../product/model.md) around deck → page → component and content modules. Define views and view modules, and the default view. Name the card view module as later work.
- Rename `kartes-and-editing.md` → `pages-and-editing.md` and `decks-and-layouts.md` → `decks-and-configuration.md`, updating all incoming links in the same change.
- [modules.md](../specs/modules.md): module kinds; the content-module contract (input: main key + Context + interpretation; output: one component's block content). The view-module contract at the level the default view needs (input: a page's components; output: what the user sees); other view modules are later work.
- [capture-and-generation](../specs/capture-and-generation.md) and [Select and Add](../MVP-Product-spec-select-and-add.md): attempts per component, page retry = all content components, "generate missing", confirmation before replacing edited content, failure and recovery per component.
- [scope.md](../product/scope.md), [AGENTS.md](../../AGENTS.md) terminology section, project skills, README.
- Write a new terminology mapping for history: karte → page; seite → component for content, and part of the future card view's layout for presentation; front seite → main key component.
- The existing [terminology plan](v0.3.0-plus-terminology-migration.md) and [compatibility record](../architecture/terminology-compatibility.md) become historical. Add a pointer at the top; don't rewrite them.

### 2. Domain and contracts (`packages/domain`, `packages/contracts`)
- Add per-instance component generation (`generateComponent`, `generateComponents`). One interpretation per generation run is shared across the components it produces. `renderSeite` (which joins module outputs into one text) is rebuilt on it so the running backend keeps its behavior, and is removed in increment 4.
- Types: `Page`, `Component` (`main_key | context | module | manual`), `ContentModuleInstance`, `ComponentAttempt`, `ViewModule`.
- Register the existing five modules as content modules, and the **default view** as the first view module.
- New contract dialect for routes and messages, added beside the karte/seite dialect (D1 retires both old dialects in increments 4–5). OpenAPI is regenerated when the routes switch in increment 4.
- Unit tests: generation per instance, applicability skips, distinct-example retry (`claimOutput`) per component.

### 3. Persistence: page/component schema (`migrations/0003_*`, `src/persistence`)
`0003` only adds the new schema, beside the karte/seite tables, so the running backend keeps working until increment 4 switches over. Don't edit applied migrations 0000–0002.

- `deck_modules`: ordered content module instances per deck, at most 12 (positions 0–11).
- `decks.view`: the deck's view; only `default` is allowed.
- `pages`: `selected_text` as capture origin (null for manual pages), `created_at`, and a main-key sort key with the list indexes.
- `components`: keyed by `(page_id, id)`; `kind`, `module_instance_id` (set exactly for module components, no foreign key so components outlive removed instances, one component per instance per page), `position`, `content` block JSON, `status`, `attempt_id`. At most one main key and one Context per page.
- `generation_runs`: one per run, holding its shared interpretation.
- `component_attempts`: keyed to `(page_id, component_id)` and their run.
- Receipts keep their existing generic table.

Tests (`tests/pages-schema.test.mjs`): a populated 0.3.0+ database upgrades through 0003 with every old table unchanged and the running store still working; the new tables enforce ownership, uniqueness, limits and cascades.

### 4. Backend (`src/core`, `src/server`)
- Migration `0004` discards the old content: it drops `kartes`, `seites`, `layout_seites` and `attempts`, empties `receipts`, deletes every deck, and creates one fresh default deck (one `<German explanation + examples>` instance, default view) that the account points to. Account tables (`account`, `credentials`, `installations`, `login_tokens`) keep their rows. Test: a populated 0.3.0+ database → 0004 → only the fresh default deck remains and sign-in is unchanged. Remove the legacy-dialect and receipt-replay fixtures that only covered old content.
- Executor: one attempt per component, still ordered and guarded by the advisory lock. Page retry enqueues every content component. "Generate missing" enqueues only components without content.
- Routes: page create/save/delete and one `generate` route whose target is `missing`, `page` or `component`; page and component targets are retries and carry a confirmation digest of the content they replace. The card/page and karte/seite dialects and the terminology compatibility layer are removed (D1). Moving and copying pages stay deferred (scope).
- Capture: create the page, then generate all content components (same receipt / outbox recovery guarantees as today, in the new shape).
- Manual create: never enqueues generation.
- Tests: backend suite rewritten for per-component attempts, interruption and recovery, retry after a configuration change, and the 0004 upgrade.
- Because the browser tests drive the extension against this backend, they pass again only with increment 5. Increment 5 is stacked on this branch and both merge together.

### 5. Extension (`extension/`)
- Pages are shown through the default view module: the ordered component list, replacing the Seite tabs.
- Page editor: main key and Context editors, the component list, Generate / Generate missing / Retry page / Retry component, existing Save/Cancel and draft rules.
- Deck settings: content module list (add/remove/reorder). No views editor.
- Capture and manual creation entry points produce pages. Copy follows D2.
- Recovery: on first run after the upgrade, clear cached content, pending captures and drafts from the old version; keep the cached account. Drafts use a new `page-draft` key with no fallback read.

### 6. Verification and delivery
- E2E harness: capture → page with generated components → edit → retry one component → change deck configuration → retry the whole page. Manual create without generation → Generate.
- Upgrade scenario: a populated 0.3.0+ database and extension build with pending captures and drafts → new backend + extension; check that the owner is still signed in, has only the fresh default deck and no pages, and that no old capture or draft is replayed.
- Browser smoke in the approved local environment, then [Deliver](../../.agents/skills/vocabularium-deliver/SKILL.md): back up the owner database (a safety net only; nothing is restored from it), migrate, check that account rows are kept and only the fresh default deck exists, package, and hand off. Owner acceptance is a separate step.

## Risks

- **Pages lose their card look until the card view module ships.** Today the editor shows a karte as Seite tabs. After this refactor every page is shown in the default view, one component list. The change is visible to the owner and must be in the release notes.
- **Content is deleted on upgrade.** Every deck and karte is gone after `0003`. The owner has accepted this; the release notes must say so plainly, and the pre-upgrade backup is kept until acceptance.
- **Contract break.** D1 chose a clean break, so any extension older than this release stops working against the new backend. Acceptable with a single owner install, but must be explicit in the release notes.
