# v0.2.1 execution plan

**Status: proposed for owner review, 14 September 2026. Diagnosis completed; product changes have not started.**

Tracker: [#35](https://github.com/Guccimane44/Vocalbularium/issues/35). Milestone: [v0.2.1](https://github.com/Guccimane44/Vocalbularium/milestone/2).

This iteration addresses the owner's two corrections: remove the unwanted dashboard texts, and eliminate the extra Chrome window when capturing selected text from the Vocabularium dashboard. It introduces no replacement helper copy.

**Owner clarification:** the current Select and Add feedback popup on external webpages is the accepted reference. Apply that same popup to the dashboard: identical wording, page-relative placement, appearance, close control, three-second lifetime and Light/Dark behavior. Preserve the current external-page experience. Dashboard feedback uses the same presentation, with only its delivery adapted to the extension page.

The baseline is the v0.2.0 candidate at `ae94bd7e594a8e8fc75dd482b2b6fe855647ed54`, in open [PR #34](https://github.com/Guccimane44/Vocalbularium/pull/34). Its pending-row handoff fix must remain effective. This plan does not merge or accept that PR. The plan review branch is based on that branch so its PR shows only this document; integration can be retargeted after v0.2.0 reaches main.

## Findings

| Problem | Confirmed cause | v0.2.1 outcome |
| --- | --- | --- |
| Unwanted saving text | `extension/app.js` adds “Saving to your account…” to pending receipts and “Saving to your account” to the status icon's accessible label and tooltip. The current scope document also names this sentence. | Remove the paragraph and that phrase from the tooltip/accessible description. Keep the clock/tint with the concise accessible state “Pending”. |
| Unwanted selection instruction | The same renderer adds “Select text on a webpage, then choose…” when Recent captures is empty. | Remove the instruction without adding another message or retaining an empty paragraph. Keep the section heading and normal layout. |
| Extra Chrome window during dashboard capture | `extension/feedback.js` tries to inject webpage feedback into the extension dashboard. Chrome rejects that call; the catch path creates a separate unfocused popup window. | Apply the accepted external-page Capture received popup to the originating dashboard, with matching presentation and behavior. Dashboard capture creates no additional Chrome window. |

The window path was reproduced with the real capture handler and actual dashboard tab ID in a temporary extension copy, using synthetic data and Chrome for Testing 151.0.7922.34 on macOS. The injection failed, one popup was created, no dashboard overlay appeared, and one card was saved. The popup displayed Capture received and closed after approximately 3.13 seconds. This confirms the unwanted window path, but not the owner's precise 50 ms native Windows flash.

The popup also loads an initially empty message and hides its body until asynchronous theme initialization finishes (`feedback.html`, `feedback-popup.js`, `app.css`). That can contribute to a blank initial frame; the precise Windows painting sequence remains unverified. Removing window creation from dashboard capture avoids relying on native window painting timing.

Existing browser tests cover ordinary webpage feedback and the restricted-page fallback. They do not cover feedback originating from the product dashboard, which allowed this path to remain unnoticed.

## Execution order

### 1. Remove the two unwanted texts — small

Issue: [#36](https://github.com/Guccimane44/Vocalbularium/issues/36). Main file: `extension/app.js`.

- Remove the saving paragraph, matching tooltip phrase, and empty-state instruction described above. Do not substitute new helper text or leave an empty paragraph/gap.
- Keep the pending icon and accessible Pending state. Preserve the existing failed-save explanation, error and Try saving again action.
- Update the current [MVP scope](MVP-Product-scope.md) to reflect the owner's correction. Leave historical v0.2.0 plans/evidence intact.
- Check an empty dashboard and a deliberately delayed capture in both themes, including tooltip/accessibility output. Keep the continuous pending-to-saved row regression passing.

**Exit:** neither unwanted phrase is presented by Recent captures; pending and failed receipts remain understandable and actionable.

### 2. Apply the existing external-page popup to the dashboard — medium

Issue: [#37](https://github.com/Guccimane44/Vocalbularium/issues/37). Main areas: feedback routing, dashboard initialization, and the feedback component.

- Add an internal feedback route for Vocabularium pages. Address only the tab where capture was invoked, validate the message source, and keep multiple open dashboards from showing duplicate feedback. Chrome supports communication between the service worker and extension pages through [extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
- Use the current external-page popup as the reference before changing feedback code. Reuse its presentation and styles for the dashboard: wording, dimensions, spacing, typography, colors, page-relative placement and close control must match. A shared renderer should keep both surfaces consistent.
- Mount that same popup outside the account content replaced during dashboard rendering. A capture/account refresh must not immediately erase its feedback.
- For dashboard capture, do not attempt webpage injection or open a fallback Chrome window. If the originating page closes or navigates away, capture continues without redirecting feedback into another dashboard or creating a window.
- Preserve the existing three-second lifetime, close control, Light/Dark behavior and independent feedback for separate captures. A theme change or account rerender must not restart its timer.
- Preserve the accepted external-page popup's appearance and behavior, and keep the genuine restricted-page fallback functioning. Use the existing permissions; the dashboard fix should not require broader website access.
- Record the shared external-page/dashboard popup contract in [Select and Add](MVP-Product-spec-select-and-add.md#capture-feedback-popup), keeping its detailed capture, retry and interruption rules authoritative.

**Exit:** dashboard capture shows the same popup the owner already accepts on external pages, saves the card normally, preserves focus/route, and creates zero additional Chrome windows. The external-page experience remains unchanged.

### 3. Verify and deliver 0.2.1 — medium

Record combined evidence and the candidate in [#35](https://github.com/Guccimane44/Vocalbularium/issues/35).

- Add a browser regression that monitors window-creation calls/events throughout dashboard capture, including windows too brief for an eventual window-count check. Assert zero new windows and exactly one feedback item in the originating dashboard.
- Compare dashboard and external-page feedback side by side in both themes against the current external-page reference. Check matching text, placement, size, styling, close control, lifetime and repeated-capture behavior; record screenshots and regression evidence for both surfaces.
- Cover account rerenders during feedback, manual dismissal, the original timer, rapid separate captures, theme switching, multiple dashboard tabs, and the originating page closing. Ensure captures still save once per invocation and feedback changes do not affect generation.
- Run the existing relevant feedback, pending-row handoff, save-recovery and browser-lifetime scenarios, then the complete logic/browser suites on the final source. Record actual results and current-head CI.
- Set package, lockfile and manifest versions to **0.2.1**. Preserve the delivered 0.2.0 ZIP/checksum, build from clean committed source, and verify the configured archive, source, origin, contents and checksum.
- Use the existing Render Free backend and provider configuration for the extracted-ZIP hosted walkthrough. No backend deployment, provider change or account reset is expected for these extension fixes.
- Hand over the package for an in-place Windows update. Record Windows/Chrome versions, source/checksum, removal of the texts, and absence of the blank-window flash during repeated dashboard captures in both themes. Have the owner compare the dashboard popup with the accepted external-page popup and confirm that the external-page experience is preserved.

**Exit:** automated checks and archive/hosted verification pass, and the owner verifies the native Windows behavior. Automated Chromium checks alone do not establish native Windows acceptance.

## Acceptance checklist

- [ ] Empty Recent captures has no selection instruction or replacement helper paragraph.
- [ ] Pending receipts have no Saving to your account paragraph/tooltip; no empty paragraph remains.
- [ ] Pending cues, save-failure recovery and the v0.2.0 continuous row handoff still work.
- [ ] Dashboard capture creates zero new Chrome windows and shows feedback only in its originating page.
- [ ] Dashboard feedback matches the accepted external-page popup in wording, placement, appearance, close control, lifetime and theme behavior; external-page feedback is preserved.
- [ ] Feedback survives account rerenders, supports manual close, and keeps its original three-second lifetime across theme changes.
- [ ] Rapid separate captures and multiple open dashboards produce the correct independent feedback/cards.
- [ ] Ordinary webpage feedback, restricted-page fallback and browser-lifetime regressions pass.
- [ ] The 0.2.1 package has recorded source, origin, checksum, current CI and hosted evidence.
- [ ] The owner confirms the two fixes on Windows before iteration acceptance.

## Progress and review

Use one focused implementation PR with separate commits for the two fixes and final verification, linked to #35–#37. Track each issue as planned, implementing, checks passed, ready for review, then accepted/merged as applicable. Keep implementation and Windows acceptance distinct. Merge only with the owner's applicable authorization.

During this planning pass, only the isolated diagnosis and document checks are performed. After plan approval, use `npm run check`, `npm test`, `npm run test:browser`, and the existing build/package/hosted commands through the project verification and delivery skills. No new setup command is introduced by this plan.

The Render reset/stale-client scenario remains deferred in [#24](https://github.com/Guccimane44/Vocalbularium/issues/24). Other UI copy, product features and infrastructure are outside these two fixes.
