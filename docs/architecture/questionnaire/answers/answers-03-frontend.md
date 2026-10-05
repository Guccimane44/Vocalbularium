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