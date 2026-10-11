# Pages and editing

## Purpose and status

This specification defines the page list, page input, and page editing shared by captured and manually created pages. Release 0.5.2 implements it, including [shaping a page](#shaping-a-page) ([D02](../architecture/traceability-map.md#entries)) and per-card actions ([D04](../architecture/traceability-map.md#entries)); [current scope](../product/scope.md) records the status.

The [product model](../product/model.md) defines a page, its components, and the main key. [Modules](modules.md#content-module-contract) owns how content modules consume the main key and Context. [Capture and generation](capture-and-generation.md) owns generation completion, replacement, failure, interruption, and recovery. [Decks and configuration](decks-and-configuration.md) owns the deck configuration that new pages start from. [Accounts and synchronization](accounts-and-sync.md) owns save ordering across installations.

## Page list

Opening a deck shows its pages as a list with two columns:

1. **Index**: a three-digit position (`001`, `002`, …) in the current order. It is calculated for display, never stored, and changes when the order or the list changes.
2. **Entry**: the page's main key.

The list loads 30 pages at a time, with **Load more pages** when more exist. A deck without pages shows "No pages in this deck yet." Clicking anywhere on a row opens the page, except when the user is selecting text in it. Each row has one keyboard target named by its entry. Rows show their generation outcome as described in [shared UI](shared-ui.md#list-state-presentation).

**Sort pages** offers four orders: creation time newest first (the default), creation time oldest first, alphabetical A to Z, and alphabetical Z to A. Alphabetical order compares main keys after Unicode NFKC normalization and lowercasing, in code-unit order. Pages with equal sort values are ordered by page ID, so the list is stable. The chosen order is remembered per deck on that installation.

The deck's **Add page manually** opens a new page draft ([creation](#creation-and-optional-generation)). The deck's **•••** menu is described in [decks and configuration](decks-and-configuration.md#dashboard).

## Required main key

Every page has a main key component: the editable text used as its generation input. A captured selection supplies the initial value; manual creation requires the user to specify it. A saved page cannot omit the main key, and a main key that is empty or only whitespace is rejected with "Enter a main key." A new manual draft may begin before the user has entered it.

The main key component belongs to the compulsory main key module. It must always be visible when the page is shown: it is always the first component and the page's title. It can coexist with manually written or generated content. Matching main keys do not merge pages or make their identities the same. The main key cannot be deleted.

## Context

A page can have one **Context** component, owned by the Context module: the surrounding block captured with the selection (around 500 characters, capped). Capture takes it only when the destination deck's configuration has the [Context module](decks-and-configuration.md#configuration); Context taken while the deck had the module is dropped if the module was removed by the time the capture is saved. A manually created page in such a deck starts with an empty Context for the user to fill. A page without the Context module has no Context.

The surrounding block is the nearest block-level element containing the selection, or the whole text field for a selection in one. When it exceeds the cap, capture keeps the text nearest the selection on both sides and marks each cut with an ellipsis. Whitespace is collapsed. A selection that fills its block, or one that cannot be read from the page (restricted pages, PDF viewers), yields no Context; capture itself proceeds unchanged. The web page URL, title, and other page details are not taken: they add nothing to generation.

The Context is editable alongside the main key. Removing it from a page, or adding it to a page that has none, follows [shaping a page](#shaping-a-page). Editing the Context follows the main-key rule below: it changes the input for subsequent generation only. It never regenerates, replaces content, or changes prior outcomes by itself.

## Components on a page

A new page starts with one component per module instance copied from the deck configuration, in configured order: the main key, the Context when the deck has the Context module, then the content components ([decks and configuration](decks-and-configuration.md#configuration-and-pages)). A content module instance that has not generated on this page yet shows as "Not generated yet", with **Generate** in its card.

After creation the page owns its module instances. Deck configuration changes never add, remove, or reorder a page's components.

### Components as cards

Each component is a card with its own actions ([D04](../architecture/traceability-map.md#entries)):

- **Edit** turns that card into a text field with **Save** and **Cancel** in the card ([editing](#editing-a-component)).
- **Generate** on a content component that never generated and is still empty starts its first generation, without a warning, because there is nothing to replace. After that the same control is **Retry**, which warns before replacing the content ([capture and generation](capture-and-generation.md#retry)).
- **Delete** removes the component ([shaping](#shaping-a-page)).

The main key card has only **Edit**. There are no page-level edit, generate, or retry controls; **Delete page** sits in the page header.

### Shaping a page

The user shapes a page directly, outside editing. Each shaping step is saved immediately as one operation, with no separate **Save**, and reaches other installations in the order it arrives, like every save ([accounts and synchronization](accounts-and-sync.md#synchronization)). Shaping is unavailable while a component is being edited.

- **Delete a component.** Any component except the main key can be deleted: a content component, the Context, or a Text component. Deleting asks for confirmation, then removes the component immediately. Deleting a module's component also removes the module instance from the page, so generation never brings it back. A component that is generating cannot be deleted until its attempt finishes.
- **Rearrange components.** The user can drag any component except the main key, including the Context and Text components, into a new order below the main key by dragging its handle: with the pointer, or from the keyboard with Space to pick it up, the arrow keys to move it, and Space to drop it. The new order shows at once, and the page reverts to the saved order only if saving fails. The order is saved with the page and used by the default view.
- **Add a module.** The user drags the Context module, the Text module, or a content module from the [module window](shared-ui.md#module-window) onto the page; while it is over the page, a line shows where it will land. From the keyboard, the user picks the module up with Space, moves through the landing places with the arrow keys, and drops it with Space. This adds a module instance to this page only; the deck configuration is unchanged. A page holds at most 12 module instances, counting every module, and at most one Context. An added content module shows as "Not generated yet" and generates only when the user presses its **Generate**; an added Context or Text starts empty for the user to fill. Adding the same module again restores what the user deleted earlier, as new, ungenerated content.

When another installation deletes a component the user is editing, the user's save fails as deleted and keeps their draft, as for any deleted component ([editing](#editing-a-component)).

### Text components

A **Text component** holds the user's own writing and belongs to a Text module instance. The user adds one by dragging the Text module onto the page, and a deck that includes the Text module gives every new page an empty one. It is edited and saved like other components. Generation and every retry leave Text components unchanged, and they are never a generation input. Image components follow the rich-media scope (Q59) and are not part of this specification.

### Editing generated components

Generated components are editable. An edit to a generated component lasts until the next retry that targets that component. That retry asks for confirmation first because it replaces the edit ([capture and generation](capture-and-generation.md#retry)).

## Editing a component

Editing is one card at a time ([D04](../architecture/traceability-map.md#entries)). **Edit** on a card makes that component editable; while it is open, the other cards' **Edit**, **Generate**, **Retry**, and **Delete** wait, and shaping is unavailable, without a separate notice: the open card's **Save** and **Cancel** end editing. Adding, deleting, and moving components is [shaping](#shaping-a-page).

- **Save** in the card writes that component and closes it. Only that component is sent, so it never overwrites another installation's edit of a different component.
- **Cancel** in the card discards the draft. Cancelling a new page returns to the deck's page list.

**Delete page** in the page header asks for confirmation ("This page and all its components will be deleted."), then deletes the page and returns to the deck's page list. Deleting a page cancels its pending generation.

Leaving the editor with unsaved changes, by navigating, logging out, or opening diagnostics, offers **Continue editing**, **Discard**, or **Save**. Closing the tab with unsaved changes triggers the browser's leave warning. Drafts are never saved automatically. A failed save keeps the drafts and offers **Try saving again**, which resubmits the same save and never generates.

A save that changes a component while it is generating is rejected: the component does not change, the draft stays, and the message explains that a component is still generating. The user saves again after the attempt finishes ([capture and generation](capture-and-generation.md#retry)).

Saving a main-key edit updates the page's entry and its position in alphabetical order. Editing never changes the page's creation time. If the page or its deck is deleted elsewhere while the user has drafts, the editor shows "Page unavailable" with the unsaved text so the user can copy it, and **Discard draft**.

## Creation and optional generation

Capture and manual entry are two ways to supply the same page input. They share generation capabilities rather than defining different kinds of page.

- **Capture** creates the page from the selected text and Context, then generates all its content components automatically.
- **Manual creation** starts a new page with the deck's modules: the user enters the main key, and fills the Context and Text components when the deck has them. It never generates by itself; content components wait as "Not generated yet". Each content card's **Generate** then evaluates that module from the main key and Context.

After creation, captured and manually created pages behave the same.

## Editing and generation again

Editing the main key changes the input for subsequent generation. It does not run modules, remove existing generated or manually written content, or change prior generation outcomes. Editing another component does not redefine the main key.

The user must explicitly request generation again to produce content from the updated key. The action uses the main key and saved Context at the time of the request, with interpretation appropriate to them. It must not use the original captured selection or an earlier key's interpretation. Content that remains from earlier attempts can therefore describe a different input from the current key.

Generation uses the page's own content module instances. Finish editing with **Save** or **Cancel** before starting a generation or a retry.

## Acceptance scenarios

1. Capturing `john cena` initializes the page's main key to `john cena`, shows it first, and generates one component per content module instance copied from the deck.
2. Manually creating a page with `john cena` supplies the same generation input. Saving creates no generation attempt and keeps what the user wrote.
3. **Generate** on a content card of that manual page evaluates that module using `john cena`, without a warning; manual origin does not disable generation.
4. Changing the main key from `john cena` to `Bismarck` and saving updates the displayed key while preserving existing John Cena content and prior outcomes. No generation request occurs as a side effect.
5. Retrying after that edit uses `Bismarck` and interpretation appropriate to it, rather than the original key. Replacement and failure behavior follow the generation specification for the targeted components.
6. Editing a generated explanation without editing the main key leaves subsequent generation input unchanged. The next retry of that explanation asks for confirmation and replaces the edit.
7. A page with no applicable module output or a failed generation still shows its main key.
8. Capturing into a deck with the Context module initializes the page's Context alongside its main key; capturing into a deck without it leaves the page with no Context.
9. Editing the Context and saving preserves existing content and prior outcomes exactly like a main-key edit. Generation after that edit uses the updated key and Context.
10. Adding a content module instance to the deck leaves existing pages unchanged; the next captured page has a component for it.
11. Deleting a generated component asks for confirmation, removes it, and no generation recreates it. Dragging the same module from the module window onto the page adds it back as "Not generated yet".
12. Dragging a module onto one page leaves the deck configuration and every other page unchanged, and does not start generation. Dragging Text adds an empty Text component; a second Context cannot be added; nothing can be added to a page with 12 modules.
13. Dragging the Context below a content component keeps that order after reloading the page; the main key stays first.
14. A Text component survives every generation and retry unchanged.
15. Every shaping step works from the keyboard: dragging a window module or a card's handle with Space and the arrow keys, and **Delete** with confirmation.
16. Dropping a reordered card shows the new order immediately, with no snap back to the old order.
17. The page offers no page-level edit, generate missing, or retry page; each card has its own actions, and the main key card has only **Edit**.

## Implementation details still to specify

Releases 0.5.0 to 0.5.2 build shaping with today's styling ([plan](../plans/page-owned-modules.md), [D04](../architecture/traceability-map.md#entries)). The visual identity of the page view and module window is a later milestone.
