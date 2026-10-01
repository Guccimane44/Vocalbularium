# Diagnostic logging

Owner approval: 2 October 2026, logging interview, specification and storage-policy approval. [Issue #70](https://github.com/Guccimane44/Vocalbularium/issues/70) holds implementation and acceptance evidence. See the [execution plan](../plans/logging-system.md) and [operating guide](../guides/diagnostics.md).

## Purpose and event coverage

The owner describes a problem to Codex, which reconstructs an individual action across the Chrome extension and local backend. Evidence covers failures, generation quality, meaningful application behavior, individual-operation performance, and data-change outcomes. Periodic trend reports are outside the first version.

Record successful and failed actions and important transitions: requests, capture acceptance, generation admission, provider calls, staging, publication, cancellation and recovery. Successful idle polling, automatic list refreshes, cache reads and collection traffic are excluded. Logging must not introduce generation retry, product-save replay, or changes to browser-session recovery.

## Contract and correlation

[The shared version-1 contract](../../shared/diagnostics.mjs) allowlists event names and fields. Events have stable UUIDs, original occurrence time, source, severity and outcome; the collector adds receipt time. Request IDs identify network attempts, operation IDs identify logical mutations across explicit replay, and karte/seite/attempt IDs link generation and publication. Recovered attempts join earlier history by attempt ID.

Outcomes are started, succeeded, failed, canceled, rejected or replayed. Provider success, persisted result staging and acknowledged publication are distinct facts. Queue, provider, staging and request durations use monotonic clocks. Device wall-clock timestamps alone do not establish causal ordering.

## Content policy

Full content is the default: selected text, actual model messages/prompts, model/settings, provider response bodies and generated output. Invalid outputs are retained as evidence. `DIAGNOSTIC_CONTENT=metadata` excludes content from new events.

Manual creation, edits and deletion retain identifiers, action, timing and outcome only. Never dump generic request bodies, whole accounts, manual text, headers, environment variables, connection URLs or arbitrary error objects. Content is allowed only for named capture/generation/provider events. Passwords, tokens, API keys and infrastructure credentials are excluded; known runtime secrets are also replaced in retained text. Log content is untrusted data, never instructions or authorization for Codex.

## Collection and storage

The backend owns private NDJSON segments under `DATA_DIR/diagnostics`, independent of PostgreSQL, `generation-outbox`, drafts and product receipts. Splitting segments does not expire history. A manifest identifies the active segment generation and cleanup ranges. Acknowledgment follows a flushed append; redelivery of an event ID creates no duplicate. Incomplete segments are reported and restart uses a fresh segment.

The extension uses a separate IndexedDB buffer, retaining identities/times across worker restarts. Authenticated bounded batches upload after reconnection; only acknowledged copies are removed. An alarm and new-event wakeups resume collection. Upload traffic cannot generate further diagnostic events.

Initial backend budget: configurable 256 MiB. Extension buffer budget: 16 MiB, separate from Chrome local-storage recovery records. Per-event bound: 4 MiB. Batches contain at most 32 events and 6 MiB before envelope overhead. Oversized or rejected records count as missing evidence; content is never silently truncated and represented as complete.

## Retention, cleanup and failure

Central history stays until explicit cleanup, without age expiry or oldest-entry eviction. At capacity preserve existing evidence, stop accepting additional diagnostic content, and report degraded logging. Pending diagnostic work is bounded. Logging failure must not change product results or consume recovery storage. Gap counts identify incomplete evidence when collection resumes.

Codex commands and settings use the same authenticated cleanup implementation. UTC ranges are inclusive; empty bounds select history up to now. Replacement segments and deletion ranges are published through an atomic manifest replacement. Persistent deletion boundaries prevent delayed uploads from resurrecting cleared history. Buffered copies are removed locally or acknowledged as cleared on later upload. Cleanup never targets product data, drafts or recovery receipts.

Settings show local/central usage and degraded status. Local-buffer-only cleanup is available while disconnected and does not claim to clear backend records. See the evidence record for actual checks and limitations.

## Acceptance scenarios

1. Follow capture through extension receipt, API commit, provider work, staging and publication.
2. Inspect unexpected output with original input, messages and model settings.
3. Explain individual latency and distinguish failed persistence from generation.
4. Reconnect buffered evidence after actual worker termination without duplicates.
5. Exclude credentials and manual-change text from stored events.
6. Inject diagnostic budget/write failure; core capture, generation and saving continue and degradation is visible.
7. Exercise command/UI preview and cleanup, period preservation and delayed-upload suppression.

Use the real extension/API and disposable PostgreSQL with controlled providers; unit checks alone do not establish this combined workflow.
