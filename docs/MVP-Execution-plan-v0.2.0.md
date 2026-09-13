# v0.2.0 execution plan

**Status: approved by the owner on 13 September 2026. Implementation in progress.**

GitHub tracking: [v0.2.0 iteration tracker, #26](https://github.com/Guccimane44/Vocalbularium/issues/26).

This plan turns [the owner's v0.2.0 changes](MVP-Iteration-v0.2.0.md) into reviewable milestones. The baseline is the accepted v0.1.0 product on main at `4a0d11e5b5faa2f3e33448a3a01edd5a4ad30937`. The [MVP scope](MVP-Product-scope.md), [modules](MVP-Product-spec-modules.md), and [Select and Add](MVP-Product-spec-select-and-add.md) continue to govern behavior outside the requested interface changes.

The expected result is a clearer dashboard and card list, consistent deck actions, a context menu that names the destination deck, and a persistent Light/Dark preference. The work is primarily in the extension; no database migration, provider change, or backend deployment is expected.

## Approved decisions

| Decision | Accepted default |
| --- | --- |
| Theme scope and initial value | Start in Light, matching the current MVP. Store the explicit Light/Dark choice per Chrome installation. It survives logout, extension reopening, browser restart, and an in-place extension update. Different installations may choose different themes. |
| Toggle location | A labeled Light/Dark control in the shared header, available on login and every product view. Changing it updates all open extension views and active capture feedback without discarding drafts or closing dialogs. |
| State presentation | Use a muted blue-green/check mark for completed, amber/clock for pending, and vermilion/warning symbol for failed. Use separate light/dark shades, with an accessible text description for each icon. These are palette directions; choose exact shades after contrast and color-vision checks. |
| Meaning of pending | Treat the existing generation value `loading` as the visual pending state; do not introduce a new stored generation state. Preserve save-failure messages and explicit resubmission separately. |
| Context-menu freshness | A local rename/default change updates the label after its successful save and refresh. Changes from another installation update on the next successful account synchronization, including background refresh while Chrome is running. Offline use retains the last synchronized name; instant cross-device updates are not proposed. |
| Badge-removal boundary | Remove generation badges from deck card rows and dashboard recent captures. Keep detailed card/page generation information and recovery controls on the card content page. The default-deck badge is a separate indicator. |

The owner accepted these defaults and the milestone order. The specifications and [acceptance matrix](v0.2.0-Acceptance.md) record the implementation contract.

## Scope coverage

| Requested change | Current implementation | Planned milestone |
| --- | --- | --- |
| Remove “Your words, kept close.” and “YOUR VOCABULARY”; use “Your decks.” | Shared header in `extension/app.html`; dashboard rendering in `extension/app.js` | M1 |
| Deck actions on the card-list page | Actions and deletion/default rules currently live inside dashboard rendering | M1 |
| Close three-dot menus after use, rerender, and navigation | Native `details` menu, with actions and open state handled inline | M1 |
| Context action `Create a card in “{default deck name}”` | A fixed label is created during worker initialization | M2 |
| Light/Dark across product views and feedback | Hard-coded light colors; webpage feedback and fallback popup are separate surfaces | M3 |
| State-colored rows without visible generation badges | Shared badge helper is also used by card content pages | M4 |
| Entire deck card row opens the card | Only the entry button navigates; sorting and indices are already derived | M4 |
| Existing behavior continues to pass | Controlled product/browser tests, hosted checks, and a Windows handoff already exist | Every milestone; combined gate in M5 |

## Execution order and milestones

Use **M0 → M1 → M2 → M3 → M4 → M5** as the review order. M3 supplies the colors used by M4. M2 builds on the account-changing actions checked in M1. The largest work item is M3 because theme changes must reach multiple kinds of extension UI.

### M0 — Agree on the interface contract

**Size: small. Output: approved scope and acceptance details.**

- Confirm the proposed defaults above and add explicit acceptance checks for dashboard copy and the dynamic context-menu label, which are requested but not listed separately in the owner's checkbox list.
- Update the dashboard/card-list/theme sections of the MVP scope, and the context-menu wording in Select and Add. Keep detailed capture, failure, interruption, and retry rules in that authoritative document.
- Record the v0.2.0 acceptance matrix and create the implementation milestone issues after the plan is approved.
- Keep the owner's requirements document as the source of requested changes; identify any accepted additions as decisions, not as original requirements.

**Exit:** each of the seven requested changes maps to an observable check, and the theme/status/synchronization defaults are agreed.

### M1 — Consistent deck actions and dashboard copy

**Size: medium. Main area: `extension/app.js`, shared menu/dialog UI, `extension/app.html`.**

- Extract the existing Set as default, Configure deck, and Delete deck behavior into one reusable deck-actions component used on both the dashboard and the deck's card-list page.
- Reuse the existing operation messages, confirmation wording, replacement-default selector, and sole-deck reset behavior. A failed save keeps its existing recovery path.
- Close the menu immediately when an action is selected, before a dialog or asynchronous save begins. Render/navigation must not reopen it; Cancel or failure must not leave a stale menu visible.
- Support keyboard opening/activation, Escape dismissal, and predictable focus return. Keep the current default's Set as default action disabled.
- After deleting the currently viewed deck, return to the dashboard. Cancel leaves the user on the same deck. Configure opens the existing configuration flow.
- Apply the exact dashboard copy changes. Removing the tagline from the shared header also removes it wherever that header is displayed.
- Update product and hosted browser helpers that currently identify the dashboard by “A growing collection.”

**Exit:** all three actions behave identically from both locations, including deleting a non-default deck, replacing the default, deleting the only deck, canceling, and recovering a failed save. Menus close on every tested path; requested copy is correct.

### M2 — Keep the capture menu's deck name current

**Size: medium. Main area: `extension/background.js`; capture logic is a regression boundary.**

- Centralize menu creation/update/removal around confirmed authentication, session readiness, and the latest synchronized default deck. Keep the existing menu ID and capture handler.
- Set the exact label `Create a card in “{default deck name}”` at successful initialization/login and update it after confirmed default changes, default-deck renames, replacement/deletion, and account refreshes. Unsaved configuration drafts must not change the label.
- Use the existing background recovery/account refresh path for changes made on another installation. The active app currently refreshes every five seconds and the recovery alarm is scheduled every 30 seconds; these are normal scheduling intervals, not a real-time guarantee.
- Keep capture unavailable when the required access/default/session state is absent, including logout and expired access. Worker restart must not duplicate menu entries.
- Guard overlapping refresh/menu updates so an older response cannot restore an outdated label or recreate capture after logout. Updating a label must not replace the browser session or reconcile active generation again.
- Update current user-facing capture instructions, including the empty recent-captures message and Windows guide. Preserve historical v0.1.0 evidence and laboratory documentation.
- Check long names, quotes, non-Latin text, and Chrome's special `%s` title handling. Use API forms compatible with the manifest's supported Chrome version.

Chrome supports updating a menu item's title and availability; its selection-context titles interpret `%s` specially. Implementation should handle these details without altering saved deck names. [Chrome contextMenus reference](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)

**Exit:** native Windows capture shows the current synchronized deck name after each relevant change, including a change from another installation without reopening the dashboard. The normal offline/recovery flow and capture destination rules still pass.

### M3 — Persistent Light/Dark mode across all surfaces

**Size: large. Main area: shared theme styles/state, app shell, dialogs, and feedback files.**

- Introduce shared color tokens for surfaces, text, borders, controls, notices, focus, and states. Replace hard-coded product colors with light/dark variants.
- Store the theme preference independently of account/session data. Read it before displaying a new extension view; apply changes through style attributes rather than rerendering an editor.
- Keep the toggle present when login/session actions rerender. Update all open extension views immediately and preserve the selected route, page, draft text, selection, and dialog state.
- Cover login, dashboard, deck lists, configuration/previews, card viewing/editing, confirmation dialogs, errors/notices, and both capture feedback paths.
- Pass theme data into the injected webpage feedback and relay later theme changes only to active feedback surfaces. The current storage is restricted to trusted extension contexts; do not expose account storage to webpages to implement theming. Clean up temporary feedback listeners when feedback disappears.
- Theme the fallback extension popup as well as the injected overlay. Preserve the existing three-second lifetime, dismissal, and reading-page focus behavior; a theme switch must not restart the timer.
- Theme extension-owned UI. Chrome's native context menu and window frame remain browser-owned surfaces.

`chrome.storage.local` and its change events fit the proposed installation preference; trusted-context access controls remain in place. [Chrome storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage)

**Exit:** a theme change updates every open product surface, including visible feedback, without reload or draft loss. The choice survives close/reopen, browser restart, logout/login, and update. Both themes pass the visual/accessibility checks in M5.

### M4 — State-colored, fully clickable card rows

**Size: medium. Depends on M3. Main area: card-list/recent-capture rendering and shared state styles.**

- Use the existing overall card generation outcome for persisted cards. Preserve failed-over-loading precedence and successful empty output as defined in [page completion and failure](MVP-Product-spec-select-and-add.md#page-completion-and-failure).
- Apply the state tint across the whole row, with a distinct icon and accessible status description. Keep hover/focus readable without erasing the state distinction. Do not remove the badge helper globally: detailed card/page status still uses it.
- Keep no-generation cards neutral, including manually created cards. Appending an unattempted page must not invent a new generation state.
- Keep recent-capture saving failures visible and actionable. A colored row is not evidence of account persistence.
- Make every part of a deck card row—index, text, status cue, and empty space—open the correct card. Provide one meaningful keyboard navigation target per row, a visible focus indicator, and an accessible name that includes the entry. Avoid duplicate activation or navigation caused by selecting text.
- Preserve the two-column presentation, all four sort orders, stable ties, calculated indices, empty-front-page placeholder, and existing card IDs. Recent-capture rows retain their separate deck/open/recovery buttons.

| Existing source state | Proposed row treatment |
| --- | --- |
| Card `completed` | Completed tint + check icon; accessible “Completed” |
| Card `loading` | Pending tint + clock icon; accessible “Pending: generating” |
| Card `failed` | Failed tint + warning icon; accessible “Failed” |
| Card with no generation outcome | Neutral row; no invented generation label |
| Capture receipt actively saving | Pending tint; retain “Saving to your account…” |
| Capture receipt awaiting resubmission after a save error | Attention/failure tint; retain “Not saved to your account,” error, and Try saving again; do not call this a generation failure |

**Exit:** deck lists and recent captures distinguish all states without visible generation badges or reliance on color alone. Full-row pointer and keyboard navigation preserve sorting and open the intended card.

### M5 — Combined verification and v0.2.0 handoff

**Size: medium. Depends on M1–M4.**

- Run the complete regression suite on the final candidate source. Update only selectors/assertions affected by the approved UI changes; preserve capture, page failure, retry locks, save recovery, deletion, synchronization, and browser-lifetime assertions.
- Address the known Retry-button observation race recorded in [PR #25](https://github.com/Guccimane44/Vocalbularium/pull/25) when touching that scenario: wait for the required disabled state, not only button visibility. Preserve what the assertion proves.
- Check keyboard use and accessible names, and inspect both themes with completed/pending/failed/neutral fixtures, long content, narrow windows, dialogs, and feedback. Record screenshots and measured contrast, including hover/focus states.
- Target at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for necessary control/status/focus cues against adjacent colors. Verify non-color cues and forced-colors behavior. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- Set the product/package version to 0.2.0 in the relevant metadata and lockfile. Build a configured candidate for the agreed existing backend from clean committed source; preserve the delivered 0.1.0 ZIP and checksum.
- Verify the archive, source/origin metadata, and checksum with the delivery skill. Run the hosted extension walkthrough against the extracted ZIP using agreed disposable test data; adapt fixtures to the actual account rather than resetting its decks.
- Have the owner update the Windows installation in place and review the changed interface, native context label, feedback, theme persistence, and a capture/edit/retry/save/synchronization walkthrough. Record version, source/checksum, Windows/Chrome versions, and observed results.

**Exit:** relevant checks and current-head CI pass; the owner accepts the v0.2.0 Windows candidate; the delivery issue links the package, evidence, and any explicit follow-ups. v0.1.0 acceptance does not automatically accept the new UI.

## Verification commands and evidence

Use Node 24 as required by `package.json`. These commands already exist; this planning change does not run live or product acceptance tests.

| Stage | Checks to run during execution |
| --- | --- |
| Each focused UI change | Relevant browser scenario(s), document/reference checks, `npm run check` |
| Combined candidate | `npm test`, `npm run test:browser`, `npm run build`, current-head GitHub checks |
| Configured package | Build with the agreed `VOCABULARIUM_API_URL`, then `python3 scripts/package.py` and the package checker from `$vocabularium-deliver` |
| Hosted/Windows acceptance | Use `$vocabularium-verify` and `$vocabularium-deliver` for the agreed hosted walkthrough and owner handoff; record actual results |

Use synthetic examples. Theme/menu/navigation work should not require new model calls at every milestone. Any hosted writes occur only as part of the agreed verification; a new backend deployment is not expected for this extension-only iteration.

## GitHub execution tracking

- Use a new v0.2.0 tracker and a linked plan-review PR. Keep M0–M6 from the accepted v0.1.0 baseline closed.
- After approval, create one implementation issue per milestone with its exit checks. Group them under a v0.2.0 milestone, with no invented calendar deadline.
- Prefer one focused PR per milestone, based on the latest integrated main. Merge only with the applicable owner authorization; avoid rebuilding the previous long PR stack.
- Use explicit progress states: planned, implementing, checks passed, ready for review, merged, candidate delivered, owner accepted. Link relevant commits and CI/evidence.
- Keep the explicitly deferred Render reset/stale-client scenario in [issue #24](https://github.com/Guccimane44/Vocalbularium/issues/24). It is not a prerequisite for this iteration unless the owner changes that decision. Production storage, provider changes, richer card rendering, and new modules remain outside this plan.

## Owner review checklist

- [x] The seven requested changes and scope boundaries are correct.
- [x] Light by default, installation-local theme persistence, and the shared toggle location are accepted.
- [x] State colors/icons, pending/save-error treatment, and the badge-removal boundary are accepted.
- [x] Context-menu names updating on successful synchronization is the intended cross-installation behavior.
- [x] Milestone order, regression coverage, and the Windows delivery gate are accepted.

Owner approval starts implementation; it does not mark any v0.2.0 product acceptance check as passed. M0–M5 are tracked in issues #28–#33 under the v0.2.0 milestone. Implementation is grouped into milestone commits in one iteration PR so work can proceed without a long chain of unmerged PRs.
