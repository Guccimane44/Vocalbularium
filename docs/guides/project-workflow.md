# Project workflow and Notion

## Where information lives

The [Vocabularium homepage](https://app.notion.com/p/3e3bb1350208800f9b5ad907c80156d2) is the project entry point for milestone outcomes, durable decisions, and explanations worth keeping.

The [working-agreement decision](https://app.notion.com/p/3ecbb135020881ff9036e7b6a77f8f56) records the owner's approval of this integration and its implementation evidence.

| Source | Owns |
| --- | --- |
| Repository | Versioned product model, supported and pending scope, capability specifications, architecture, repeatable procedures, and source changes |
| Notion | Milestone intent and completion scope, decision context and approval history, concise progress summaries, and reusable Q&As |
| GitHub | Implementation issues and PRs, reviews and merge state, CI runs, releases, and delivery evidence tied to a revision and environment |

Use the [product model](../product/model.md) for terms, [current scope](../product/scope.md) for implementation boundaries, and the relevant substantive specification for behavior. Some documents remain under `docs/history/mvp/` during the taxonomy migration; follow the current scope's authority links. An empty destination file does not replace an existing specification. Vision and proposals do not establish implementation or approval.

Link between records. Keep the complete plan, specification, test output, and package evidence in their appropriate sources; Notion summarizes the result and points to them. Derive GitHub links from the actual remote and relevant branch or commit. Use immutable revision links for verified facts and evidence; identify the branch when linking evolving documentation. Do not assume the default branch contains the working specification or released backend.

## When to consult and update Notion

Consult relevant records when scoping a milestone, changing product or architecture decisions, resolving an intent conflict, or preparing acceptance and delivery. A routine scoped fix need not read the whole workspace or create a new Notion entry.

- **Change:** read the matching milestone and applicable accepted or implemented decisions. Record the requested outcome and acceptance criteria in the repository specification and implementation issue. Cross-link a Notion record when it adds intent or rationale. Update progress when a significant implementation event occurs; capture a new durable decision only when the owner actually makes it.
- **Verify:** use the milestone's acceptance criteria alongside the specification. Keep detailed evidence in the issue/PR or a repository evidence record. Add a concise milestone summary stating the revision, scenarios, result, real and mocked dependencies, and remaining gaps. An environment failure leaves the affected behavior unverified.
- **Deliver:** consult current release and delivery records, including the installed backend revision. Record the candidate version, source revision, backend target, checksum, verification link, and outstanding owner checks. Keep implementation, merge, publication, deployment, and owner acceptance distinct.

Update existing records at meaningful events, not after every command. Preserve recorded dates and historical results. Reading project context is part of the workflow; external writes follow the user's authorization for tracking or Notion maintenance. A read-only request does not authorize status updates, and a Notion decision is not permission to merge, deploy, or message others.

If Notion is unavailable, continue independent repository work and include the proposed Notion update in the handoff. Never report an unsaved update as completed. If a missing decision blocks dependent work, surface that specific gap while progressing on independent work.

## Actual Stages

[Actual Stages](https://app.notion.com/p/3e8bb135020880e3ada8dcda87fef2c2) uses one row per meaningful milestone. Inspect the current schema before writing; the core fields are `Milestone`, `Plan`, `Scheduled on`, `Finished on`, `Status`, and `Evidence`.

The page body contains the outcome, completion scope, acceptance criteria, concise verification/delivery evidence, remaining work, and links to the repository plan and GitHub tracker. `Evidence` points to the principal tracker or evidence record; put additional links in the body.

Use `Not started`, `In progress`, or `Done` against the page's stated completion criteria. Fill `Finished on` only from known completion evidence. A completed implementation milestone can have separate owner handoff remaining, but the page must say so. If owner acceptance is part of that milestone's criteria, it remains incomplete until acceptance occurs. Do not reinterpret historical dates or status as proof of an unperformed check.

## Decision logs

[Decision logs](https://app.notion.com/p/3eabb13502088075bd17d8278a9346a7) records one durable choice per row. Areas are `Product`, `Codebase`, and `System`; System includes working-process decisions. Existing fields include `Name`, `Area`, `Status`, `Created time`, `Decision date`, `Specification`, and `Implementation`.

Use `Proposed` or `In Review` until explicit approval; `Accepted` means approved, and `Implemented` requires evidence that the choice was carried out within its stated scope. Use `Deferred`, `Rejected`, or `Superseded` when supported. Implementation status does not imply deployment or owner acceptance. `Decision date` is the actual approval date when known, not the automatic record creation time.

Keep context, the choice, rationale, consequences, approval source, and implementation scope in the body. Record considered alternatives only when known. Link the governing repository specification and issue/PR/evidence through the corresponding fields. An intentionally changed behavior updates its repository specification; a discrepancy does not automatically justify rewriting either source.

## Q&As

[System Q&As](https://app.notion.com/p/3e8bb135020880c39d6acd5071b9d9a7) explains concepts, architecture tradeoffs, and workflow rationale. [Codebase Q&As](https://app.notion.com/p/3e8bb13502088002bdc9e5472c0fd051) explains specific implementation behavior.

Create an answer when it resolves a recurring or useful question. Include a concise answer, relevant file/specification links, a checked date and source revision for implementation facts, and any limits. Keep useful questions in their existing structure; do not create another task database to hold them. Q&As explain rules and code, while specifications and source remain authoritative.

## Writing and reconciliation

Fetch the current page and database schema before an update, preserve unrelated content and child pages/databases, and search for an existing matching record before creating one. Use focused edits. Read back structural or uncertain writes before retrying to avoid duplicate records.

When records disagree, compare their approval source, revision, environment, and stated scope. Current GitHub release/deployment evidence can be newer than a repository plan's historical implementation note. Record the supported distinction, link the evidence, and leave unknown facts unknown. Do not infer owner acceptance from a successful automated run or transfer historical test counts to a new revision.
