# 03 — Frontend (Q11–Q16)

The frontend is the extension dashboard, editors, and any future web client. Decide state, rendering, and update discipline here; the backend cannot paper over a frontend that loses drafts or shows stale layouts.

## Q11. What are the frontend surfaces and their stack?

**Decision:** Which surfaces ship at 1.0 (popup, dashboard, deck configuration, karte editor, options/login) and do they stay WXT + React or diverge (e.g. separate web app)?

**Context:** Today everything is one WXT MV3 build with React dashboard/configuration/editor, built to `artifacts/extension` with build-time `VOCABULARIUM_API_URL` baked into host permissions (README). The vision reserves a distinctive UI direction for later but assigns concrete shared rules to a shared UI spec ([vision](../product/vision.md)).

**Options:**
- One codebase, one build — cheapest; every surface shares components and the API client. Tradeoff: web-client needs later become a fork.
- Shared packages + two shells (extension + web) — more setup (contracts/domain packages already hint this way); unlocks hosted web without duplicating logic.
- Per-surface rewrites — fastest per surface, most drift; reject unless a surface has truly different constraints.

**Answer prompt:** Name the surfaces and the repo layout (packages per surface?). Research task: map current `extension/` files to surfaces and flag anything already duplicated.

## Q12. How do drafts, saves, and navigation interact?

**Decision:** Define the editing contract: save unit (seite, karte, deck layout), autosave vs explicit Save/Cancel, dirty indicators, and what leaving mid-edit does.

**Context:** Current contract: manual drafts survive seite switches, Save writes all changed seites together, Cancel discards the session, leaving offers Save/Discard/Continue, failed saves keep drafts with Try-again ([MVP scope](../history/mvp/MVP-Product-scope.md), README). The model separates drafts (unsaved) from saved account data ([model](../product/model.md)).

**Options:**
- Explicit Save/Cancel (current) — clearest mental model, fewest accidental writes; needs the leave-guard and draft-restore paths maintained.
- Autosave with version history — smoothest UX; needs debouncing, conflict handling, and a history UI to undo bad autosaves.
- Optimistic per-seite save — finest granularity; most request churn and partial-failure states.

**Answer prompt:** Pick the contract and the save unit. Research task: list every current draft key (`karte-draft`, legacy `card-draft`) and state which survive extension reload vs backend restart.

## Q13. What is rendered — plain text or rich blocks?

**Decision:** Stay plain-text seites or move to structured blocks (headings, lists, ruby/pinyin, IPA, audio players, images, cloze)?

**Context:** Seites render and edit as whole plain-text blobs; module outputs are concatenated with blank lines and editing need not preserve module boundaries ([modules](../specs/modules.md)). The vision's module examples (pronunciation + audio, timelines, visualizations) assume richer rendering eventually ([vision](../product/vision.md)). This is the most expensive frontend decision: it changes the editor, the stored format, and layout-change migration together.

**Options:**
- Plain text — zero migration, matches current editor and tests. Tradeoff: caps module expressiveness at prose.
- Markdown subset — moderate step; renders richer content while staying diffable and editable as text. Needs a sanitizer and a renderer contract per module.
- Block JSON (ProseMirror/TipTap-style) — richest editing (per-module blocks, media embeds); heaviest build, hardest migration of existing plain-text kartes.

**Answer prompt:** Pick the representation and the editing granularity (whole seite vs per-module blocks). Research task: take the flagship multi-language karte from the product description and mock it in each representation; note what breaks.

## Q14. How does the frontend handle backend versions and offline?

**Decision:** What does the client do when the backend is older/newer, unreachable, or reset (Render Free wipe)?

**Context:** Stale-client recovery after a backend reset is explicitly untested (issue #24). The terminology layer already negotiates dialects via `X-Vocabularium-Terminology` and accepts legacy fields ([terminology compatibility](terminology-compatibility.md)). The Windows guide warns that Render resets erase sessions and data ([windows-install](../guides/windows-install.md)).

**Options:**
- Version gate (client refuses mismatched backend with a clear message) — safest data-wise; annoys users during upgrades.
- Best-effort compat (old clients keep working, new fields ignored) — smoothest upgrades; forces permanent compat shims.
- Online-required (no cached reads) — simplest; dashboard is dead without the backend.

**Answer prompt:** Pick the policy and the stale/reset UX (message, recovery action, data-loss warning). Research task: enumerate every cached artifact (account, decks, receipts, drafts) and its invalidation rule.

## Q15. How are extension updates delivered?

**Decision:** Manual unpacked install forever, Chrome Web Store auto-update, or both? And what is the backend-before-extension ordering guarantee?

**Context:** Current delivery is manual: replace files, press Reload, reopen dashboard tabs; extension reload ends that installation's generation session ([windows-install](../guides/windows-install.md)). Backend schema changes require API-stopped migration before the new extension connects ([local-postgresql](local-postgresql.md), [terminology compatibility](terminology-compatibility.md)).

**Options:**
- Manual only — full control, zero store review; every user performs the backend-then-extension dance by hand.
- Web Store auto-update — smooth client updates; still needs a backend-compatibility window so auto-updated clients don't hit old backends.
- Managed updater (extension checks backend version and prompts) — best UX; needs a version endpoint and compat matrix maintained per release.

**Answer prompt:** Pick the channel and write the 5-step update procedure a non-technical user follows. Research task: read the Deliver skill and list what `package-info.json` must contain for each channel.

## Q16. What is the frontend performance and accessibility budget?

**Decision:** Set numbers: dashboard open time, capture-to-receipt latency, list pagination behavior, plus the accessibility floor (keyboard flows, screen-reader seite navigation, target WCAG level).

**Context:** Current lists load 30 kartes and 40 decks at a time with four sort orders and NFKC normalization; detail is fetched on open (README). Appearance is Light/Dark with keyboard interactions and accessible state cues ([scope](../product/scope.md)). The vision demands a distinctive, non-generic interface without prescribing it ([vision](../product/vision.md)).

**Options:**
- Budget-first (e.g. dashboard interactive <1s on 10k-karte deck, capture receipt <500ms local) — forces virtualization and bounded reads early.
- Best-effort — ships faster; performance and a11y become retrofit projects with real users already suffering.
- A11y-first — screen-reader and keyboard flows designed before visual polish; slight delay to visual distinctiveness.

**Answer prompt:** Write the numeric budgets and the WCAG target. Research task: measure current dashboard open + capture receipt on the slowest supported machine and record the baseline.
