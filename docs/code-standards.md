# Code standards

Every change keeps these rules. Each one says what fails when it is broken; **nothing** means only this text holds it, so take extra care there. Read this file, and [LESSONS.md](../LESSONS.md), before changing code; CLAUDE.md loads both into every session.

**Keep these tables true.** When the owner corrects a mistake, or a review keeps asking for the same thing, fix it and add its rule under its area here. A mistake found in merged work that the owner did not correct goes into [LESSONS.md](../LESSONS.md) first, and moves here once it is seen on a third separate day. If its rule is already here with **nothing** beside it, the mistake is a repeat: in the same change, enforce the rule at the highest level that works (a design that makes the mistake impossible, then types, then a lint or CI check whose message names the fix, then a test), and show the check failing on the past mistake. Keep prose only for judgment calls. Remove a rule once its mistake can no longer happen.

How to describe and review a change to a subsystem is in the [subsystem references](subsystems/README.md#describe-a-prs-change).

## Storage and the API

| Rule | Enforced by |
| --- | --- |
| Applied migrations never change; a schema change is a new migration (`npm run db:generate`). | nothing |
| Upgrades keep accounts, sign-in, decks and pages unless the owner decides otherwise. | `tests/upgrade.test.mjs`, `tests/browser/upgrade.test.mjs` |
| A mutation is idempotent by its operation ID. | `npm run check:sessions` in CI, for capture, publish and delete page in every order ([sessions skill](../.agents/skills/vocabularium-sessions/SKILL.md)); `npm run check:captures` in CI, for one capture across the extension and the store, through lost replies, retries and restarts ([captures skill](../.agents/skills/vocabularium-captures/SKILL.md)); replay tests in `tests/postgres.test.mjs`, `tests/decks.test.mjs`, `tests/server.test.mjs`; nothing makes a new mutation route take one |
| One browser session per installation ([sessions and recovery](subsystems/sessions-and-recovery.md#browser-sessions)). | `npm run check:sessions` in CI (an ended session changes nothing; none of its attempts stays loading); the store's `stale_session` check (`src/core/store-sessions.mjs`); `tests/foundation.test.mjs`, `tests/postgres.test.mjs`, `tests/browser/reliability.test.mjs` |
| A parent's header (its top line) is written by generation and never edited by the user. | the store rejects the edit; `tests/facets.test.mjs` |
| An API change regenerates `docs/api/openapi.json` (`npm run openapi`). | the OpenAPI step in `.github/workflows/verify.yml` |

## Generation and prompts

| Rule | Enforced by |
| --- | --- |
| Provider calls never run inside a database transaction or the ordered executor. | one test in `tests/postgres.test.mjs` (a waiting model call doesn't hold the executor); nothing for transactions |
| No generated content is cached, audio included. | nothing |
| A prompt change shows as a change to `tests/prompts/*.txt`. | `tests/prompts.test.mjs` (`UPDATE_PROMPTS=1` after a deliberate change) |
| A facet comes with its failure points, and its module's golden set fills each one (at least 3 items, one in the test split) before the facet merges ([golden folders](subsystems/quality-gate.md#golden-folders)). | for a module with a golden plan: the plan's type (a facet without points does not compile) and `tests/catalog.test.mjs` (every failure point filled); nothing for modules without a plan until v0.17.0 step 9 |

## Privacy

| Rule | Enforced by |
| --- | --- |
| A report's page and logs never leave this computer: its GitHub issue carries only the user's text, the screen, the module type and the builds ([D336](decisions/d336-report-a-problem.md)). | `tests/reports.test.mjs` (the issue `scripts/reports.mjs` writes names no page content and no logs) |

## Releases and merging

| Rule | Enforced by |
| --- | --- |
| Each release states its upgrade in its own file under [docs/releases](releases/README.md). | `scripts/package.py` refuses to package without `docs/releases/<version>.md` |
| Every PR that changes the extension comes with a ready-to-load build of its head for the owner to try, unzipped beside its ZIP (`npm run test-build`, [Change skill](../.agents/skills/vocabularium-change/SKILL.md#keep-github-useful)). | the Stop hook (`scripts/stop-hook.mjs`, wired in `.claude/settings.json`) stops a Claude Code session from ending while its branch's open PR changes `extension/` and has no test build of its head; nothing for other agents |
| Merge only when every check passes on a branch up to date with `main`. | the GitHub ruleset "main: verify must pass" |
| An agent never merges a PR; the owner does. | `.claude/settings.json` asks the owner before any `gh pr merge`; nothing for other agents |
| A browser test that fails at random is named, never passed over. | `scripts/browser-tests.mjs` reruns a failed file once and fails the run either way |
| The API and extension under discussion are the ones built from the code under discussion. | the version and commit on the homepage and login page; the account menu's warning when the two differ (`tests/extension.test.mjs`); `/health/live` and a failed second start name the running build (`tests/server.test.mjs`) |

## The repository

| Rule | Enforced by |
| --- | --- |
| Every project skill in `.agents/skills/` has a link in `.claude/skills/`, where Claude Code finds skills. | `scripts/check.mjs` in `npm run check` |
| Relative links and anchors in Markdown resolve. | `scripts/check-links.mjs` in `npm run check` |
| Decision files follow their naming, numbering and header rules ([decisions](decisions/README.md)). | `scripts/check-decisions.mjs` in `npm run check`; `scripts/check-decision-issues.mjs` in CI |
| A file, export, dependency, local or parameter goes once nothing uses it. | `knip` (unused files, exports and dependencies; a new entry point goes in `knip.json`) and the compiler's `noUnusedLocals` and `noUnusedParameters`, both in `npm run check`; nothing catches an unused field of an object or a constant copied between files |
| Ask the owner only when a wrong guess is costly; list every default under **Defaults taken** ([Change skill](../.agents/skills/vocabularium-change/SKILL.md#take-the-request-in)). | nothing (a judgment call) |

## Interface

Each rule is stated in one line; where it needs more, the linked section owns the full rule.

| Rule | Enforced by |
| --- | --- |
| No interface text in code: English strings are in `extension/locales/en/messages.json`, other languages beside them, a module's names in its folder ([interface language](subsystems/localisation.md#interface-language)). | `tests/localisation.test.mjs`; the `english-string` layout rule on every captured screen |
| Arabic mirrors the layout; generated content keeps its own direction, set on the content, never on the card. | `tests/browser/localisation.test.mjs`; the `rtl-mirror` layout rule (`tests/browser/layout-rules.test.mjs`) |
| Colours come from the theme's tokens. Saturated colour means a module family or a status, and a family colour always comes with a name or a text alternative ([visual identity](subsystems/interface.md#visual-identity)). | the `token-colour` layout rule, for colours outside the tokens; nothing for the meaning of a colour |
| Status is always a word, never colour alone. Completed work shows no status ([list states](subsystems/interface.md#list-state-presentation)). | nothing |
| Text of any length fits: a main key from one word to a passage, long module names, every interface language. | the `text-overflow` and `viewport-overflow` layout rules on every captured screen |
| Focus is always a visible 2 px ring, and every control is large enough to hit ([appearance](subsystems/interface.md#appearance)). | the `focus-visible` layout rule checks that a focused control has a ring, not its width; the `target-size` layout rule |
| Every drag also works from the keyboard (Space, the arrow keys, Space, Escape) and is announced to screen readers. | the drag tests in `tests/browser/`; nothing makes a new drag do it |
| Menus close after an action, on Escape, on navigation and on a click outside, and return the focus to their trigger. Confirmation dialogs never close on a timer ([dialogs](subsystems/interface.md#dialogs-menus-and-feedback)). | nothing |
| A row that holds a button is not itself one link: its text links, and the button sits beside it. | nothing |
| Things move by transform and opacity only, with the design system's durations; under reduced motion nothing moves ([motion](subsystems/interface.md#motion)). | nothing for new code |
| A move draws no flicker, jump or flash. A move that slides, adds, deletes or navigates joins the motion catalogue. | `tests/browser/motion.test.mjs`, checked frame by frame by `tests/browser/motion.mjs`, for the moves in its catalogue |
| No font or other asset is loaded from the network; the fonts are bundled. Reading text is never smaller than 16 px. | nothing |
| A changed screen is looked at before it merges, and its [screen reference](screens/README.md) changes with it. | the screens job fails on a changed screen until the PR is labelled `screens-changed` ([screens](guides/screens.md)); nothing for the screen page |

The layout rules run on every screen `npm run screens` captures; `tests/screens/rules/allowlist.mjs` lists what the current screens break today, so only something new fails.
