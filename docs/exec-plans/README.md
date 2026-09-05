# Agent-first migration execution plans

Version 1, 2026-09-05. Baseline:
`a958e4d36cf791b87d15ca60cd4d48e2c43d540a`.

The outcome is a repository that an unfamiliar agent can navigate, reproduce,
verify, and change in isolation with mechanical feedback. Preserve current
product behavior throughout this foundation migration. Broad application
refactoring is deferred, not pre-authorized by these plans.

## Sequence and status

| ID | Plan | Status | Depends on | Delivery boundary |
| --- | --- | --- | --- | --- |
| 000 | [Baseline and repository knowledge](000-baseline.md) | Complete | None | This audit, map, behavior ledger, initial AGENTS guidance, reviewed plans. |
| 001 | [Reproducible commands and environment](001-reproducibility.md) | Planned | 000 | Pin the tested runtime; repeatable bootstrap/doctor/verification contract. |
| 002 | [Isolation and safe local state](002-isolation.md) | Planned | 001 | Disposable local runtime, profiles, reset, secret-file exclusions. |
| 003 | [Behavioral characterization](003-behavioral-verification.md) | Planned | 001,002 | Ordered migrations, actual Worker/API, browser and client failure evidence. |
| 004 | [Agent legibility and working protocol](004-agent-legibility.md) | Planned | 000; finalize after 001–003 | Scoped guidance, task-to-check map, maintained evidence, fresh-agent navigation exercise. |
| 005 | [Mechanical guardrails](005-mechanical-guardrails.md) | Planned | 001–004 | CI, boundary checks, migration/secret/artifact guards, lint/format debt ratchets. |
| 006 | [Constrained maintenance rehearsal](006-maintenance-rehearsal.md) | Planned | 001–005 | Demonstrate the process with one small behavior-preserving change. |

Execute one reviewable slice at a time; each numbered substep may be its own
commit or pull request. The next eligible plan is the lowest numbered Planned
plan whose required predecessors are Complete. Plan 004's documentation drafting can proceed alongside
001–003, but its command/evidence claims cannot close before those tools exist.
Integration tests require 002 isolation first. CI can begin with already-green
checks during 001; the complete enforcement gate belongs to 005.

## Execution protocol

1. Read [AGENTS.md](../../AGENTS.md), the [audit](../agent-first/audit.md), and the
   selected plan. Record the actual starting commit, owner, environment and scope.
2. Change status to `In progress`. Work on a task branch/dedicated checkout with
   one writer per overlapping file set. Independent reviewers challenge evidence.
3. Follow allowed paths and non-goals. If a necessary change affects behavior,
   record it as a separate defect/product plan; do not hide it in tooling work.
4. Run the stated gates. Record command, environment, result, limitations, and
   redacted durable evidence references. Test failure is evidence to investigate.
5. Have an independent reviewer inspect the diff, behavior implications and
   failure cases. Record challenges, responses, and unresolved risks.
6. Mark `Complete` only when every required gate passes. Mark an externally
   unavailable check `Blocked` with a reason, owner and next action. Update this
   index and the relevant knowledge/evidence document in the same change.

Statuses: `Planned`, `In progress`, `In review`, `Blocked`, `Complete`,
`Superseded`. Stable numeric IDs and filenames survive status changes; Git stores
revisions. Never silently overwrite completed evidence. A superseding plan links
both directions. Add a new ID for a new defect or application migration.

Use [the template](TEMPLATE.md). Every plan records purpose, scope, dependencies,
steps, validation, risks/rollback, decisions, review, and completion evidence.
Commands labeled **proposed** are intended interfaces to implement, not commands
available at the baseline. Do not claim a plan completed merely because this
document describes it. No calendar estimates or external-service availability
are assumed.

## Deferred work and stop boundary

After 006, assess readiness for a separately scoped first refactor. Candidates
such as splitting `page.tsx`, extracting application packages, replacing the
account aggregate with indexed records/delta sync, changing the framework,
upgrading dependencies, or reorganizing the UI catalog require their own case,
behavior evidence, and execution plan. None belongs in 000–006.

[D01–D03](../agent-first/behavior-ledger.md) need explicit defect follow-ups after
reproduction. Their fixes may follow foundation completion; outstanding behavior
failures must remain visible and tested.
Plan 003 defines separate current-outcome characterization and desired product
acceptance results. A foundation gate may pass with a precisely recorded baseline
defect; that does not make the desired behavior or production acceptance pass.

Live authentication/generation, Apple lifecycle/linking, autonomous recovery,
hosted native access, real-device acceptance, language quality and accessibility
remain release work in [implementation status](../implementation-status.md).
Foundation completion does not imply production MVP completion.
