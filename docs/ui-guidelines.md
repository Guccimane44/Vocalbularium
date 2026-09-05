# Vocabularium — UI and visual direction

Draft 0.3 · 5 September 2026 · Companion to the product specification, including the confirmed MVP content model.

## 1. Confirmed direction

The confirmed direction is **futuristic classicism**: classical and Greco-Roman aesthetics interpreted through a contemporary, forward-looking interface. It should express both the classical character of the name **Vocabularium** and the identity of a modern language-learning product. The interface must feel current for 2026 and have a recognizable identity. Exact fonts, colors, and material details below are proposals to develop during implementation.

The creative brief is: **a classical library imagined in the near future**. Use architectural proportion, sculptural typography, mineral tones, precise geometry, and a restrained sense of light and depth. The result should feel intelligent, composed, and quietly intriguing, with warmth appropriate to daily learning.

The classical influence comes chiefly from proportion, typography, and framing. The futuristic influence comes from responsive behavior, precise layering, subtle illumination, and contemporary controls. These qualities should be integrated into the same components. Definitions and examples stay comfortable to read throughout a study session. The style must preserve one front, separate language backsides, one selected Essential answer, and one schedule per card.

MVP interface labels, menus, and system messages are English. Generated explanations/examples remain in the user's chosen languages; English UI must not impose an English content default. Expose only the Explanation and Examples modules, plus their relevant language/role settings.

## 2. A recognizable visual identity

Build the identity around three coordinated elements:

- **Sculptural typography:** the captured expression is the strongest visual element, treated with the care of an inscription. Use strong proportion and intentional placement while preserving its actual spelling, case, diacritics, and legibility. Classical lettering can inform the Vocabularium wordmark; it must not force uppercase Latin styling onto vocabulary content.
- **Architectural framing:** use measured margins, aligned vertical divisions, fine rules, and subtly inset surfaces. One recurring portal or arch proportion can give headers or empty states character. The main reading surface remains practical and adapts to content rather than cropping text into an ornamental shape.
- **Illuminated page index:** language navigation uses a precise index rail or tab treatment with an active edge/underline. A slight layered edge can suggest multiple backsides of the same entry. Repeat it in per-language preset previews. Extra layers may show shape or material only, never another language's answer text before reveal or beside the active page.

Use the same proportions and details across capture, study, wordlists, and presets. Let a small number of distinctive components carry the identity. Standard controls must remain recognizable, responsive, and accessible. Classical symmetry may structure a header or review stage; reading content follows its natural alignment and reading direction.

If illustration is useful in onboarding or an empty state, explore abstract architectural forms, a sculpted letterform, or a restrained material study. Avoid relying on statues, columns, laurels, marble textures, or faux-Latin labels to establish the theme. Decorative words and images must not reveal the answer during recall. The ordinary interface uses clear, familiar language rather than historical roleplay.

## 3. Color and surfaces

Proposed starting palette, not a locked brand decision:

| Role | Candidate | Use |
| --- | --- | --- |
| Light foundation | Pale limestone / warm ivory | Calm page and reading surfaces. |
| Dark foundation | Obsidian / deep blue-black | Text, dark appearance, and depth. |
| Structural detail | Muted platinum / cool stone gray | Divisions, inset edges, secondary surfaces; stronger accessible variants for text. |
| Active accent | Clear, cool blue | Selected action, focus, and a restrained light effect along the active index. |
| Optional warm detail | Subdued bronze | Sparse brand detail or illustration, never the sole cue for a functional state. |

Use tonal depth and a small amount of concentrated accent color. Reading surfaces should suggest the calmness of stone or paper through color and finish, without visible grain behind text. A soft inset edge or controlled shadow can distinguish a surface. Light may define the active navigation edge or a transient interaction; it should not surround every element with a glow.

Use translucent or softly reflective treatment only where it clarifies a functional layer. Strong bevels, chrome effects, patterned marble, and broad animated gradients would compete with vocabulary. Define semantic success, warning, and error colors separately from the proposed brand palette and validate actual combinations during implementation.

