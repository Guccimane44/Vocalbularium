# Terminology migration boundaries

The product hierarchy is **deck → karte → seite**. See the [model](../product/model.md) and [approved plan](../plans/v0.3.0-plus-terminology-migration.md).

## Inventory and upgrade requirements

| Area | Existing representation | Migration requirement |
| --- | --- | --- |
| Extension views, configuration, context menu and errors | Visible card/page copy; component names, selectors and navigation hashes | Copy in increment 1; internals in increment 2; retain old links in increment 3 |
| Shared contracts and HTTP | `cardId`, `pageId`, `pages`, `basePageIds`; `/api/cards`, `/api/card` | Change client and server together; continue accepting previous builds |
| PostgreSQL | `cards`, `pages`, `layout_pages`; relevant columns, indexes and constraints | Add a migration; preserve original migrations and all data |
| Operation receipts | SHA-256 of sorted operation kind and payload; JSON result | Preserve the original fingerprint representation so old and new requests replay the same operation |
| Extension recovery | `capture-*`, `save-*`, cached account and session-storage `card-draft` | Read legacy fields and retain operation IDs, pending work and unsaved text |
| Generation journal | Attempt-ID filenames with `{ok,text}` results | No renamed fields; retain verbatim result text and attempt IDs |
| Tests, smoke scripts and prototype | Product names mixed with Playwright page objects | Rename product concepts only; browser pages and pagination keep their meaning |
| Historical records | Applied migrations, screenshots, quotations, evidence and past release plans | Preserve verbatim; historical card maps to karte and content page maps to seite |

Collection query pages, browser pages, webpage URLs, the deck configuration page, karte view page and karte content page remain pages. User-authored deck names, selected text and generated text are data and are never rewritten by terminology adapters.

Compatibility retirement requires an explicit later decision after supported old installations, pending operations and saved navigation links no longer need it. Receipt fingerprint compatibility remains necessary as long as historical receipts are retained.

## Current contracts and compatibility

The current schema uses `kartes`, `seites`, `layout_seites`, `karte_id` and `seite_id`. Current JSON uses `karteId`, `seiteId`, `seites`, `baseSeiteIds`, `karteCount` and `seiteCount`. Current item routes are `/api/kartes/:karteId`, `/api/decks/:deckId/kartes`, and `/api/karte/{create,save,delete,retry}`. Route structure and behavior are preserved.

Previous `/api/cards` and `/api/card` routes remain aliases. Old JSON fields remain accepted on shared routes and aliases, including capture snapshots and deck layouts. A request containing both names for the same field is rejected as ambiguous before mutation. New extension requests set `X-Vocabularium-Terminology: karte-seite`; new item routes and new request fields also select current response fields. Shared reads without that header return the legacy response dialect, so previous extension builds continue working. Legacy messages are decoded by the worker. Old `#card/` and `#new-card/` links are normalized without changing item or seite IDs.

`packages/contracts/src/terminology.ts` owns field, route, message and error-code adapters. Receipt fingerprints always use the original operation kinds and field representation; existing fingerprint/result JSON stays untouched in SQL. Replay converts stored result fields on read, returns the original sequence, and never reruns a committed mutation. Content-loss confirmation digests retain their original row representation too. Old query cursors remain accepted.

`extension/recovery.js` decodes cached accounts, pending captures and save receipts on read. The next successful write uses current fields. The editor reads `card-draft` as a fallback, writes `karte-draft`, then removes the old key; draft dictionaries, content and operation IDs survive. Pending saves are converted when explicitly submitted. Recovery does not automatically retry failed saves or restart generation. Journal filenames and `{ok,text}` data need no translation.

## Retained-term audit

| Retained terms and locations | Reason |
| --- | --- |
| `packages/contracts/src/terminology.ts`, `src/server/terminology.mjs`; old draft-key fallback in `extension/kartes.js`; old cursor kind in `src/core/store.mjs` | Explicit upgrade compatibility; removal requires the retirement conditions below |
| `migrations/0000_*`, `0001_*` and their snapshots | Previously applied immutable schema history |
| `migrations/0002_terminology.sql` | ALTER statements necessarily name the old schema objects being renamed |
| `tests/helpers/legacy-database.mjs`, `tests/terminology.test.mjs`, the populated-original-schema fixture in `tests/postgres.test.mjs`, and the upgrade scenario in `tests/app.browser.test.mjs` | Synthetic previous-build fixtures and user-text preservation assertions |
| `docs/history/`, links/anchors into history, the approved mapping plan and this boundary record | Historical evidence and exact old-to-current mapping; screenshots/release artifacts stay intact |
| Browser `page`, `pages()`, `newPage`, `fullPage`, `pagehide`, `pageUrl`; feedback and unavailable HTTP-page copy | Browser pages, webpage URLs and browser lifecycle APIs |
| Query `page`, `pageLimit`, `KarteBatch`, `DeckBatch`, deck-page message and bounded-read summaries | Pagination; no karte content meaning |
| Deck configuration page, karte content page, karte view page | Whole application interfaces; their contained surfaces are seites |
| `discard`, `discardCodes`, `discardUnavailable`, “Discard”, and general language-learning “flashcards” in the vision description | Unrelated word meanings; no substring replacement |

The repository audit includes maintained source, types, scripts, prototype, tests, active prose, current schema snapshot, generated OpenAPI and built/package output. Product names outside the compatibility/history fixtures use karte and seite. User-provided strings containing old words are explicitly retained in upgrade coverage.

## Upgrade procedure and retirement

Stop the local API, back up the database with the existing reviewed procedure, apply `npm run db:migrate`, restart the new API, then reload/update the extension. This implementation does not apply migrations to the owner's running database or deploy a backend. Applied migrations remain immutable; the new migration renames schema objects without changing IDs, relationships, content, timestamps, attempt outcomes or operation IDs.

Compatibility retirement requires an explicit later decision after supported old installations, pending operations and saved navigation links no longer need it. Receipt fingerprint compatibility remains necessary as long as historical receipts are retained. Backend changes must be installed before the new extension; the new extension does not target a previous backend build.
