# Plan: repository cleanup against 0.16.6

Drafted 15 November 2026 for the owner's review. Status: **owner's answers recorded 15 November 2026** (see [answers](#the-owners-answers)); Batch 0 partly carried out; Batches 1, 2, 3 (its rows), 4, 5 and 7 **done on 15 November 2026** in one branch, `claude/determined-villani-b4b693`; Batch 6 skipped. Each batch's status is under its heading.

Moved to history on 21 November 2026: every batch is done or skipped. What is left of Batch 0 is the owner's own local files (`.workbuddy/`, `report/` and `.claude/launch.json`), which no PR changes.

The current code on `main` at `6ce4e95` (0.16.6) is the source of truth. Each candidate below names its path, the evidence that it is stale, the suggested action and the risk. Candidates are grouped into batches that can each be one PR. Applied migrations (`migrations/`) and upgrade fixtures (`tests/helpers/legacy-database.mjs`, the fixtures inside `tests/upgrade.test.mjs`) are out of scope and stay untouched.

## What was checked and found clean

So the batches below are not mistaken for the whole picture:

- **Code is in use.** Every file under `extension/`, `src/`, `shared/`, `types/`, `packages/*/src` and `scripts/` is imported by another file or named in `package.json`, CI or a skill. Every dependency in `package.json` is imported, except `@tiptap/core`, `@tiptap/pm` (peer dependencies of the Tiptap packages) and `@types/pg` (used by `tsc`); all stay.
- **Tests run.** Every `tests/*.test.mjs` is in `npm test`, every `tests/browser/*.test.mjs` is in `npm run test:browser`. `tests/prompts.test.mjs` already fails on an orphaned `tests/prompts/*.txt`.
- **Retired terms.** The earlier terms of [the model's terms table](../../product/model.md#earlier-terms) appear outside history, migrations and upgrade fixtures only in: `docs/product/model.md` (the terms table, which is its job), `docs/architecture/questionnaire/` and `decisions/conflicts.md` (questions recorded as asked), `README.md` and `docs/guides/install.md` (stale upgrade text, Batch 2). No code or interface string uses them.
- **Paths and commands named in docs** exist, apart from shorthand (`domain/render.ts`) and files that are generated or only in the package ZIP (`about.generated.ts`, `INSTALL.md`, `package-info.json`).
- **Specifications** (`docs/specs/`) and `docs/architecture/generation.md` name no retired module, model or control.

## Batch 0: local housekeeping (no PR)

None of this is in git. The owner approved it on 15 November 2026.

**Done on 15 November 2026:** removed the worktrees `catalog`, `empty-optional`, `english-forms`, `luna-prompts`, `0-15-0-splits-ecd5c0`, `lucid-wozniak-f39523`, `trusting-hertz-e7943a`, `../Vocabularium-haiku` and `../Vocabularium-json-repair`, after checking that each had no uncommitted or untracked work, and pruned the three stale `/private/tmp` entries. Each removed worktree's ignored `.data/` (its golden, gate and judge runs, 7 MB in all, no database dumps) was first copied to `.data/worktree-runs/<name>/` in this checkout. `../Vocabularium-haiku/.data` was a link to this checkout's `.data/`; only the link was removed. Branches were left as they are.

**Kept:** `.claude/worktrees/catalog-dead-fields`, which holds an uncommitted `docs/plans/step-2-flag-definitions.md` (the file `maps/capture-to-card-walkthrough.md` links to), and `.claude/worktrees/german-tables` (see Batch 3).

**Still to do, by the owner** (the session's permission check refused the deletes): the logs in `.claude/worktrees/`, `.workbuddy/`, `report/bug-report.md` and `.claude/launch.json`.

**Bug report triage** (each finding checked against `main` at `6ce4e95`):

1. `dateGroup` with a shared `now`: **fixed** (`extension/page-list.tsx:162`).
2. `listDecks` cursor `after?.key ?? 0`: still there (`src/core/store-decks.mjs:45`); correct while deck ordinals start at 1. Latent, no effect today.
3. `reconcile()` drops `save-publish-*` receipts of another session ID (`extension/capture.js:149`): **probably not a bug.** AGENTS.md's invariant says another session ID is `stale_session`, so such a receipt can never publish.
4. `captureContext`'s timed-out `executeScript` promise: still there (`extension/context-extraction.js:68`). Real but minor: a late rejection nobody handles. A one-line `.catch` fixes it.
5. `requiredParts` and `.trim()`: correct as written, because the type check runs first. No action.
6. `moveComponent` and `addModule` positions: consistent today; the report asks only for a comment and a boundary test.

Only finding 4 is worth an issue; finding 6's boundary test could join it.

| Path | Evidence | Action | Risk |
| --- | --- | --- | --- |
| `report/bug-report.md` | A static review of 0.10.0 (25 October 2026, branch `codex/expertise-subject-b`). Finding 1 is fixed: `groups()` now passes one `now` (`extension/page-list.tsx:162`). Findings 2–6 were not re-checked; finding 2's `after?.key ?? 0` is still in `src/core/store-decks.mjs:45`. | Triage findings 2–6 into GitHub issues (or drop them), then delete the file. | Low. Losing it before triage loses five unverified findings. |
| `.workbuddy/memory/2026-10-25.md` | Another tool's session note; it only summarises the bug report above. | Delete. | None. |
| `.claude/launch.json` | Its one configuration starts the API from `.claude/worktrees/german-tables`, not from this checkout. | Replace with a configuration for the main checkout, or delete. | None. |
| `.claude/worktrees/*.log`, `trial.txt` | Build and test logs from earlier sessions. | Delete. | None. |
| Worktrees whose branch is merged into `main`: `.claude/worktrees/catalog` (`release/0.8.0`), `catalog-dead-fields`, `empty-optional`, `english-forms`, `luna-prompts`; detached `0-15-0-splits-ecd5c0`, `lucid-wozniak-f39523`, `trusting-hertz-e7943a`; `../Vocabularium-haiku`, `../Vocabularium-json-repair` | `git merge-base --is-ancestor` says each branch is in `main`. Three `/private/tmp/...` worktrees are marked prunable. | `git worktree remove` each after checking it has no uncommitted changes; `git worktree prune`. | Low, provided each is checked for uncommitted work first. |
| `.claude/worktrees/german-tables` (`claude/german-tables`) | **Ten commits not on `main`**, including D32, D33, the Luna and dictionary plan and the M6 evidence that `main` links to (Batch 3). | **Keep** until Batch 3 is decided. | High if removed. |

## Batch 1: move finished plans into history

**Status: done (15 November 2026).** Sixteen plans moved; their links in and out fixed mechanically; the link check reports nothing new.

**Evidence.** The [project workflow](../../guides/project-workflow.md) says a plan moves to `docs/history/plans/` once its release ships. These are finished or abandoned and still in `docs/plans/`:

| Path | Why it is finished | Action |
| --- | --- | --- |
| `0.16.1-refinements.md`, `0.16.2-refinements.md`, `0.16.3-retry-and-context.md`, `0.16.4-small-expansion.md` | Released and accepted (each says so in its header). | Move to `docs/history/plans/`. |
| `backpressure.md` | 0.16.0, released (scope's 0.15.0 → 0.16.0 upgrade). | Move. |
| `one-english-module.md` | Released as 0.16.5 (D34). | Move. |
| `haiku-only-provider.md` | Carried out in D36, 0.16.5. | Move. |
| `step-1-delete-dead-fields.md` | Released as 0.16.6 (D31). Its header still says "draft". | Move; add a one-line "released as 0.16.6". |
| `facet-prompts-stand-alone.md`, `m1-token-split.md`, `m2-core-then-parallel.md`, `m3-cost-per-facet.md`, `m8-haiku-deepseek-opus-judge.md` | Run; each result is already in `docs/history/evidence/`. | Move. |
| `headers-flags-classifier-handoff.md`, `jev-flags-experiment.md` | The owner dropped the classifier ([split facets](split-facets.md#why-there-is-no-classifier)); the Jev experiment was never run. | Move, with a one-line "not carried out: the classifier was dropped". |
| `wiktionary-experiment.md` | Written for the retired English (British) module and replaced by M4. | Move, with "superseded by M4". |
| `catalog-cleanup-and-flag-design.md` | Step 1 is done (D31). Step 2 (flag definitions) is still open; its draft is uncommitted in `.claude/worktrees/catalog-dead-fields/docs/plans/step-2-flag-definitions.md`. | **Keep** (owner, 15 November 2026: "not yet"). |

**Keep in `docs/plans/`:** `split-facets.md` and `m4-dictionary-reading.md` (drafts in progress, with work on `claude/german-tables`), and `cleanup-and-refinement.md` (owner: "not yet").

**Links to fix in the same PR:** every relative link into a moved plan, from decisions (D31, D34, D36 and others), `docs/guides/screens.md` (→ `backpressure.md`), `tests/golden/token-split/inputs.json`'s note, and the plans that link to each other. Moved plans' own links out (`../architecture/…`, `../history/evidence/…`) change depth too.

**Risk:** low. Only markdown moves; the risk is broken links, which a one-off link check finds (no link check exists in the repository today).

**Checks:** `npm run check` (whitespace and JSON); a relative-link check over every tracked `.md` file, which must report nothing new; `npm test` (nothing should change; confirms no test reads a plan).

## Batch 2: README and install guide match 0.16.6

**Status: done (15 November 2026).** README and install guide rewritten as below; `npm run build`, `python scripts/package.py` and `verify_package.py` passed on the committed tree. The User-Agent follow-up stays open.

| Path | Evidence | Action | Risk |
| --- | --- | --- | --- |
| `README.md` | Says "release 0.11.0" (twice). Describes **Edit page**, **Generate missing** and **Retry page**, which D04 removed (`tests/browser/editing.test.mjs:36` checks they are gone) and no string in `extension/locales/en/messages.json` has. Says "exact-selection components still complete", but D03 retired the selected-text modules. Says requests identify as `Vocabularium/0.8.1`; the code sends `Vocabularium/0.13.1` (`src/server/opencode.mjs:33`). Mentions "word/sentence sample previews" in deck settings, and an upgrade paragraph in the retired terms that predates nine later upgrades. Links provider smoke results from DeepSeek in September. | Rewrite the Deck settings, Page workflows, Generation and Release status sections from the specifications; replace the upgrade paragraph with a link to [scope's upgrade section](../../product/scope.md#upgrade-from-earlier-builds). Keep the setup and verification commands, which are current. | Low. Docs only, but read by every new session; each claim must be checked against the code or a string. |
| `docs/guides/install.md` | Says "Release 0.16.4" and "Upgrading to 0.5.0 discards existing decks and pages"; mentions a build with the retired terms. It ships inside every candidate ZIP. | State the version generically (from `package-info.json`) and point upgrades to scope. | Low; check the Deliver skill's package check still finds the guide. |

**Checks:** `npm run check`; the link check; `npm run build` and `python scripts/package.py` followed by the Deliver skill's `verify_package.py`, because the install guide goes into the ZIP.

**Separate follow-up, not in this batch:** the hard-coded `User-Agent: Vocabularium/0.13.1` in `src/server/opencode.mjs` is a code fact, not a doc fact. Reading it from `package.json` is a small code change that belongs with `tests/opencode.test.mjs`.

## Batch 3: decision records agree with what shipped

**Status: done for this cleanup (15 November 2026).** D36 has a row; D31 and D35 are marked implemented in the map and in their files; D32 and D33 have rows saying they come with the dictionary milestone. D35's open item and five links wait for that milestone.

| Path | Evidence | Action | Risk |
| --- | --- | --- | --- |
| `docs/architecture/decisions/d35.md` | Five broken links: `d32.md`, `plans/luna-and-dictionary-expansion.md`, `plans/english-forms-facet.md` and `history/evidence/english-wiktionary-coverage.md` exist only on `claude/german-tables`. The Forms facet itself is on `main` (`catalog/.../english/facets/forms`). Status still "accepted". | **Decided (owner, 15 November 2026): the dictionary comes to `main` as its own milestone** ("create its own milestone"). D32, D33 and the documents D35 links to arrive with that milestone, which fixes D35's links; this cleanup does not rewrite D35. Its status does not wait: Forms shipped in 0.16.5 (PR #309, listed in the 0.16.5 release PR #314), so D35 is marked **implemented (0.16.5)** now. Only its open item, whether the English Wiktionary fills Forms, and its five links wait for the milestone. | Low for this cleanup; the milestone carries the risk. |

**The dictionary is not on `main`.** `claude/german-tables` holds it in ten commits (12–13 November 2026, 71 files, about 6,000 lines): the German Wiktionary import (`scripts/dictionary-import.mjs`, `src/server/dictionary.mjs`, the tables in `src/persistence/schema.ts`), German grammar facets filled from it (D32, accepted, implemented only on that branch), summaries prepared once per word (D33, paused for cards since M5), and the plans and evidence D35 links to. `main` has no Wiktionary code. The branch left `main` at `91e6f04` (11 November) and cannot merge as it is:

- **Migration numbers collide.** The branch adds `0019_dictionary.sql` and `0020_dictionary_summaries.sql`; `main` has since shipped `0019_english_module.sql` (0.16.5). The branch's two migrations must be generated again as `0020` and `0021` on top of `main`. Any database that applied the branch's `0019`/`0020` (the `.env.postgres.tables` database the old `.claude/launch.json` started) would then disagree with `main`'s journal; it should be treated as a throwaway test database, not upgraded.
- **Ten files conflict**, among them `traceability-map.md`, `scope.md`, `specs/modules.md`, `migrations/meta/_journal.json` and four German facet definitions.
- **It predates D34, D36 and D31.** Its prompts and tests were made with DeepSeek as the model; `main` is now Haiku only, with one English module and four catalog fields fewer.

Bringing it in is its own milestone (rebase, new migrations, a fresh gate on Haiku), not a cleanup step. The owner chose that on 15 November 2026. The milestone needs its own plan in `docs/plans/` and a tracker issue; until it lands, `.claude/worktrees/german-tables` and its branch stay.

**What this batch still does now:** add D36's row to the traceability map; mark D31 implemented (0.16.6) and D35 implemented (0.16.5), in the map and in each decision file; add rows for D32 and D33 with their state and "comes with the dictionary milestone". Only D35's open item and its five links wait for that milestone.

**D35's links stay as they are until then.** They are the one known exception to the link check in every batch: the check must report nothing outside `docs/history/` except the five links in `docs/architecture/decisions/d35.md`. They are not turned into plain text, so the milestone does not have to edit them back.
| `docs/architecture/traceability-map.md` | D36 has no row, though D36 is implemented (0.16.5) and README and scope link it. D31 says "accepted" though it shipped in 0.16.6. D35 says "accepted" though it shipped in 0.16.5. D32 and D33 are taken on `claude/german-tables` and missing here. | Add D36's row; mark D31 implemented (0.16.6) and D35 implemented (0.16.5). Add a row each for D32 (accepted; built only on `claude/german-tables`) and D33 (paused for cards since M5), each saying "on `claude/german-tables`; comes with the dictionary milestone", so readers see their state, not a gap between D31 and D34. | Low. |
| `d31.md` | Calls the headers and flags map "the owner's local … map (not in the repository)", but `maps/headers-and-flags-map.md` is tracked (Batch 4). | Follows from Batch 4. | Low. |
| `d17.md` + `d17-one-request.md`, `d20.md` + `d20-module-pages.md` | The only decisions split into a map entry and a separate detail file. Not wrong, just inconsistent. | **Keep.** Merging rewrites anchors that the specs and the traceability map link to, for little gain. | — |

The Notion column shows "pending" for D26, D27, D34 and D35. That is a Notion task, recorded here only so it is not lost.

**Checks:** `npm run check`; the link check, which must report nothing under `docs/architecture/` except D35's five links.

## Batch 4: decide what `maps/` is

**Status: done (15 November 2026).** `maps/` untracked; links into it from plans are plain text.

**Evidence.** Commit `a0eea1d` (9 November 2026, "Keep the structure maps local in an ignored maps/ folder") added `maps/` to `.gitignore`, but the files were already tracked, so git still tracks all six, and two later commits changed them. They describe `main` at `761bfbd` (0.16.4). `capture-to-card-walkthrough.md` links to a plan that does not exist. D31 calls them not in the repository.

**Owner's choice (15 November 2026): keep them local.** `git rm --cached -r maps/` removes them from git and leaves the local copies. Links into `maps/` from plans moved in Batch 1 become plain text ("the owner's local map").

**Risk:** low; no code reads them.

**Checks:** `npm run check`; the link check.

## Batch 5: experiment fixtures under `tests/golden/`

**Status: done (15 November 2026).** `tests/golden/token-split/inputs.json` is now `docs/history/evidence/m1-token-split-inputs.json`; `held-out/` kept.

`scripts/golden-set.mjs` and `scripts/gate.mjs` read only the top-level `tests/golden/*.json` and `calibration/`; `silver/` is read by `scripts/silver-set.mjs` and `tests/catalog.test.mjs`, and `reading/` by `scripts/reading-check.mjs`. Two folders are read by nothing:

| Path | Evidence | Action | Risk |
| --- | --- | --- | --- |
| `tests/golden/token-split/inputs.json` | Inputs for M1–M3, which are finished. No script reads it. | Move to `docs/history/evidence/` beside the M1 note (or delete; the evidence notes already list the inputs used). | Low. |
| `tests/golden/held-out/` | Its README says no script reads these files yet; written for the classifier the owner dropped, though `split-facets.md` and `m4-dictionary-reading.md` still mention `lookup-german.json`. | **Keep** while M4 is live; move to history if the owner drops M4. | Low. |

**Checks:** `npm test` (in particular `tests/catalog.test.mjs`); `node --check` via `npm run check`. No live gate run is needed, because no read path changes.

## Batch 6 (optional): unused exported types

**Status: skipped** (owner, 15 November 2026).

These exported type aliases are used nowhere, not even in their own file. The extension and server are JavaScript, so no caller imports them.

- `packages/contracts/src/index.ts`: `LanguageRequest`, `HealthResponse`, `MutationOutcome`, `LoginRequest`, `SessionRequest`, `DeckMoveRequest`, `PollRequest`
- `packages/contracts/src/pages.ts`: `FacetAddRequest`, `FacetDeleteRequest`, `ParagraphBlock`, `PageDeleteRequest`, `DeckConfigurationSaveRequest`
- `packages/contracts/src/audio.ts`: `ClipList`
- `src/core/store-records.ts`: `RunRow`

**Suggested action: keep, or remove them only alongside the next contracts change.** They cost nothing and document each payload's type; removing them is churn. A further thirty or so exports are used only inside their own file; making them private is cosmetic and not worth a PR.

**Checks if done:** `npm run typecheck`, `npm test`, `npm run openapi` with no diff in `docs/api/openapi.json`.

## Batch 7: delete the questionnaire

**Status: done (15 November 2026).** The questionnaire is deleted. Links in specs and decisions became plain text with the Q number and the date of the owner's answer (the date its answer was committed); in scope's deferred rows, which already link each answer's Notion record, they became plain Q numbers. The retired terms also left `AGENTS.md`'s own wording, C14 in `conflicts.md`, its row in the map and scope's 0.4.0 upgrade line. **What the search still finds**, all expected: `extension/pages.js:32` removes an old session-storage key on upgrade (the statement above that no code uses them was wrong; this is upgrade code, checked by `tests/browser/upgrade.test.mjs`); the upgrade tests `tests/browser/upgrade.test.mjs`, `tests/extension.test.mjs:170`, `tests/reads.test.mjs:97` and `tests/pages-schema.test.mjs` besides the listed fixtures; and the German word *Seite* in a golden-set key (`tests/golden/computer-science.json:130`).

**Owner's decision (15 November 2026):** the retired terms are long past; the questionnaire goes.

| Path | Evidence | Action | Risk |
| --- | --- | --- | --- |
| `docs/architecture/questionnaire/` (14 question files, 13 answer files, `spec-mapping.md`) | The questions were asked against 0.3.0+ and 0.4.1; every answer that still holds has since been written into a specification, a decision or scope. It is the main remaining user of the retired terms. | Delete. Git keeps it. | Medium: about 40 links in 16 files point into it. |
| Links into it: `docs/product/scope.md` (14), `docs/specs/modules.md` (4), `traceability-map.md` (3), `generation.md` (3), `model.md`, `d14.md`, `conflicts.md`, `clarifications.md` (2 each), and one each in `shared-ui.md`, `capture-and-generation.md`, `accounts-and-sync.md`, `project-workflow.md`, `d09.md`, `d11.md`, `d36.md`, `README.md` | A link to a deleted file. | Replace each with the decision or Notion record that carries the same rule, or with plain text such as "the owner's answer to Q72 (10 October 2026)". `project-workflow.md` step 1 drops the questionnaire as a decision source. `README.md`'s link goes with Batch 2's rewrite. | Low each; the risk is a rule losing its only stated reason, so each replacement names one. |
| `decisions/conflicts.md`, `clarifications.md` | Many entries resolve a conflict between two questionnaire answers by Q number (C14 uses the retired terms). | **Keep**; turn the links into plain Q numbers. These files are how the decisions explain themselves. | Low. |
| 8 links from `docs/history/` | History is frozen. | Leave them; they point to files git still has. | None. |

The retired-terms rule in AGENTS.md then holds without an exception: after this batch they remain only in `docs/history/`, migrations, upgrade fixtures and `docs/product/model.md`'s terms table.

**Checks:** `npm run check`; the link check, which must report nothing outside `docs/history/`; a search for the retired terms outside history, migrations, upgrade fixtures and `model.md`, which must find nothing.

## Kept on purpose

- `docs/history/d20-design/`: D20's design boards, moved to history on 18 November 2026 once every element was found built or replaced; the specifications and the screen catalogue are the visual authority.
- `docs/product/vision.md`, `competitor-critique.md`: product direction; `vision.md` links the critique, so it stays when Batch 7 removes the questionnaire's links to it.
- `docs/history/`: history by definition; not audited for staleness.
- `opencode.jsonc`: OpenCode's Notion MCP configuration for agent sessions, not app configuration.
- `.agents/skills/`: every path and `npm run` command they name exists.

## The test harness against current development

Asked by the owner on 15 November 2026: is the harness degrading, or no longer matching development?

**What passes.** On `main` at `6ce4e95`, `npm run check` passes and `npm test` passes 267 of 267 in 12 seconds, with the PostgreSQL and upgrade tests running (none skipped). CI's last 30 runs on `main` passed 26 times. Every content module has a golden set or belongs to a family that has one, and a calibration set for its judge. The screen catalogue (`tests/screens/`) covers every module group but one (below). The browser journeys were not run in this session: they need ports 4317 and 4318, and the owner's API uses 4318. Their health below comes from CI.

**Where the harness has fallen behind:**

| Area | Evidence | Suggested action | Risk |
| --- | --- | --- | --- |
| **A flaky browser journey** | The manual page UI journey in `tests/browser/editing.test.mjs:77` failed on `main` twice on 14 November (runs 43594370403 and 43653209823) with `Timed out: Chinese added`, and passed on the next merge with no fix. Its 12-second wait (`tests/browser/helpers.mjs:91`) covers adding a module from the module window and its card appearing. | **Fixed (uncommitted), 15 November 2026.** The cause was a real race in the product, not the test: a module dropped after the last entry was sent with a position counted from the list on screen. Right after a delete the page can still show the deleted card for a moment, so the position was one past the page's end, the server refused it (`src/core/store-pages.mjs:243`) and nothing was added. Reproduced every time by slowing the page's re-read after a delete; `extension/shaping.tsx` now sends such a drop as "at the end", as the window's + already does. | Medium: a flaky guard on `main` teaches people to rerun red CI. |
| **Evidence screenshots in the journeys** | The browser journeys take 72 screenshots into `artifacts/` named for old releases (`v0.2.0-…` to `v0.16.4-…`), e.g. `editing.test.mjs:68` writes `artifacts/v0.6.3-confirm-delete.png`. Nothing reads them: CI uploads only the candidate ZIP, and since 0.16.0 `npm run screens` is the visual record. They cost time in the slowest CI job (the browser journeys took 6 minutes 22 seconds in the last run on `main`). | Delete the `screenshot({ path: … })` calls that only record evidence; keep any whose image a test compares or inspects. | Low; checks: `npm run test:browser` passes with the same test count. |
| **The live gate's judge** | Since 0.16.5 the judge is Haiku. Its latest calibration (local, 14 November) agreed on 97% but missed 4 recorded fails, so the gate reports German, English and Chemistry as **not calibrated**: for those three modules the gate's judge verdict does not count (scope, 0.16.5 upgrade). | Recalibrate, or relabel the four missed fails if the owner now reads them as passes (the owner noted on 12 November that the judge is too strict). Until then the gate guards those modules only by checks and golden-set review. | Medium: prompt changes to German or English have no judge. |
| **Calibration sets lag the catalog** | `tests/golden/calibration/english.json` has no Forms facet (D35) and still says it merges the English (British) and English (American) sets; `german.json` has no Case facet. Every calibration card was written by DeepSeek or Luna before D36. | When recalibrating, add recorded Haiku cards with Forms and Case, and update the notes. | Low. |
| **Content-check fixtures lag the catalog** | `tests/fixtures/checks/recorded.json` has no English card with Forms, so Forms' checks run only on hand-made cards (`tests/content-checks.test.mjs:119`). | Add one recorded Haiku English card with Forms. | Low. |
| **The screen catalogue misses Chemistry** | `tests/screens/fixtures.mjs:36` groups Expertise as Mathematics and Computer Science only. Chemistry, added in 0.16.4 with its Equation flag in the top line (D30), has no page screen. | Add Chemistry to the Expertise group; regenerate the baseline. | Low. |
| **A group can vanish silently** | The same line drops any group whose module no longer exists (`.filter(… isParentType)`), so a renamed module loses its screens without a failure. | Fail instead of filtering. | Low. |

**Not a problem:** the Languages family's internal ID is `translation` (`catalog/languages/family.ts`); the golden set uses it correctly.

## Order and the checks every batch passes

Batch 0 any time. Then 1 and 2 (independent, both docs only), then 4 and 7, then 5. Batch 3's map rows (D36's row, D31 and D35 implemented, D32 and D33 with their state) can go with Batch 1; D35's open item and links go with the dictionary milestone, which is planned separately. Batch 6 only with a later contracts change. The harness items are code changes in `tests/`; they can go in one PR beside these batches, with the flaky journey first.

Every PR passes CI as it stands (`npm run check`, the OpenAPI drift check, `npm test`, `npm run test:browser`, the build and package steps), plus the batch's own checks above. No batch changes a prompt, so `tests/prompts/*.txt` must not change and no `UPDATE_PROMPTS=1` run is expected; any diff there means a batch went wrong. No batch changes interface strings, so `tests/localisation.test.mjs` must pass unchanged.

## The owner's answers

Given on 15 November 2026:

1. Batch 0, remove the local files and merged worktrees: **yes** (partly done; see Batch 0).
2. Batch 1, move `catalog-cleanup-and-flag-design.md` and `cleanup-and-refinement.md`: **not yet**; both stay.
3. Batch 3, D32 and D33: the owner asked whether the lookup table is still not on `main`. It is not; see Batch 3. Then, on the dictionary's future: **"create its own milestone"**. The dictionary, with D32, D33 and the documents D35 links to, comes to `main` as a milestone of its own; D35 is not rewritten.
4. Batch 4, `maps/`: **local only**.
5. The questionnaire: **delete it** (Batch 7).
