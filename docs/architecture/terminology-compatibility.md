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
