# 006 — Demonstrate one constrained maintenance change

Version: 1 | Status: Planned | Owner: Assign at execution
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (record new start SHA)
Depends on: 001–005

## Purpose and preservation contract

Prove that an independent agent can use the new knowledge, tools, isolation and
guards to finish one small change without broad refactoring. Preserve B01–B14;
this is a process acceptance exercise, not permission to begin a redesign or fix
the client protocol defects incidentally.

## Allowed scope and prerequisites

Choose exactly one remaining stable lint diagnostic in test/tool code whose
removal preserves assertions and behavior (for example a safely narrowed helper
type). Record the exact diagnostic and one intended file before editing. Allow
that file, its specific debt-inventory entry and this plan's evidence only. If no
suitable diagnostic remains after 003/005, revise this plan with one equally
small tooling-only maintenance target before starting; do not invent cleanup.

## Execution steps

1. Give a fresh implementer the root guidance and this plan, without earlier task
   history. Have it identify the selected diagnostic, relevant behavior IDs and
   checks, and its isolated checkout/state boundaries.
2. Record clean starting state and run baseline gates. Apply the smallest change;
   remove only the matching resolved debt entry. Preserve all test assertions.
3. Run appropriate focused checks, then the established aggregate verification
   and guard command against the actual starting base. Capture reproducible proof.
4. Have a separate reviewer inspect whether the change altered behavior, weakened
   a test, expanded scope, hid debt or relied on shared state.
5. Revert/reapply the maintenance patch in a disposable copy to demonstrate the
   claimed diagnostic difference. Preserve working implementation state.
6. Record process friction and readiness decision. If gates are incomplete,
   update the responsible foundation plan; do not label the repository ready.

## Validation and acceptance

- A fresh agent located the target, commands, contracts and rollback from tracked
  guidance. No hidden setup steps were needed.
- Exactly one intended diagnostic is eliminated; none introduced. Tests keep the
  same assertions, and all relevant behavior and repository gates pass.
- Two-run isolation from 002 still holds; cleanup touches only owned state.
- Independent review records evidence and resolves every scope/behavior concern.
- Plans 001–005 meet their required gates, with optional external platform/release
  limitations still explicit. Foundation readiness does not imply live MVP readiness.
- Record whether a separate, bounded application-refactor plan can now be
  considered. No broad refactor starts as part of completing this plan.

## Risks and rollback

An easy rehearsal could avoid the process weaknesses; choose a real remaining
diagnostic and require the full change/evidence loop. Revert the one-file patch
and restore its debt entry to roll back. There is no data migration.

## Decisions and independent review

The migration ends with demonstrated use rather than documentation alone.
Application changes and D01–D03 fixes need independent plans after reproductions.
Target selection and independent reviewer: pending execution.

## Execution record

- Starting commit/environment and selected diagnostic: pending.
- Commands/results/evidence: pending.
- Deviations and open issues: pending.
- Completion/remaining work: not started.
