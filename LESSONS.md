# Lessons from merged work

Read this before changing code. Each lesson is what merged work got wrong and the rule that would have caught it. A lesson seen on three separate days moves into the [code standards](docs/code-standards.md) or the [rules table in AGENTS.md](AGENTS.md#rules-and-what-enforces-them), and leaves this file.

## How a lesson is written

```markdown
**The rule, in one sentence, as an instruction.**
- What happened: the commit or PR, what it did wrong, and what fixed it.
- How to check for it next time.
- Seen 1× (2026-11-21).
```

- **Write the rule so a reviewer can check it.** "Test the receipt after a worker restart" is checkable; "be careful with receipts" is not.
- **Fix the class, not the sample.** Name the whole kind of mistake, not just the case that was reported.
- **Evidence is short.** A commit or PR link and one line each. The story belongs in the PR.
- **Each time the mistake is seen on another day**, add its evidence line and raise the count. On the third day, move the rule into the code standards or the AGENTS.md rules table, with its check, and add a line under [Moved](#moved) saying where it went.
- **A lesson that no longer applies** (its code is gone, or a design now makes the mistake impossible) is deleted, with the reason in the commit message.

## Lessons

No lessons yet.

## Moved

Rules that were seen a third time and now live in the code standards or AGENTS.md, one line each with where they went.

None yet.
