---
name: vocabularium-verify
description: "Select and run Vocabularium regression checks, investigate CI failures, and record evidence for an incremental change. Use for testing or verification of this repository; live provider and hosted checks apply only when that testing is authorized."
---

# Vocabularium Verify

Verify the changed behavior and its affected invariants. Run from the Vocabularium repository root. Read `AGENTS.md`, `package.json`, and the relevant specification before selecting checks. The current Node requirement is in `package.json`; use that runtime, including for commands launched by npm, rather than assuming the system Node is suitable.

## Select checks

The commands below already exist. Confirm them against the checkout when using this skill; record actual counts rather than copying an earlier run.

| Changed area | Starting point |
| --- | --- |
| Documents or skill instructions | `npm run check`, changed links, and any applicable skill validation; no product browser run solely for prose |
| Account, store, modules, generation, decks, cards | Relevant files in `tests/`; `npm test` for shared logic or a complete backend regression pass |
| Extension interactions or browser lifetime | Relevant scenarios in `tests/app.browser.test.mjs`; `npm run test:browser` for the complete product and foundation browser suite |
| Build/package | `npm run build`, `python3 scripts/package.py`, and verification of the resulting archive; see `$vocabularium-deliver` |

Use `npm ci` when dependencies need installing or the lockfile changed. Install Playwright Chromium when missing. Browser tests use isolated profiles, their own servers on ports 4317/4318, and temporary data. Check for port conflicts; do not terminate an unrelated user server to make a test pass. Test only the changed behavior first, then broaden when shared invariants, failures, or required CI justify it.

Use the behavioral rules in `docs/MVP-Product-spec-select-and-add.md` for capture, interruption, page completion, retry, and save recovery. For store changes, check the affected ordering, replay, page identity, and cross-installation behavior. Add a regression scenario for a meaningful bug or new behavior, not a test that merely mirrors changed wording or implementation.

## Diagnose failures

Read the failing assertion and logs before rerunning. Distinguish a product regression, environment failure, and a test that observes the wrong state. The reliability scenario intentionally controls worker wake sources and waits for successful publication receipts to clear; preserve what those assertions prove. Do not remove lifecycle evidence or extend timeouts just to obtain green CI.

If a transient infrastructure/timing failure is supported by evidence, retry the failed job once. A repeated identical failure needs investigation or an explicit blocker. Wait for checks on the actual PR head; green checks for a predecessor do not verify later edits. Stop broad reruns after the relevant checks pass unless new changes or unresolved concerns justify them.

## Live checks are a separate mode

Read `docs/M6-Delivery.md#hosted-verification` and the smoke scripts first. Confirm the target and the task/session's existing authorization: these commands can spend provider usage and mutate the shared test account. Do not infer that a generic request to run regressions includes live writes.

- `npm run smoke:generation` uses the server's configured provider and key. Inspect synthetic outputs for the changed behavior; a small sample is not systematic quality evaluation.
- `VOCABULARIUM_API_URL=<agreed-origin> npm run smoke:hosted` creates sample captures and exercises saves, retries, and a temporary configuration deck. It currently expects the initial default-deck layout. If the shared layout has changed, adapt the fixture or arrange an isolated test account rather than resetting user data.
- Build for that same origin before `npm run smoke:hosted:browser`; it expects generated samples from the API smoke. Set `VOCABULARIUM_TEST_EXTENSION` when checking an extracted ZIP. It creates and removes a manual test card in two real extension profiles.

Keep secrets out of command output and evidence. Use the ignored environment file/backend secret settings; never print the file. Honor existing authorization without repeatedly asking for the same connection. On a live failure, retain the evidence and diagnose before resubmitting operations or making more model calls.

## Record evidence

Report the revision, changed behavior, commands/scenarios, result, and relevant environment. Keep controlled local tests, live provider samples, hosted synchronization, archive verification, and native Windows checks distinct. Use `docs/M5-Acceptance.md` for its existing MVP criteria and the current issue/PR for the increment. Read current limitations; do not copy stale pending gates forward or mark unperformed checks passed.

Review any new `docs/evidence/` artifact before committing it. Prefer synthetic examples without account/session identifiers or credentials. Link the current CI run and describe remaining acceptance in plain language.
