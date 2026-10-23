# Plan: the interface localised into the six UN languages (0.9.0)

Proposed: 22 October 2026 (Europe/Berlin). Implements [D14](../architecture/traceability-map.md#entries), accepted by the owner on 22 October 2026, with the languages chosen in [K35](../architecture/traceability-map.md#clarifications) on the same day. Tracker: [#208](https://github.com/Guccimane44/Vocalbularium/issues/208).

## Outcome

The user chooses the interface language in the settings, beside **Appearance**: English, العربية, 中文（简体）, Français, Русский or Español. The choice belongs to the account, so every installation connected to it follows. It sets every interface text, the explanations of modules and facets, and the language the Expertise modules write in ([shared UI](../specs/shared-ui.md#interface-language)). In Arabic every surface is laid out right to left; generated content keeps the direction of its own language. English stays the default, and a new account starts in English whatever the browser's language.

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

Counted on `main` at 0.8.1, before increment A:

| Source | Count |
| --- | --- |
| Distinct interface strings in the extension (labels, buttons, messages, statuses; estimated by scanning text nodes and capitalised string literals) | about 150; the extraction in increment A gives the exact number |
| Interface messages from the API, shown to the user (`StoreError` and `apiFailure` texts) | counted in increment A |
| Explanations (`explanation.md` in the catalog) | 24 |

Each language other than English therefore translates a few hundred short strings and 24 short texts. Increment A records the exact counts in its PR, and the tracker carries them forward.

## String process

- **Catalogue per language.** `extension/locales/<language>/messages.json`: flat keys (`settings.appearance.label`), each with a message in ICU-like form, `{name}` placeholders and plural forms chosen with `Intl.PluralRules`. English is the source; it is complete by definition.
- **One lookup.** `extension/i18n.ts` exports `t(key, values)`, the current language and its direction, and a subscription that redraws the interface when the preference changes. The API keeps returning English messages with stable codes; the extension shows the message for the code from its catalogue and the English text only as a fallback.
- **Explanations** move to `explanation.<language>.md` beside the English `explanation.md`; a missing translation falls back to English.
- **Checks.** A conformance test fails when a key used in the code is missing from the English catalogue, when a catalogue has keys English does not, when placeholders differ from English, or when a language offered in the settings is incomplete. A scan fails on a new hard-coded interface text in the extension.
- **Translation.** Claude drafts every translation, and a separate Claude reviewer checks each language against the English source: meaning, placeholders and plurals, consistent terms, length and, for Arabic, direction. A language becomes selectable only when its catalogue and explanations are complete and that review has passed. The owner checks the languages by hand later, after release (owner direction, 23 October 2026).

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

K35 applied to the traceability map, shared UI, scope and the Q69 answer; this plan and the tracker [#208](https://github.com/Guccimane44/Vocalbularium/issues/208).

### A. Strings externalised, and the language preference

- **Catalogue and lookup** as in the string process, with the English catalogue only. Every interface text in `extension/` moves to it, including `app.html`, `feedback.html`, the context menu and the badge; API codes shown to the user get catalogue entries.
- **Preference.** Migration `0016` adds `account.language` (`text not null default 'en'`, checked against the six codes). `GET /api/account/summary` returns it; `POST /api/language` sets it as an operation with a receipt, like the default deck. The extension keeps the last known value locally, so the interface starts in it before the API answers.
- **Settings.** A **Language** select beside **Appearance**, each language named in itself, listing only the languages whose catalogue is complete; in this increment only English. A save failure shows "Language could not be saved. Try again." and keeps the previous value.
- **Document language.** `<html lang dir>` follows the preference on every extension page.
- **Tests.** Unit: lookup, placeholders, plurals, fallback, the conformance checks. API: the migration, reading and setting the language, an invalid code rejected, the receipt replayed. Browser E2E: the select saves and survives a reload; the existing suites pass unchanged in English.

### B. Right to left and a pseudo-language

- **Layout.** Styles move to logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`); direction-carrying icons and the card's ejected actions mirror; drag and drop, the drop line and keyboard dragging follow the reading direction.
- **Content direction.** Main keys, generated content and the editor take `dir="auto"`, so a German card stays left to right in an Arabic interface.
- **Pseudo-languages** for testing, never offered to users: an accented and lengthened English, and a right-to-left one, to find hard-coded texts, truncation and mirroring faults before real translations.
- **Tests.** Browser E2E in the right-to-left pseudo-language: the page list, a page, deck settings, the module and facet windows, dialogs and drag and drop; screenshots of each in both themes.

### C. The five translations

- **Interface catalogues** for Arabic, Chinese (Simplified), French, Russian and Spanish, with the names and descriptions of modules and facets (not their abbreviations), and the 24 explanations in each.
- **Expertise modules** write in the language preference: the prompt composer receives it as generation input, and the generation record notes it. The Languages modules are unchanged.
- **Fonts:** the bundled Fraunces and Instrument Sans cover Latin and Cyrillic; Arabic and Chinese use system fonts, as Chinese content already does ([shared UI](../specs/shared-ui.md#visual-identity)).
- **Review:** a Claude reviewer, separate from the drafting, reviews each language; its findings are fixed before the language is offered, and the PR records the review per language. The owner's manual check comes later.
- **Tests.** Catalogue completeness per language; browser E2E switching to each language and back; an Expertise page generated in French with a mocked provider, checking the prompt's language.

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
- **API messages** stay English on the wire; a code without a catalogue entry shows English. The conformance test lists the codes.

## Not in this milestone

Languages beyond the six; following the browser's language; localised generated content of the Languages modules; regional variants (such as Traditional Chinese or Brazilian Portuguese); D12's folded empty cards.
