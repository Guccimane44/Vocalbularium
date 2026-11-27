---
name: vocabularium-captures
description: "Model-check the capture protocol between the extension and the store, from the menu click to a saved page, on every order of lost replies, Try saving again, worker restarts and browser restarts, with TLA+ and TLC. Use when a change touches handleCapture, submit, reconcile, initialize, Try saving again, prepareCapture, capture, command, openSession or requireSession."
---

# Vocabularium Captures

A capture crosses three places that each keep state: the worker's receipt in `chrome.storage.local`, the wire, and the store's receipts and sessions. Tests check the orders someone thought of. `npm run check:captures` runs TLC over a TLA+ model of all three and checks six rules after every step of every order, within the bounds below. The store alone, on real PostgreSQL, is checked by the [sessions skill](../vocabularium-sessions/SKILL.md); this check is the extension and the store together, as a model.

## What it proves

| Rule | In plain words | Harm if broken |
| --- | --- | --- |
| `OnePage` | A capture never makes a second page, whatever is resent. | The same word twice in a deck. |
| `NeverLost` | A capture the user made has its page, or a receipt to retry. | A capture vanishes without a trace. |
| `SavedHasPage` | A receipt says saved only when its page exists. | Recent captures says saved for a page that does not exist. |
| `NeverReused` | No capture is refused as `operation_reused`. | A capture can never be saved: every retry is refused. |
| `Fenced` | No attempt keeps loading once its browser session has ended. | A card spins forever, or a late result lands after its session ended. |
| `InFlightNotInterrupted` | A save in flight is never told it was interrupted. | Recent captures offers Try saving again for a capture that is still saving. |

**What the model holds.** The menu click (`handleCapture`), `submit` one await at a time (`context`, `/api/capture/prepare`, `/api/capture`, and its catch), Try saving again on a stored receipt, `initialize` (a new session when `chrome.storage.session` is empty, `/api/session`, then `reconcile`), `clearHandedOffCaptures`, worker restarts (session kept), browser restarts (session cleared), a deck change at any time, requests lost before the server sees them, replies lost after it served them, and requests served after their sender gave up. On the server: `command`'s receipt and fingerprint, `requireSession`, `openSession` failing the installation's loading attempts, and `capture` failing an interrupted capture's attempts at once.

**One step is one indivisible step in the code.** A store request is one step because `command` runs in one transaction through the ordered executor (`src/persistence/postgres.ts`). A worker step is the code between two awaits. `openSession` and the `reconcile` that follows it are one step: no submit can act between them, because each waits on `initialize` before its first request.

**Bounds** (in `formal/captures/Captures.cfg`): one capture, two submits at once, two deck configurations, two browser sessions, three worker lives, four requests. That is about 3.4 million states, in under a minute. Larger bounds grow fast: three sessions, four worker lives and six requests filled a 12 GB disk with TLC's state files. Raise one bound at a time, and watch `df -h`.

**Assumptions:**
- One installation. Each epoch has exactly one session ID, so sessions are modelled by their epoch.
- Session IDs, operation IDs and the main key never change once made. The fingerprint is the capture payload (session, main key, context, snapshot). `recoverySession` is not part of it.
- The menu item, once made by an `initialize`, survives worker restarts (`captureMenu` in `extension/context-menu.js`).

**Not covered:**
- Publishing, polling and the `save-*` receipts of `saveOperations`.
- Every other mutation, Retry, deck deletion, sign-out (`removeAccess`), and upgrades, which discard receipts on purpose.
- Two captures interacting (each has its own operation ID), and a second installation.
- Liveness: the check shows nothing bad happens, not that a retry eventually succeeds.

## Run it

```bash
npm run check:captures
```

It needs Java 11 or later: `JAVA_HOME`, Homebrew's `openjdk` (`brew install openjdk`), or `java` on `PATH`. The first run downloads TLC 1.7.4 into `~/.cache/vocabularium/tlc-1.7.4/` and checks its SHA-256. That download needs the owner's approval when an agent runs it. TLC keeps its state files in a temporary folder, which the script deletes afterwards.

