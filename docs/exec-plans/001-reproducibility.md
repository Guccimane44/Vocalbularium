# 001 — Make development commands reproducible

Version: 2 | Status: Complete | Owner: Primary migration agent
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (record new start SHA)
Depends on: 000

## Purpose and preservation contract

A clean checkout should install and verify with an explicit toolchain and clear
failures. Preserve B01–B14, all dependency versions, the package layout and build
artifact contract. No package-manager migration, framework upgrade, dependency
pruning, app rewrites, native distribution setup or live credentials.

## Allowed scope and prerequisites

Root/web package script metadata, runtime pin file, `scripts/`, setup docs, and
focused tool tests. Preserve the web lockfile except mechanically required root
metadata alignment. Use Node 22.21.0/npm 10.9.4 as the candidate already observed,
not a claim they are permanently preferred or supported on all platforms.

## Execution steps

1. Record starting SHA and establish a single exact Node pin (e.g. `.node-version`)
   and npm `packageManager` metadata. Verify compatibility with the pinned
   `node:sqlite` tests; fail early on unsupported/mismatched tools with remediation.
2. Add a read-only **proposed** `npm run doctor`: check versions, expected lockfile,
   manifests, tools and local configuration shape. Report native tools separately
   as optional/unavailable, and never print environment values or contact services.
3. Keep `npm run setup` delegating to web `npm ci`. Document optional online
   package fetching and network failure distinctly from application failure.
   Do not install globally or repair toolchains silently.
4. Add **proposed** `npm run verify:fast` for existing tests, typecheck and JS syntax;
   add **proposed** `npm run verify` for fast checks plus build/staging. Propagate
   every subprocess failure. Keep known-red lint reported separately until 005.
5. Write clean-checkout setup→local migration→dev→verify instructions, state and
   output paths, offline cache requirements, and environment-variable consumers.
   Mark `CRON_SECRET` dormant; provider keys are not prerequisites for fixtures.
6. Reproduce on a disposable checkout with no local env/state/build/dependencies.
   Verify the documented dev command returns a successful local HTTP response;
   preserve the preview plugin. Later browser assertions belong to 003.
   This is an interim single-run bootstrap check; parallel launch/reset isolation
   is not claimed until 002. Use a sanitized fixture environment without live keys.

## Validation and acceptance

- Existing commands: `npm run setup`, `npm test`, `npm run typecheck`,
  `npm run build`; all pass under the pin and the lockfile does not drift.
- Proposed doctor/verification commands exist, match docs and pass from root.
- Inject missing runtime/dependency/manifest conditions in disposable copies;
  doctor exits nonzero with actionable text. Deliberately failing a child check
  must make the aggregate command fail, not continue to apparent success.
- Fresh run records OS, Node/npm, starting SHA, install cache/network state,
  commands and outcomes. Test a supported CI OS as well as the observed macOS
  setup before claiming cross-platform reproducibility.
- No live provider, hosted write or existing personal D1 state is needed.
- Independent reviewer reproduces from the instructions without hidden shell
  variables. Scoped tools do not launch native tests when the SDK is absent.

## Risks and rollback

Pins can overconstrain another platform; record the supported environment and
test it before expansion. Command wrappers must not hide errors. Revert script/
metadata/docs changes to roll back. No database/schema rollback is involved.
Never run `npm ci` over another agent's active dependency directory.

## Decisions and independent review

Accepted audit challenges F02/F10: use the already-tested pair first; document
dormant config. The audit's cached install is a starting result, not completion
of these new command/CI gates. Independent execution review completed 2026-09-06:
reviewer found and verified fixes for symlink entry no-op, non-executable tool
paths, contradictory pins and malformed configuration shapes. CLI regression
tests now cover those failures and actual child exit propagation.

## Execution record

- Starting commit/environment: `4188dfc`; 2026-09-06, macOS, Node 22.21.0/npm 10.9.4.
- Commands/results/evidence: `npm run doctor` 52/52; tooling tests 7/7; root
  `npm run verify` passed (31 application tests, types, syntax, build/staging).
  Independent reviewer reran doctor/tooling tests and accepted fixes.
- Fresh source export plus new tooling: offline cached `npm run setup` installed
  571 packages; final `npm run verify` passed in `/private/tmp/vocab-plan001.IY96cJ`.
  No personal env/state copied. Local migration applied seven SQL commands;
  sanitized dev server returned HTTP 200 at its printed localhost:4311 origin.
  Preview stopped afterward. Loopback checks required sandbox escalation.
- Lockfile SHA-1 remained `bba15a073d80a015757d7f645d9af8f22c91fa33`; application
  source, schema and hosting manifests unchanged. No deployment or live services.
- Deviations/limits: macOS only; no cross-platform claim or CI execution yet.
  Cached install is not empty-cache/hermetic proof. Direct application scripts
  remain available; aggregate verification and setup enforce the exact toolchain.
- Completion: 001 complete. Parallel/profile isolation and additional runtime
  checks remain in 002/003; lint debt remains explicit until 005.
