# Dotfiles v0.1.0 onboarding

Scope: supervised foundation maintenance, preserving product behavior. Tracked in
[issue #1](https://github.com/Guccimane44/Vocalbularium/issues/1). This document adds
an operating contract; it does not finish migration plans 003–006 or authorize
product refactoring, deployment, remote migrations, or live provider calls.

## Baseline and authority

Onboarding starts from committed foundation revision
`5b966120cb6c7fc32aba14cf680a0ac4414e334a`. It completes the committed prerequisites for plans 000–002; plans 003–006
are present but unfinished. It is three commits ahead of remote main `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` at inspection.
Existing uncommitted plan-003 work and draft plan-004 guidance remain untouched in
the original checkout and are excluded from this branch's evidence. The onboarding
PR therefore includes those three committed foundation prerequisites.

The product name is Vocabularium; the GitHub repository is
`Guccimane44/Vocalbularium`. GitHub reports it public. Keep issue bodies, PR evidence,
and any published workpad free of credentials, user snapshots, private runtime logs,
and session IDs. Sites access is a separate boundary: both hosting manifests refer
to one existing remote Site. No new Site is registered and none is deployed here.

Product specification and UI guidelines govern intended behavior; source plus dated
checks govern implementation claims. The behavior ledger preserves B01–B14 and
keeps D01–D03 visible. Existing migration plans continue to own product foundation
work; GitHub issues link those plans rather than creating a second roadmap.

## Checks and their limits

Root project.json uses the dotfiles schema and keeps dispatch disabled. Setup uses
Node 22.21.0/npm 10.9.4 with the existing lockfile. `npm run verify` runs doctor,
tooling/application tests, types, JS syntax, build and staging. It does not establish
actual API/browser acceptance, installed extension behavior, live identity/generation,
or iOS SDK/device acceptance. Lint is a known failing baseline, not silently waived
as a pass. See the repository map and development guide for boundary-specific checks.

Dotfiles `project validate` checks structure only. v0.1.0's `agent-work verify`,
scheduler, console review, and recorded acceptance are dotfiles-specific: do not
invoke them for this repository or substitute its issue number into those commands.
Until a separately reviewed multi-repository adapter exists, the supervisor runs
native checks locally and records exact commit/diff, results, limitations, and
review evidence in the authorized issue/PR. No automated product acceptance is enabled.

## Manual pilot gate

The issue launcher starts from the remote default branch, so merge the reviewed
foundation/onboarding prerequisites before preparing an implementation worker.
Do not work around this by changing the GitHub default branch or bypassing recovery
protections. A separate pilot issue must define one representative bounded change,
acceptance, selected model, and an explicit model-attempt budget before launch.

For a new approved task, prepare from a clean checkout, then use a manual run with
`--reserve 25 --weekly-reserve 3` to match the declared launch thresholds. Four
slots are shared with dotfiles; only one worker may own an issue/workspace. Manual
runs do not continuously poll issue feedback or quota, so the supervisor must stop
the run before intervening; do not assume scheduler monitoring is active here.

Select Luna for simple issue/document drafting, Astra for complex implementation,
debugging, architecture or analytical prose. Existing issues can use a Work class
field matching docs/model-routing.md in dotfiles, or the manual `--model` override.
No model labels or automatic-dispatch permission are needed for this onboarding.

The pilot must include a deliberate stop and a supervisor-authorized saved-session
resume in the same workspace. Inspect checkpoint, controller handoff, Git changes,
and logs first; never silently create a replacement session after failed recovery.
Missing dependencies should be installed by the supervisor through project setup
before the worker starts. Never relax the worker's installation/publication boundary.
Record observed worker usage and supervisor cost separately when available; unknown
usage stays unknown. A time limit is not a hard token/subscription cost limit.

## Rollback and next work

Revert only onboarding files/edits to remove this integration. Do not reset the
original dirty checkout, delete its tests, alter database migrations or clear user
state. The dotfiles runtime and scheduler allowlist are unchanged.

Next: review/merge these prerequisites, reconcile the preserved unfinished plan-003
work in its own task, then authorize a bounded pilot. Add automatic product dispatch
only after repository-scoped verification/review and isolation are implemented and
proven. Optional skills/expertise remain unloaded unless a specific task needs them.

## Onboarding evidence — 2026-09-08

Executed in a separate worktree from the committed baseline above, on macOS using
Node 22.21.0/npm 10.9.4. Source/lockfile remained unchanged by setup and verification.

| Check | Observed result | Limit |
| --- | --- | --- |
| Offline setup | Failed: pinned Playwright package absent from npm cache | No alternate version selected. |
| Normal pinned setup | Passed | npm reported four moderate dependency advisories; not fixed/upgraded in onboarding. |
| `npm run verify` | Passed: doctor 53/53, tooling 7/7, application 31/31, types, JS syntax, build and staging | Does not run actual HTTP/browser acceptance or native SDK checks. |
| `npm --prefix apps/web run lint` | Failed, matching the documented known-red lane | Findings remain owned by mechanical-guardrails plan 005; no rules suppressed. |
| dotfiles project contract validation | Passed structurally | Does not register this repository or execute its commands. |
| Patch whitespace | Passed | Does not establish runtime behavior. |

Full Xcode and XcodeGen were unavailable. No browser installation, real browser/API
journey, live provider, hosted deployment, model worker pilot, or remote migration
was performed. Build output was generated only in this worktree and remains ignored.
Original checkout status was compared with the pre-onboarding inventory and remained
unchanged. Runtime logs remain local; only this bounded evidence summary is public.

Independent review: a separate Luna reviewer checked scope, baseline ancestry,
commands, and harness boundaries. The reviewer found wording that could imply plans
003–006 were absent; it was corrected to distinguish present plans from completed
prerequisites and uncommitted work. No blocking contract or scope finding remained.
Automatic dispatch and the pilot remain inactive; merging this onboarding still
does not establish behavioral or product acceptance.
