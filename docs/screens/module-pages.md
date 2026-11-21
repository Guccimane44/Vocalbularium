# Module pages

Module pages explain a family, a module or a facet, so a user can learn what it does without trying it. All three kinds open in one side sheet. Their text, samples and names are kept in each module's folder in the [module catalog](../subsystems/module-catalog.md).

## Getting there

- A family's mark and name in the [module window](module-window.md) open its family page; **About <module>** under a module opens its module page.
- **About** among a card's actions on a [page](page.md), or in a module's menu in [deck settings](deck-settings.md).
- A facet's name in the [facet window](facet-window.md) opens its facet page.
- No route of its own; the sheet opens over the screen.

## What it shows and what the user can do

### The pages

Every module family with modules, every module in the module window and every facet but the core has a **page** that explains it, so a user can learn what it does without trying it: a **family page**, a **module page** and a **facet page**. This section and the screen catalogue (`npm run screens`, [screens](../guides/screens.md)) are the reference for their layout and wording; D20's design boards are history ([D20](../decisions/d20-module-pages.md)).

- **One sheet.** The pages open in one side sheet that slides in over the module window, the same for all three kinds. A **path** at its top links them, such as *Languages / German / Article*; a module page links to its facets, a facet page back to its module and on to the module's other facets. **Back** returns one step; **Escape** closes the sheet and returns the focus to what opened it. They open from the module window ([shared UI](module-window.md#the-window)), a facet window and a card ([pages and editing](facet-window.md#the-window)) and deck settings ([decks and configuration](deck-settings.md#the-configuration)).
- **Static.** A page shows the same content wherever it opens: it takes nothing from the current card or deck and has no add button. Modules are added only from the module window.
- **A family page** shows the family's mark, name and colour, one sentence on what its modules do, what every module of the family does in three short steps, its modules, each opening its module page, and the other families. Every family with modules has one.
- **A Languages module page** has a header (the family, the module's mark and name, one sentence), three **facts** (what it reads, what it writes, what happens to a key already in its language), **How it looks**, **How it works** and its **facets**. How it looks shows a sample: a dropdown of the interface languages, each named in itself (*العربية*), chooses the key's language, starting at the interface language; **Word** or **Sentence** chooses the input; the key is set large above a card that shows the core only and ends in a hint that facets follow, a dashed **+ Facets** tab on a fading rule and "Add facets for more customised content." How it works is four lines on one rail: **Main key** (the key), **Read as** (the core's flags shown in its header), **Module core** (the meanings, one numbered per line, or a sentence's translation) and **Facets** (the module's facet marks, those that apply filled). The facets are listed in the module's order, each with its one-line description and what it applies to (*Nouns*, *Verbs*, *Words · sentences*), opening its facet page.
- **An Expertise module page** has the header, no facts, **See it on a card** with **Word** or **Sentence** on the subject's own term and no language dropdown, a card with the core and the same facet hint, and its facets, without what each applies to; it has no How it works. **Text** and **Context** have the header only.
- **A facet page** has a header (*Facet · German*, its mark and name, one sentence), **Applies to** (only what it applies to, such as *Nouns*) and **Describes** (what it is written from); **Samples** with the module page's controls, showing for an input it applies to the key, then the card the sample sits on: the core and the card's other facets dimmed, in the module's order, and the facet highlighted in full; for an input it does not apply to, "Left out" with the reason. The card is the facet's own sample's when it has one, otherwise its module's; a facet with two word samples names its tabs by their role. Every facet page has at least one sample in every interface language. Then the module's facets, the current one marked.
- **Core, not grammar word.** The pages call what the facets are written from the **core**; the word a grammar facet describes is not named as such.

**Samples.** The modules of a family share one sample set where they can: the Languages modules the word *language* and the sentence *Languages are the bridges connecting people and the world.*, in each interface language, as each module writes them; each Expertise module a term of its own subject, written in the interface language. A facet that never applies to the shared word has its own word in the same languages (its `sample-key.json`). Samples are generated once per interface language, reviewed and stored in the catalog, and regenerated only when a prompt change makes them stale; they are never generated when a page opens.

The one-line descriptions in the module window and the facet window stay beside the pages. The main key, which is not in the window, has no page, and the core has none of its own: its module's page explains it. The pages' text is written in English, the default interface language, and in each other interface language beside it; the sheet shows the one in the language preference.

## Source

| Part | Source |
| --- | --- |
| The sheet, its path and the three kinds of page | `AboutSheet`, `openAbout`, `Path`, `FamilyPage`, `ModulePage`, `FacetPage`, `SampleControls`, `SampleCard` in [`about-sheet.tsx`](../../extension/about-sheet.tsx) |
| The pages' text and samples | `catalog/about.generated.ts`, built from each module's `about*.json`, `samples/` and `names.*.json` by [`build-packages.mjs`](../../scripts/build-packages.mjs) |
| Catalog text helpers | [`catalog-text.ts`](../../extension/catalog-text.ts) |

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/browser/module-pages.test.mjs`](../../tests/browser/module-pages.test.mjs) | Family, module and facet pages in one sheet, from the module window, a card, the facet window and deck settings |
| [`tests/catalog.test.mjs`](../../tests/catalog.test.mjs), [`tests/localisation.test.mjs`](../../tests/localisation.test.mjs) | Every page's text and samples in every interface language |
| `npm run screens -- --only '^(family\|module\|facet)-page$'` | Languages, German and Article in the sheet, in both themes and six languages |
