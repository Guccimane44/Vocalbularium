# D20: family, module and facet pages

Accepted by the owner in chat on 29 October 2026, with the proposed defaults of its open items, for release 0.13.0. The detail of the [traceability map](traceability-map.md#entries)'s D20 entry; its conflicts and clarifications are also listed in the map ([conflicts](traceability-map.md#conflicts), [clarifications](traceability-map.md#clarifications)). Design: the owner's [design canvas](https://claude.ai/artifact/UDLZsTHRdzqAEDYvHQK8dD) (private to the owner), iterated with the owner in chat and canvas comments on 29 October 2026.

**Reference design.** The owner settled the canvas on 29 October 2026 at version `1793292631-75fb`; it is the reference for the increment's layout and wording. Its source is kept in [d20-design](d20-design/): board 0 the Languages family page (`Family.dc.html`), 1 the German module page (`Main.dc.html`), 2 Article, 3 Conjugation, 4 Mathematics, 5 Text and 6 the entry points, with the shared styles in `sage.css` (the Vocabularium Sage tokens) and the layout in `canvas.json`. The boards render only in the canvas's runtime; read as source, they hold every label, sample and style. Where this text and the boards differ, the boards win; the [open items](#open-items) cover what the boards do not show.

## Decision

**The explanations of D13 become pages: a family page, a module page and a facet page, in one sheet, with samples a user can choose.** The current module dialog and the facet explanation that expands in the facet window are removed, with the dialog D18 opens from a facet's **About**; nothing of their layout is kept. The owner's direction (chat, 29 October 2026): "the current implementation can be thrown away".

### The sheet

- **One side sheet** slides in from the side over the module window, the same for all three kinds of page. A **path** at its top links them: *Languages / German / Article*. A module page links to its facets, a facet page back to its module and on to the module's other facets. **Back** returns one step; **Escape** closes the sheet and returns the focus to what opened it.
- **Static.** A page shows the same content wherever it opens, so it can appear in deck settings as on a page: it has no add button and takes nothing from the current card (no "on this card" switch, no hint about the card's key). Modules are still added only from the module window.

### Where the pages open

- **Module window:** a family's heading opens its **family page**; **About German** below a module, a text link replacing D18's round ⓘ, opens its **module page**.
- **Facet window:** a row's **›** opens the facet's **facet page**, in place of the explanation that expands beneath the row. The tick stays where it is.
- **A card:** a facet's **About** (D18) opens its facet page; the card's own actions gain **About German** (the module's name), which opens its module page.
- **Deck settings:** each module in the deck's list opens its module page.
- **The path** at the top of every page reaches the family page.

### The family page

The family's name, mark and colour; one sentence on what its modules do; what every module of the family does, in three short steps (Languages: reads your key in any language, writes the core in its language, facets describe its translation); its modules, each opening its module page; and the other families.

### The module page

1. **Header:** the family as an eyebrow, the module's mark and name, and one sentence on what it does.
2. **Facts:** three short facts, such as *Reads: any language*, *Writes: German, whatever language you use Vocabularium in*, *Key already German: explained, not translated*.
3. **How it looks:** a sample. Controls above the sample's key choose the key's language from a dropdown (each interface language, named in itself and in English) and **Word** or **Sentence**. The key is set large, as the page title over a card, and below it a card shows **the core only**, ending in a hint that facets follow: a dashed **+ Facets** tab on a fading rule, and "Add facets for more customised content."
4. **How it works:** four lines on one rail, from the key to the facets: **Main key** (the key), **Read as** (the core's flags, such as *Wort · Nomen* or *Satz*), **Module core** (the core's meanings, one numbered per line, or a sentence's translation), **Facets** (the module's facet marks, those that apply filled, the others outlined). No explanatory sentences.
5. **Facets:** every facet of the module in its order, each with a one-line description and what it applies to (*Nouns*, *Verbs*, *Words · sentences*), opening its facet page.

### The facet page

1. **Header:** *Facet · German*, the facet's mark and name, one sentence on what it gives, then **Applies to** (only what it applies to, such as *Nouns*) and **Describes** (such as *the German noun in the core's first meaning, or your key itself when it is German*).
2. **Samples:** the same controls as the module page. For a word: the key, the core's word and the facet's output, in a short flow, then the facet as a card renders it. For an input the facet does not apply to: "Left out", with the reason.
3. **Where it sits:** a small card with the facet's section highlighted among the others, in the module's order.
4. **The module's facets:** a strip of all of them, the current one marked.

### Expertise and Notes module pages

- **An Expertise module** (board 4) has the header, three facts (*Reads: any language*, *Writes:* the interface language, *Best for:* the subject's terms), **See it on a card** with **Word** or **Sentence** on the subject's own term and no language dropdown, a card with the core and the same facet hint, and its facets. It has no How it works.
- **Text** (board 5) has the header, three facts (*Written by: you*, *Generation: never touches it*, *How many: as many as you like*) and an example note; no generated sample and no facets.

The pages say **core** for what the facets are written from. The specifications' term *grammar word* ([modules](../specs/modules.md#catalog)) stays as an internal term and is not shown.

### Samples

- **The Languages modules** use one sample set: the word *language* and the sentence *Languages are the bridges connecting people and the world.*, in each interface language (English, Arabic, Chinese, French, Russian, Spanish), each as its module writes it. The set grows with the interface languages. The 幸福 sample of the early development is retired.
- **A facet that never applies to a noun** uses a word beside *language* in the same languages: Conjugation uses *speak* (*sprechen*). Comparison and Case get theirs by [K65](traceability-map.md#clarifications).
- **The Expertise modules** keep their subject's own term (Mathematics *eigenvalue*, Computer Science *Frontend*), as their samples are today.
- **Text** has no generated sample; **Context** shows its sample text.
- Samples are stored in the catalog and reviewed before release; they are never generated when a page opens ([K63](traceability-map.md#clarifications)).

### Unchanged

The one-line descriptions in the module window and the facet window; the facet window's ticks; what each module and facet generates; the interface languages ([D14](traceability-map.md#entries)). No stored data changes: no migration, and decks and pages are kept.

## Open items

Resolved on acceptance with their proposed defaults: conflicts C29–C30 and clarifications K62–K68 in the [map](traceability-map.md).
