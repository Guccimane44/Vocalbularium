## Terminology migration

For terminology migration work, follow
[the 0.3.0+ plan](docs/plans/v0.3.0-plus-terminology-migration.md).
Implement its three reviewable increments in order, preserving
product behavior, existing data, and recovery compatibility.

The target vocabulary is deck → karte → seite.
Existing names may remain until their planned migration step.
Use semantic replacements; unrelated meanings of “page” stay unchanged.

## Reusable workflows

Use the project skill that matches the work; ordinary changes do not require running all three:

- [Vocabularium Change](.agents/skills/vocabularium-change/SKILL.md) — scope an increment and keep issues and PRs current.
- [Vocabularium Verify](.agents/skills/vocabularium-verify/SKILL.md) — choose regression checks, investigate failures, and record evidence.
- [Vocabularium Deliver](.agents/skills/vocabularium-deliver/SKILL.md) — package a candidate, validate its ZIP, and prepare the owner handoff.

The skills reuse the current specifications, commands, and deployment records. Update those sources when behavior or tooling changes; keep historical results and temporary environment details out of the reusable instructions.
