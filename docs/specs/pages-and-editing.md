# Pages and editing

## Purpose and status

This specification defines the page list, page input, and page editing shared by captured and manually created pages. Release 0.4.1 implements everything here except [shaping a page](#shaping-a-page), which [D02](../architecture/traceability-map.md#entries) accepted and which is not built; [current scope](../product/scope.md) records the status. Until D02 ships, pages follow the rules in [Before D02](#before-d02).

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

A new page starts with one component per module instance copied from the deck configuration, in configured order: the main key, the Context when the deck has the Context module, then the content components ([decks and configuration](decks-and-configuration.md#configuration-and-pages)). A content module instance that has not generated on this page yet shows as "Not generated yet" so the user can generate it.

After creation the page owns its module instances. Deck configuration changes never add, remove, or reorder a page's components.

### Shaping a page

Accepted with D02; not built. The user shapes a page directly, outside the editing session:

- **Delete a component.** Any component except the main key can be deleted: a content component, the Context, or a manual component. Deleting asks for confirmation, then removes the component immediately. Deleting a module's component also removes the module instance from the page, so generation, **Generate missing**, and page **Retry** never bring it back. A component that is generating cannot be deleted until its attempt finishes.
- **Rearrange components.** The user can drag any component except the main key, including the Context and manual components, into a new order below the main key. The order is saved with the page and used by the default view.
- **Add a module.** The user drags the Context module or a content module from the [module window](shared-ui.md#module-window) onto the page. This adds a module instance to this page only; the deck configuration is unchanged. A page holds at most 12 module instances, including the main key and Context, and at most one Context. An added content module shows as "Not generated yet" and generates only when the user asks (**Generate missing**, page **Retry**, or the component's **Retry**); an added Context starts empty for the user to fill. Adding the same module again restores what the user deleted earlier, as new, ungenerated content.

### Manual components

The user can add a **manual component**: a text component that no module owns. It is created, edited, and saved like other edits. Generation, **Generate missing**, and every retry leave manual components unchanged. Image components follow the rich-media scope (Q59) and are not part of this specification.

### Editing generated components

Generated components are editable. An edit to a generated component lasts until the next retry that targets that component. That retry asks for confirmation first because it replaces the edit ([capture and generation](capture-and-generation.md#retry)).

## Editing session

**Edit page** makes every text component of the page editable: the main key, the Context, content components, and manual components. The user can also add their own text components and, when the page has none, a Context.

- **Save** writes every changed component together and returns to the page. Only changed components are sent, so an unchanged component never overwrites another installation's edit.
- **Cancel** discards the unsaved drafts. Cancelling a new page returns to the deck's page list.
- **Delete page** asks for confirmation ("This page and all its components will be deleted."), then deletes the page and returns to the deck's page list. Deleting a page cancels its pending generation.

Leaving the editor with unsaved changes, by navigating, logging out, or opening diagnostics, offers **Continue editing**, **Discard**, or **Save**. Closing the tab with unsaved changes triggers the browser's leave warning. Drafts are never saved automatically. A failed save keeps the drafts and offers **Try saving again**, which resubmits the same save and never generates.

A save that changes a component while it is generating is rejected whole: no component changes, the drafts stay, and the message explains that a component is still generating. The user saves again after the attempt finishes ([capture and generation](capture-and-generation.md#retry)).

Saving a main-key edit updates the page's entry and its position in alphabetical order. Editing never changes the page's creation time. If the page or its deck is deleted elsewhere while the user has drafts, the editor shows "Page unavailable" with the unsaved text so the user can copy it, and **Discard draft**.

## Creation and optional generation

Capture and manual entry are two ways to supply the same page input. They share generation capabilities rather than defining different kinds of page.

- **Capture** creates the page from the selected text and Context, then generates all its content components automatically.
- **Manual creation** requires the user to enter the main key (Context optional) and never generates by itself. The user may save the page and write manual components without generating. **Generate** then evaluates the page's content module instances from the main key and Context.

After creation, captured and manually created pages behave the same.

## Editing and generation again

Editing the main key changes the input for subsequent generation. It does not run modules, remove existing generated or manually written content, or change prior generation outcomes. Editing another component does not redefine the main key.

The user must explicitly request generation again to produce content from the updated key. The action uses the main key and saved Context at the time of the request, with interpretation appropriate to them. It must not use the original captured selection or an earlier key's interpretation. Content that remains from earlier attempts can therefore describe a different input from the current key.

Generation uses the page's own content module instances. Finish editing with **Save** or **Cancel** before starting generation or a retry.

## Before D02

Release 0.4.1 implements the page/component model with deck-driven modules ([Q72](../architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72)):

- There are no input modules: every page has a main key, the Context is a fixed optional component, and the deck's **Capture with Context** setting (on by default) decides whether capture takes it. Clearing the Context's text and saving removes it, and a page without one can gain it while editing.
- A page's content components follow the deck's current configuration. A module instance added to the deck appears on existing pages as "Not generated yet"; reordering the deck reorders every page.
- Components of an instance removed from the deck stay on the page, marked "no longer in this deck". They stay editable, have no **Retry**, and generation never touches them.
- Components cannot be deleted or rearranged. The Context can be cleared, and manual components can be emptied but not removed.

## Acceptance scenarios

1. Capturing `john cena` initializes the page's main key to `john cena`, shows it first, and generates one component per content module instance copied from the deck.
2. Manually creating a page with `john cena` supplies the same generation input. Saving without clicking **Generate** creates no generation attempt and preserves manually entered components.
3. **Generate** on that manual page evaluates every content module instance on the page using `john cena`; manual origin does not disable generation.
4. Changing the main key from `john cena` to `Bismarck` and saving updates the displayed key while preserving existing John Cena content and prior outcomes. No generation request occurs as a side effect.
5. Retrying after that edit uses `Bismarck` and interpretation appropriate to it, rather than the original key. Replacement and failure behavior follow the generation specification for the targeted components.
6. Editing a generated explanation without editing the main key leaves subsequent generation input unchanged. The next retry of that explanation asks for confirmation and replaces the edit.
7. A page with no applicable module output or a failed generation still shows its main key.
8. Capturing into a deck with the Context module initializes the page's Context alongside its main key; capturing into a deck without it leaves the page with no Context.
9. Editing the Context and saving preserves existing content and prior outcomes exactly like a main-key edit. Generation after that edit uses the updated key and Context.
10. Adding a content module instance to the deck leaves existing pages unchanged; the next captured page has a component for it.
11. Deleting a generated component asks for confirmation, removes it, and page **Retry** and **Generate missing** do not recreate it. Dragging the same module from the module window onto the page adds it back as "Not generated yet".
12. Dragging a module onto one page leaves the deck configuration and every other page unchanged, and does not start generation.
13. Dragging the Context below a content component keeps that order after reloading the page; the main key stays first.
14. A manual component survives **Generate missing** and page retry unchanged.

## Implementation details still to specify

Before implementing D02, specify the exact delete and drag interactions, keyboard alternatives to dragging, and the module window layout as part of the shared UI redesign. Keep them consistent with the required main key and existing recovery protections.
