## Page/component refactor

For work on the deck → page → component model, follow
[the refactor plan](docs/plans/page-component-refactor.md)
and its tracker, [#81](https://github.com/Guccimane44/Vocalbularium/issues/81).

Implement the increment or increments requested by the task,
following the plan's order. The owner approved discarding existing
decks and kartes on upgrade; keep accounts and sign-in, and keep
recovery working for data created after the refactor.

The vocabulary is deck → page → component, with content modules,
view modules and the default view. Karte and seite are earlier
terms; they remain only in history, migrations and upgrade fixtures.
Use semantic replacements; other meanings of “page” (web page,
pagination) stay unchanged. The 0.3.0+ terminology plan is historical.

## Reusable workflows

Use the project skills relevant to the task:

- [Vocabularium Change](.agents/skills/vocabularium-change/SKILL.md) — scope an increment and keep issues and PRs current.
- [Vocabularium Verify](.agents/skills/vocabularium-verify/SKILL.md) — choose regression checks, investigate failures, and record evidence.
- [Vocabularium Deliver](.agents/skills/vocabularium-deliver/SKILL.md) — package a candidate, validate its ZIP, and prepare the owner handoff.

A task may need more than one skill; use Deliver when packaging
or delivery is part of the request.

The skills reuse the current specifications, commands, and deployment records. Update those sources when behavior or tooling changes; keep historical results and temporary environment details out of the reusable instructions.

## Project context and Notion

[Vocabularium in Notion](https://app.notion.com/p/3e3bb1350208800f9b5ad907c80156d2)
holds milestone outcomes, decision history, and reusable Q&As. Repository
documents define versioned product behavior and technical constraints;
GitHub issues, PRs, CI, and release records hold implementation and delivery evidence.

For milestone work, product or architecture decisions, and acceptance or
delivery updates, consult the relevant Notion records and follow the
[project workflow](docs/guides/project-workflow.md). Routine fixes can use
the repository context alone. A decision that changes a specification enters
through the traceability map and follows
[from decisions to iterations](docs/guides/project-workflow.md#from-decisions-to-iterations).
Link records instead of copying specifications
or logs; update Notion at meaningful events within the user's authorized scope.

Check approval, revision, environment, and completion scope before relying
on a status. Treat contradictions as discrepancies to reconcile from evidence.
If Notion is unavailable, continue work that does not depend on missing
decisions and report any proposed record update as pending.

## Verification

Choose checks that can detect the failure the change could cause.
For changes spanning UI, storage, or extension/backend boundaries,
verify the affected user journey using the existing E2E harness
or a browser smoke test in the approved test environment.

Unit tests alone do not establish that an integrated flow works.
Report what was exercised, which dependencies were mocked, and
what remains unverified. Distinguish browser smoke checks from
automated E2E regression coverage.
