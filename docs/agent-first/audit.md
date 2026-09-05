# Agent-first migration audit

Version 1, 2026-09-05. Baseline commit:
`a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (single implementation commit).
Audit branch: `codex/agent-first-migration`; starting checkout was clean on `main`.

## Assessment

The MVP has meaningful domain boundaries, exact dependency versions and a web
lockfile, 31 tests, and unusually candid implementation notes. Preserve these.
Its main weakness for autonomous maintenance is the gap between a working local
implementation and a repeatable, inspectable change process: uncertain command
coverage, untested runtime/client seams, shared state hazards, and no enforced
repository checks. Large source files are navigation risks, not evidence that a
rewrite is the next useful step.

“Agent-first” here means an unfamiliar agent can locate the relevant code,
reproduce the environment, demonstrate behavior, work without contaminating other
runs, and receive actionable mechanical failures. It does not require a new agent
framework, generated architecture, or application redesign.

This change adds knowledge, lightweight agent guidance, and versioned execution
plans. Plans 001–006 are designed work, not implemented guardrails. Application
source, dependencies, schema, hosting manifests, and product behavior stay intact.

## Fresh verification

Environment: macOS, Node `v22.21.0`, npm `10.9.4`; Xcode developer directory is
`/Library/Developer/CommandLineTools`. Existing dependencies were checked first.
Then the exact baseline commit was exported with `git archive` into a disposable
directory, without ignored dependencies, environment files, builds, or databases.
`npm ci --offline` installed 571 packages from the machine's existing npm cache.
This proves a fresh source/dependency installation with that cache and platform;
it does not prove empty-cache network installation, another OS, or hermetic builds.

| Check | Fresh result | Scope / limitation |
| --- | --- | --- |
| `npm test` | PASS, 31/31 in original and disposable checkout | 22 domain/persistence/review, four auth, three Chrome simulations, two mocked provider tests. |
| `npm run typecheck` | PASS in both checkouts | Web TypeScript only. |
| `npm run build` | PASS in both checkouts, including root staging | Vite warns about JSON import compatibility with a future native config loader; Vinext leaves `/` unclassified. No deployment. |
| `npm --prefix apps/web run lint` | FAIL, 118 errors | Existing debt, not introduced by this documentation change. |
| Bounded `oxfmt --check` | FAIL, 18 of 82 inspected files | Existing formatting debt. Exact scope below. |
| `node --check` for Chrome background/popup and web service worker | PASS | Syntax only. |
| `swiftc -frontend -parse` on four Swift sources | PASS | Full Xcode unavailable; no SDK compilation. |
| Local D1 migration in disposable checkout | PASS; 0000 applied (seven SQL commands); second invocation reported no migrations to apply | Initial sandbox run could not open loopback; an authorized local-only retry passed. No personal or hosted database was used. |
| HTTP/browser/live integrations | NOT RUN | Must not infer runtime behavior from build or simulations. |

Formatter scope, from `apps/web`: `./node_modules/.bin/oxfmt --check app lib
tests vite.config.ts next.config.ts drizzle.config.ts db hooks components/ui`.
Affected files: route, globals, layout, page, schema, all eight `lib/*.ts` files,
and all five test/helper files. No formatter wrote changes. Lint's largest rule
groups include 31 floating promises, 15 label/control associations, 13 explicit
`any`, 13 semantic-tag preferences, and ten base-to-string diagnostics. Counts
describe this baseline, not a sufficient future ratchet key. Some debt is semantic
or accessibility-related and must not be “fixed” by blanket suppression.

The offline install printed an audit summary; it is not a fresh advisory scan.
The older dependency advisory statement in implementation status was not reverified.

## Findings and migration ownership

| ID / priority | Evidence | Decision / plan |
| --- | --- | --- |
| F01 / high | No tracked root agent guide, plan lifecycle, CI workflow or aggregate verification command at baseline. README delegates tests to web without machine-readable check scope. | Seed guidance now (000); reproducibility 001, fuller agent workflow 004, enforcement 005. |
| F02 / high | `package.json:13` and web manifest specify only Node `>=22.13.0`; no npm/runtime pin. Lockfile/exact dependencies do exist. | Pin the tested baseline before considering upgrades; exercise clean setup and missing-prerequisite errors (001). |
| F03 / high | Four test files, no actual Cloudflare Worker/HTTP or browser-client/UI lane; Chrome background source does run in a VM simulation. `tests/helpers.ts:6–11` executes only migration 0000 through `node:sqlite`. | Ordered migrations + actual Worker/D1 + browser characterization (003), after isolation. |
| F04 / high | D01 browser queue ordering, D02 key-order-sensitive receipts, D03 Chrome transient HTTP failures. | Explicit defect register and reproducers; separate fixes, no silent product changes (003). |
| F05 / high | Both hosting manifests reference one Site; browser fixed origin-local DB name, Chrome profile storage, fixed iOS App Group/Keychain service. | Isolation covers all state surfaces, not only Git branches (002). |
| F06 / high | `.env*` and `.wrangler` ignored, `.dev.vars` / `.dev.vars.*` are not; path inspection found no tracked files of those secret-bearing types. | Add ignore coverage and fail-closed secret/state artifact checks (002,005); no credential values were read. |
| F07 / medium | Lint fails; no root lint wrapper/CI. Formatter differs in 18 files. | Baseline stable diagnostics then reject new violations; reduce deliberately, never mass-format to pass (005). |
| F08 / medium | Browser intentionally imports domain for optimistic mutations; auth/store/provider runtime are separate files. | Enforce current server boundary transitively, allow shared domain and erased type imports; no “all lib is server” rule (005). |
| F09 / medium | Root staging checks equal manifests but does not constitute artifact validation, migration immutability, or secret checks. | Check required staged files, migration consistency, generated-output exclusions (005). |
| F10 / medium | `CRON_SECRET` appears in env example/runtime type but is not consumed; job route authenticates sessions. | Document dormant setting; do not claim an autonomous scheduler or cron authorization path (001,004). |
| F11 / deferred | Full native/live-provider/accessibility acceptance and scale work remain in implementation status. | Keep release gates separate from repository foundation completion. |

## Independent challenges and decisions

Three independent read-only agents reviewed source before seeing a migration draft.
The primary audit also ran baseline checks and inspected key runtime paths.

| Reviewer role | Challenge to an optimistic assessment | Disposition |
| --- | --- | --- |
| Behavior audit | Passing domain tests do not prove offline causal delivery or cross-client retries; property-order retry probe returned 409. | Accepted: D01/D02, preservation ledger, actual client/runtime tests before changes. Native impact remains labeled inference. |
| Reproducibility/isolation audit | A passing build is not a repeatable toolchain; global lint is already red; Wrangler secret-file names are not ignored. | Accepted: clean archive install evidence, toolchain plan, diagnostic ratchet, secret path guard. |
| Legibility challenge | Existing documentation is mostly candid; new architecture would solve the wrong problem. Worktrees still share remote Site identity; Chrome retry claims are too broad. | Accepted: map/authority first, separate hosted authority, D03. |
| Legibility challenge | Blanket client/domain import bans would force redesign. | Accepted: preserve shared domain; protect only server runtime/value dependency paths. |

Draft-review decisions and final validation are recorded in
[plan 000](../exec-plans/000-baseline.md). Repository-wide “agent readiness” remains
unclaimed until the later plans demonstrate their gates.

## Reproduction notes

Use a disposable export or worktree, retain the exact baseline SHA and tool
versions, install from `apps/web/package-lock.json`, then run root test/typecheck/
build. Do not reuse a personal local D1 database for destructive acceptance tests.
The original audit used `/private/tmp/vocabularium-audit.f1xsKH`; that directory is
temporary evidence, not a required path or durable dependency. No hosted service
was accessed, no live configuration was inspected, and no deployment was made.

## Completion addendum

The disposable database accepted the initial migration, and reapplication was a
no-op. This checks today's migration chain; it does not establish future upgrade
or seeded-data preservation behavior. Those remain plan 003 gates.

All three reviewers challenged the written plans. Corrections included precise
page-replacement semantics, explicit baseline-defect disposition, earlier profile
harness setup, cumulative verification, trusted migration comparison, inherited
credential exclusion, stale-process checks and concrete UI scenarios. A final
independent consistency review accepted the revised sequencing and gate semantics.

Local document validation checked 14 Markdown files, 40 relative file links and
required metadata/sections for all seven numbered plans, with no failures.
Whitespace/scope review found only documentation/guidance changes. There are no
application, lockfile, migration, hosting or CI changes in this audit slice.
