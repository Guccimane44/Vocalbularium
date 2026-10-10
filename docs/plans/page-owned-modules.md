# Plan: page-owned modules and the module window (0.5.0)

Proposed: 10 October 2026 (Europe/Berlin). Implements [D02](../architecture/traceability-map.md#entries), accepted by the owner on 10 October 2026, with the decisions recorded below. Tracker: [#108](https://github.com/Guccimane44/Vocalbularium/issues/108). Status: **awaiting owner approval**.

## Outcome

The deck configuration becomes the template for page creation only. After creation, a page owns its modules. The user deletes components, rearranges them, and drags modules onto the page from a **module window** on the right of both the page view and deck settings. The main key, Context, and the user's own text become modules like the rest.

This milestone builds the interaction model and the two-panel layout with today's styling. The distinctive visual identity ([vision](../product/vision.md#uiux-direction), [Q67](../architecture/questionnaire/answers/answers-13-ux-and-migration.md#67)) is a later milestone.

## Owner decisions

Recorded in D02 and its follow-ups on 10 October 2026:

1. The deck configuration is only the template for new pages; later deck changes never reach existing pages.
2. Any component except the main key can be deleted, immediately after a warning. A deleted component stays gone; generation never recreates it.
3. Every component except the main key can be rearranged; the main key stays first.
4. Modules are added to one page by dragging them from the module window. An added content module waits as "Not generated yet".
5. **Input modules:** the main key module is compulsory and first; the Context module is optional, at most one, and replaces the Capture with Context setting.
6. **Text module (new):** the user's own text is a Text input module. It can repeat, a deck can include it (new pages then start with an empty text block), and it counts toward the limit. It replaces "Add your own text" and manual components.
7. **Limit:** at most 12 module instances per deck and per page, counting every module, including the main key, Context, and Text.
8. **Upgrade:** all existing decks and pages are discarded, as in 0.4.0; accounts and sign-in stay. The development data was for testing only.
9. **Scope:** layout and interaction now; the new look later.

## Target model

| Concept | Before (0.4.1) | After (0.5.0) |
| --- | --- | --- |
| Deck configuration | Content module instances, plus a Capture with Context setting | Ordered module instances: `main-key` (first, exactly one), at most one `context`, any number of `text` and content modules; 12 in total |
| New page | Main key, optional Context, components created on generation | A copy of every deck instance, each with its own component: main key and Context filled by capture, Text empty, content modules "Not generated yet" until generated |
| Page modules | Follow the deck's live configuration | Owned by the page; deck changes never reach it |
| Own text | Manual components without a module | Text module instances |
| "Not generated yet" | No component row | A content component with no attempt (status empty) |
| Component order | Derived from the deck order | Stored per page; main key pinned first |
| Generate missing / Retry page | Deck instances | The page's content instances |
| Removed-instance components | Kept, marked "no longer in this deck" | Concept removed |

Every component records its page's module instance and module type. Page-scoped instance IDs are new IDs, not the deck's, so editing the deck can never be confused with a page's modules.

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan (this PR)

This plan, the tracker issue, and the D02 amendment (Text module, upgrade discards content) in the traceability map. Notion: a milestone row in Actual Stages and the update to the D02 decision record, each with the owner's OK.

### 1. Specifications (docs only)

Update the product model, [pages and editing](../specs/pages-and-editing.md), [decks and configuration](../specs/decks-and-configuration.md), [modules](../specs/modules.md), [capture and generation](../specs/capture-and-generation.md), [shared UI](../specs/shared-ui.md) and [scope](../product/scope.md) for the Text module and the 0.5.0 upgrade. They replace manual components and "Add your own text" with the Text module. They define the shaping operations, their confirmation and concurrency rules, and the module window's contents. Remove the "Before D02" sections when 0.5.0 ships (increment 6).

### 2. Domain and contracts (`packages/domain`, `packages/contracts`)

Additive, as in 0.4.0: the new rules and schemas live in new entry points, `@vocabularium/domain/page-modules` and `@vocabularium/contracts/page-modules`, which nothing uses yet. Increments 4 and 5 switch the backend and extension over and remove the old `pages` dialect.


- Module catalog with kinds: input (`main-key`, `context`, `text`) and content (the three generative types).
- Configuration validation: `main-key` first and exactly once, at most one `context`, at most 12 instances.
- Page model: components carry `moduleType` and a page-scoped `moduleInstanceId`; `kind` and `configured` are retired.
- `generationTargets` and `defaultView` take the page's own instances; shaping rules (`canDelete`, `canMove`, `canAdd`) live in the domain so the backend and the extension share them.
- Contracts: deck schema with input modules and no `captureContext`; page schema; new shaping request schemas.

### 3. Persistence (`migrations/0007_*`, `src/persistence`)

Additive, as in 0.4.0 ([#86](https://github.com/Guccimane44/Vocalbularium/pull/86)): the running store reads `kind` and `capture_context`, so removing them now would break `main`. Migration `0007` only adds `components.module_type` and unique indexes for one main key and at most one Context per deck and per page.

Increment 4's migration `0008` does the rest, landing with the backend and extension switch:

- discard decks, pages, components, attempts, runs, and receipts; keep account, credentials, login tokens, and installations; create one fresh My Deck with `main-key`, `context`, and `<German explanation + examples>`, as 0004 did;
- drop `decks.capture_context` and `components.kind`; require `module_type` and `module_instance_id`; keep the main key at position 0; limit components to 12 per page;
- an upgrade test from a populated 0007 database, like the 0004 test.

### 4. Backend (`src/core`, `src/server`)

Includes migration `0008` (above). The extension (increment 5) is merged into this branch so backend and extension land together, as 0.4.0's [#87](https://github.com/Guccimane44/Vocalbularium/pull/87) did.


- Capture and manual creation copy the deck's instances onto the page; capture fills the Context only when the deck has the Context module.
- Generation targets the page's content instances.
- Shaping operations, each an ordered operation with a receipt like every other mutation:
  - `POST /api/page/modules/add` with module type and position;
  - `POST /api/page/components/delete`, which rejects the main key and generating components;
  - `POST /api/page/components/move` with the target position, never above the main key.
- Concurrency: a save that targets a deleted component fails as deleted and keeps the user's draft (existing rule). Shaping a component that is generating is rejected like a save.
- OpenAPI regenerated; the API version stays `/api` (Q27 is not part of this milestone).

### 5. Extension (`extension/`)

- **Module window**, a shared React component: the right-hand panel listing Context, Text, and the three content modules, each with a one-line description. Items are disabled at the limit, and Context is disabled when already present. On narrow windows the panel moves below the content.
- **Drag and drop** with `@dnd-kit` (exact version pinned), chosen for its keyboard sensor and screen-reader announcements. Every drag also has a keyboard path: an **Add** button on each window item, and move up/down controls on each component.
- **Page view:** components as cards with a drag handle and a delete control (warning dialog, then immediate delete), "Not generated yet" cards with **Generate**, and **Edit page** for text editing. Shaping is unavailable while editing.
- **Deck settings:** the configuration list on the left with the main key pinned, the module window on the right, and the example previews kept. The Capture with Context toggle is removed.
- The upgrade clears cached decks, pages, drafts, and pending operations from extension storage, keeping sign-in, as the 0.4.0 upgrade did.

### 6. Verification and delivery (0.5.0)

- Unit and store tests for the domain rules, the shaping operations, generation targets, and limits.
- Browser E2E journeys:
  - build a deck in deck settings with drag and keyboard;
  - capture into it;
  - delete, move, and add on the page, then **Generate missing**;
  - check that a second installation sees the shaping in FIFO order and that a draft for a deleted component is kept;
  - keyboard-only shaping.
- An upgrade rehearsal on a restored copy of the development database, then the owner's backend upgrade.
- Version 0.5.0, scope ledger updated to `implemented`, the D02 record moved to Implemented, and owner acceptance recorded separately.

## Acceptance criteria

1. A new deck contains the main key module first; Context and Text can be added or removed; the 13th module cannot be added.
2. Capturing into a deck creates one component per deck instance; content components generate automatically.
3. Changing the deck afterwards changes no existing page.
4. On a page, deleting any component except the main key asks for confirmation and removes it immediately; **Generate missing** and **Retry page** do not recreate it.
5. Components can be reordered by drag and by keyboard; the main key cannot move; the order survives reloads and reaches a second installation.
6. Dragging a content module onto a page adds a "Not generated yet" component and starts no generation; dragging Text adds an empty text component; a second Context cannot be added.
7. Every drag interaction has a keyboard equivalent.
8. Upgrading discards decks and pages, keeps sign-in, and starts one fresh My Deck.

## Risks

- **Drag and drop accessibility:** mitigated by `@dnd-kit` and the explicit keyboard paths, verified in E2E.
- **Concurrent shaping across installations:** each shaping step is a small ordered operation, so FIFO and the existing deleted-component rule apply; covered by a two-installation E2E journey.
- **Contract break:** extension and backend must upgrade together, as in 0.4.0.
- **Test churn:** the page model change touches most store and browser tests; increments 2–4 update them as they go rather than at the end.

## Not in this milestone

The visual identity redesign; view modules other than the default view; moving or copying pages between decks; the interpretation line (Q30); rich-text blocks.
