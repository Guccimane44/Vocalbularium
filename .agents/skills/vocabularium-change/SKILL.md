---
name: vocabularium-change
description: "Take a Vocabularium request in, scope it as an increment, and track it through specifications, GitHub issues, and PRs. Use when planning or implementing a requested product change, or updating its progress; not for unrelated repositories or a standalone test/package check."
---

# Vocabularium Change

Turn the requested increment into a reviewable change against the current working product. Paths below are relative to the repository root; locate it from the current checkout, not from a personal filesystem path.

## Take the request in

The owner's requests are often short and casual. Before changing anything, restate the request as an intake and get the owner's confirmation:

- **Before and after:** what the user sees or what the system does now, and what it should do instead, in the product model's terms.
- **Acceptance criteria:** observable checks, each one something a test, a screenshot or a browser journey can show.
- **Where it goes:** the files, modules or journeys it touches, from the architecture map in `AGENTS.md`, and whether it is polish within the milestone or a decision with a D-number ([what gets a D-number](../../../docs/guides/project-workflow.md#from-decisions-to-iterations)).
- **Questions:** only where the request is genuinely ambiguous and a sensible default would risk the wrong result; otherwise state the default you take.

Keep it short. When the owner confirms, the intake's criteria become the issue's or plan's acceptance checklist. A request that already reads as an intake, or a fix whose before and after are evident, needs no separate confirmation.

## Establish the change

Read `AGENTS.md`, whose architecture map says where each kind of change goes and what guards it, and the documents relevant to the requested change. Use the [product model](../../../docs/product/model.md)'s terms in current issues, PRs and specifications. The [current scope](../../../docs/product/scope.md) distinguishes supported behavior from accepted requirements pending implementation and longer-term deferrals; a requirement in a specification is not evidence that the capability exists. Treat the current implementation as the baseline. A milestone plan selects accepted capabilities from scope; a new product or architecture decision that changes a specification first gets a traceability-map row ([from decisions to iterations](../../../docs/guides/project-workflow.md#from-decisions-to-iterations)).

Keep unrelated deferred features out of the increment; an explicit owner request can change earlier scope. Update the relevant specification when behavior intentionally changes. Use [capture and generation](../../../docs/specs/capture-and-generation.md) for capture, completion, interruption, retry, and save recovery, and the [module specification](../../../docs/specs/modules.md) for applicability and generation input. Link to those rules rather than duplicating them.

For persistence or operating-environment changes, read the [local PostgreSQL guide](../../../docs/architecture/local-postgresql.md). The supported backend uses PostgreSQL and loopback binding; the earlier Render/SQLite deployment is retired. Preserve applied migrations and add reviewed migrations for new schema changes. Upgrades keep accounts, sign-in, and existing decks and pages unless the owner decides otherwise; [scope](../../../docs/product/scope.md#upgrade-from-earlier-builds) records each release's upgrade behavior.

Inspect the working tree, branch, remote, and relevant issue/PR before deciding where to work. The repository name and product spelling differ: derive the GitHub repository from the remote. The MVP was developed with stacked PRs, so confirm the current base and merge state; neither `main` nor an old branch name is automatically the right starting point. Reuse a branch for the same unfinished change; start a focused `codex/` branch for a new increment. Preserve unrelated local work.

## Connect intent and progress

For milestone work or a product/architecture decision, follow the [project workflow](../../../docs/guides/project-workflow.md): consult the matching Notion milestone and applicable accepted or implemented decisions, then link their intent to the repository specification and GitHub issue/PR. Routine scoped fixes need no new Notion record. Reconcile conflicting status from approval, revision, environment, and completion scope; current release evidence may be newer than a plan's implementation note.

Within the user's tracking authorization, update the existing milestone after meaningful progress and capture durable owner decisions with their approval source and known decision date. Keep detailed plans and verification in the repository/GitHub and link concise Notion summaries to them. Do not turn a proposal into an approved requirement or mark owner acceptance from implementation evidence. If Notion is unavailable, continue independent work and report the proposed update as pending.

## Keep GitHub useful

Use the project's existing authorization to maintain issues and PRs. If that authorization is absent in a new context, prepare the local change and draft text before seeking only the missing authorization. A status-only request authorizes reading, not silently changing issue states.

- Reuse a matching issue or create one for the new increment. Record the user-visible outcome, acceptance checklist, linked specifications, and remaining dependencies. Use a milestone or parent tracker when it helps group actual work; do not reuse completed MVP milestones merely because they exist.
- Link a focused PR to the issue. If its base is another implementation branch, state the dependency. Keep the title and description about the final behavior and evidence.
- Update progress after meaningful events: implementation ready, checks passed/failed, package prepared, deployed, or owner action needed. Record actual results and relevant commit/run links. Distinguish implementation, automated verification, deployment, and owner acceptance.
- Close an issue when its own acceptance conditions are met. A stable MVP is a baseline for increments, not evidence that an unperformed check passed. Historical test counts, package hashes, and deployment revisions belong in evidence records, not in this skill.

Prefer the connected GitHub tools; use an authenticated CLI when available. Inspect the latest issue/PR body before replacing it and preserve unrelated content. After an uncertain write, read back the state before retrying to avoid duplicate issues or PRs. Use structured multiline bodies or a temporary body file with the CLI.

Choose checks from `package.json`, `.github/workflows/verify.yml`, and the affected behavior; use `$vocabularium-verify` when regression work is needed. Include the affected user journey when a change spans UI, storage, or extension/backend boundaries. A request to implement and track a change does not itself authorize merging, publishing a release, deploying or migrating the owner's running backend, changing hosting plans, or sending messages to other people.

Finish with the outcome, issue/PR links, checks performed, and material remaining work. Keep current acceptance and deployment facts in the linked project records.
