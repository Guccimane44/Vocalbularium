### Q11

Decision: Shared packages + two shells (extension + web).

Surfaces at 1.0: popup feedback, dashboard, deck configuration, karte editor/view, options/login — plus one addition: inline expandable module description under every module in the library and under every placed instance (spec-excerpt only, iterated later).

Stack: logic in packages/contracts + packages/domain (types, MODULES + descriptions, renderSeite, validation, API client — no chrome.*, no DOM). Shells only render + adapt: extension shell stays WXT + React MV3 (extension/ → artifacts/extension); web shell reuses the same packages with web adapters (paste-input instead of selection, web storage instead of chrome.storage, router paths instead of hash, HTTPS/CORS instead of host permissions).

Why: you chose extension + web at 1.0 with upfront investment. One codebase/one build would fork the moment web starts; per-surface rewrites add drift. The shared-package seam already exists, so Option 2 avoids the fork at moderate setup cost.

What would change my mind: web slips past 1.0 or shell differences prove trivial — then fall back to one codebase/one build, keeping packages clean as the escape hatch.

### Q12

Explicit Save/Cancel

### Q13

Block JSON

### Q14

Decision: Version gate on major.minor (patch free) + online-required + no legacy terminology fallback + clear cache on reset. Effective from 1.0.0. No compat guarantee for <1.0.0.
Policy:
- Extension X.Y.* only works with backend X.Y.*. Example: 1.0.3 works with 1.0.x, refuses 1.1.0 or 1.0.x <> 1.1.x.
- Check via GET /api/meta → { version, minCompatibleExtension, incarnationId } on startup, login, and before save. Keep backend-before-extension update order.
- Online-required: no authoritative offline reads. Dashboard is dead without backend.
- Legacy /api/cards, /api/card/*, cardId/pageId/pages, card-draft fallback, and X-Vocabularium-Terminology dialect switching are retired at 1.0.0. Current karteId/seiteId/seites, /api/kartes, karte-draft only.
- Backend reset is detected via stable incarnationId (changes only on restore/re-init). On mismatch the extension discards cached account data and requires fresh sign-in.

Stale / reset UX:
- Unreachable: Backend unreachable at <origin>. [Retry]
- Version mismatch: Extension 1.Y.x needs backend 1.Y.x (found A.B.C). Update backend first, then reload extension.
- Reset detected: Backend was reset. Cached decks and sessions belong to the old database and were cleared. Sign in again. Unsaved karte-drafts are kept for manual copy and are never auto-replayed.

Cached artifacts + invalidation:
Artifact	Invalidated when
account, decks/kartes cache	logout, version-block, incarnation mismatch, failed fetch never clears
receipts, captures (capture-*, save-*)	same as above; never auto-resend after reset
karte-draft (sessionStorage)	preserved on Save-fail / offline for Try-again; preserved (not replayed) on reset; cleared only on explicit Save / Discard

Why:
Dev phase, zero users pre-1.0, so no fleet of old clients to protect. Gate is cheapest safe path, online-required matches current behavior, dropping shims removes permanent debt, incarnation ID fixes untested issue #24 / audit “reset identity absent”.

What would change my mind:
Offline editing becomes a product requirement → revisit online-required. A large auto-updated fleet with mixed versions → add minCompatible window or temporary best-effort shim instead of hard gate.

### Q15
Managed updator.

### Q16
Best-effort.