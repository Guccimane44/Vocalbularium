# First-task checklist: Vocabularium + dotfiles v0.1.0

Use this for one supervised manual issue. See the [dotfiles v0.1.0 onboarding guide](dotfiles-onboarding.md) for the operating contract.

## Before starting

- [ ] Confirm the reviewed foundation/onboarding prerequisites are on the remote default branch.
- [ ] Start from that default branch in a clean, dedicated checkout; confirm no user state, secrets, `.env*`, `.dev.vars*`, or snapshots are in scope.
- [ ] Confirm the issue is one bounded change with acceptance criteria and an explicit model-attempt budget.
- [ ] Confirm one worker owns the issue and workspace; do not change the GitHub default branch or bypass recovery protections.
- [ ] Confirm Node `22.21.0`, npm `10.9.4`, and the existing lockfile; the supervisor installs missing dependencies with project setup.
- [ ] Run the explicit setup appropriate to the checkout (`npm run setup`) and resolve missing prerequisites through the supervisor.

## Choose and launch

- [ ] Choose Luna for simple drafting/documentation; choose Astra for complex implementation, debugging, architecture, or analytical prose.
- [ ] Use a manual run with short reserve `25%` and weekly reserve `3%` (`--reserve 25 --weekly-reserve 3`).
- [ ] Keep the run manual: product automatic dispatch is off. Ordinary manual runs check quota before launch but do not continuously monitor quota or issue feedback; the supervisor must intervene.
- [ ] Start the approved issue and record the selected model and attempt budget.

## Start the work

- [ ] Read the repository’s applicable `AGENTS.md` and the issue acceptance criteria.
- [ ] Keep changes within the issue boundaries; preserve product behavior and avoid deployments, remote migrations, live providers, and publication.
- [ ] Before an interruption, save a concise checkpoint with completed work, decisions, verification status, and next action.

## Recovery and resume

- [ ] After a deliberate stop, inspect the saved checkpoint, controller handoff, Git diff, and logs before resuming.
- [ ] Resume the same saved session in the same workspace; never silently create a replacement session.
- [ ] Obtain explicit supervisor authorization before continuing.

## Verification and handoff

- [ ] Run the exact native checks appropriate to the touched boundary and record pass/fail; a skipped or known-failing check is not a pass.
- [ ] Check relative links and whitespace, then inspect the final diff and scope.
- [ ] Record public-safe evidence: commit/diff, exact results, limitations, review evidence, and known/unknown worker versus supervisor usage. Exclude credentials, snapshots, private logs, and session IDs.
- [ ] Supervisor reviews and publishes; do not claim product acceptance, automatic dispatch, or live provider/browser/iOS acceptance from these checks.
