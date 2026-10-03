---
name: vocabularium-verify
description: "Select and run Vocabularium regression checks, investigate CI failures, and record evidence for an incremental change. Use for testing or verification of this repository; live provider and hosted checks apply only when that testing is authorized."
---

# Vocabularium Verify

Verify the changed behavior and its affected invariants. Run from the Vocabularium repository root. Read `AGENTS.md`, `package.json`, and the relevant specification before selecting checks. The current Node requirement is in `package.json`; use that runtime, including for commands launched by npm, rather than assuming the system Node is suitable.

## Prepare the test environment

Database and browser suites require PostgreSQL 18. Follow the [local setup and disposable-database instructions](../../../docs/architecture/local-postgresql.md#verification-and-disposable-databases), and inspect `tests/helpers/database.mjs` when diagnosing fixture failures. npm test commands load ignored `.env.postgres` when present; CI supplies `TEST_DATABASE_ADMIN_URL`. The configured test role must be able to create disposable databases and have the fixture permissions described in the setup guide. Its connection must target the loopback `postgres` maintenance database, never the development account database. Fixtures apply migrations to uniquely named databases and remove only their own databases during cleanup; do not substitute a broad reset or run tests against owner data.

Use `npm ci` when dependencies need installing or the lockfile changed. Install Playwright Chromium when missing. Browser tests use isolated Chrome profiles and their own servers on ports 4317/4318. Check for listener conflicts; do not terminate an unrelated user server to make a test pass. The npm test hooks build workspace packages, and `test:browser` also builds the extension. Before running a test file directly, build the required packages/extension and load the same test environment, for example with Node's `--env-file-if-exists=.env.postgres` option.

## Select checks

The commands below already exist. Confirm them against the checkout when using this skill; record actual counts rather than copying an earlier run.

| Changed area | Starting point |
| --- | --- |
| Documents or skill instructions | `npm run check`, changed links, and any applicable skill validation; no product browser run solely for prose |
| Account, store, modules, generation, decks, kartes | Relevant files in `tests/`; `npm test` for shared logic or a complete backend regression pass |
| PostgreSQL, migrations, operation ordering, recovery journal | Relevant scenarios in `tests/postgres.test.mjs` and related store/generation tests; use the local guide for backup/restore rehearsals when those operations are in scope |
| Bounded lists, sorting, read routes, cursors | `tests/reads.test.mjs` and the affected browser list scenarios |
| Terminology and upgrade compatibility | `tests/terminology.test.mjs`, `tests/extension.test.mjs`, and the legacy recovery/navigation scenario in `tests/app.browser.test.mjs` |
| Extension interactions or browser lifetime | Relevant scenarios in `tests/app.browser.test.mjs`; `npm run test:browser` for the complete product and foundation browser suite |
| Build/package | `npm run build`, `python3 scripts/package.py`, and verification of the resulting archive; see `$vocabularium-deliver` |

Test the changed behavior first, then broaden when shared invariants, failures, or required CI justify it. For changes spanning UI, storage, or extension/backend boundaries, exercise the affected user journey through the existing browser harness or an appropriate browser smoke check. Unit tests alone do not verify an integrated flow. Local product browser tests use the real extension, API, and disposable PostgreSQL databases with controlled generation providers; identify those substitutes and any uncovered behavior. A browser smoke check is distinct from automated E2E regression coverage.

Use [current scope](../../../docs/product/scope.md) to separate supported behavior from accepted requirements awaiting implementation. Use [Select and Add](../../../docs/MVP-Product-spec-select-and-add.md) for capture, interruption, seite completion, retry, and save recovery, and the [compatibility policy](../../../docs/architecture/terminology-compatibility.md) for upgrades. For store changes, check the affected ordering, replay, seite identity, and cross-installation behavior. Add a regression scenario for a meaningful bug or new behavior, not a test that merely mirrors changed wording or implementation.

Read `.github/workflows/verify.yml` for required CI. Database/browser suites currently run on Linux with PostgreSQL; Windows and Linux foundation jobs cover syntax/type checks, extension-worker checks, building, and packaging. Green Windows packaging does not establish native Windows PostgreSQL/browser behavior.

## Diagnose failures

Read the failing assertion and logs before rerunning. Distinguish a product regression, environment failure, and a test that observes the wrong state. The reliability scenario intentionally controls worker wake sources and waits for successful publication receipts to clear; preserve what those assertions prove. Do not remove lifecycle evidence or extend timeouts just to obtain green CI.

If a transient infrastructure/timing failure is supported by evidence, retry the failed job once. A repeated identical failure needs investigation or an explicit blocker. Wait for checks on the actual PR head; green checks for a predecessor do not verify later edits. Stop broad reruns after the relevant checks pass unless new changes or unresolved concerns justify them.

## Live checks are a separate mode

Inspect the smoke scripts and the target's current source/API revision first. The [local PostgreSQL guide](../../../docs/architecture/local-postgresql.md#keep-the-old-installation-separate) separates the current backend from the historical hosted MVP; the hosted procedures in `docs/history/mvp/M6-Delivery.md` are historical context, not proof that a current extension/script works with that old deployment. Confirm compatibility, the agreed target, and the task/session's existing authorization: live generation spends provider usage and hosted checks mutate an account. Do not infer that a generic request to run regressions includes live writes.

- `npm run smoke:generation` loads `.env` and calls `OpenCodeProvider` directly, without exercising the API, database, or extension. Inspect synthetic outputs for the changed behavior; a small sample is not systematic quality evaluation.
- `VOCABULARIUM_API_URL=<agreed-origin> npm run smoke:hosted` creates sample captures and exercises saves, retries, and a temporary configuration deck. It currently expects the initial default-deck layout. If the shared layout has changed, adapt the fixture or arrange an isolated test account rather than resetting user data.
- Build for that same origin before `npm run smoke:hosted:browser`; its default mode expects generated samples from the API smoke. `VOCABULARIUM_HOSTED_CHECK=interface` selects a mode that creates its own temporary deck and manual karte, checks appearance and cross-installation editing, and removes its data without requesting generation or requiring the initial default layout. Both modes require an HTTPS origin and a compatible backend. Set `VOCABULARIUM_TEST_EXTENSION` when checking an extracted ZIP.

Keep secrets out of command output and evidence. Use the ignored environment file/backend secret settings; never print the file. Honor existing authorization without repeatedly asking for the same connection. On a live failure, retain the evidence and diagnose before resubmitting operations or making more model calls.

## Record evidence

When verification serves a tracked milestone or acceptance gate, consult its Notion completion criteria using the [project workflow](../../../docs/guides/project-workflow.md), alongside the relevant repository specification. Within the user's tracking authorization, update the existing milestone with a concise result and links to detailed evidence: revision, exercised journey, real/mocked dependencies, and remaining gaps. Preserve the distinction between automated regression, browser smoke, deployment, and owner acceptance. Routine checks need no new Notion entry; if the connector is unavailable, include the proposed update as pending in the handoff.

Report the revision, changed behavior, commands/scenarios, result, relevant environment, real/mocked dependencies, and remaining coverage gaps. Keep controlled local tests, browser smoke checks, live provider samples, hosted synchronization, archive verification, and native Windows checks distinct. Use the current issue/PR and relevant acceptance specification for the increment; `docs/history/mvp/M5-Acceptance.md` supplies historical MVP criteria only where still applicable. Read current limitations; do not copy stale pending gates forward or mark unperformed checks passed.

Review any new `docs/history/evidence/` artifact before committing it. Prefer synthetic examples without account/session identifiers or credentials. Link the current CI run and describe remaining acceptance in plain language.
