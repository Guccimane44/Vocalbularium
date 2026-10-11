# Plan: the Vocabularium Sage visual identity (0.6.0)

Proposed: 12 October 2026 (Europe/Berlin). Implements [D05](../architecture/traceability-map.md#entries), accepted by the owner on 12 October 2026. Tracker: [#120](https://github.com/Guccimane44/Vocalbularium/issues/120). Status: approved by the owner on 12 October 2026; increment 0 in progress.

## Outcome

Vocabularium gets its own visual identity, **Vocabularium Sage**: a calm, Notion-like workspace on green-grey paper where each module is marked by a coloured index tab of its module family. Generated content is shown as readable structure (numbered meanings, examples beside their translations) instead of raw markup. Every layout handles main keys of any length, from one word to a passage. Motion is quick and physical, and the capture gains a short signature moment.

The interaction model of 0.5.x stays: page-owned modules, the module window, per-card actions and drag-only shaping ([D02](../architecture/traceability-map.md#entries), [D04](../architecture/traceability-map.md#entries)). This milestone changes how it looks and moves, and how deck pages are listed.

## Design sources

These are the design references for this milestone. The specifications link to them; where they disagree with a specification, the specification wins and the difference is reported.

- **[Vocabularium Sage design system](https://claude.ai/artifact/6gmEs5nUHAzKCC4do39u9E)**: tokens for both themes (Sage and Moss night), the six module families, type, spacing, radius, motion durations and easings, the brand book, and CSS-only references for MainKey, ModuleCard, PageList, ModuleWindow, Navigation, Button, SearchField and Status.
- **[Direction canvas](https://claude.ai/artifact/32N8fTYUFYBeb2yFw31HHX)**: the explorations; the chosen screens are the *Candidate* row (greener sage, list by default) and row B (dashboard and deck settings).
- **[Motion prototype](https://claude.ai/artifact/PXPBc7KNfsL5jSLp3341Aj)**: capture flight, a new page arriving in the deck, generation reveal, and shaping by drag and keyboard.

The three are private artifacts owned by the owner. The implementation copies the tokens into the repository (increment 2), so the build never depends on them.

## Owner decisions

Recorded in D05, from the design interview on 11 October and the review rounds on 11 and 12 October 2026, and accepted with the answers to K19–K21 on 12 October 2026:

1. **Direction:** B, *Index Tabs*: Notion-inspired, professional and clean, with clean motion. Personality is playful but grown-up; references are Arc and Notion.
2. **Tone:** the greener sage ground in light mode; a dark counterpart (*Moss night*). Appearance follows the system setting, with a manual override.
3. **Module families:** each module belongs to one of six families (Meaning, Usage, Roots, Connections, Sound, Notes), which sets its tab colour and icon. Colours stay paired with the module's name.
4. **Typography:** Fraunces (with a CJK serif fallback) for main keys, titles and reading text; Instrument Sans for the interface. Both are bundled with the extension. Chinese and Japanese use the system's serif fonts; nothing is loaded from Google at runtime.
5. **Long inputs:** the main key's size follows its length (word, phrase, sentence, passage). In the page list every row has the same shape: the key (up to two lines) over one line of meaning.
6. **Page list:** List, Table and Gallery are **layouts** of a deck's page list, not views (K19). List is the default for every deck, grouped by capture date for the creation-time sort orders only (K20). Table and Gallery are also built in this milestone, with a switch remembered per deck.
7. **Quiet status:** completed work shows no badge; only waiting, generating and failed states appear. A failed row offers its action (Retry, Try saving again) as a visible button.
8. **Rendering:** generated content is rendered from its current text format by the extension. Stored content, prompts and the API do not change; text that the renderer does not recognise is shown as plain text, as today.
9. **Capture:** stays in the context menu. After the user chooses it, the selection lifts off the page and flies into the capture feedback popup in about half a second, and the toolbar badge counts captures until the dashboard is opened (K21). No new extension permission; the floating selection button from the prototype is not part of this milestone.
10. **Motion:** the durations and easings in the design system; every animation stops under reduced motion.

## Before and after

| Area | 0.5.2 | 0.6.0 |
| --- | --- | --- |
| Theme | Light/Dark control, Light by default | Sage and Moss night; follows the system setting, overridable in an account menu |
| Header | Appearance select, Log out and Diagnostic logs as buttons | Deck sidebar; one account menu for appearance, logs and log out |
| Dashboard | Deck cards; tall Recent captures rows with two buttons | Deck sidebar and deck cards; Recent captures as compact rows or cards, each one link |
| Page list | Index column and main key; whole-row status tints | List (grouped by date), Table or Gallery; key over meaning, family marks, quiet status |
| Page view | Main key repeated in a card; identical white cards; raw markup; permanent button rows; "Completed" badges | Main key once, sized by length; module cards with family tabs; rendered content; actions on hover and focus; status only when not completed |
| Deck settings | Example previews below Save, full width | Live preview beside the module list, following it as it changes |
| Module window | Flat list of text boxes | Search and collapsible family groups |
| Capture feedback | "Capture received" popup | Same popup, restyled, with the selection flying into it |
| Motion | None | Design-system motion; reduced-motion fallback |

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts. Increments 2–8 change the extension only; the backend and the database stay as in 0.5.2.

### 0. Record the plan (this PR)

This plan, the D05 row with its conflict and clarifications in the [traceability map](../architecture/traceability-map.md), the tracker issue, the Notion decision record (`Proposed`) and the 0.6.0 milestone in Actual Stages (`Not started`).

### 1. Specifications (docs only, after D05 is accepted)

- [Shared UI](../specs/shared-ui.md): a visual identity section that points to the design system and names the rules the extension must keep (families, quiet status, focus, contrast, motion and reduced motion); appearance follows the system; *List state presentation* and *Text content* are replaced by the new list states and the rendering rule.
- [Pages and editing](../specs/pages-and-editing.md): page list layouts (List, Table, Gallery) and date groups; main key tiers; cards with hover actions; empty Text as one line.
- [Decks and configuration](../specs/decks-and-configuration.md): dashboard and sidebar; deck settings with the live preview; the per-deck remembered layout.
- [Capture and generation](../specs/capture-and-generation.md): the capture flight into the feedback popup.
- [Modules](../specs/modules.md): each module type's family, and the render contract of the three content modules.
- [Product model](../product/model.md): **layout** (how a deck lists its pages) as a term distinct from **view** (how one page is shown).
- [Vision](../product/vision.md#uiux-direction): the UI/UX direction is set; the open paragraph points to the design system.
- [Scope](../product/scope.md): new rows as `accepted for 1.0`, then `implemented` in increment 8.

### 2. Foundation: tokens, fonts, appearance

- Copy the design-system tokens into `extension/theme.css` as custom properties for both themes, generated from a checked-in copy of `tokens.json` by a build script, so the two cannot drift.
- Bundle Fraunces (variable) and Instrument Sans as `woff2` with their OFL licences; CJK falls back to system serif fonts.
- Appearance: **System** (default), **Sage**, **Moss night**, stored per installation like today's theme, with the existing live update across open views.
- Motion tokens and a global reduced-motion rule.
- Module families in `packages/domain` (`page-modules`): each catalog entry gets a family, shared by the extension and any later client.

### 3. Shell, navigation and dashboard

- Deck sidebar (deck colour, name, page count), Home, and **+ New deck**; on narrow windows it becomes a menu.
- An account menu holding appearance, diagnostic logs and log out.
- Dashboard: deck cards and Recent captures in the new style; each capture is one link, and unsaved receipts keep **Try saving again**.

### 4. Page list layouts

- **List** (default): rows grouped by capture date for the two creation-time orders and ungrouped for the alphabetical ones; key over meaning, family marks, Open on hover, and the waiting, generating, failed and not-saved states with their actions.
- **Table** and **Gallery**, with a layout switch remembered per deck on the installation, next to the existing sort order.
- Loading 30 pages at a time, the four sort orders and keyboard access stay as specified.

### 5. Page view and module window

- MainKey in four tiers (word, phrase, sentence, passage with Show all).
- Module cards with the family tab; actions in one control revealed on hover and keyboard focus; no "Completed" badges; empty Text as one line.
- **Renderer** in `packages/domain`: a pure function per content module type that turns today's output text into headings, numbered meanings and example pairs, and returns plain text for anything else. It never produces HTML; the extension builds elements from its result. Covered by unit tests with the recorded provider samples.
- Module window with search and family groups; drag behaviour from 0.5.2 unchanged.

### 6. Deck settings

The module list on the left, the live preview of a sample page in the middle (word or sentence sample, following every drag), the module window on the right. Cancel and Save stay at the top.

### 7. Motion

- Capture flight: the content script lifts the selection and flies it into the feedback popup (about 560 ms), then shows the popup as today; the toolbar badge counts captures until the dashboard is opened.
- A new page sliding into the list; family marks popping in as components finish; status changes cross-fading.
- Generation reveal on the page; tab lift on hover; drag pick-up tilt, landing line and cards making room, on top of the existing `@dnd-kit` behaviour.
- Reduced motion keeps every state change without movement.

### 8. Verification and delivery (0.6.0)

- Unit tests for families and the renderer; existing store and API tests unchanged.
- Browser E2E updated for the new structure, plus new journeys: each page list layout and its remembered choice; long main keys in the list and on the page; appearance following the system and the override; the capture flight ending in the popup; reduced motion.
- Screenshots of the dashboard, page list, page view and deck settings in both themes and at a narrow width, kept with the release evidence.
- Accessibility pass: contrast of every token pair in both themes, keyboard paths, focus rings, forced-colors mode, screen-reader announcements for drags and status.
- Version 0.6.0; scope ledger to `implemented`; D05 to Implemented in Notion; owner acceptance recorded separately.

## Acceptance criteria

1. The extension follows the system's light or dark setting by default; the account menu can force Sage or Moss night, and the choice updates every open view at once.
2. Every module card shows a tab in its family's colour with its name; the page list, sidebar and module window use the same family marks with text labels.
3. A completed component and a completed page show no status badge; waiting, generating, failed and not-saved states are visible in the list and on the page.
4. Content from the three content modules appears as numbered meanings and example–translation pairs; unrecognised text appears unchanged as plain text.
5. A word, a phrase, a sentence and a passage each display without overflow on the page and in all three layouts; a passage on the page shows six lines and **Show all**.
6. List is the default layout of every deck; Table and Gallery can be chosen, and the choice is remembered per deck on that installation.
7. Deck settings show a live preview that changes with the module list.
8. Capturing from the context menu shows the selection flying into the feedback popup, and the popup behaves as before.
9. With reduced motion, no element moves, and every state is still shown.
10. Text and controls meet the contrast targets in both themes, and every action works from the keyboard.
11. Upgrading from 0.5.2 keeps all decks and pages, needs no migration, and changes no API.

## Risks

- **E2E churn:** most browser tests select today's markup. Increment 2 adds stable test ids before the restyle, so later increments change looks without rewriting tests.
- **Renderer accuracy:** the provider may vary its format. The renderer falls back to plain text, and the recorded samples become its test fixtures.
- **CJK on different systems:** system serif fonts differ between macOS, Windows and Linux. The screenshots in increment 8 cover macOS; others are checked by the owner when available.
- **Milestone size:** three layouts and motion make this the largest UI milestone so far. If it runs long, Table and Gallery can ship in a 0.6.x release after List; that split is the owner's call.
- **Dark theme and motion:** the owner accepted D05 without separate comments on Moss night or the motion prototype; their values can still be tuned in increment 2.

## Not in this milestone

The floating selection button on web pages; structured (block) generation output ([Q13](../architecture/questionnaire/answers/answers-03-frontend.md#q13)); view modules other than the default view; new modules (Pronunciation, Etymology and others appear only as design examples); a logo; localisation of the interface.
