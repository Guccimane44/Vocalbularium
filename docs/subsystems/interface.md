# Interface

The rules every screen shares: the sidebar and trail, the Vocabularium Sage visual identity, the two themes, how lists show state, motion, dialogs and menus, and how text content is drawn. A screen's own layout is on its [screen page](../screens/README.md); the checks a reviewer applies to any interface change are in the [code standards](../code-standards.md#interface). Interface languages are in [localisation](localisation.md).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Design tokens | The repository copy of the Sage design system's colours, type, spacing, radius and motion values, for both themes; `theme.css` is generated from it, with the forced-colours rules. | [`extension/design/tokens.json`](../../extension/design/tokens.json) → [`build-theme.mjs`](../../scripts/build-theme.mjs) → [`theme.css`](../../extension/theme.css); `npm run check` fails when they differ |
| Theme choice | **System**, **Sage** or **Moss night**, stored per installation and applied to every open view and the capture popup. | [`theme.js`](../../extension/theme.js) |
| Families and deck colours | A module family's mark, colour and icon; a deck's colour from its choice or its ID. | [`families.tsx`](../../extension/families.tsx), [`deck-colour.ts`](../../extension/deck-colour.ts); each family's `family.ts` in the [module catalog](module-catalog.md) |
| Fonts | Fraunces and Instrument Sans, bundled with the extension. | [`fonts.css`](../../extension/fonts.css) |
| Motion | The named moves, their durations and easings, and reduced motion. | [`motion.css`](../../extension/motion.css); `useArrivals` in [`page-list.tsx`](../../extension/page-list.tsx) |
| List states | Saving, generating and failed in place of a page's meaning line. | `SavingStatus`, `GeneratingStatus`, `MeaningLine` in [`page-list.tsx`](../../extension/page-list.tsx) |
| Dialogs and buttons | Confirmation dialogs, menus, the keycap buttons and their icons. | [`dialog.ts`](../../extension/dialog.ts), [`button-icon.tsx`](../../extension/button-icon.tsx), [`button-icons.ts`](../../extension/button-icons.ts) |
| Navigation | The deck sidebar, its drag, and the narrow-window menu button; the trail. | `renderSidebar`, `sortableDecks` in [`shell.js`](../../extension/shell.js); [`crumbs.tsx`](../../extension/crumbs.tsx), [`crumb-text.ts`](../../extension/crumb-text.ts) |
| Text content | Plain main keys, markdown in Context, Text and facets, tables, KaTeX and highlighted code. | [`rich-blocks.tsx`](../../extension/rich-blocks.tsx), [`card-content.tsx`](../../extension/card-content.tsx); `renderContent` in [`render.ts`](../../packages/domain/src/render.ts) |
| Layout rules | Deterministic checks on every captured screen: overflow, target size, focus, mirroring, English strings and token colours. | [`tests/screens/rules/`](../../tests/screens/rules/index.mjs) |

## Behaviour

### Navigation

Every signed-in view shows a **deck sidebar** on the left: the wordmark, **Home** (the dashboard), the account's decks in the account's own order ([D27](../decisions/d27.md)), each with its deck colour, name, and page count, and **+ New deck**, and the account menu at its foot. The deck being shown is marked as current. A deck's row drags to a new place, as its card on the dashboard does, and either list follows the other. The decks scroll within the sidebar while the account menu stays at the foot. On a narrow window the sidebar becomes a menu button in the header.

Every view below Home starts with its **trail** from Home: a deck's page shows *Home › the deck*; its settings, whether opened from Home or from the deck's page, *Home › the deck › Deck settings*; a page *Home › the deck › its main key*, and a page being made *Home › the deck › New page*; a new deck *Home › New deck*; diagnostic logs *Home › Diagnostic logs*. Every crumb but the last is a link; the last names the view. A deck's name or a main key is cut to 32 characters with an ellipsis and keeps its whole text as a tooltip. Leaving deck settings by a crumb discards the draft as Cancel does. In a right-to-left language the trail mirrors.

### Visual identity

