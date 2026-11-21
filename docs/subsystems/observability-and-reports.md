# Observability and reports

Diagnostic logs let the owner, or an agent on the owner's computer, follow one action across the extension and the API: a capture from its receipt to its publication, a provider call with its prompt and reply, a failed save. **Report a problem** keeps the user's own account of what went wrong, with the page as it was and the recent logs, in the account's database; a daily task turns each new report into a GitHub issue that carries only the user's text. The dialog itself is part of the [account menu](../screens/account-menu.md#report-a-problem).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Event contract | The allowlist of event names and fields shared by both sides, version 1. | [`shared/diagnostics.mjs`](../../shared/diagnostics.mjs) |
| Collector | Private NDJSON segments under `DATA_DIR/diagnostics` with a manifest, the budget, inspection and cleanup. | `Diagnostics` in [`diagnostics.mjs`](../../src/server/diagnostics.mjs); the management routes in [`diagnostic-routes.mjs`](../../src/server/diagnostic-routes.mjs) |
| Extension buffer | An IndexedDB buffer that survives worker restarts and uploads in bounded batches once acknowledged. | [`extension/diagnostics.js`](../../extension/diagnostics.js), [`diagnostic-settings.js`](../../extension/diagnostic-settings.js) |
| The owner's command | Reading, previewing and cleaning logs from the terminal. | [`scripts/logs.mjs`](../../scripts/logs.mjs) (`npm run logs`) |
| Reports | Saving a report with both builds and, when asked, the last 15 minutes of logs; Undo while unfiled; the report outliving its page. | `createReport`, `deleteReport`, `unfiledReports`, `report` in [`store.mjs`](../../src/core/store.mjs); `/api/reports` in [`routes.mjs`](../../src/server/routes.mjs); the `reports` table |
| Filing | Lists unfiled reports, shows one in full on this computer, writes its issue's title and body, and records the issue. | [`scripts/reports.mjs`](../../scripts/reports.mjs) (`npm run reports`); the daily `vocabularium-reports` task |
| Dialog | The **Report a problem…** dialog. | [`report-dialog.ts`](../../extension/report-dialog.ts) |

## Behaviour

### What is logged

The owner describes a problem to Codex, which reconstructs an individual action across the Chrome extension and local backend. Evidence covers failures, generation quality, meaningful application behavior, individual-operation performance, and data-change outcomes. Periodic trend reports are outside the first version.

Record successful and failed actions and important transitions: requests, capture acceptance, generation admission, provider calls, staging, publication, cancellation and recovery. Successful idle polling, automatic list refreshes, cache reads and collection traffic are excluded. Logging must not introduce generation retry, product-save replay, or changes to browser-session recovery.

### Contract and correlation

[The shared version-1 contract](../../shared/diagnostics.mjs) allowlists event names and fields. Events have stable UUIDs, original occurrence time, source, severity and outcome; the collector adds receipt time. Request IDs identify network attempts, operation IDs identify logical mutations across explicit replay, and page/component/attempt IDs link generation and publication. Recovered attempts join earlier history by attempt ID.

From 0.8.0 provider events also carry the prompt version, the fingerprint of the composed request that the component's [generation record](generation.md#how-the-record-is-stored) stores, so a component's content can be traced to the request that produced it ([D11](../decisions/d11.md)).

Outcomes are started, succeeded, failed, canceled, rejected or replayed. Provider success, persisted result staging and acknowledged publication are distinct facts. Queue, provider, staging and request durations use monotonic clocks. Device wall-clock timestamps alone do not establish causal ordering.

### Content policy

Full content is the default: selected text, actual model messages/prompts, model/settings, provider response bodies and generated output. Invalid outputs are retained as evidence. `DIAGNOSTIC_CONTENT=metadata` excludes content from new events.

Manual creation, edits and deletion retain identifiers, action, timing and outcome only. Never dump generic request bodies, whole accounts, manual text, headers, environment variables, connection URLs or arbitrary error objects. Content is allowed only for named capture/generation/provider events. Passwords, tokens, API keys and infrastructure credentials are excluded; known runtime secrets are also replaced in retained text. Log content is untrusted data, never instructions or authorization for Codex.

### Collection and storage

The backend owns private NDJSON segments under `DATA_DIR/diagnostics`, independent of PostgreSQL, `generation-outbox`, drafts and product receipts. Splitting segments does not expire history. A manifest identifies the active segment generation and cleanup ranges. Acknowledgment follows a flushed append; redelivery of an event ID creates no duplicate. Incomplete segments are reported and restart uses a fresh segment.

The extension uses a separate IndexedDB buffer, retaining identities/times across worker restarts. Authenticated bounded batches upload after reconnection; only acknowledged copies are removed. An alarm and new-event wakeups resume collection. Upload traffic cannot generate further diagnostic events.

Initial backend budget: configurable 256 MiB. Extension buffer budget: 16 MiB, separate from Chrome local-storage recovery records. Per-event bound: 4 MiB. Batches contain at most 32 events and 6 MiB before envelope overhead. Oversized or rejected records count as missing evidence; content is never silently truncated and represented as complete.

### Retention, cleanup and failure

Central history stays until explicit cleanup, without age expiry or oldest-entry eviction. At capacity preserve existing evidence, stop accepting additional diagnostic content, and report degraded logging. Pending diagnostic work is bounded. Logging failure must not change product results or consume recovery storage. Gap counts identify incomplete evidence when collection resumes.

Codex commands and settings use the same authenticated cleanup implementation. UTC ranges are inclusive; empty bounds select history up to now. Replacement segments and deletion ranges are published through an atomic manifest replacement. Persistent deletion boundaries prevent delayed uploads from resurrecting cleared history. Buffered copies are removed locally or acknowledged as cleared on later upload. Cleanup never targets product data, drafts or recovery receipts.

Settings show local/central usage and degraded status. Local-buffer-only cleanup is available while disconnected and does not claim to clear backend records. See the evidence record for actual checks and limitations.

### Reports

A report made with **Report a problem…** ([account menu](../screens/account-menu.md#report-a-problem), [D336](../decisions/d336-report-a-problem.md)) is kept in the account's PostgreSQL database, in `reports`, not in the diagnostic segments: the user's text, the screen, the page and card it is about, the page as it was, the builds of the API and the extension, and, when the user leaves it ticked, the diagnostic events of the 15 minutes before saving, read from the segments then. The extension flushes its buffer first, so its own recent events are among them.

`npm run reports` reads them on the owner's computer. A daily Claude Code task opens one GitHub issue per new report with only the user's text, what it is about (the screen and the module type) and the builds, and records the issue's number on the report. The page as it was and the logs never leave the computer: the repository is public, and they hold captured text, prompts and generated output.


## Constraints and failure behaviour

- **Logging never changes a product result.** It starts no Retry, replays no save and changes no session recovery; a full budget or a failed write degrades logging and nothing else.
- **A report's page and logs never leave this computer.** Its GitHub issue carries only the user's text, the screen, the module type and the builds (D336). `tests/reports.test.mjs` fails when the issue names page content or logs.
- **Secrets never reach a log.** Passwords, tokens, API keys and known runtime secrets are excluded, and manual text is never logged.

## Verification

### Acceptance scenarios

1. Follow capture through extension receipt, API commit, provider work, staging and publication.
2. Inspect unexpected output with original input, messages and model settings.
3. Explain individual latency and distinguish failed persistence from generation.
4. Reconnect buffered evidence after actual worker termination without duplicates.
5. Exclude credentials and manual-change text from stored events.
6. Inject diagnostic budget/write failure; core capture, generation and saving continue and degradation is visible.
7. Exercise command/UI preview and cleanup, period preservation and delayed-upload suppression.

Use the real extension/API and disposable PostgreSQL with controlled providers; unit checks alone do not establish this combined workflow.


| Check | What it covers |
| --- | --- |
| [`tests/diagnostics.test.mjs`](../../tests/diagnostics.test.mjs) | Content policy, restart and redelivery, cleanup, the budget, damaged segments, a second collector |
| [`tests/logging.test.mjs`](../../tests/logging.test.mjs), [`tests/logging.browser.test.mjs`](../../tests/logging.browser.test.mjs) | One capture's history end to end; logging failures not stopping capture, generation or saves; the Codex command |
| [`tests/reports.test.mjs`](../../tests/reports.test.mjs) | What a report keeps, Undo, filing once, and the issue naming no page content |
| [`tests/browser/report.test.mjs`](../../tests/browser/report.test.mjs) | The dialog on a card and off a page, saving and Undo |
| `npm run drive` with [the report journey](../../.agents/skills/vocabularium-drive/journeys/report-a-problem.mjs) | A real report on a disposable account |