When a rule breaks, the script reports it and checks the rest without it, so every rule gets a verdict. It exits 1 if any rule broke.

```bash
npm run check:captures -- --self-test
```

The self-test runs the model with each break below and confirms that each rule fails. It takes about 6 seconds. Run it after any change to the model: a rule that cannot fail proves nothing.

| Break | The code mistake it models | Must break |
| --- | --- | --- |
| `no-replay` | `command` runs the action without reading its receipt. | `OnePage` |
| `fail-drops-receipt` | `submit`'s catch removes the receipt. | `NeverLost` |
| `saved-before-reply` | The receipt is written saved as the request goes out. | `SavedHasPage` |
| `recovery-in-fingerprint` | `capture`'s fingerprint also holds `recoverySession`. | `NeverReused` |
| `interrupted-generates` | An interrupted capture's attempts stay loading. | `Fenced` |

`--break <name>` runs the full check with one break, to see its counterexample.

## Read a failure

A failure names the rule, its harm, and a shortest order of steps, in the code's words:

```
Broke "InFlightNotInterrupted": A save in flight is never told it was interrupted.
  A shortest order of steps that breaks it:
    1. initialize: the browser has no session, so a new one is made with the next epoch
    2. initialize: /api/session opens the session, then reconcile marks every saving capture "interrupted"
    3. Chrome stops the worker; chrome.storage.session survives
    4. the user captures from the menu: handleCapture keeps a saving receipt and calls submit
    5. initialize: /api/session opens the session, then reconcile marks every saving capture "interrupted"
```

To see the whole path state by state, or a chart of how a capture moves between states, read the model with the pstack `/statechart` skill.

Then decide whether it is a bug or a modelling error. Replay the steps against the real code. The worker can be driven with the fake `chrome` and `fetch` that `background()` in `tests/extension.test.mjs` sets up; the store with the fixtures in `tests/postgres.test.mjs`.
- If a step cannot happen in the code, the model is wrong. Fix the model, and say what was wrong.
- If every step can happen, it is a bug. Report it with the steps and the harm. Never weaken a rule, or the model, until it passes. Fix the product only when the owner asks.

**A finding open today:** `InFlightNotInterrupted` breaks, as shown above. It was reproduced against the real worker at `c3d172c`. A worker woken by the menu click runs `initialize` for the first time inside the capture's own `submit`, and `reconcile` marks that capture "The save was interrupted. Try saving again." while `/api/capture/prepare` is in flight. The capture still saves; the notice is false. Until it is fixed, `npm run check:captures` exits 1 on this rule alone, and the other five must hold.

## Change it

A change to a covered function changes its action in `formal/captures/Captures.tla`. Each action's comment names the code it stands for. Keep one indivisible step in the code as one action. Write the change from the code, not from what makes the check pass.

- A promise that changes on purpose changes its rule, here and in [capture and save](../../../docs/subsystems/capture-and-save.md), in the same PR, with the reason.
- A new code mistake worth guarding adds a break: a name in `Breaks`, an `IF … \in Breaks` at the place the mistake would be, and a line in `BREAKS` in `scripts/check-captures.mjs`. Then run `--self-test`.
- A new action adds a line to `STEPS` in the script, so its counterexamples read in plain words.

## What it was last confirmed against

At commit `c3d172c`:

- `extension/capture.js`: `handleCapture`, `submit`, `reconcile`
- `extension/background-runtime.js`: `initialize`, the `try-saving-again` message, `clearHandedOffCaptures`
- `extension/context-menu.js`: `captureMenu`
- `src/core/store-sessions.mjs`: `command`, `openSession`, `requireSession`
- `src/core/store-generation.mjs`: `capture`, `prepareCapture`
- `src/server/routes.mjs`: `/api/capture/prepare`, `/api/capture`
- `src/persistence/postgres.ts`: the ordered executor that serialises transactions

When any of these change, compare the change with its action in the model, update the model, and run the check and the self-test. Move this commit forward only after confirming that the model describes the code at the new commit. `/pstack:maintain-formal-verification-skill` does that pass for changes that skipped it.
