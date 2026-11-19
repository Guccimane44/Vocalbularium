# Decisions

Each file here holds one decision that changed a specification: where it came from, the decision in full, the documents it affects and its open items. The [project workflow](../guides/project-workflow.md#from-decisions-to-iterations) says when a change needs a decision and how one moves from proposed to implemented.

**Status.** Each decision's status lives in its own file's header, and only there. The PR that applies a decision writes "Accepted <date>, <Notion link>" into that header. Notion's status field is optional; when it disagrees with the file, the file wins. The status values are listed in the [project workflow](../guides/project-workflow.md#from-decisions-to-iterations).

**Names.** A decision's ID is its GitHub issue number: `d<issue>-<short-name>.md`, for example `d320-forms-facet.md`. A draft written before its issue exists is `d-draft-<slug>.md` and is renamed once the issue is opened. CI checks that every numbered file has an issue whose title starts with that number. D01–D36 predate this rule and keep their names; [D17](d17-one-request.md) and [D20](d20-module-pages.md) also keep a longer detail file.

**What `npm run check` enforces** (`scripts/check-decisions.mjs`): every file is named as above; a numbered file's first line is `# D<number>: <title>`; no two files share a number; and each header has exactly one `- **Status:**` line, starting with a value from the [project workflow](../guides/project-workflow.md#from-decisions-to-iterations), and at most one `- **Notion:**` line.

**Conflicts and clarifications** found while checking a decision against the others and the specifications are in [conflicts](conflicts.md) and [clarifications](clarifications.md), each naming its decision.

**Without a file.** D32 (German tables filled from an imported German Wiktionary) and D33 (dictionary summaries written once per word) are accepted and built only on the `claude/german-tables` branch; they come with the dictionary milestone. Q01–Q72, the owner's answers to the system-design questionnaire of 4–10 October 2026, were removed on 15 November 2026 and remain in git history.
