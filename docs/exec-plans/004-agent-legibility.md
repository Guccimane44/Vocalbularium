# 004 — Make bounded agent work easy to navigate

Version: 1 | Status: Planned | Owner: Assign at execution
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (record new start SHA)
Depends on: 000; finalize after 001–003

## Purpose and preservation contract

An unfamiliar agent should find the right boundary, contract, command and plan
without reconstructing the original prompt session. Preserve product scope and
the existing architecture. Root AGENTS/map/ledger already arrive in 000; this
plan validates and refines them against implemented tools, rather than promising
an instruction file that already exists.

## Allowed scope and prerequisites

`AGENTS.md`, task-specific platform guides if useful, docs, plan template/index,
command reference and concise architecture decisions. No module moves, renaming,
API schemas generated from speculation, or duplicate copies of the product spec.

## Execution steps

1. Update the repository map and command matrix using the actual 001–003 command
   names, supported platforms and evidence. Remove stale proposed-command claims
   when implemented. Keep a single source of truth for each fact.
2. Add scoped web/Chrome/iOS instructions only where their commands or state differ
   materially. Explain server value-import boundaries, intentional shared domain,
   Worker fixture trust, extension storage, and native SDK verification limits.
3. Maintain short decisions for aggregate/CAS, frozen reviews, one-time allowance,
   preview versus live identity, and local versus hosted authority. Link existing
   architecture explanations instead of repeating algorithms in instructions.
4. Make the execution template/lifecycle practical: owner, actual start SHA,
   scope, behavior IDs, required checks, stop conditions, evidence, reviewer,
   rollback and completion. Update evidence when touching its source boundary.
5. Run a fresh-agent navigation exercise: give an independent agent only a clean
   checkout and root instructions, without prior conversation. Have it plan one
   capture/retry test change and one native verification task, read-only.
6. Incorporate concrete navigation failures; avoid more prose unless it fixes a
   demonstrated ambiguity. Record which guidance was used and links followed.

## Validation and acceptance

- The fresh agent can locate UI, HTTP, shared domain, store, provider, migrations
  and native clients; choose the right commands and identify which do not exist
  or are unavailable on its platform.
- It identifies at least the relevant B/D IDs, no broad refactor scope, required
  state isolation, shared hosted identity, lint debt handling and rollback.
- Root guide stays short (target at most 100 lines), with progressive links;
  scoped guides do not contradict root or duplicate entire product documents.
- Every command in the working guide is actually available and tested; proposed
  commands remain clearly labeled only in future plans.
- Relative links resolve and plan status/dependency metadata matches the index.
  Use manual/local checks now; mechanize this under 005.
- Another reviewer can distinguish historical manual evidence, fresh automated
  evidence, inferred risk, intended contract and blocked external acceptance.

## Risks and rollback

Stale instructions can be worse than missing ones. Keep authority explicit and
require evidence updates with boundary changes. Revert documentation changes to
roll back; no application or data effects. Do not grant agents implicit deployment
authority through a generic “finish the task” repository instruction.

## Decisions and independent review

Accepted F01/F08: navigation and evidence discoverability matter more than new
architecture. The original prompt is historical context, not an active work queue.
Independent navigation exercise and review: pending.

## Execution record

- Starting commit/environment: pending.
- Commands/results/evidence: pending.
- Deviations and open issues: tooling-dependent sections wait for 001–003.
- Completion/remaining work: not started.
