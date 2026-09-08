# 000 — Establish repository knowledge and migration design

Version: 1 | Status: Complete | Owner: Primary audit agent
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` | Depends on: none

## Purpose and preservation contract

Produce an evidence-backed audit and executable migration sequence while leaving
all existing application behavior intact. Protect B01–B14 in the behavior ledger.
This slice delivers documentation and initial agent navigation, not future CI,
application fixes, runtime pins, schema changes or deployment.

## Allowed scope and prerequisites

`AGENTS.md`, README navigation, `docs/agent-first/`, `docs/exec-plans/` only.
Read-only code inspection and local baseline checks are permitted. Destructive
database checks use an exported disposable checkout. No hosted data or secrets.

## Execution steps

1. Record clean starting state and create `codex/agent-first-migration`.
2. Map product/runtime/client boundaries, commands, state, documentation authority.
3. Run existing tests/typecheck/build/syntax checks; independently measure lint and
   formatting debt. Repeat install/checks from an export of the exact commit.
4. Commission independent behavior, reproducibility/isolation, and legibility
   audits before sharing a synthesized plan. Record contrary evidence.
5. Write behavior/evidence ledger with known discrepancies and external gaps.
6. Write phased plans with scope, dependencies, gates and rollback. Add a short
   agent entry point and README links. Challenge the drafts independently.
7. Validate document links and required plan structure; review the final diff for
   application changes. Record completion and commit versioned artifacts.

## Validation and acceptance

- Existing application checks are reported exactly, including lint/format failure.
- Clean export installation and build limitations are explicit, not “hermetic.”
- Every preservation contract names source and evidence/gaps; suspected defects
  are separate and have a reproducer, owner and follow-up policy.
- All six foundations have planned delivery and measurable acceptance gates.
- Independent reviewers' challenges have dispositions; unresolved evidence stays
  visible. Plans 001–006 remain Planned.
- Relative Markdown file links resolve, plan index/statuses agree, and the changed
  path set contains only the allowed documentation/guidance files.
- Original source, lockfile, migrations and hosting manifests are unchanged.

## Risks and rollback

Documentation can overstate proof or turn known bugs into contracts. Counter this
with dated evidence levels and independent review. Revert this documentation
slice to roll back; no data migration or product rollback is necessary. Retain
only redacted summaries, never user data or credentials, in Git.

## Decisions and independent review

- 2026-09-05: Preserve existing architecture and explicit implementation caveats.
- 2026-09-05: Introduce root AGENTS/map now; defer expanded scoped instructions and
  mechanical enforcement to their own plans.
- 2026-09-05: Independent challenges accepted for D01/D02/D03, lint debt,
  migration-chain coverage, `.dev.vars` exclusions and shared remote identity.
- 2026-09-05: Isolation precedes stateful characterization. A numeric lint ceiling
  and blanket client/domain ban were rejected as inadequate or scope-expanding.
- 2026-09-05 draft challenge: all three reviewers identified the isolation-harness
  prerequisite and/or baseline-defect closure ambiguity. Accepted: minimal profile
  harness in 002; precise current-outcome assertions and separate failing desired
  acceptance in 003; no silent weakening or incidental fixes.
- 2026-09-05 behavior review: corrected B05 to distinguish successful current-page
  replacement from frozen snapshots; added Optional/Examples/list-edit/interest
  scenarios to 003.
- 2026-09-05 tooling review: made 005 verification cumulative, migration base
  trusted, and 002 reset/process ownership and environment exclusion explicit.
- 2026-09-05 final independent consistency review: accepted the revised isolation,
  characterization and verification sequencing; no remaining material contradiction.

## Execution record

- Starting state: clean `main`; one baseline commit; branch created successfully.
- Baseline evidence: [audit](../agent-first/audit.md); repository and behavior maps
  are linked from the root guide. Tests 31/31, typecheck/build and syntax passed;
  lint/format debt retained without source edits.
- Fresh installation: baseline Git export, cached offline `npm ci`, clean
  test/typecheck/build passed on Node 22.21.0/npm 10.9.4.
- Local migration: 0000 applied in disposable local D1 (seven commands); rerun
  reported no migrations to apply. Loopback restriction required an authorized
  sandbox escalation; no remote database access or existing user-state reset.
- Document validation: 14 Markdown files, 40 relative links, seven numbered plans'
  metadata/sections; all passed. Whitespace and diff scope passed. Application
  source, dependencies, schema, hosting and CI remain unchanged.
- Completion: audit/design slice complete and recorded in Git. Next eligible
  work is 001; 001–006 are not started. Full foundation and product readiness are
  not claimed by closing 000.