Colors communicate action, selection, and state; they are not permanent country/language codes. The design must work when the learner configures more languages than the palette has colors. Essential, Optional, selected, pending, and failed states always have text/icon cues in addition to color.

Design light and dark appearances intentionally: pale architectural surfaces in light mode, quiet obsidian surfaces with controlled light in dark mode. Preserve the same information hierarchy and comfortable contrast. Do not simply invert screenshots or use low-contrast metallic-gray labels to imply sophistication.

## 4. Typography for a multilingual product

Pair a classical display treatment with a precise contemporary text/UI treatment. For supported scripts, explore a robust inscription-inspired or editorial serif for the wordmark and large word headings, alongside a clear humanist or geometric sans serif for controls and supporting text. Avoid fragile hairlines at reading sizes. A monospaced style may serve a small functional numeric detail, but should not make the app resemble a command console.

Establish clear semantic styles: captured word, primary answer, explanation, example, source/context, and control label. Display personality belongs mainly to large headings; body content needs stable spacing and comfortable line lengths. Keep paragraph text naturally aligned. Do not use all caps, excessive tracking, or Roman numerals for ordinary vocabulary, labels, or counts merely to suggest antiquity.

Provide compatible script-specific fallbacks and test them visually. Each writing system should receive equal typographic care; the Greco-Roman inspiration belongs to the brand and composition, not to a requirement that all scripts imitate Roman lettering. Do not squeeze Chinese, Japanese, Arabic, long German compounds, combining marks, or multiword expressions into a layout tuned only for a short English word. Preserve joining and diacritics, support right-to-left text per field, and wrap long expressions without truncating their meaning. Avoid artificial letter spacing across scripts where it harms reading.

Support system text enlargement on iOS and text zoom/reflow in the browser. Layout can grow and scroll rather than shrinking text to protect a decorative composition. Apple's typography and accessibility guidance provide the platform baseline. [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

## 5. Screen composition

| Screen | Visual treatment and hierarchy |
| --- | --- |
| Review front | A generously spaced expression on a quiet, precisely framed surface. Clear “Answer in …” cue for the selected Essential language, optional context, one obvious Reveal action. |
| Review backside | Active language index and numbered common meanings, each with its explanation and exactly one matching example when enabled. Use typography and fine rules to group meanings. Keep other languages on separate pages. Rating controls have a stable location and equal legibility. |
| Wordlists | An orderly vocabulary index with expressive headings, compact rows, and aligned status. Architectural rhythm must support fast scanning and search. |
| Add/share | Compact expression preview, destination, and a clear Add action. Carry the brand through typography and one restrained edge/detail; preserve the speed of capture. |
| Presets | Edit one language page at a time with an adjacent or immediately accessible preview. Precise rows and divisions distinguish per-language modules from wordlist settings. Essential/Optional roles are explicit. |
| Completion | A small, composed confirmation, perhaps a brief light transition, and a clear next action. Avoid a slow ceremonial sequence after repeated study actions. |

For quizzes, the selected Essential language is the only required answer for that attempt, even if other pages are also marked Essential. The interface should distinguish persistent role (“Essential”) from the current target (“Answer in German”). Page browsing must not visually imply a second score or a second review schedule.

A word with three included meanings remains one card with three explanation entries on each backside. Examples on adds exactly one paired example to each entry; Examples off removes those examples. Avoid an independent example-count control, per-meaning score indicators, or layouts that suggest each meaning is a separate scheduled card. A sentence and its displayed translation form one example.

Optional pages follow the configured visibility rules. Hidden content must also remain hidden to keyboard focus, selection, accessibility reading, and decorative previews before it is meant to be revealed.

Use language names and accessible labels for tabs and alternative-language tags. Flags are not language identifiers. The “also a word in …” tag can read like a concise scholarly annotation, but must remain visibly interactive and clearly worded. Functional labels stay readable; fine framing details must never make focus or selection hard to find.

## 6. Motion and feedback

Motion should feel precise, fluid, and slightly spatial, then settle:

