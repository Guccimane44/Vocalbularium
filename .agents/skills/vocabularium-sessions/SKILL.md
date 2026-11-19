---
name: vocabularium-sessions
description: "Check the store's promises about browser sessions and operation receipts on every order of operations, against the real store on PostgreSQL, and extend the check. Use when a change touches openSession, capture, stage, publish, deletePage, receipts or the attempts' session fencing."
---

# Vocabularium Sessions

Two browser sessions of one installation (the browser restarts), captures from each, a result staged and published, a page deleted, an operation ID reused: tests check the orders someone thought of. `npm run check:sessions` runs every order of these operations, each on a fresh copy of a migrated database, and checks five rules after every step. It runs in CI after `npm test`.

## What it proves

| Rule | In plain words | Harm if broken |
| --- | --- | --- |
| replay | An operation ID used again with the same payload returns its first result and changes nothing. | A resent capture makes a second page; a resent publish writes twice. |
| reuse | An operation ID used again with another payload is refused (`operation_reused`) and changes nothing. | One receipt silently stands for two different changes. |
| stale | An operation from a browser session that has ended, or never opened, changes nothing. A replay of its own earlier receipt is the one exception. | An old browser overwrites what the new one did. |
| fenced | Once a session ends, none of its attempts is still loading, and a component and its attempt agree on loading or completed. | A card spins forever, or a late result lands after its session ended. |
| deleted | A deleted page never comes back, nor do its components or attempts. | A late result or a resent capture recreates a page the user deleted. |

**Scope.** These operations: open session A, open session B (a newer epoch of the same installation), capture from A, capture from B, capture from A again with another word under A's operation ID, stage A's result, publish it from A, publish it from B, and delete A's page.

**Bound.** None within that scope. An order whose last step changed nothing behaves like a shorter order, so the check extends only orders that changed something. It stops when no order adds anything new: 540 orders, about 30 seconds.

**Not covered:**
- requests running truly in parallel (the store admits them one at a time through its ordered executor);
- a second installation;
- Retry, facet attempts, deck changes and audio;
- the API routes and the extension's receipts.

## Run it

```bash
npm run check:sessions
```

It needs PostgreSQL and `.env.postgres`, like `npm test`. `--depth <n>` stops at orders of `n` steps; `--workers <n>` sets how many orders run at once (6 by default).

## Read a failure

A failure names the rule, what broke it, and a shortest order of steps that breaks it, each with how it ended (`done`, `replayed` or `refused (<code>)`):

```
Broke "fenced": attempt of browser-a still loading after its session ended.
  1. open A: done
  2. capture from A: done
  3. open B: done
```

Replay those steps in a test (`tests/postgres.test.mjs` has the fixtures) to see the state. The check found a real bug when the rule is right and the code is wrong. Never weaken a rule to make the check pass. If the product changed on purpose, change the rule and its row above in the same PR, and say why.

## Extend it

A change to these operations, or a new operation with the same promises, adds a step to `STEPS` in `scripts/check-sessions.mjs`. Each step has:

- a name;
- the operation ID it uses, if any, and its payload, so the replay and reuse rules know when it is a repeat;
- the session it acts for, if any;
- what it runs.

A step that needs an earlier result throws `Disabled` until that result exists (see `need`). Then break the real code the step guards, see the check fail, and restore it.

## What it was last confirmed against

- `src/core/store-sessions.mjs`: `command`, `openSession`, `requireSession`
- `src/core/store-generation.mjs`: `capture`, `startRun`, `stage`, `publish`
- `src/core/store-pages.mjs`: `deletePage`

These were confirmed at commit `4bb009b`. On that commit, each of these broken variants failed the check with a shortest order of 2 or 3 steps:

- the fingerprint check removed;
- capture's session check removed;
- a new session no longer failing the old one's loading attempts;
- delete page removing only the cards.

When those functions change, run the check, and update this list and the commit.
