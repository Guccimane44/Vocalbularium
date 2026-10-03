## Terminology migration

For terminology migration work, follow
[the 0.3.0+ plan](docs/plans/v0.3.0-plus-terminology-migration.md).

Implement the increment or increments requested by the task,
following the plan's order. Preserve product behavior, existing
data, and recovery compatibility.

The target vocabulary is deck → karte → seite.
Existing names may remain until their planned migration step.
Use semantic replacements; unrelated meanings of “page” stay unchanged.

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
the repository context alone. Link records instead of copying specifications
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
