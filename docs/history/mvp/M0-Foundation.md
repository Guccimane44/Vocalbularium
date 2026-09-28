# M0 foundation decisions and evidence

Related: [M0 issue #6](https://github.com/Guccimane44/Vocalbularium/issues/6), [delivery tracker #5](https://github.com/Guccimane44/Vocalbularium/issues/5), and [implementation plan](MVP-Implementation-plan.md#m0--validate-the-foundation).

Foundation-stage status: local foundation validated; Windows acceptance and hosted connections were pending at that stage. The owner authorized simple defaults and explicitly requested continued implementation while arranging Windows later. [Draft PR #13](https://github.com/Guccimane44/Vocalbularium/pull/13) contains this work. The later [M6 deployment record](M6-Delivery.md#render-free-deployment) documents the now-live Render Free backend and OpenCode Go generation; owner Windows acceptance remains open.

## Selected defaults

| Area | Decision and reason |
| --- | --- |
| Extension | Manifest V3; native JavaScript modules, HTML, and CSS. The small plain-text MVP can use browser controls without a UI framework or bundler. |
| Browser baseline | Chrome 120 or newer as an initial compatibility baseline. The actually tested Chromium version is recorded below; minimum-version and Windows confirmation remain separate checks. |
| Backend | Node.js 24, one application process and one synchronous account mutation writer. Network/model work stays outside database transactions. |
| Storage | SQLite through Node's built-in `node:sqlite` API. Stable page IDs and foreign keys preserve layout identity and prevent deleted objects from being recreated by late writes. Keep one backend instance for this iteration. See [Node SQLite documentation](https://nodejs.org/api/sqlite.html). |
| Hosting | Updated for owner testing: one Render Free web service with temporary SQLite storage and no paid disk. Sleep, restart, and redeploy reset test data. Persistent hosted storage remains open for production. See [Render Free](https://render.com/docs/free) and the [test-phase exception](MVP-Product-scope.md#10-first-iteration-delivery-and-deferred-work). |
| Generation | Updated for owner testing: OpenCode Go Chat Completions with `deepseek-v4.1-flash`, configurable through `OPENCODE_MODEL`. Prompt for JSON and validate it locally before staging page output; no automatic model fallback. The live Go provider smoke passed; see [recorded samples](evidence/deepseek-v4.1-flash-smoke-2026-09-12.json). See [OpenCode Go](https://opencode.ai/docs/go/). |
| Account refresh | Start with refresh when a view opens and every five seconds while active, retaining unsaved drafts. Record any later adjustment with the runtime defaults. |
| Verification | Node's test runner for database behavior and Playwright with Chromium for the extension. The laboratory provider stages deterministic text after 5.5 seconds in browser tests. |

## Lifecycle design under test

An installation ID persists locally. Each new browser session receives an ID in `chrome.storage.session` and increments a durable local session counter. The counter orders sessions for this installation only; it is not used to order account edits. Worker reconnection reuses the same session. A newer session invalidates unfinished attempts from the previous session of that installation.

The backend first stages generation results. Only a separate request from the originating, still-current browser session can publish them to page content. Reopening Chrome reconciles the previous session before processing results. A delayed session-registration request cannot replace a newer session. Detailed expected outcomes remain in the [interruption rules](MVP-Product-spec-select-and-add.md#chrome-closing-during-generation).

Short polling runs while attempts are active; a Chrome alarm provides recovery after worker suspension. Capture receipts and pending publication requests are saved locally before transmission. No dashboard tab is required for processing. Chrome documents independent worker termination and the differing local/session storage lifetimes: [worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

This approach detects a full browser-session transition on reopening. It does not claim an instantaneous server-side browser-exit notification. Forced process termination is tested below; Windows background-mode behavior and the boundary between final result publication and browser exit remain explicit acceptance checks.

## Persistence design under test

Complete mutation commands enter one synchronous database writer. Successful transactions receive monotonically increasing receipt sequences. Multi-page saves validate all affected pages before writing, and generation happens outside transactions. Failed lock checks do not create success receipts, so explicit resubmission can be evaluated again.

Every distinct action has an operation ID and payload fingerprint. A retransmission of a committed operation returns its original receipt without applying it again. Reusing that ID for a different payload is rejected. Repeated user captures get new IDs. This supports the [saving contract](MVP-Product-spec-select-and-add.md#saving-and-synchronization-failures) without content-based deduplication.

Saved page text, deck module instructions, and original input are separate data. Attempt records retain module snapshots; current layouts determine which stable page identities still exist. The prototype tests these persistence mechanisms directly; the complete layout editor and confirmation flow belong to M3.

## Capture feedback approach

On an ordinary page, inject an isolated, non-modal feedback surface into the top frame. The captured text comes from the context-menu selection, including selections in child frames. Each action has its own feedback item and timer. On a surface where injection is prohibited, try a small unfocused extension popup window. The exact user interaction remains governed by the [feedback specification](MVP-Product-spec-select-and-add.md#capture-feedback-popup).

The implementation uses documented [script injection](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [window creation](https://developer.chrome.com/docs/extensions/reference/api/windows). Native context-menu behavior, restricted-surface fallback focus, and Windows presentation need manual confirmation; browser tests that call the capture handler do not prove native menu interaction.

## Verification record

Run commands from [the README](../README.md#verification). Record passing evidence only after the corresponding check actually completes.

| Check | Current evidence |
| --- | --- |
| Syntax, JSON, and whitespace | Passed on 11 September 2026. |
| Account database tests | 11 passed on Node.js 24.19.0: persistence, operation receipts, duplicate captures, canonical payload comparison after storage roundtrips, publication ownership, session recovery, save ordering, atomic lock rejection, snapshots, and deletion. |
| Real Chromium lifecycle and feedback | Passed on Chromium 151.0.7922.34 / macOS: three-second feedback, dismissal, repeated captures, dashboard closure, actual worker stop/restart, two browser profiles, normal browser close/reopen, and explicit recovery from an incomplete save acknowledgment. |
| Native context menu | Passed through the visible macOS Chrome UI: selected `幸福` and the child-frame sentence `我真的很幸福`; invoked the native action; observed feedback and both saved cards through the extension button. |
| Restricted-page fallback | Automated fallback-window creation and manual dismissal passed. Native focus/presentation on the owner's Windows environment remains pending. |
| Abrupt process termination | Passed by forcibly terminating the disposable browser process during generation, allowing a server result to arrive, reopening the same profile, and checking interruption and stale-result rejection. |
| Publication/exit boundary and Windows background mode | Pending Windows acceptance. |
| Owner's Windows environment | Pending owner setup. |
| Hosted account access and live provider | Pending M1/M2 service setup and credentials. |

## Remaining scope

This prototype intentionally contains no product login or complete card/deck editor, and its generated-looking text is illustrative. M1/M2 still need authenticated API validation, full pending-save recovery across session changes, provider error handling, and live generation. The existing specifications remain unchanged.

Keep M0 open for its remaining acceptance evidence. Continue the local M1 implementation using the validated foundation, as the owner requested. The linked GitHub issue and draft PR record completed substeps and outstanding checks separately from later milestone work.
