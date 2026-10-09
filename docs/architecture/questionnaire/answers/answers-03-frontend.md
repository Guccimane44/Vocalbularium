### Q11

Decision: Shared packages + two shells (extension + web).

Surfaces at 1.0: popup feedback, dashboard, deck configuration, karte editor/view, options/login — plus one addition: inline expandable module description under every module in the library and under every placed instance (spec-excerpt only, iterated later).

Stack: logic in packages/contracts + packages/domain (types, MODULES + descriptions, renderSeite, validation, API client — no chrome.*, no DOM). Shells only render + adapt: extension shell stays WXT + React MV3 (extension/ → artifacts/extension); web shell reuses the same packages with web adapters (paste-input instead of selection, web storage instead of chrome.storage, router paths instead of hash, HTTPS/CORS instead of host permissions).

Why: you chose extension + web at 1.0 with upfront investment. One codebase/one build would fork the moment web starts; per-surface rewrites add drift. The shared-package seam already exists, so Option 2 avoids the fork at moderate setup cost.

What would change my mind: web slips past 1.0 or shell differences prove trivial — then fall back to one codebase/one build, keeping packages clean as the escape hatch.

### Q12

Explicit Save/Cancel

### Q13

Block JSON at 1.0 (ProseMirror/TipTap-style). Seite content is stored and rendered as a versioned block document; modules produce typed blocks. Safety comes from per-block-type render contracts (Q59). Existing plain-text seites migrate to a single paragraph block. Resolves C1 in the [traceability map](../traceability-map.md#conflicts).

### Q14

Decision: Compatibility window (revised to resolve C4; see Q27/Q64) + online-required + no legacy terminology fallback + clear cache on reset. Effective from 1.0.0. No compat guarantee for <1.0.0.
Policy:
- The backend supports extension versions N and N−1 (Q27). An extension older than the backend's minCompatibleExtension is blocked with an update message. The web app deploys with the backend and is always in sync.
- Check via GET /api/meta → { version, minCompatibleExtension, incarnationId } on startup, login, and before save. Keep backend-before-extension update order.
- Online-required: no authoritative offline reads. Dashboard is dead without backend.
- Legacy /api/cards, /api/card/*, cardId/pageId/pages, card-draft fallback, and X-Vocabularium-Terminology dialect switching are retired at 1.0.0. Current karteId/seiteId/seites, /api/kartes, karte-draft only.
- Backend reset is detected via stable incarnationId (changes only on restore/re-init). On mismatch the extension discards cached account data and requires fresh sign-in.

Stale / reset UX:
- Unreachable: Backend unreachable at <origin>. [Retry]
- Version too old: This version of the extension is no longer supported. Update it from your browser's extension store, then reload.
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
Browser-store auto-update (Chrome Web Store and Firefox Add-ons). No separate updater; when the extension is below minCompatibleExtension it shows the "Version too old" message from Q14 (Q64 step 5). Revised to resolve C4.

### Q16
Revised to resolve C7 (was best-effort).
- Accessibility: WCAG 2.2 AA with keyboard parity, audited before every release, per Q68.
- Performance targets, sized for Q55 (low thousands of kartes per account) and the hosted setup (Q22). These are release checks, not user-facing promises:
  - Capture receipt (the "captured" toast): under 1 s at p95 with a warm backend. Cold starts may take up to about 3 s, and the toast never blocks reading.
  - Dashboard open: interactive in under 2 s with 5,000 kartes in the account.
  - Generation: no latency budget; covered by the 60 s timeout and the visible queue (Q56).