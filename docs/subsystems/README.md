# Subsystem references

Each page describes one part of Vocabularium as it works today: what it is responsible for, which code holds each piece, the path a request takes, what must hold and what happens when something fails, and how to check it. Start with the page for the area you are changing, then follow its source links to the code.

| Subsystem | What it covers | Reference |
| --- | --- | --- |
| Capture and save | The context-menu capture, its receipt, the feedback popup and badge, and saving through operation receipts, **Try saving again** and recovery after the worker stops | [Capture and save](capture-and-save.md) |
| Sessions and recovery | Sign-in, one browser session per installation, refreshing open views, and what Chrome or the API stopping does to work in progress | [Sessions and recovery](sessions-and-recovery.md) |
| Store | PostgreSQL, the ordered executor, the schema and migrations, decks, pages and components, page summaries | [Store](store.md) |
| Generation | Attempts and runs, capacity, Retry of a card, a facet or the core, the journal, stage and publish, the text provider | [Generation](generation.md) |
| Audio | Spoken parts, clips and their jobs, the speech provider | [Audio](audio.md) |
| Module catalog | Modules and facets, their shapes, flags, checks, prompts and page text; the composer; golden sets and the gate | [Module catalog](module-catalog.md) |
| Interface | Visual identity, themes, list states, motion, dialogs and text content, shared by every screen | [Interface](interface.md) |
| Localisation | Interface languages, catalogues, the account's preference, right to left | [Localisation](localisation.md) |
| Observability and reports | Diagnostic logs on both sides, and **Report a problem** with its GitHub issues | [Observability and reports](observability-and-reports.md) |
| Packaging and releases | The build, the package, release notes, build identity and CI | [Packaging and releases](packaging-and-releases.md) |

What is left in [`docs/specs/`](../specs/) describes screens, and moves to the [screen references](../screens/README.md).

How a screen looks and what the user can do on it is in the [screen references](../screens/README.md). A subsystem page explains how the mechanism works and links to the screens that show it. A rule that every change must keep is in the [code standards](../code-standards.md).

## What a page contains

Every page uses the same sections, in this order, and leaves out a section only when it has nothing to say:

1. **An opening paragraph**: what the subsystem does and where it ends.
2. **Responsibilities and sources of truth**: a table with the columns *Part*, *Responsibility* and *Source*. The source links the file and names the function, class or table that holds the piece.
3. **Runtime path**: the numbered steps a request takes through the code, from the user's action to the stored result.
4. **Behaviour**: the rules the user can observe, in the product model's terms. These are the rules the specifications used to hold.
5. **Constraints and failure behaviour**: what must always hold, and what the user and the store see when a step fails.
6. **Verification**: the tests and commands that prove the behaviour, each with what it covers.

## Keep a page current

- **Update the owning page in the same PR** when a change alters a responsibility, an interface, a stored state or its transitions, a runtime path, a compatibility rule or a failure behaviour. A refactor that keeps all of these needs no prose change.
- **Keep each fact on one page** and link to it from everywhere else, including AGENTS.md and the skills.
- **Link to files and name functions** rather than copying code. Explain what a signature can't say: why a field exists, what a value means, which order matters.
- **Describe current behaviour only.** A proposal belongs in its issue, PR or decision file. History (when something changed, which release, which incident) belongs in git, the [release notes](../releases/README.md) and [LESSONS.md](../../LESSONS.md), never in the page.
- **A new subsystem gets its page** in the PR that creates it, and a row in the table above.

## Describe a PR's change

For each subsystem a PR touches, its description says:

- what triggers the change, and the behaviour before and after;
- any change to an interface, stored state, compatibility or failure behaviour;
- the page it updated, the code that implements the change, and the test or journey that shows it;
- or, for a refactor, that the documented behaviour is unchanged.

This is the author's claim. The reviewer checks it against the diff.

## Review a change

1. Find the subsystems the change touches and the path a request really takes through them.
2. Compare the claimed before and after with the code at the base and at the head. Follow the callers and the state changes beyond the changed lines.
3. Check that each changed rule appears on its owning page and that the page's source links still point at the right code.
4. Check that the cited tests or journeys exercise the claimed behaviour. Report the checks that were not run.

An updated page does not prove the code is right. Behaviour changes still need their tests.