- **Capture:** a brief confirmation with a precise settling motion or a single light response.
- **Reveal:** a small translation/depth transition or brief fade that preserves reading orientation. The answer appears promptly; elaborate rotating tablets are unnecessary for repeated practice.
- **Language change:** the active index shifts and the outgoing page gives way to the next. Never show multiple destination-language answer texts simultaneously.
- **Rating:** immediate pressed feedback and a quick, controlled transition to the next card, with no duplicate submission while transitioning.
- **Completion:** one quiet resolving motion or light change. Keep recurrent celebration out of the study rhythm.

Proposed custom-motion starting range: roughly 150–250 ms, tuned on devices; use native control motion where appropriate. Prefer controlled easing to exaggerated bouncing. Keep resting study content still; no perpetual particles, floating monuments, scanning text, or ambient shimmer. Motion must be interruptible and must not add mandatory waiting to repeated practice. A reduced-motion mode uses immediate changes or brief fades, preserving the same information. Haptics may confirm discrete iOS actions subtly.

## 7. Contemporary platform behavior

Use current iOS navigation, search, safe-area, keyboard, and accessibility conventions while carrying Vocabularium's typography, architectural spacing, and page index through the content. Apple's current material guidance places Liquid Glass chiefly in the functional navigation/control layer and recommends restrained custom use. Keep vocabulary reading surfaces solid or otherwise quiet and legible; support system contrast/transparency preferences and older supported OS versions. [Apple materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Liquid Glass overview](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass)

The browser shares the brand and interaction meanings, with layouts suited to desktop space and keyboard/pointer input. Use a readable study column and optional list navigation rather than stretching a phone card across the monitor. Provide visible focus and keyboard equivalents for reveal, paging, and rating. Mobile layouts must not depend on hover or gesture discovery.

These references establish contemporary platform behavior. Futuristic classicism is Vocabularium's own art direction, expressed through its name, reading experience, and interaction details.

## 8. Rules for the coding agent

Before spreading styling across screens, define shared tokens for semantic colors, typography, architectural spacing, rules, corner profiles, elevation, active-edge light, and motion. Implement a small set of reusable components: word heading, answer surface, language index, role/target labels, interpretation annotation, list row, status, and rating controls. Carry the same design principles across iOS and browser implementations. Visual tokens, not repeated one-off styling, should make the classical and futuristic elements coherent.

Do not leave the UI at an off-the-shelf component-library appearance. A generic dashboard of interchangeable rounded boxes, decorative gradients, and identical pill badges does not satisfy this brief. Nor does adding a serif font and gold accents to an otherwise unchanged template. Avoid historical-theme decoration, cyberpunk HUD clutter, and luxury ornament that makes ordinary controls less clear. Distinctive treatment is expected in the actual capture, study, wordlist, and preset flows, not just a landing page.

Build the main study sequence early with realistic content and real product states. Refine the relationship between the classical word treatment, contemporary controls, quiet materials, active page index, and motion before replicating it throughout the app. This is part of implementation, not a requirement to stop for a new approval step.

Visual verification must cover:

- Light and dark appearance, enlarged text, reduced motion, and reduced transparency where supported.
- Narrow iPhone width and desktop browser layouts, touch/keyboard use, visible focus, and screen-reader order.
- Long words, multiword expressions, Chinese/Japanese, Arabic/right-to-left text, diacritics, and missing-font fallback behavior.
- English explanation-only and German explanation-plus-examples as clearly separate pages.
- Multi-meaning pages with consistent numbering/identity across languages and one-to-one explanation/example association; no controls for deferred modules.
- Selected Essential answer versus other Essential/Optional pages; no answer leakage before reveal.
- Saving, offline, generating, one optional page failed, missing Essential content, empty lists, and completion.
- One-time generation allowance and exhausted states, with per-backside accounting and no unimplemented payment or renewal promise.
- Classical character and contemporary behavior remain recognizable in ordinary content screens even when decorative illustration and motion are disabled.

Deliver reviewed screenshots of the implemented main flows and concise notes on checks performed. A color palette or a single attractive mockup alone does not establish that the interface meets the brief.
