# Localisation

The interface is written in English and offered in the other official UN languages: Arabic, Chinese (Simplified), French, Russian and Spanish. The language is the account's preference. It sets the interface text, the modules' names and pages, and the language the Expertise modules write in; the Languages modules keep their own. What a module writes in each language is in the [module catalog](module-catalog.md#writing-in-the-interface-language).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Catalogues | The English catalogue is the source of every interface text; each other language has its own beside it, and may lack a key, which then shows in English. | [`extension/locales/en/messages.json`](../../extension/locales/en/messages.json) and `extension/locales/<language>/` |
| Reviews | The review record of each language's strings and Expertise writing guide. | [`extension/locales/reviews.json`](../../extension/locales/reviews.json) |
| Lookup | `t()` with placeholders and plural forms, the offered languages, English as the fallback, the right-to-left direction, and the pseudo-languages. | [`i18n.ts`](../../extension/i18n.ts) |
| A module's names | Its label, description, core and facet names in each language, kept in its folder and merged in at build time. | `names.<language>.json` in each module folder ([module catalog](module-catalog.md)) |
| The preference | Stored on the account and sent with its summary; changed through `/api/language`. | `language`, `setLanguage` in [`store.mjs`](../../src/core/store.mjs); [`routes.mjs`](../../src/server/routes.mjs) |
| Messages from the API | API and domain errors shown to the user are matched to catalogue entries. | `apiText` in [`i18n.ts`](../../extension/i18n.ts) |

## Behaviour

### Interface language

Every interface text is English, in sentence case, and English is the default **language preference** ([D14](../decisions/d14.md); Q69, the owner's answer of 8 October 2026). 1.0 ships with the interface localised into the major languages:

- **The languages** for 1.0 are English and the other official UN languages: Arabic, Chinese (Simplified), French, Russian and Spanish. Arabic is written right to left, so every surface mirrors its layout in Arabic, while generated content keeps the direction of its own language. After 1.0 the list grows release by release; a new language is a catalogue of strings and explanations, not a code change.

- **Choosing it.** The account menu has a **Language** row below **Appearance**, showing the current language; it opens the list of languages in the menu's place, each named in itself, the current one ticked, with a way back to the menu. Picking one saves it and closes the menu. A language whose catalogue is not complete and reviewed is listed with "Coming soon" and cannot be picked. A failed save keeps the previous language and says so in the list.
- **The preference** belongs to the account, so every installation shows the same language. It starts as English and does not follow the browser's language unless the user chooses.
- **What it sets:** the interface text, the names and one-line descriptions of modules and facets, the [pages](../specs/modules.md#explanations) of families, modules and facets with their samples' key language starting at it, and the language the Expertise modules write in, with that language's writing guide ([writing in the interface language](module-catalog.md#writing-in-the-interface-language)). The Languages modules keep writing in their own language, and a captured key is never translated by the preference; otherwise the interface language is independent of the language of generated content. A facet's abbreviation, on its [tags](../specs/pages-and-editing.md#components-as-cards), its tab and its facet-window row, stays as the catalog gives it in every language.
- **Strings.** Every interface text is an entry of the English catalogue (`extension/locales/en/messages.json`), the source of every other language; no interface text is written into the code, and the localisation test fails on one that is. A module's own names in the other languages are kept beside the module in the catalog (`names.<language>.json`) and merged into the language's catalogue ([D25](../decisions/d25.md)). Two pseudo-languages, never offered, test this in the browser: an accented, lengthened English and a right-to-left one. A language is offered only when its catalogue and pages are complete and reviewed, and its Expertise writing guide and generation have passed review ([writing in the interface language](module-catalog.md#writing-in-the-interface-language)); until then it is listed as coming soon. Strings are drafted and reviewed by the [string process](../history/plans/localisation.md#string-process).


## Constraints and failure behaviour

- **No interface text in code.** `tests/localisation.test.mjs` fails on a string written into the extension outside the catalogue, and the `english-string` layout rule on a captured screen that shows English in another language.
- **Arabic mirrors every surface**, while generated content keeps the direction of its own language, set on the content, never on the card.
- **A language is offered only when it is complete and reviewed**: its catalogue, its pages, its Expertise writing guide and its generation. Until then it is listed as coming soon.
- **A failed save of the preference keeps the previous language** and says so.

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/localisation.test.mjs`](../../tests/localisation.test.mjs) | Every key used and present, English placeholders, no text in code, plurals, fallback, pseudo-languages, API messages, complete catalogues and page texts |
| [`tests/browser/localisation.test.mjs`](../../tests/browser/localisation.test.mjs) | The preference across installations, right to left and the pseudo-languages on every surface, and each language end to end |
| [`tests/server.test.mjs`](../../tests/server.test.mjs) | The preference belongs to the account, starts as English and replays its receipt |
| `npm run screens` | Every screen in all six languages |
