# D336: Report a problem from the account menu

- **Opened:** 2026-11-19
- **Status:** accepted
- **Notion:** pending
- **Source:** the owner in a Claude Code chat, 19 November 2026, choosing the outer loop of the five-layer development framework: a local report button, an agent that opens fix PRs the owner merges, run daily on the owner's Mac. Placement and design from the owner's design canvas the same day: "the report button should be placed alongside the diagnostic logs", then "Yes, build it". Issue [#336](https://github.com/Guccimane44/Vocalbularium/issues/336).
- **Affected docs:** [decks and configuration](../subsystems/interface.md#navigation) (the account menu), [diagnostic logging](../subsystems/observability-and-reports.md) (where reports and logs live), [scope](../product/scope.md)
- **Open items:** none

## Context

Until now a problem the owner noticed reached an agent only when the owner described it in a chat. Lauren Tan's development pyramid ends in an outer loop: problems reach agents by themselves, and agents fix them, once the inner loop is reliable. Its first three layers are in place: the dead-code lint ([#333](https://github.com/Guccimane44/Vocalbularium/pull/333)), `npm run drive` with its feature map ([#334](https://github.com/Guccimane44/Vocalbularium/pull/334)) and `npm run check:sessions` ([#335](https://github.com/Guccimane44/Vocalbularium/pull/335)).

## Decision

**The account menu gets Report a problem…, right under Diagnostic logs. A report is saved in the local database; a daily agent turns it into an issue and a fix PR that the owner merges.**

- **Where.** The account menu holds, in order: Appearance, Language, Diagnostic logs, **Report a problem…**, a rule, Log out. It works from any screen.
- **The report.** A dialog titled **Report a problem** asks what it is about and what went wrong:
  - On a page, **About** offers *The whole page* (chosen first) and each of the page's content cards by its module's name. Elsewhere it offers *This screen*.
  - **What went wrong?** takes the user's own text, required, at most 2,000 characters.
  - **Sent with your report** lists what is kept with it: the page and its cards as they are now (on a page), both builds, and, ticked by default, the diagnostic logs of the last 15 minutes.
  - **Save report** saves it; **Cancel** closes the dialog. A notice then says **Report saved**, with **Undo** for as long as it shows.
- **Where it is kept.** The API stores the report in a new `reports` table: its text, the screen, the page and card it is about, the page as it was, both builds and, when ticked, the logs. It stays there when the page is deleted. Saving is idempotent by its operation ID, like every mutation, and the logs, read at the time of saving, are not part of the receipt's fingerprint. Undo deletes a report that has not been filed yet.
- **The daily agent.** A scheduled Claude Code task on the owner's Mac reads new reports (`npm run reports`) and opens one GitHub issue per report. The issue carries only:
  - the user's sentence;
  - what the report is about: the screen and the module type, not the card's content;
  - both builds.

  The page and the logs stay local, because the repository is public and they hold captured text, prompts and generated output. The task records the issue's number on the report. For each such issue it then reproduces the problem with `npm run drive`, writes a check that fails, fixes it, and opens a PR with the evidence and **Defaults taken**. **It never merges**: the owner does.

## Consequences

- One migration adds the `reports` table. Upgrades keep every account, deck and page; earlier builds have no reports.
- The account menu's screen changes, and the dialog is a new screen in the screen catalogue.
- What the agent may change unattended is limited to opening branches and PRs. Widening it, for example to merge low-risk changes, needs a new decision.