The [Vocabularium Sage design system](https://claude.ai/artifact/6gmEs5nUHAzKCC4do39u9E) holds the identity's values and references: colour tokens for both themes, type, spacing, radius, motion durations and easings, the brand book, and CSS references for the main components. The extension keeps a copy of its tokens in the repository, so the build never depends on the design system. Where the design system and a specification disagree, the specification wins and the difference is reported.

These rules hold everywhere:

- **Content first.** Main keys and generated content are the largest, darkest things on screen; buttons, status, and settings recede.
- **Colour means module family.** Each module belongs to one family ([modules](module-catalog.md#module-families)), which sets the colour of its index tab and its icon. Apart from status, nothing else uses saturated colour. A family colour always appears with the module's name, or with a text alternative where only the small family mark is shown.
- **Success is quiet.** Completed work shows no status. Only saving, generating, and failed states appear ([list state presentation](#list-state-presentation)).
- **Type.** Main keys, titles, and generated reading text use Fraunces; the interface, translations, and captions use Instrument Sans. Both are bundled with the extension. Chinese and Japanese text uses the system's serif or sans-serif fonts; no font is loaded from the network. Reading text is never smaller than 16 px.
- **Long text.** Every layout handles text of any length without overflow: main keys from one word to a passage ([pages and editing](../screens/page.md#the-main-key)), long module names, and right-to-left text, which sets its direction on the component content, never on the card.

### Appearance

The extension has two themes, **Sage** (light) and **Moss night** (dark). By default it follows the operating system's light or dark setting and changes with it. The account menu offers **System**, **Sage**, and **Moss night** as three icons side by side, a screen, a sun and a moon, the current one raised, each named in its tooltip and to screen readers, and choosing one leaves the menu open; the sign-in view offers the same control in its header. The choice is stored per Chrome installation, separately from account data, and survives logout, closing views, restarting the browser, and updating the extension in place. Other installations can choose differently.

Changing the theme, or the system setting while **System** is chosen, updates every open extension view, dialog, and active capture feedback immediately, without losing drafts, selection, navigation, or dialog state, and without restarting the feedback popup's timer. Browser-owned menus and frames follow Chrome's own appearance.

Both themes keep readable hover and focus states, non-color status cues, and usability in forced-colors mode. Normal text targets 4.5:1 contrast; large text and necessary control, status, and focus cues target 3:1 against adjacent colors. Focus is always a visible 2 px ring.

### List state presentation

Lists show status only when something is in progress or needs attention. A completed page or capture shows no status. The status takes the place of the page's meaning line ([page list](../screens/deck.md)), so the row keeps its shape:

- **Saving:** a capture receipt still being saved to the account shows a clock and "Saving to your account".
- **Generating:** a page with a component attempt in progress shows three moving dots and "Generating", with the count of finished components when there are several ("Generating 1 of 2").
- **Generation failed:** a page whose current outcome is failed ([capture and generation](generation.md#component-completion-and-failure)) shows "Generation failed" on a tinted row, with a visible **Retry…** button. It opens the page at its first failed component, whose card offers **Retry** under the usual rules ([capture and generation](generation.md#generation-actions)); the list itself starts no generation.
- **Not saved:** a receipt waiting to be saved again shows "Not saved" and the error on a tinted row, with **Try saving again** as a visible button. That is a save problem, not a generation failure, and nothing implies that the capture was saved.

A row that holds a button is not itself one link: its text links to the page, and the button sits beside it, so each works from the pointer and the keyboard. Status is always a word, never colour alone.

### Motion

Motion is quick and physical: what the user touches responds with a small spring and settles. Nothing moves on its own except work in progress. Durations and easings come from the design system: colour changes 120 ms, revealing hover actions 150 ms, moving things 350 ms with a slight overshoot, larger objects 450 ms, and one cycle of the generating dots 1 s. Elements move by transform and opacity only, a few pixels at a time.

The named moments are: the capture flight ([capture and generation](../screens/capture.md#the-menu-the-popup-the-flight-and-the-badge)); a new page sliding into a list and its family marks appearing as components finish; status changes cross-fading; generated content rising into its card line by line while the card grows to fit; a module card's tab lifting on hover; a card's actions ejecting from its tab with a spring, one after the other; and a dragged module tilting slightly while the landing line and the other cards make room.

When the system asks for reduced motion, nothing moves: every state change still happens, without transitions, and the generating dots stand still beside their word.

### Dialogs, menus, and feedback

Confirmation dialogs for retry, deletion, and unsaved changes stay open until the user chooses; they never close on a timer. Menus close after an action, on Escape, on navigation, and on a click outside, and return focus to their trigger. The capture feedback popup is defined in [capture and generation](../screens/capture.md#the-menu-the-popup-the-flight-and-the-badge).

### Text content

The main key holds plain text, shown with line breaks preserved and never interpreted as HTML; editing it edits that text. The Context and the Text module hold the same markdown as a parent's core, edited with the same toolbar editor. A parent module's content is markdown per facet, drawn into fixed containers ([modules](module-catalog.md#render-contracts)): the core, then one container per facet with content. The editor shows formatting without markdown characters ([pages and editing](../screens/page.md#editing-generated-components)). A facet's content can also hold a table, display math in LaTeX rendered with KaTeX, or a fenced code block with syntax highlighting; tables keep their rows and columns on a narrow card by scrolling within their container, a formula that fails to render shows its LaTeX source, and a facet's own Edit edits them as their source text.

## Constraints and failure behaviour

- **Colours come from the tokens.** A colour outside them fails the `token-colour` layout rule on every captured screen; `tests/screens/rules/allowlist.mjs` lists what today's screens break, so only something new fails.
- **Where the design system and this page disagree, this page wins** and the difference is reported.
- **Nothing loads from the network**: fonts and icons are bundled.

## Verification

| Check | What it covers |
| --- | --- |
| `npm run screens -- --base main` | Every screen in both themes and six languages, with the layout rules ([screens](../guides/screens.md)) |
| [`tests/browser/layout-rules.test.mjs`](../../tests/browser/layout-rules.test.mjs) | Each layout rule on its fixtures, and on real screens in English and Arabic, light and dark |
| [`tests/contrast.test.mjs`](../../tests/contrast.test.mjs) | Text at 4.5:1 and focus rings, borders, status marks and family shapes at 3:1, in both themes |
| [`tests/browser/motion.test.mjs`](../../tests/browser/motion.test.mjs) | The motion catalogue, frame by frame |
| [`tests/browser/buttons.test.mjs`](../../tests/browser/buttons.test.mjs) | The keycap buttons |
| [`tests/browser/accounts.test.mjs`](../../tests/browser/accounts.test.mjs) | A theme change reaching every open view, draft, dialog and the popup |
| [`tests/browser/crumbs.test.mjs`](../../tests/browser/crumbs.test.mjs) | The trail on every screen below Home |
| [`tests/render.test.mjs`](../../tests/render.test.mjs) | Text content rendering |
