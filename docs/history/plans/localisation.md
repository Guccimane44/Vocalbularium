# Plan: the interface localised into the six UN languages (0.9.0)

Proposed: 22 October 2026 (Europe/Berlin). Implemented in release 0.9.0 (plan [#209](https://github.com/Guccimane44/Vocalbularium/pull/209); increments A, B and C, [#210](https://github.com/Guccimane44/Vocalbularium/pull/210), [#211](https://github.com/Guccimane44/Vocalbularium/pull/211) and [#212](https://github.com/Guccimane44/Vocalbularium/pull/212)); owner acceptance is recorded on the tracker. Implements [D14](../../architecture/traceability-map.md#entries), accepted by the owner on 22 October 2026, with the languages chosen in [K35](../../architecture/traceability-map.md#clarifications) on the same day. Tracker: [#208](https://github.com/Guccimane44/Vocalbularium/issues/208).

## Outcome

The user chooses the interface language from **Language** in the account menu, below **Appearance**: English, العربية, 中文（简体）, Français, Русский or Español. The choice belongs to the account, so every installation connected to it follows. It sets every interface text, the explanations of modules and facets, and the language the Expertise modules write in ([shared UI](../../specs/shared-ui.md#interface-language)). In Arabic every surface is laid out right to left; generated content keeps the direction of its own language. English stays the default, and a new account starts in English whatever the browser's language.

0.9.0 builds on `main` at 0.8.1. One account column is added; decks, pages and components do not change.

## Owner decisions

Recorded in D14 and K35 on 22 October 2026 and applied to the specifications:

1. **Languages for 1.0:** English, Arabic, Chinese (Simplified), French, Russian and Spanish (K35).
2. **Right to left in 1.0:** Arabic mirrors the layout of every surface (K35).
3. **The list grows after 1.0:** adding a language is a catalogue of strings and explanations, with no code change (K35).
4. **The preference** belongs to the account, starts as English, and does not follow the browser (K37).
5. **What it sets:** interface text, the names and descriptions of modules and facets, explanations and the Expertise modules' output; the Languages modules and captured keys do not follow it, and facet abbreviations stay as they are (K36, confirmed and extended by the owner on 23 October 2026).
6. **String process:** chosen by this plan, after counting the strings (K38).

## Cost baseline

Counted at 0.8.1, the extension's count by the extraction in increment A:

| Source | Count |
| --- | --- |
| Interface messages of the extension (`extension/locales/en/messages.json`: labels, buttons, statuses, announcements, dialogs, the worker's menu and feedback) | 263 |
| Catalog texts shown in the interface (module and family names, descriptions, facet names, the core's names; facet abbreviations stay as they are) | 36 |
| Messages from the API that reach the user (`StoreError` and `apiFailure` texts) | about 58 |
| Explanations (`explanation.md` in the catalog) | 12 |

Each language other than English therefore translates about 355 short strings and 12 short texts.

## String process

- **Catalogue per language.** `extension/locales/<language>/messages.json`: flat keys (`settings.appearance.label`), each with a message in ICU-like form, `{name}` placeholders and plural forms chosen with `Intl.PluralRules`. English is the source; it is complete by definition.
- **One lookup.** `extension/i18n.ts` exports `t(key, values)`, the current language and its direction, and a subscription that redraws the interface when the preference changes. Static pages mark their texts with `data-i18n`.
- **Catalog texts** keep their English in the catalog; a language's catalogue names them as `catalog.<module>.label` and the like, read through `extension/catalog-text.ts`. A facet's abbreviation is not translated (K36). A reason the domain gives the interface, such as why a module cannot be added, is a code the extension words (`addBlockedReason`).
- **API messages** stay English on the wire. Increment C gives each message the API shows a stable key in its failure details, so the extension shows it from its catalogue; until then they are shown in English.
- **The manifest's** name and description stay English (Chrome would choose their language by the browser's, not the account's); the toolbar button's title follows the preference, set by the worker.
- **Explanations** move to `explanation.<language>.md` beside the English `explanation.md`; a missing translation falls back to English.
- **Checks.** A conformance test fails when a key used in the code is missing from the English catalogue, when a catalogue has keys English does not, when placeholders differ from English, or when a language offered in the settings is incomplete. A scan fails on a new hard-coded interface text in the extension.
- **Translation.** Claude drafts every translation, and a separate Claude reviewer checks each language against the English source: meaning, placeholders and plurals, consistent terms, length and, for Arabic, direction. A language becomes selectable only when its catalogue and explanations are complete and that review has passed. The owner checks the languages by hand later, after release (owner direction, 23 October 2026).

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

K35 applied to the traceability map, shared UI, scope and the Q69 answer; this plan and the tracker [#208](https://github.com/Guccimane44/Vocalbularium/issues/208).

### A. Strings externalised, and the language preference

- **Catalogue and lookup** as in the string process, with the English catalogue only. Every interface text in `extension/` moves to it, including `app.html`, `feedback.html`, the context menu, the capture feedback and the worker's messages.
- **Preference.** Migration `0016` adds `account.language` (`text not null default 'en'`, checked against the six codes). `GET /api/account/summary` returns it; `POST /api/language` sets it as an operation with a receipt, like the default deck. The extension keeps the last known value locally, so the interface starts in it before the API answers.
- **Account menu.** A **Language** row below **Appearance** shows the current language and opens the list in the menu's place (owner request, 23 October 2026): all six languages, each named in itself, the current one ticked; one whose catalogue is not complete and reviewed says "Coming soon" and cannot be picked, so in this increment only English can. Picking one saves it and closes the menu; a save failure shows "Language could not be saved. Try again." in the list and keeps the previous value.
- **Document language.** `<html lang dir>` follows the preference on every extension page.
- **Tests.** Unit: lookup, placeholders, plurals, fallback, the conformance checks. API: the migration, reading and setting the language, an invalid code rejected, the receipt replayed. Browser E2E: the Language row opens the list, the unfinished languages cannot be picked, Back returns to the menu, and a language not offered keeps English across a reload; the existing suites pass unchanged in English.

### B. Right to left and a pseudo-language

- **Layout.** Styles move to logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`). Sideways motion multiplies by `--flip` and start- or end-side origins name `--start` or `--end`, all set from `dir` on the document (`app.css`). The card's tab, its ejected actions and question, the facet tags, the facet window, the module window, the sidebar and the account menu mirror; the question's tail and the family chevrons turn. Keyboard dragging takes the arrow towards the reading start as back. Arrows that are text, such as **← My Deck** and **‹ Language**, are catalogue entries, so each language draws its own.
- **Content direction.** Main keys, generated and written content blocks, the editors, deck names and the meaning line's meaning take their own direction (`dir="auto"` or `<bdi>`), so a German card stays left to right in an Arabic interface.
- **Pseudo-languages** for testing, never offered to users: `en-XA` accents and lengthens each message by a third inside ⟦…⟧, `ar-XB` keeps English and runs right to left. They are set by `pseudoLanguage` in the extension's local storage and override the account's language until removed. In `ar-XB` English punctuation lands at the wrong end of a line, as English always does in a right-to-left layout; Arabic text does not.
- **Not mirrored:** the capture feedback on a web page keeps its corner, as the web page's own layout decides nothing about it.
- **Tests.** Browser E2E in `ar-XB`: the sidebar, account menu, card tab, facet tags, card question, module window and the direction of German content and a Latin main key; in `en-XA`: no visible interface text or label left unaccented on the dashboard, account menu, language list, page list, page, card actions, deck settings and diagnostic logs. Screenshots of the dashboard, page, card question, facet window and deck settings in both themes.

### C. The five translations

- **Interface catalogues** for Arabic, Chinese (Simplified), French, Russian and Spanish (`extension/locales/<language>/messages.json`), with the names and descriptions of modules and facets (`catalog.*`, not their abbreviations), and the 12 explanations in each (`explanation.<language>.md`).
- **API messages:** the API keeps answering in English; each `api.*` entry of the English catalogue matches one message the API or the domain sends, its placeholders standing for the values, and the worker shows it in the interface language (`apiText`). Operator messages (configuration, database ownership) stay English. A test fails when an entry's English no longer appears in the API or the domain.
- **Expertise modules** write in the language preference: their prompts name `{{language}}`, which the composer fills from the account, so the prompt version recorded with each part differs per language. The Languages modules are unchanged.
- **Fonts:** the bundled Fraunces and Instrument Sans cover Latin only; the stacks name system Cyrillic (Georgia, Segoe UI, Helvetica Neue, Arial) and Arabic (Noto Naskh or Sans Arabic, Geeza Pro) fonts before the CJK ones ([shared UI](../../specs/shared-ui.md#visual-identity)).
- **Review:** each language is reviewed by a Claude reviewer separate from the drafting, then re-checked after its findings are applied; the review is recorded in `extension/locales/reviews.json`, and only a language recorded there is offered. Terms changed on review: Russian генерация for generation, раздел for facet and добавление for capture; Chinese 子项 for facet. Left to the owner: Arabic المدخل الرئيسي instead of المفتاح الرئيسي for main key, and whether وحدة (module) reads too much like a lesson unit. The owner's manual check comes later.
- **Tests.** Catalogue completeness per language, including the plural forms each language needs; every explanation in every language; the API entries still sent; browser E2E picking a language from the list, another installation's choice followed, and each language's dashboard, page, names, explanation and direction; an Expertise page generated in French with a mocked provider, checking the prompt's language.

### D. Verification and delivery (0.9.0)

- The full unit and browser suites; browser E2E in each language; both themes and forced colours in Arabic.
- Version 0.9.0; the scope ledger's D14 row to `implemented`, with an upgrade note (the new column starts as English); D14 to Implemented in the traceability map and Notion. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. **Language** in the settings lists the six languages, each in its own name; choosing one changes the whole interface at once, without a reload.
2. A second installation of the same account shows the chosen language after its next sync.
3. A new account, or an upgraded one, starts in English, whatever the browser's language.
4. In Arabic every surface is mirrored, and a German or Chinese card keeps its own direction.
5. Explanations appear in the chosen language, and an Expertise page generated after the switch is written in it; a German parent still writes German with translations as before.
6. No interface text is hard-coded: the scan and the conformance test pass, and the accented pseudo-language shows no unaccented English.
7. A save failure of the preference keeps the previous language and says so.

## Risks

- **Translation quality** in languages the owner does not read: every language passes a separate Claude review before it is offered, and the owner's later manual check can still correct it.
- **Right-to-left layout** touches every stylesheet and the shared drag-and-drop code; increment B tests it on its own before any translation lands.
- **Text length:** French, Russian and Spanish run up to a third longer than English; the lengthened pseudo-language finds truncation early.
- **API messages** stay English until increment C keys them; a message without a key shows English.

## Not in this milestone

Languages beyond the six; following the browser's language; localised generated content of the Languages modules; regional variants (such as Traditional Chinese or Brazilian Portuguese); D12's folded empty cards.
