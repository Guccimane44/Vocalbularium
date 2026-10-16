# Pages and editing

## Purpose and status

This specification defines the page list, page input, and page editing shared by captured and manually created pages. Release 0.5.2 implements it, including [shaping a page](#shaping-a-page) ([D02](../architecture/traceability-map.md#entries)) and per-card actions ([D04](../architecture/traceability-map.md#entries)). Release 0.6.0 adds the page list layouts, main key tiers, and card presentation of [D05](../architecture/traceability-map.md#entries). Release 0.7.0 adds parent modules with facets ([D08](../architecture/traceability-map.md#entries)). [Current scope](../product/scope.md) records the status.

The [product model](../product/model.md) defines a page, its components, and the main key. [Modules](modules.md#content-module-contract) owns how content modules consume the main key and Context. [Capture and generation](capture-and-generation.md) owns generation completion, replacement, failure, interruption, and recovery. [Decks and configuration](decks-and-configuration.md) owns the deck configuration that new pages start from. [Accounts and synchronization](accounts-and-sync.md) owns save ordering across installations.

## Page list

Opening a deck shows its pages in one of three **layouts** of the page list ([K19](../architecture/traceability-map.md#clarifications); a layout lists pages, a [view](../product/model.md#view) shows one page). **List** is the default for every deck; a switch beside the sort order offers **List**, **Table**, and **Gallery**, and the chosen layout is remembered per deck on that installation.

- **List** shows each page as its main key above one line of meaning, so words, phrases, sentences, and passages share one shape. The main key wraps to at most two lines and is cut with an ellipsis after that. The meaning line shows the first numbered meaning in the core of the page's first content component that has one; for a sentence it shows the first translation, starting with "Sentence ·", and for a passage it reads "Passage · *n* words" until a summary module exists. On the right, one small family mark per filled component, in page order, with a text alternative such as "3 modules filled", and **Open** on hover and keyboard focus. In the two creation-time orders, pages are grouped under their capture date (Today, Yesterday, then month and day); the alphabetical orders are not grouped ([K20](../architecture/traceability-map.md#clarifications)).
- **Table** shows one row per page with the columns main key (up to two lines), meaning, modules (the family marks), and capture date.
- **Gallery** shows one card per page: its family marks along the top edge, the main key (larger for a word, up to four lines for longer text), the meaning, and the capture date.

In every layout, the main key is the whole text when it is searched or read aloud; only its display is cut. The main key links to the page, and the rest of the row or card opens it too, except when the user has selected text in it. The page list receives these fields with each page summary, never the page's content ([decks and configuration](decks-and-configuration.md#views-and-layouts)). A page that is saving, generating, or failed shows its status in place of the meaning ([shared UI](shared-ui.md#list-state-presentation)); a completed page shows none. The page list keeps the rest of its behavior.

The list loads 30 pages at a time, with **Load more pages** when more exist. A deck without pages shows "No pages in this deck yet." Clicking anywhere on a row or card opens the page, except when the user is selecting text in it or presses its own button. Each row or card has one keyboard target named by its main key.

**Sort pages** offers four orders: creation time newest first (the default), creation time oldest first, alphabetical A to Z, and alphabetical Z to A. Alphabetical order compares main keys after Unicode NFKC normalization and lowercasing, in code-unit order. Pages with equal sort values are ordered by page ID, so the list is stable. The chosen order is remembered per deck on that installation.

The deck's **Add page manually** opens a new page draft ([creation](#creation-and-optional-generation)). The deck's **•••** menu is described in [decks and configuration](decks-and-configuration.md#dashboard).

## Required main key

Every page has a main key component: the editable text used as its generation input. A captured selection supplies the initial value; manual creation requires the user to specify it. A saved page cannot omit the main key, and a main key that is empty or only whitespace is rejected with "Main key can not be empty.", shown inside the empty field in the failed colour with a failed-colour outline until the user types, and the field takes focus (since 0.6.3; earlier it was a notice below the field). A new manual draft may begin before the user has entered it.

The main key component belongs to the compulsory main key module. It must always be visible when the page is shown: it is always the first component and the page's title. It can coexist with manually written or generated content. Matching main keys do not merge pages or make their identities the same. The main key cannot be deleted.

A main key can be anything from one character to a passage, and the page title's size follows its length after trimming whitespace ([shared UI](shared-ui.md#visual-identity)):

| Tier | Length (Latin / CJK characters) | Shown as |
| --- | --- | --- |
| Word | up to 24 / 8 | very large display type |
| Phrase | up to 60 / 20 | large display type |
| Sentence | up to 200 / 70 | display type that wraps freely |
| Passage | longer | a reading block cut after six lines, with **Show all** and **Show less** |

The tier changes only the presentation: generation, search, duplicates, and editing always use the full text. Where generation classified the input as a sentence, a shorter key may move up one tier, never down. Editing a passage uses a multi-line field. The main key is shown once, as the title; there is no separate main key card.

Once a generation run has interpreted the main key, a small label under the title says whether it was read as a word or as a sentence ([modules](modules.md#input-and-applicability); [D08](../architecture/traceability-map.md#entries)). It explains which core and facets the content cards show. It cannot be changed directly: editing the main key and retrying interprets it again. It names no language.

## Context

A page can have one **Context** component, owned by the Context module: the surrounding block captured with the selection (around 500 characters, capped). Capture takes it only when the destination deck's configuration has the [Context module](decks-and-configuration.md#configuration); Context taken while the deck had the module is dropped if the module was removed by the time the capture is saved. A manually created page in such a deck starts with an empty Context for the user to fill. A page without the Context module has no Context.

The surrounding block is the nearest block-level element containing the selection, or the whole text field for a selection in one. When it exceeds the cap, capture keeps the text nearest the selection on both sides and marks each cut with an ellipsis. Whitespace is collapsed. A selection that fills its block, or one that cannot be read from the page (restricted pages, PDF viewers), yields no Context; capture itself proceeds unchanged. The web page URL, title, and other page details are not taken: they add nothing to generation.

The Context is editable alongside the main key. Removing it from a page, or adding it to a page that has none, follows [shaping a page](#shaping-a-page). Editing the Context follows the main-key rule below: it changes the input for subsequent generation only. It never regenerates, replaces content, or changes prior outcomes by itself.

## Components on a page

A new page starts with one component per module instance copied from the deck configuration, in configured order: the main key, the Context when the deck has the Context module, then the content components ([decks and configuration](decks-and-configuration.md#configuration-and-pages)). A content module instance that has not generated on this page yet is empty and shows only its index tab, with **Retry** among its actions.

After creation the page owns its module instances. Deck configuration changes never add, remove, or reorder a page's components.

### Components as cards

Each component below the main key is a card. Its index tab, on the card's top edge, shows a six-dot menu button, then the family icon and the module's label in the family colour. When a page holds more than one instance of the same module, their labels are numbered in the page's order, such as German 1 and German 2, so they can be told apart in their tabs, actions and announcements; a module alone of its type keeps its plain label (since 0.7.2). The card repeats the colour as a thin top edge ([shared UI](shared-ui.md#visual-identity)). Generated content is rendered as its module's render contract describes ([shared UI](shared-ui.md#text-content)). A completed card shows no status; a generating card is only its tab, with a comet, a light glowing head and a fading tail (light in both themes), running round the tab's rounded edge at a steady pace while a soft halo in the family colour breathes around the tab, until the content arrives; then comet and halo fade away as the content rises in (since 0.6.3, earlier the moving dots in an open card; under reduced motion the edge glows, still); and a failed card says what failed beside its **Retry**. An empty component, such as a Text the user has not filled or a content module not generated yet, shows only its index tab, without a card body or placeholder text; its tab ejects its actions as on any card (since 0.6.2).

A parent module's card shows its core, then each of its facets that applies, in the order the parent type defines, each under its label ([modules](modules.md#parent-modules-and-facets)). Since 0.7.4 a facet's label is a small tab sitting on the facet's rule, a cousin of the module's index tab: in a pale tint of the family colour, rounded on top, with the facet's abbreviation in a small family-coloured mark before its name; the editor shows the same tab. A facet that does not apply to the input is not shown. A facet added since the parent last generated is not shown on the card, only as its tag, until a **Retry** generates it (since 0.7.4; until then it showed its label, waiting for Retry); while editing, it has its empty editor like any facet without content. Each facet's label offers **Retry** and **Delete** (Retry since 0.7.3; since 0.7.4 they act on the facet's entry in the structured content), shown while the facet is pointed at or focused. They work like a card's: at once when the facet is empty, otherwise after "Are you sure?" beside the label. The facet's question mirrors the card's (since 0.7.3): "Are you sure?" stands on the left, its tail pointing at the final **Retry** or **Delete** and **Cancel**, which comes last, under the pointer that asked, and takes the focus; Cancel, the final button and the question spring out leftwards one after another, and the question gives one small wobble, as on a card. Each question's bubble and tail share one unbroken outline. A facet's **Retry** regenerates that facet alone and keeps the rest of the card ([capture and generation](capture-and-generation.md#retrying-one-facet)); while it runs the card stays open and the spark runs round the facet's tab, as round a generating card's tab, and is the only sign of it (since 0.7.4; until then the facet said "Generating…", its content faded and its tag breathed). A facet without content stands in its place while it generates, as its tab alone, and stays only if it comes back with content: an empty result or a failure takes it away again. When it ends with content, a shining frame lights on the edges of the facet's rounded block, which reaches the card's sides, just inside the card and the size of its focus outline, and fades (since 0.7.4; until then a ring lit just outside its text); a facet shown by its tag's remove does the same.

Each card has its own actions ([D04](../architecture/traceability-map.md#entries)). They stay inside the card's tab until the user clicks the family icon and label, or presses Enter on them; the tab then ejects them to its right as smaller tabs in the family's tint, each with its icon, springing out from behind the tab one after the other while the tab kicks back slightly. Hovering one fills it with the family colour; **Delete** fills with the failed colour ([D07](../architecture/traceability-map.md#entries), since 0.6.3). Clicking the tab again, clicking elsewhere, pressing Escape, or choosing an action puts them back; one card's actions are out at a time. Hovering shows nothing. A failed card keeps its **Retry** beside the tab, filled with the failed colour. The actions are:

- **Edit** turns that card into a text field with **Save** and **Cancel** in the card ([editing](#editing-a-component)).
- **Retry** on a content component generates it. A component with nothing in it, such as one that never generated, starts at once, because there is nothing to replace. A component with content asks first, the same way **Delete** does, in the card's family colour rather than the failed one: a final **Retry**, **Cancel** under the pointer, and "Are you sure?" ([capture and generation](capture-and-generation.md#retry)). Since 0.6.3 there is no separate **Generate**.
- **Fold** folds the card: its content slides shut and fades while the card narrows to a slim band under its tab, so the user can set components aside and see the rest of the page better. A folded card offers **Unfold**, which opens it the same way, and **Edit** unfolds it before editing. Folding changes only how the page is shown in this browser, where it is remembered per page; it never changes the page, and other browsers show the card unfolded. An empty component has nothing to fold and offers no **Fold** (since 0.6.3).
- **Delete** removes the component ([shaping](#shaping-a-page)). An empty component is deleted at once. A component with content asks first, in the same row and without a dialog: the actions give way to a final **Delete**, filled with the failed colour, **Cancel**, and "Are you sure?" in a small speech bubble in the failed colours, which gives one small wobble as it appears. Cancel lands exactly where the clicked **Delete** was, so a second click under the pointer cancels; the final **Delete** stands to its left, and focus moves to **Cancel**. Cancel returns to the actions; Escape or a click elsewhere puts everything back (since 0.6.3; earlier a dialog). A deleted card pops where it stands, like a bubble: it swells a touch, then grows a little more as it vanishes, around its own middle, in about a quarter of a second; the cards below then slide up. Under reduced motion it simply goes.

The six dots before the family icon open the card's **menu**. Its entries, **Duplicate**, **Copy text**, and **Move to page…**, are placeholders marked *Coming soon* and do nothing yet (since 0.6.3).

The main key, shown as the page title, has only **Edit**, always shown beside it like **Delete page**, and no lock mark (since 0.6.3; from 0.5.2 Edit appeared on hover and focus, beside a lock mark). There are no page-level edit, generate, or retry controls; **Delete page** sits in the page header.

### Facet tags

Since 0.7.1 a parent's card also wears one **tag** per facet it has, shaped like a bookmark in the parent's family colour and marked with the facet's abbreviation ([modules](modules.md#catalog)). The tags follow the order the parent type defines, whatever order the facets were added in. Where they sit follows the card:

- A card with content wears its tags stuck out of its left edge, one under another below the tab; the card is at least as tall as its tags.
- A folded card wears them in a row at the right of its bottom edge, hanging below it.
- A card that is only its tab, such as one that is generating, hangs them below the tab, each on a short chain from a rail under the tab; with more tags than the tab is wide, the rail reaches past the tab's end. Every module in deck settings is drawn this way ([decks and configuration](decks-and-configuration.md#configuration)). When the card is pointed at, the rail, chains and tags lift with the tab, and while the card generates they stay beneath the tab so the spark running round it is never covered (since 0.7.3).

The tags move with the card:

1. **A facet is added.** Its tag flies from where it was let go, or from the facet in the module window when added with **+**, to its place: the left edge of a card with content, the bottom right of a folded card, or below the tab.
2. **The card folds.** While the card holds still, the tags move down the left edge, round the corner and along the bottom edge to the bottom right; then the card folds and they ride its bottom edge up.
3. **The card unfolds.** The card opens with the tags riding its bottom edge down; then they move back the same way, along the bottom edge, round the corner and up the left side.
4. **A facet is deleted.** Its tag pops where it stands and disappears, like a deleted card.

A facet with nothing in it, such as one waiting for **Retry**, one that does not apply to the input, or every facet of a card that is only its tab, wears a blander tag: its family colour, much less saturated, with its mark still legible; its accessible name ends in "empty" (since 0.7.3). Deck settings hold no content, so their tags are not marked.

On an open card's edge, clicking a tag pulls it out of the card (since 0.7.4): it slides further out, and the ribbon it was tucked in by shows beneath it, in a deeper shade of the family colour, holding the facet's **Retry**. That **Retry** regenerates the facet at once, without "Are you sure?", whether or not it has content, and the tag goes back in; Escape, a click elsewhere or the tag again also push it back, and nothing scrolls. This holds for a facet with content and one without, such as a facet waiting for **Retry**. When its Retry failed, it wears a small dot in the failed colour, and its accessible name says so. A tag on a folded card, or hung below a card that is only its tab, is not a button, and clicking it changes nothing. While a card is edited its tags do not pull out. (Until 0.7.4 clicking a tag scrolled to its facet's section, unfolding a folded card first.) Pointed at or focused, a tag shows a small remove on its corner, in the failed colour, which keeps its colours and swells slightly when pointed at itself (since 0.7.3); it deletes the facet like the **Delete** beside its label: a facet with content shows its section and asks "Are you sure?" there; one with nothing in it, such as a facet waiting for **Retry**, goes at once. A tag shows no text beyond its abbreviation; its facet's name is in its accessible name. Under reduced motion the tags stand in their places without moving, and a deleted tag simply goes.

### Ghost tags

Since 0.7.2 a facet's **+** in the module window is pick, then place, when more than one parent would take the facet: two German parents on a page cannot be told apart by their labels, but they can be pointed at. Pressing **+** picks the facet up, and the facet stays marked in the window. Each parent that would take it shows a **ghost tag** in the slot the facet's tag would take there: an outline of the tag, dashed and barely filled, marked with the facet's abbreviation, glowing softly in the family colour. The tab of each such parent glows the same way; the cards themselves are not outlined. It stands among the parent's [tags](#facet-tags) in the parent's order, which make room for it, on the left edge of a card with content, in the row of a folded card, or on a chain below the tab. A parent that already has the facet, a parent of another type, and a generating parent show none.

- **Placing.** Clicking a ghost, or the tab of the card wearing it, adds the facet to that parent. The other ghosts go; this one stops glowing and waits until the facet is saved, when its tag flies in from the facet in the module window, as when added with **+** to a single parent, and takes the ghost's place. The facet waits for **Retry** as when dragged in. A folded card stays folded.
- **Cancelling.** Escape, the facet's **+** again, or a click anywhere else, the rest of a glowing card included, puts the facet back and the ghosts go. Picking up another facet replaces the first.
- **From the keyboard.** Pressing **+** moves the focus to the first ghost, scrolled into view; Tab and Shift+Tab move between the ghosts only, Enter or Space places the facet, and Escape cancels and returns the focus to the **+**. Each ghost's accessible name says which parent it adds to, by label and position, such as "Add Synonyms to German 2".
- **One parent or none.** With one parent that would take the facet, the **+** adds it at once and its tag flies there (0.7.1). With none, the facet stays disabled.

Deck settings work the same way, with the ghosts hanging below the tabs. Dragging a facet is unchanged. Under reduced motion the ghosts and tabs glow without pulsing, and the tag appears without flying.

### Shaping a page

The user shapes a page directly, outside editing. Each shaping step is saved immediately as one operation, with no separate **Save**, and reaches other installations in the order it arrives, like every save ([accounts and synchronization](accounts-and-sync.md#synchronization)). Shaping is unavailable while a component is being edited.

- **Delete a component.** Any component except the main key can be deleted: a content component, the Context, or a Text component. Deleting a component with content asks first, beside its tab, then removes it immediately; an empty component is deleted at once. Deleting a module's component also removes the module instance from the page, so generation never brings it back. A component that is generating cannot be deleted until its attempt finishes.
- **Rearrange components.** The user can drag any component except the main key, including the Context and Text components, into a new order below the main key by dragging its tab's family icon and label: with the pointer, where a click that does not move opens the actions instead, or from the keyboard with Space to pick it up, the arrow keys to move it, and Space to drop it. The new order shows at once, and the page reverts to the saved order only if saving fails. The order is saved with the page and used by the default view.
- **Add a module.** The user drags the Context module, the Text module, or a content module from the [module window](shared-ui.md#module-window) onto the page; while it is over the page, it stands where it will land as the card it will become, and the cards slide apart to make room ([shared UI](shared-ui.md#module-window)). From the keyboard, the user picks the module up with Space, moves through the landing places with the arrow keys, and drops it with Space. This adds a module instance to this page only; the deck configuration is unchanged. A page holds at most 12 module instances, counting every module, and at most one Context. An added content module starts empty, showing only its index tab, and generates only when the user presses its **Retry**; an added Context or Text starts empty for the user to fill. Adding the same module again restores what the user deleted earlier, as new, ungenerated content. A parent is added with its core only; its facets are added separately ([modules](modules.md#choosing-and-changing-facets)).
- **Add a facet.** The user drags a facet from the module window onto a parent of its own type on the page, or uses the facet's **+**, which adds it directly when one parent would take it and otherwise shows [ghost tags](#ghost-tags) to place it with (deck settings work the same way); over any other card or place it is refused and goes back to the window. The facet joins the parent in the parent's order and waits, shown only as its tag (since 0.7.4), until the user's next **Retry** regenerates the whole parent, or the facet's own **Retry** generates it alone (since 0.7.3). A parent that already has the facet does not take it again.
- **Delete a facet.** Deleting a facet removes it from its parent's content and from the instance, so a later **Retry** does not bring it back; dragging it in again restores it. A parent that is generating cannot lose or gain a facet until its attempt finishes.

When another installation deletes a component the user is editing, the user's save fails as deleted and keeps their draft, as for any deleted component ([editing](#editing-a-component)).

### Text components

A **Text component** holds the user's own writing and belongs to a Text module instance. The user adds one by dragging the Text module onto the page, and a deck that includes the Text module gives every new page an empty one. It is edited and saved like other components. Generation and every retry leave Text components unchanged, and they are never a generation input. Image components follow the rich-media scope (Q59) and are not part of this specification.

### Editing generated components

Generated components are editable. An edit to a generated component lasts until the next retry that targets that component. That retry asks for confirmation first because it replaces the edit ([capture and generation](capture-and-generation.md#retry)).

Since 0.7.4 a parent card is edited with **live formatting**: **Edit** turns the core and each facet into a text editor in place, with one **Save** and **Cancel** in the card ([D09](../architecture/traceability-map.md#entries), amended). Each holds that part's markdown ([modules](modules.md#render-contracts)), shown formatted as the user types, as in a notes app: typing `**` makes bold, `*` italic, `- ` or `1. ` a list, `` ` `` inline code and `==` a highlight, and the characters themselves do not stay visible. Keyboard shortcuts toggle bold (Cmd/Ctrl+B) and italic (Cmd/Ctrl+I). The editor has no structure of its own: no fields, item numbers or separators beyond what the text holds.

- **Shown, not editable:** the module's name in its tab, each facet's name, and the core's top line with the key's language, the key and its romanization.
- **Editors:** one for the core's meanings or translation, then one per facet the card has, in the parent's order, under its name. A facet without content keeps its place with an empty editor and a dimmed name, to be filled.
- **Save** never refuses an empty part: the core or any facet may be emptied. A facet left empty has no content: it is not shown on the card and its tag is blander. A core left empty shows only its top line.
- **While editing,** the card's tags stay and show, as the user types, which facets have text; the facets' **Retry** and **Delete** and the tags' remove wait until **Save** or **Cancel**. Opening the editor moves the focus nowhere. A parent with no content yet cannot be edited; **Retry** fills it.

## Editing a component

Editing is one card at a time ([D04](../architecture/traceability-map.md#entries)). **Edit** on a card makes that component editable; while it is open, the other cards' **Edit**, **Retry**, and **Delete** wait, and shaping is unavailable, without a separate notice: the open card's **Save** and **Cancel** end editing. Adding, deleting, and moving components is [shaping](#shaping-a-page).

- **Save** in the card writes that component and closes it. Only that component is sent, so it never overwrites another installation's edit of a different component.
- **Cancel** in the card discards the draft. Cancelling a new page returns to the deck's page list.

**Delete page** in the page header asks for confirmation ("This page and all its components will be deleted."), then deletes the page and returns to the deck's page list. Deleting a page cancels its pending generation.

Leaving the editor with unsaved changes, by navigating, logging out, or opening diagnostics, offers **Continue editing**, **Discard**, or **Save**. Closing the tab with unsaved changes triggers the browser's leave warning. Drafts are never saved automatically. A failed save keeps the drafts and offers **Try saving again**, which resubmits the same save and never generates.

A save that changes a component while it is generating is rejected: the component does not change, the draft stays, and the message explains that a component is still generating. The user saves again after the attempt finishes ([capture and generation](capture-and-generation.md#retry)).

Saving a main-key edit updates the page's entry and its position in alphabetical order. Editing never changes the page's creation time. If the page or its deck is deleted elsewhere while the user has drafts, the editor shows "Page unavailable" with the unsaved text so the user can copy it, and **Discard draft**.

## Creation and optional generation

Capture and manual entry are two ways to supply the same page input. They share generation capabilities rather than defining different kinds of page.

- **Capture** creates the page from the selected text and Context, then generates all its content components automatically.
- **Manual creation** starts a new page with the deck's modules: the user enters the main key, and fills the Context and Text components when the deck has them. It never generates by itself; content components wait, empty, until generated. Each content card's **Retry** then evaluates that module from the main key and Context.

After creation, captured and manually created pages behave the same.

## Editing and generation again

Editing the main key changes the input for subsequent generation. It does not run modules, remove existing generated or manually written content, or change prior generation outcomes. Editing another component does not redefine the main key.

The user must explicitly request generation again to produce content from the updated key. The action uses the main key and saved Context at the time of the request, with interpretation appropriate to them. It must not use the original captured selection or an earlier key's interpretation. Content that remains from earlier attempts can therefore describe a different input from the current key.

Generation uses the page's own content module instances. Finish editing with **Save** or **Cancel** before starting a generation or a retry.

## Acceptance scenarios

1. Capturing `john cena` initializes the page's main key to `john cena`, shows it first, and generates one component per content module instance copied from the deck.
2. Manually creating a page with `john cena` supplies the same generation input. Saving creates no generation attempt and keeps what the user wrote.
3. **Retry** on an empty content card of that manual page evaluates that module using `john cena`, without a warning; manual origin does not disable generation.
4. Changing the main key from `john cena` to `Bismarck` and saving updates the displayed key while preserving existing John Cena content and prior outcomes. No generation request occurs as a side effect.
5. Retrying after that edit uses `Bismarck` and interpretation appropriate to it, rather than the original key. Replacement and failure behavior follow the generation specification for the targeted components.
6. Editing a generated explanation without editing the main key leaves subsequent generation input unchanged. The next retry of that explanation asks for confirmation and replaces the edit.
7. A page with no applicable module output or a failed generation still shows its main key.
8. Capturing into a deck with the Context module initializes the page's Context alongside its main key; capturing into a deck without it leaves the page with no Context.
9. Editing the Context and saving preserves existing content and prior outcomes exactly like a main-key edit. Generation after that edit uses the updated key and Context.
10. Adding a content module instance to the deck leaves existing pages unchanged; the next captured page has a component for it.
11. Deleting a generated component asks beside its tab, removes it, and no generation recreates it. Dragging the same module from the module window onto the page adds it back, empty and not generated.
12. Dragging a module onto one page leaves the deck configuration and every other page unchanged, and does not start generation. Dragging Text adds an empty Text component; a second Context cannot be added; nothing can be added to a page with 12 modules.
13. Dragging the Context below a content component keeps that order after reloading the page; the main key stays first.
14. A Text component survives every generation and retry unchanged.
15. Every shaping step works from the keyboard: dragging a window module or a card's tab with Space and the arrow keys, opening a card's actions with Enter, and **Delete** with its question beside the tab.
16. Dropping a reordered card shows the new order immediately, with no snap back to the old order.
17. The page offers no page-level edit, generate missing, or retry page; each card has its own actions, and the main key has only **Edit**.
18. A word, a phrase, a sentence, and a passage each display as their tier on the page and without overflow in every page list layout; a passage shows six lines and **Show all**.
19. List is the default layout of a new deck; choosing Table or Gallery is remembered for that deck on the installation, and the other decks keep theirs.
20. A completed page shows no status in the list or on the page; a generating or failed page shows it in place of its meaning line.
21. A German parent on the sentence `我真的很幸福` shows its German translation and, with Examples, one similar sentence; Article, Synonyms, and Antonyms are not shown. The label under the title says the key was read as a sentence.
22. A German parent on the German word `Ufer` explains it in German, and its Article facet gives `das Ufer` with its plural.
23. Dragging the Pinyin facet onto a German parent is refused; dropping it on a Chinese parent adds it, shown only as its tag (since 0.7.4; its label until then) until **Retry** regenerates that parent with pinyin.
24. Deleting the Examples facet removes the examples from the parent; the next **Retry** regenerates the parent without them.
25. Two German parents on one page generate independently; retrying one leaves the other unchanged.
26. A German parent dragged onto a page comes with its core only. With a second German on the page, the two tabs read German 1 and German 2 (since 0.7.2). With two German parents on the page, the Examples facet's **+** shows a glowing ghost tag on each, and clicking the second German's ghost or tab flies the Examples tag to it alone (since 0.7.2); on a page without a German parent, German facets are disabled in the module window, which shows no text explaining why (since 0.7.1).
27. A German parent with all four facets wears the tags Ar, Ex, Sy and An, in that order, on its left edge. Folded, the tags travel along the card's edge to its bottom right; unfolded, they return the same way. A facet added from the window flies its tag to the card; a deleted facet's tag pops.
28. On a German parent with an Article and Examples, the Examples facet's **Retry** asks "Are you sure?" and, confirmed, regenerates the examples alone; the Article and the meanings stay unchanged (since 0.7.3).
29. On an open German card, clicking the Synonyms tag pulls it out with its **Retry**; Escape pushes it back. Clicked again and its **Retry** chosen, Synonyms regenerates at once without "Are you sure?", its section standing in its place meanwhile with the spark round its tab; the Article stays. A facet added from the window shows only its tag, and its tag's **Retry** generates it into its place in the parent's order (since 0.7.4).

## Implementation details still to specify

Releases 0.5.0 to 0.5.2 build shaping with the functional styling ([plan](../plans/page-owned-modules.md), [D04](../architecture/traceability-map.md#entries)). Release 0.6.0 builds the page list layouts and the page view in the Vocabularium Sage identity ([D05](../architecture/traceability-map.md#entries), [plan](../plans/visual-identity.md)).
