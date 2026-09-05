# Architecture and synchronization

## Repository and runtime

Vocabularium is a monorepo with a React/Vinext browser app, Cloudflare Worker API/D1 database, a plain Manifest V3 Chrome extension, and SwiftUI iOS sources. The root package delegates development and tests to the browser package. Its deployment build stages that package’s Worker and migration artifacts without bundling native clients into the Worker.

The Site is registered once. Root and browser `.openai/hosting.json` files describe the same Site; the root build checks they match. Runtime credentials never belong in these files.

## Account aggregate and atomic changes

D1 stores each account’s bounded MVP library as a JSON aggregate with a revision column. Every mutation reads the current revision, applies a pure domain operation, and writes only when the revision still matches. Contending writes replay against the canonical state; after twelve failed attempts the caller receives a conflict.

This intentionally favors correctness and a small operational footprint for the initial 100-page allowance. It is not a large-library database design. Limits are 20 wordlists, six answer pages per preset, 1,000 active saved words, and a 1.8 MB serialized account record. Reaching capacity produces an explicit error, never silent data loss. Before larger quotas or commercial tiers, normalize cards, jobs, revisions, observations, receipts, and usage into indexed tables and introduce cursor-based change feeds.

Sessions and verification challenges are separate indexed tables. Session tokens are random and stored as hashes. Verification codes expire in ten minutes, are single use, allow five attempts, and use an HMAC with a server secret. Rate limits are atomic. Apple identity tokens are verified against Apple’s keys, issuer, configured audiences, expiry, and a single-use nonce challenge.

Preview accounts and live identities have separate namespaces. Email and Apple identities currently remain separate accounts; verified identity linking/merging is still an explicit acceptance task. Never infer a link from a client-provided email address.

## Capture and generation

Each mutation has a stable UUID, a device ID, and a typed payload. A receipt binds its UUID to its exact logical request. Replay returns the original result; reuse with different data fails.

Capture saves original spelling, context, source URL, selected/hinted source, and an immutable preset snapshot. Repeated captures of the same entry add occurrences and reuse the card. An unsupported entry can be resubmitted with improved context. Explicit alternate-language learning creates a separate lexical card.

Quota is computed from the one-time grant minus completed pages and reserved pages. Capture reserves the full configured page set atomically; insufficient allowance leaves the word saved without starting a partial request. Each validated publication commits one unit. Failed or deleted pages release their reservation. Retries only request missing pages; explicit regeneration applies the current list preset and charges successful pages while preserving the card’s schedule and old valid content.

Durable jobs use leases. After capture acceptance, the Worker starts generation with `waitUntil`. Foreground clients and the Chrome alarm can resume interrupted jobs. The job runner has a bounded lease/recovery count. **A separately provisioned scheduled/queue worker remains required for guaranteed autonomous recovery when no client returns and Worker execution was interrupted.** No background-delivery guarantee is claimed for iOS.

The generator resolves a shared meaning inventory before generating language pages. Every explanation/example uses an application-assigned meaning ID. Structural checks enforce exact ordered coverage, presentation policy, one example per enabled meaning, no duplicate examples, and compatible page/inventory revisions. The live adapter additionally asks a separate model check about language/script and semantic pairing. This is not a substitute for speaker evaluation.

Successful siblings and previous page revisions survive a failed regeneration. Deleted cards and deleted accounts reject late publication. Usage includes provider/model, input/output tokens, page language, attempts, latency, and optional cost estimates when explicit prices are configured. No cost figure is invented when prices or provider usage are unavailable.

## Review semantics

`ts-fsrs@5.4.2` supplies the single card schedule with desired retention 0.9 and deterministic fuzz disabled. Due times are UTC instants. The account time zone defines daily new-word limits. Due reviews precede new words.

An attempt freezes one Essential language, its answer page, meaning inventory, preset, and base scheduling revision. Essential languages rotate on completed, applied reviews. Revealing and paging do not change scheduling. Ratings require reveal and are bounded to Again/Hard/Good/Easy. Device times more than five minutes ahead are rejected; accepted timestamps are clamped to the attempt and previous review.

The first server-accepted observation from a base revision advances the schedule. Other observations remain in history with `applied:false`; they do not advance rotation or scheduling. Duplicate delivery of the same mutation creates no extra observation. This explicit receipt-order rule provides one canonical outcome on every client rather than last-write-wins replacement of history.

## Client durability and account switching

Browser IndexedDB stores snapshots and pending mutations under their account owner. Browser storage is a cache/outbox, not the source of truth. Sync checks the authenticated owner before uploading. Permanent validation/conflict failures remain visible for explicit dismissal. Signing out clears the active-account pointer; expired/deleted sessions lock the visible library. The production service worker caches only the app shell and static assets, never API responses.

Chrome stores each pending capture under its own key. Service-worker restart cannot lose the queue. A changed account cannot claim another account’s pending items. Captures made before setup require explicit assignment after connecting. Host permission is requested only for the selected service origin.

The iOS app and extension use an App Group directory. Each mutation is written atomically to its own protected file; creation timestamps preserve causal order. Tokens stay in Keychain and are not shared with the share extension. The extension confirms local durable saving, then the main app uploads on foreground. Offline review is limited to already-prepared, cached attempts; final scheduling is server-authoritative.

## API outline

All application endpoints use no-store responses. Browser sessions use HttpOnly, SameSite cookies (Secure on HTTPS); native clients use bearer tokens.

- `GET /api/auth/config`: available sign-in integrations and preview eligibility.
- `POST /api/auth/preview`: platform-authenticated private preview session.
- `POST /api/auth/email/request`, `.../verify`: code authentication.
- `POST /api/auth/apple/start`, `.../callback`, `.../native`: Apple challenge and token verification.
- `GET /api/sync?cursor=<revision>`: canonical account snapshot or unchanged response.
- `POST /api/mutations`: durable, idempotent application changes.
- `POST /api/jobs/run`: bounded lease-based generation progress for the signed-in account.
- `POST /api/devices/token`: a 30-day account-scoped device session.
- `GET /api/account/export`, `DELETE /api/account`, `POST /api/auth/logout`.

A full snapshot is currently returned when the revision changes. Fine-grained delta sync, multi-account identity linking, and large-library compaction remain migration work before a broad public launch.
