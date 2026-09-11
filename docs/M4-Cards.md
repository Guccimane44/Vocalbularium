# M4 card workflows

The product now includes four stable list orders, derived indices, manual card creation, multi-page editing, Save/Cancel/leave choices, confirmed deletion, and current-page retry. Plain text and line breaks are preserved throughout. Empty manual cards are valid and carry no generation label or retry action.

Editor drafts retain each page's original baseline and changed text. A save updates only changed pages and is atomic across them. Remote refreshes preserve local text and cursor position. A rejected generation-lock save stays pending for explicit resubmission; generation completion never applies that draft automatically. Browser-tab session storage retains the active draft across reloads, and pending account writes use durable extension storage.

Retry uses the original capture input, established interpretation, and current saved page configuration. The UI presents the exact warning from [Select and Add](MVP-Product-spec-select-and-add.md#retry-the-current-page), and the server enforces the cross-installation lock. Those rules remain authoritative.

## Verification performed

- 35 store/server/module/card tests passed locally. Card checks cover manual-card identity/status, unchanged-page preservation, stale/deleted targets, original-input retries with current configuration, creation-time preservation, and all four deterministic sort orders.
- Five product Chromium scenarios passed. New scenarios exercise every unsaved-edit choice, multi-page Save/Cancel, offline draft recovery, empty-front entries and indices, canceled/confirmed deletion, the exact retry warning, and a two-installation multi-page draft rejected during retry and saved only after an explicit resubmission.
- Syntax checks passed. The deck browser scenario was corrected to wait for its saved-default acknowledgment before inspecting the server; the earlier GitHub failure was this test timing issue.

Live model, hosted, native Windows lifecycle, and final publication-versus-exit acceptance remain pending in the delivery tracker. Reliability integration continues in M5.
