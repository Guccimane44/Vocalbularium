## Vocabulary

The [product model](docs/product/model.md) defines deck → page →
component, with content modules, view modules and the default view.
Karte and seite are earlier terms; they remain only in history,
migrations and upgrade fixtures. Other meanings of “page” (web page,
pagination) stay unchanged.

## Architecture map

Vocabularium is a Chrome extension (`extension/`) talking to a local,
single-account Fastify API (`src/server/`) over loopback, with PostgreSQL 18
behind it (`src/persistence/`, `migrations/`). Two workspace packages hold
what both sides share: `packages/contracts` (TypeBox schemas for every API
payload) and `packages/domain` (rules, the module catalog, the prompt
composer, rendering). Build them with `npm run build:packages`; the
extension and the server import their `dist/`.

**A module** lives in one folder of the catalog,
`packages/domain/src/catalog/<family>/<module>/`, and is registered with one
import and one entry in `catalog/index.ts`. Its folder holds:

- `module.ts`: ID, kind, label, description, instances, provider kind, its core and ordered facets.
- `module.prompt.md`: the module's rule inside the shared rules (`composer/rules.md`).
- `facets/core/`: `facet.ts` (shape, flags, formatter), `core.prompt.md`, `retry.prompt.md` (a facet's own Retry), `reading.prompt.md` (a card's Retry keeping its reading).
- `facets/<facet>/`: `facet.ts` (label, abbreviation, `applies`, `when`, `spoken`, shape, formatter), `prompt.md`, `about*.json`, and optionally `sample-key.json` and `samples/`.
- `about.json` and `about.<language>.json`: its page's text; `names.<language>.json`: its names in the other interface languages; `samples/<language>.json`: its sample cards; optionally `sample-keys.json`.

Every module owns its facets; nothing is shared between modules, so German
Examples and Chinese Examples are separate folders. Each language gets the
facets its dictionary can offer. The contract names no facet: the catalog
alone decides (D25). The full rules are in the
[generation architecture](docs/architecture/generation.md#module-catalog).

**From capture to card:**

1. `extension/context-menu.js` and `capture.js` take the selection and its Context; `background-runtime.js` owns the browser session and the durable receipts (`save-operations.js`, `recovery.js`).
2. `src/server/routes.mjs` checks the payload against `packages/contracts` and calls the store.
3. The store (`src/core/store.mjs`, built from one concern per file: `store-sessions`, `store-decks`, `store-pages`, `store-generation`, `store-audio`, sharing `store-common`) commits the page and its components. Every mutation carries an operation ID whose receipt replays its first result.
4. `src/server/generation.mjs` runs each content module's attempt: the composer (`packages/domain/src/composer/compose.ts`) builds one request per module from its prompt files, `provider.mjs` and the adapter (`opencode.mjs`) call the model, `domain/generated.ts` checks the result against the module's shapes, and `domain/content.ts` formats it into stored markdown per facet. The store stages it, then publishes it into its component.
5. Spoken parts (`domain/spoken.ts`) become audio jobs (`src/server/audio.mjs`, `speech.mjs`, `elevenlabs.mjs`) stored per line by `store-audio`.
6. The extension's page (`page-view.tsx`, `card-content.tsx`, `shaping.tsx`, `facet-window.tsx`) renders through `domain/render.ts`. Module pages come from `about-sheet.tsx`, reading the generated `catalog/about.generated.ts`, because the extension cannot read files at run time.

**Invariants every change keeps:**

- Applied migrations never change; a schema change is a new migration (`npm run db:generate`). Upgrades keep accounts, sign-in, decks and pages unless the owner decides otherwise, and each release states its upgrade in [scope](docs/product/scope.md#upgrade-from-earlier-builds).
- A mutation is idempotent by its operation ID. Provider calls never run inside a database transaction or the ordered executor.
- One browser session per installation: an older epoch or another session ID is `stale_session`.
- A parent's header (its top line) is written by generation and never edited by the user.
- No interface text in code: English strings in `extension/locales/en/messages.json`, other languages beside them, a module's names in its folder. Arabic mirrors the layout.
- No generated content is cached; a prompt change shows as a change to `tests/prompts/*.txt`.
- An API change regenerates `docs/api/openapi.json` (`npm run openapi`); CI fails on drift.

**Where each kind of change goes, and what guards it:**

| Change | Where | Guarded by |
| --- | --- | --- |
| A module, facet or prompt | its catalog folder | `tests/catalog.test.mjs`, `tests/prompts.test.mjs` (`UPDATE_PROMPTS=1` after a deliberate change), `tests/localisation.test.mjs`, golden sets (`npm run smoke:generation`, live) |
| Stored shape or API | `packages/contracts`, `migrations/`, `src/core/` | `tests/postgres.test.mjs`, `tests/upgrade.test.mjs`, `tests/server.test.mjs` |
| Generation, Retry, recovery | `src/server/generation.mjs`, `src/core/store-generation.mjs` | `tests/generation.test.mjs`, `tests/browser/reliability.test.mjs` |
| A page, card or deck interaction | `extension/` | `tests/extension.test.mjs`, the journey files in `tests/browser/` |
| Interface strings | `extension/locales/` | `tests/localisation.test.mjs`, `tests/browser/localisation.test.mjs` |

## Reusable workflows

Use the project skills relevant to the task:

- [Vocabularium Change](.agents/skills/vocabularium-change/SKILL.md): take a request in, scope the increment, and keep issues and PRs current.
- [Vocabularium Verify](.agents/skills/vocabularium-verify/SKILL.md): choose regression checks, investigate failures, and record evidence.
- [Vocabularium Deliver](.agents/skills/vocabularium-deliver/SKILL.md): package a candidate, validate its ZIP, and prepare the owner handoff.

A task may need more than one skill; use Deliver when packaging
or delivery is part of the request.

The skills reuse the current specifications, commands, and deployment records. Update those sources when behavior or tooling changes; keep historical results and temporary environment details out of the reusable instructions.

## Project context and Notion

[Vocabularium in Notion](https://app.notion.com/p/3e3bb1350208800f9b5ad907c80156d2)
holds milestone outcomes, decision history, and reusable Q&As. Repository
documents define versioned product behavior and technical constraints;
GitHub issues, PRs, CI, and release records hold implementation and delivery evidence.
The [project workflow](docs/guides/project-workflow.md) says when to consult
and update each, and when a change needs a decision of its own.

Check approval, revision, environment, and completion scope before relying
on a status. If Notion is unavailable, continue work that does not depend on
missing decisions and report any proposed record update as pending.

## Verification

Choose checks that can detect the failure the change could cause.
For changes spanning UI, storage, or extension/backend boundaries,
verify the affected user journey using the existing E2E harness
or a browser smoke test in the approved test environment.

Unit tests alone do not establish that an integrated flow works.
Report what was exercised, which dependencies were mocked, and
what remains unverified. Distinguish browser smoke checks from
automated E2E regression coverage.
