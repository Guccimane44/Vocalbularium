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
Standard: payload is selected text + Context (the surrounding block, capped at around 500 characters) + URL/title + timestamp. Capture with Context can be turned on or off (default on); when off, only text + timestamp travel. Stored per karte alongside the main key and editable next to it (including per-karte deletion); sent to the LLM only when present; nothing else retained. User intent stays out of 1.0.0 scope. Spec: [kartes-and-editing](../../../specs/pages-and-editing.md#context), [Select and Add](../../../MVP-Product-spec-select-and-add.md#capture-scenario). Needs a retention/redaction rule per Q11/Q33.

### Q08
Decision: Support both modes. Mode 1 (fire-and-forget) is the default; mode 2 (fire-and-popup) is opt-in via a global toggle.
- Trigger: Mode 2 fires on terminal generation state — both full success and partial failure (any seite failed).
- Popup scope: Examine + seite Retry only. The popup shows karte seites with previous/next navigation and a Retry entry point per failed seite. No editing in the popup; editing stays in the karte editor.
- Focus and dismissal: The popup never steals focus. It auto-dismisses after 3 seconds for both success and failure. Dismissal of the popup never clears the underlying state — a failed seite keeps its Retry action on the dashboard karte until explicitly retried.
- Delivery: Originating installation only (session-bound publication). In-page overlay when the source tab is still open; OS notification with an Open action as fallback when it is not.
- Progress: Terminal-only. No mid-generation progress display at 1.0.

### Q09
best-effort queue

### Q10
Decision: Session + installation ID. No anonymous use — every capture, poll, draft, generation claim, and retry requires an authenticated account; unauthenticated or expired-session requests fail with "sign in again," never a degraded product.
- Authorization: The login session (7-day, as today) is the only full-power credential. Each installation registers a stable installation ID at first run; every capture, poll, draft, save, and generation claim carries session + installation ID. Same-account captures from two browsers are distinguished by installation ID: each installation owns its queues, receipts, drafts, and generation claims, and results publish only to the originating installation (your Q08 popup rule).
- Refresh (consequence, not the decision): Event-driven refresh on local mutations + focus/visibility + a server completion signal for generation; interval polling demoted to degraded fallback at 30–60s with backoff, gated on visible + signed-in (as today). SSE only when multi-device or hosted operation makes staleness/churn visible in metrics (Q62) — subscriptions keyed by installation ID, which is why the ID must exist first.
- Tokens (deferred with tripwire): Short-lived, capture-scoped tokens for login-less surfaces (hotkey helper, share-sheet, scripts) are not built at 1.0 — Q06 keeps all such surfaces out. Pairing itself is an authenticated action (code minted from a signed-in dashboard), never self-issued. Revisit when Q06 promotes any non-browser capture surface to must-have; then build issuance, per-request verification, expiry/rotation, per-device revocation, and per-token quota.
- Offline + expiry interaction (Q09 link): Captures queued offline were queued by a logged-in installation; on reconnect they submit under that session or wait for re-auth. Nothing submits anonymously.