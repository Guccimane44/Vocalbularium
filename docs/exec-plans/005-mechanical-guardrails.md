# 005 — Enforce repository boundaries and verification

Version: 1 | Status: Planned | Owner: Assign at execution
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (record new start SHA)
Depends on: 001–004

## Purpose and preservation contract

Turn documented invariants into fast, actionable failures while preserving the
current behavior and visible technical debt. No broad lint fixes, formatting,
dependency upgrades, application restructuring, deployment workflow or secret
provisioning. Protect B01–B14 and allow intentional existing client/domain reuse.

## Allowed scope and prerequisites

CI workflow definitions, root scripts, focused checker fixtures/tests, explicit
debt inventory, repository metadata and command docs. Use existing pinned tools
where possible; any extra checker dependency requires a narrow justification and
lockfile. App source changes for lint cleanup belong in later small slices.

## Execution steps

1. Add **proposed** `npm run check:repo -- --base <ref>` with separate named checks
   and actionable file/rule output. Resolve and validate the base ref; fail closed
   if unavailable. CI fetches the base explicitly from trusted event/configuration,
   never a PR-controlled argument or an assumed shallow parent. With no deployment
   ledger, conservatively protect every migration present at that trusted base.
2. Implement the invariant matrix below. For each checker write a minimal
   disposable fixture or copy that deliberately violates it, assert nonzero exit,
   and keep real application files/migrations intact during tests.
3. Capture current lint diagnostics using the pinned tool. Ratchet normalized
   path/rule/message plus stable source identity/multiplicity against the inventory;
   reject new-file/new-location violations, not merely totals. Removing an old
   error cannot buy permission for a new one. Updates require explicit reviewed
   debt decisions; reductions remove stale entries. Changed source at an existing
   violation requires review, not automatic grandfathering.
4. For formatting, baseline only the existing 18 files/content regions. New files
   must pass; newly changed regions must pass or receive a specific reviewed
   exception. Avoid a whole-file rule that forces a 1,639-line reformat for one
   edit. If the formatter cannot support region checks reliably, implement a
   reviewed touched-file transition with explicit exceptions rather than claiming
   a precise ratchet. Never loosen global formatting/lint configuration to pass.
5. Add CI for pinned setup, fast checks, repository guards, integration/browser
   lanes and build. Use read-only repository permissions, lockfile-keyed dependency
   cache, bounded timeouts and separate per-run state. Do not cache D1/profiles or
   put provider/deployment credentials in jobs. Untrusted PR code gets no secrets.
   Extend root `npm run verify` cumulatively: fast checks → build → repository/
   staged-artifact guards → integration → browser characterization, including the
   production-shell lane. Setup stays separate. Require the same complete gate
   locally and in CI; do not leave `verify` at its narrower 001 meaning. Run the
   separate desired-product acceptance report with visible D-linked failures;
   do not call it passing merely because baseline characterization is green.
6. Upload bounded, redacted failure logs/traces with documented retention; exclude
   tokens, personal snapshots and database contents. Report baseline debt separately
   from new violations. No auto-format, auto-commit or snapshot auto-accept in CI.
7. Document required check names. Repository administrators may configure merge
   protection separately; adding a workflow does not prove branch protection is
   active. Record remote policy verification as external unless actually inspected.

## Invariants and negative gates

| Check | Preserved invariant | Deliberate failure proof |
| --- | --- | --- |
| Client/server imports | Traverse client value-dependency graph; prohibit auth/store/provider/Worker runtime exposure. Allow current domain/fixtures and erased type-only imports where safe. | Client imports a server module directly and through an intermediate alias/re-export; both fail. Existing client→domain passes. |
| Migrations | Every migration at the trusted base is append-only, a conservative proxy for deployed SQL; journal order/files agree; new migration tested for preservation. | Edited/deleted/renamed base migration, missing journal file, duplicate order, absent/untrusted base each fail. |
| Hosting/staging | Root/web manifests equal; no credentials in allowed manifest shape; staged Worker/client/hosting metadata and migrations present/match sources. | Mismatch, missing Worker/metadata/migration, or unexpected secret field fail without contacting Sites. |
| Secrets/local artifacts | Deny tracked `.env`/`.dev.vars*`, keys, local DB/state, generated build outputs; narrowly allow reviewed examples. Add content-based secret scan with redacted findings. | Dummy secret-pattern fixture and sensitive path fail; safe example passes. Do not print dummy or real secret values in errors. |
| Lint debt | No new diagnostics; unchanged baseline debt visible; tool/config identity recorded. | Remove one old error and add a different one: still fails. New violating file fails. Simple line shift alone does not lose identity. |
| Format debt | No unreviewed formatting drift/new-file debt; baseline transition explicit. | New badly formatted file and disallowed changed-region drift fail; no whole-tree rewrite required. |
| Docs/plan structure | Local Markdown links and required metadata/sections valid; index IDs/status/dependencies consistent; completed plans have evidence. | Broken relative link, unknown dependency or false Complete without evidence fails. |
| Commands | Aggregate check exit status faithfully reflects every child check. | Inject failing child and malformed checker output; parent fails, never silently skips. |

## Validation and acceptance

- Proposed `npm run check:repo -- --base <ref>` and 001–003 verification commands
  pass with the explicit baseline debt inventory. Raw lint remains honestly
  failing until its debt is removed; a passing ratchet is not “lint clean.”
- Each invariant above has both pass and deliberate-failure evidence; unsupported
  syntax/path cases fail clearly. Include spaces in paths and canonicalized paths.
- Fresh CI-equivalent run uses no live services/secrets and leaves source/lockfile
  unchanged. Test/artifact state cannot leak between parallel jobs.
- Existing guards catch changes in generated/source artifacts rather than trusting
  the build exit code alone. A manifest/parity pass does not authorize deployment.
- Independent review confirms guards are enforceable, bounded and not creating
  hidden behavior changes or broad exceptions. Run remotely if authorized;
  otherwise record local workflow validation and remote execution as unverified.

## Risks and rollback

Weak diagnostic identity or broad allowlists can hide new defects; brittle AST/
format checks can produce noise. Test adversarial examples before required CI.
Revert the checker/workflow slice to roll back while retaining evidence of gaps;
do not disable all checks as a response to one false positive. Source/schema/data
do not change. Remote branch protection needs its own reversible admin change.

## Decisions and independent review

Accepted F07/F08/F09: no numeric-only lint ceiling, no client/domain ban, no
unchecked artifact assumptions. Baseline debt reductions are separate maintenance
work; CI must neither deploy nor trust PR-controlled credentials. Review: pending.

## Execution record

- Starting commit/environment: pending.
- Commands/results/evidence: pending.
- Deviations and open issues: remote workflow/policy execution separately recorded.
- Completion/remaining work: not started.
