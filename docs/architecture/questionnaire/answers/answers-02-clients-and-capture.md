### Q06
must have clients (1.0):
* chrome extension
* firefox extension
* hosted web app

post-1.0:
* safari extension (macOS)
* iOS (share sheet or Safari extension)
* desktop hotkey

out:
* audio/youtube capture

Revised to resolve C3: the 1.0 list matches Q01 and Q11 (extension shell + web shell), and Q10 keeps capture tokens deferred until a post-1.0 surface is promoted.

### Q07
**Amended 10 October 2026:** the owner dropped URL/title because they add nothing to generation; the page's creation time is the timestamp. Capture with Context is implemented in release 0.4.1 as a deck setting.

Standard: payload is selected text + Context (the surrounding block, capped at around 500 characters) + timestamp. Capture with Context can be turned on or off per deck (default on); when off, only text + timestamp travel. Stored per page as its Context component, next to the main key and editable (including clearing it); sent to the LLM only when present; nothing else retained. User intent stays out of 1.0.0 scope. Spec: [pages-and-editing](../../../specs/pages-and-editing.md#context), [Select and Add](../../../MVP-Product-spec-select-and-add.md#capture-scenario). Needs a retention/redaction rule per Q11/Q33.

### Q08
**Amended 10 October 2026 by the owner, after [Q72](answers-06-data-and-semantics.md#q72):** the opt-in result popup (mode 2) is deferred and will be designed later. Fire-and-forget stays the default. The earlier popup design, written for kartes with seites, is kept below for reference and no longer binds the specs.

Decision: Fire-and-forget (mode 1) is the default capture contract: the brief **Capture received** popup, background generation, and results checked later on the dashboard and in the page editor, where a failed component keeps its **Retry** until explicitly retried.
- Progress: Terminal-only. No mid-generation progress display at 1.0.
- Deferred: mode 2 (fire-and-popup), an opt-in result popup on terminal generation state.

Earlier mode 2 design (deferred, for reference): trigger on full success or partial failure; examine and retry only, with previous/next navigation and a Retry per failed seite; never steals focus; auto-dismisses after 3 seconds; originating installation only, as an in-page overlay or an OS notification fallback.

### Q09
best-effort queue

### Q10
Decision: Session + installation ID. No anonymous use — every capture, poll, draft, generation claim, and retry requires an authenticated account; unauthenticated or expired-session requests fail with "sign in again," never a degraded product.
- Authorization: The login session (7-day, as today) is the only full-power credential. Each installation registers a stable installation ID at first run; every capture, poll, draft, save, and generation claim carries session + installation ID. Same-account captures from two browsers are distinguished by installation ID: each installation owns its queues, receipts, drafts, and generation claims, and results publish only to the originating installation (your Q08 popup rule).
- Refresh (consequence, not the decision): Event-driven refresh on local mutations + focus/visibility + a server completion signal for generation; interval polling demoted to degraded fallback at 30–60s with backoff, gated on visible + signed-in (as today). SSE only when multi-device or hosted operation makes staleness/churn visible in metrics (Q62) — subscriptions keyed by installation ID, which is why the ID must exist first.
- Tokens (deferred with tripwire): Short-lived, capture-scoped tokens for login-less surfaces (hotkey helper, share-sheet, scripts) are not built at 1.0 — Q06 keeps all such surfaces out. Pairing itself is an authenticated action (code minted from a signed-in dashboard), never self-issued. Revisit when Q06 promotes any non-browser capture surface to must-have; then build issuance, per-request verification, expiry/rotation, per-device revocation, and per-token quota.
- Offline + expiry interaction (Q09 link): Captures queued offline were queued by a logged-in installation; on reconnect they submit under that session or wait for re-auth. Nothing submits anonymously.