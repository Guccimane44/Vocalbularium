## Vocabulary

The [product model](docs/product/model.md) defines deck → page →
component, with content modules, view modules and the default view.
The earlier terms in its [terms table](docs/product/model.md#earlier-terms)
remain only in history, migrations and upgrade fixtures. Other meanings of “page” (web page,
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

- `module.ts`: ID, kind, label, description, instances, its core and ordered facets.
- `module.prompt.md`: the module's rule inside the shared rules (`composer/rules.md`); `rubric.md`: what the judge scores its cards on.
- `facets/core/`: `facet.ts` (shape, flags, formatter), `core.prompt.md`, `retry.prompt.md` (a facet's own Retry), `reading.prompt.md` (a card's Retry keeping its reading).
- `facets/<facet>/`: `facet.ts` (label, abbreviation, `applies`, `when`, `spoken`, shape, formatter, `checks`), `prompt.md`, `about*.json`, and optionally `sample-key.json` and `samples/`.
- `about.json` and `about.<language>.json`: its page's text; `names.<language>.json`: its names in the other interface languages; `samples/<language>.json`: its sample cards; optionally `sample-keys.json`.

Every module owns its facets; nothing is shared between modules, so German
Examples and Chinese Examples are separate folders. Each language gets the
facets its dictionary can offer. The contract names no facet: the catalog
alone decides (D25). The full rules are in the
[module catalog](docs/subsystems/module-catalog.md#catalog-layout).

**From capture to card:**

1. `extension/context-menu.js` and `capture.js` take the selection and its Context; `background-runtime.js` owns the browser session and the durable receipts (`save-operations.js`, `recovery.js`).
2. `src/server/routes.mjs` checks the payload against `packages/contracts` and calls the store.
3. The store (`src/core/store.mjs`, built from one concern per file: `store-sessions`, `store-decks`, `store-pages`, `store-generation`, `store-audio`, sharing `store-common`) commits the page and its components. Every mutation carries an operation ID whose receipt replays its first result.
4. `src/server/generation.mjs` runs each content module's attempt: the composer (`packages/domain/src/composer/compose.ts`) builds one request per module from its prompt files, `provider.mjs` and the adapter (`opencode.mjs`) call the model, `domain/generated.ts` checks the result against the module's shapes, and `domain/content.ts` formats it into stored markdown per facet. The store stages it, then publishes it into its component.
5. Spoken parts (`domain/spoken.ts`) become audio jobs (`src/server/audio.mjs`, `speech.mjs`, `elevenlabs.mjs`) stored per line by `store-audio`.
6. The extension's page (`page-view.tsx`, `card-content.tsx`, `shaping.tsx`, `facet-window.tsx`) renders through `domain/render.ts`. Module pages come from `about-sheet.tsx`, reading the generated `catalog/about.generated.ts`, because the extension cannot read files at run time.

**Where each kind of change goes, and what guards it:**

| Change | Where | Guarded by |
| --- | --- | --- |
| A module, facet or prompt | its catalog folder | `tests/catalog.test.mjs`, `tests/prompts.test.mjs` (`UPDATE_PROMPTS=1` after a deliberate change), `tests/localisation.test.mjs`, `tests/content-checks.test.mjs` (a facet's `checks`); live: `npm run gate -- <module>` (golden set, checks and the calibrated judge against the module's `rubric.md`) |
| Stored shape or API | `packages/contracts`, `migrations/`, `src/core/` | `tests/postgres.test.mjs`, `tests/upgrade.test.mjs`, `tests/server.test.mjs` |
| Generation, Retry, recovery | `src/server/generation.mjs`, `src/core/store-generation.mjs` | `tests/generation.test.mjs`, `tests/generation-recovery.test.mjs`, `tests/opencode.test.mjs`, `tests/browser/reliability.test.mjs` |
| A page, card or deck interaction | `extension/` | `tests/extension.test.mjs`, the journey files in `tests/browser/`, `npm run screens -- --base main` ([screens](docs/guides/screens.md)); a move that slides, adds, deletes or navigates joins the motion catalogue, `tests/browser/motion.test.mjs`, checked frame by frame by `tests/browser/motion.mjs` |
| Interface strings | `extension/locales/` | `tests/localisation.test.mjs`, `tests/browser/localisation.test.mjs` |

## Rules and what enforces them

Every change keeps these rules. The second column says what fails when a rule is broken; **nothing** means only this text holds it, so take extra care there. Rules for one area are moving into the [code standards](docs/code-standards.md), section by section.

| Rule | Enforced by |
| --- | --- |
| Applied migrations never change; a schema change is a new migration (`npm run db:generate`). | nothing |
| Upgrades keep accounts, sign-in, decks and pages unless the owner decides otherwise. | `tests/upgrade.test.mjs`, `tests/browser/upgrade.test.mjs` |
| Each release states its upgrade in its own file under [docs/releases](docs/releases/README.md). | `scripts/package.py` refuses to package without `docs/releases/<version>.md` |
| A mutation is idempotent by its operation ID. | `npm run check:sessions` in CI, for capture, publish and delete page in every order ([sessions skill](.agents/skills/vocabularium-sessions/SKILL.md)); replay tests in `tests/postgres.test.mjs`, `tests/decks.test.mjs`, `tests/server.test.mjs`; nothing makes a new mutation route take one |
| Provider calls never run inside a database transaction or the ordered executor. | one test in `tests/postgres.test.mjs` (a waiting model call doesn't hold the executor); nothing for transactions |
| One browser session per installation ([sessions and recovery](docs/subsystems/sessions-and-recovery.md#browser-sessions)). | `npm run check:sessions` in CI (an ended session changes nothing; none of its attempts stays loading); the store's `stale_session` check (`src/core/store-sessions.mjs`); `tests/foundation.test.mjs`, `tests/postgres.test.mjs`, `tests/browser/reliability.test.mjs` |
| A parent's header (its top line) is written by generation and never edited by the user. | the store rejects the edit; `tests/facets.test.mjs` |
| No generated content is cached, audio included. | nothing |
| A prompt change shows as a change to `tests/prompts/*.txt`. | `tests/prompts.test.mjs` (`UPDATE_PROMPTS=1` after a deliberate change) |
| An API change regenerates `docs/api/openapi.json` (`npm run openapi`). | the OpenAPI step in `.github/workflows/verify.yml` |
| The interface rules: strings, mirroring, colour, focus, motion, dialogs and screens. | [code standards, Interface](docs/code-standards.md#interface) |
| Merge only when every check passes on a branch up to date with `main`. | the GitHub ruleset "main: verify must pass" |
| A browser test that fails at random is named, never passed over. | `scripts/browser-tests.mjs` reruns a failed file once and fails the run either way |
| The API and extension under discussion are the ones built from the code under discussion. | the version and commit on the homepage and login page; the account menu's warning when the two differ (`tests/extension.test.mjs`); `/health/live` and a failed second start name the running build (`tests/server.test.mjs`) |
| Relative links and anchors in Markdown resolve. | `scripts/check-links.mjs` in `npm run check` |
| Decision files follow their naming, numbering and header rules ([decisions](docs/decisions/README.md)). | `scripts/check-decisions.mjs` in `npm run check`; `scripts/check-decision-issues.mjs` in CI |
| Ask the owner only when a wrong guess is costly; list every default under **Defaults taken** ([Change skill](.agents/skills/vocabularium-change/SKILL.md#take-the-request-in)). | nothing (a judgment call) |
| A report's page and logs never leave this computer: its GitHub issue carries only the user's text, the screen, the module type and the builds ([D336](docs/decisions/d336-report-a-problem.md)). | `tests/reports.test.mjs` (the issue `scripts/reports.mjs` writes names no page content and no logs) |
| A file, export, dependency, local or parameter goes once nothing uses it. | `knip` (unused files, exports and dependencies; a new entry point goes in `knip.json`) and the compiler's `noUnusedLocals` and `noUnusedParameters`, both in `npm run check`; nothing catches an unused field of an object or a constant copied between files |

**Keep this table true.** When the owner corrects a mistake, or a review keeps asking for the same thing, fix it and add its rule here, or under its area in the code standards. A mistake found in merged work that the owner did not correct goes into [LESSONS.md](LESSONS.md) first; it moves here once it is seen on a third day. If its rule is already here with **nothing** beside it, the mistake is a repeat: in the same change, enforce the rule at the highest level that works (a design that makes the mistake impossible, then types, then a lint or CI check whose message names the fix, then a test), and show the check failing on the past mistake. Keep prose only for judgment calls. Remove a rule once its mistake can no longer happen.

## Before you change code

- Read the [subsystem reference](docs/subsystems/README.md) for the area you are changing, and the [screen reference](docs/screens/README.md) for each screen you change, then follow their source links. Screens without a page yet are still described in `docs/specs/`.
- Read [LESSONS.md](LESSONS.md) and the [code standards](docs/code-standards.md).
- A PR updates the pages it makes untrue, and describes its change per subsystem ([how](docs/subsystems/README.md#describe-a-prs-change)).

## Reusable workflows

Use the project skills relevant to the task:

- [Vocabularium Change](.agents/skills/vocabularium-change/SKILL.md): take a request in, scope the increment, and keep issues and PRs current.
- [Vocabularium Verify](.agents/skills/vocabularium-verify/SKILL.md): choose regression checks, investigate failures, and record evidence.
- [Vocabularium Deliver](.agents/skills/vocabularium-deliver/SKILL.md): package a candidate, validate its ZIP, and prepare the owner handoff.
- [Vocabularium Drive](.agents/skills/vocabularium-drive/SKILL.md): run the real extension and API on a disposable account, drive a feature the way a user does, and keep screenshots and database rows as evidence; its [feature map](.agents/skills/vocabularium-drive/features/README.md) says what a user can do.
- [Vocabularium Sessions](.agents/skills/vocabularium-sessions/SKILL.md): check the store's session and receipt promises on every order of operations, and extend the check when a change touches them.

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
A decision's ID is its GitHub issue number: its file is
`docs/decisions/d<issue>-<short-name>.md`, or `d-draft-<slug>.md` until the
issue exists; D01–D36 keep their names.

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
