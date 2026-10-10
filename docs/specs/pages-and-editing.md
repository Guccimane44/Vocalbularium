# Pages and editing

## Purpose and status

This specification defines the owner-approved page input and editing behavior shared by captured and manually created pages. Release 0.4.0 implements it; release 0.4.1 adds capture with Context ([current scope](../product/scope.md)). Existing browsing, sorting, save, draft, and deletion behavior remains defined by the applicable [MVP editing rules](../history/mvp/MVP-Product-scope.md#8-card-content-page-and-manual-editing), read with the [earlier terms](../product/model.md#earlier-terms) mapping.

The [product model](../product/model.md) defines a page, its components, and the main key. [Modules](modules.md#content-module-contract) owns how content modules consume the main key and Context. [Select and Add](../MVP-Product-spec-select-and-add.md) owns detailed generation completion, replacement, failure, interruption, and recovery rules. [Deck configuration](decks-and-configuration.md) owns which content module instances a page's deck has.

## Required main key

Every page has a main key component: the editable text used as its generation input. A captured selection supplies the initial value; manual creation requires the user to specify it. A saved page cannot omit the main key. A new manual draft may begin before the user has entered it.

The main key must always be visible when the page is shown. In the default view it is the first component. It can coexist with manually written or generated content and must remain visible regardless of whether a module prints input. Matching main keys do not merge pages or make their identities the same.

## Context

Each page has an optional **Context** component: the surrounding block captured with the selection (around 500 characters, capped). Capture with Context is a [deck setting](decks-and-configuration.md#configuration), on by default; the destination deck's setting at capture time applies. When it is off, or for manual creation without supplied context, the page has no Context.

The surrounding block is the nearest block-level element containing the selection, or the whole text field for a selection in one. When it exceeds the cap, capture keeps the text nearest the selection on both sides and marks each cut with an ellipsis. Whitespace is collapsed. A selection that fills its block, or one that cannot be read from the page (restricted pages, PDF viewers), yields no Context; capture itself proceeds unchanged. The web page URL, title, and other page details are not taken: they add nothing to generation. The Context is editable alongside the main key, including clearing it back to no Context.

Editing the Context follows the main-key rule below: it changes the input for subsequent generation only. It never regenerates, replaces content, or changes prior outcomes by itself. Saving a Context edit is distinct from requesting generation.

## Components on a page

A page shows its components in order: the main key, the Context when present, one content component per content module instance in the deck's current configuration, components of instances no longer configured, then any manual components. A content module instance that has never generated on this page has no component yet; the page editor shows it as missing so the user can generate it.

Components of a module instance that was later removed from the deck stay on the page as saved content, marked as no longer configured. They remain editable. Generation and page retry never touch them.

### Manual components

The user can add a **manual component**: a text component that no module owns. It is created, edited, and saved like other edits. Generation, **Generate missing**, and every retry leave manual components unchanged. Image components follow the rich-media scope (Q59) and are not part of this specification.

### Editing generated components

Generated components are editable. An edit to a generated component lasts until the next retry that targets that component. That retry asks for confirmation first because it replaces the edit ([Select and Add](../MVP-Product-spec-select-and-add.md#retry)).

Hiding or deleting individual components is not part of 1.0.

## Creation and optional generation

Capture and manual entry are two ways to supply the same page input. They share generation capabilities rather than defining different kinds of page.

- **Capture** creates the page from the selected text and Context, then generates all its content components automatically.
- **Manual creation** requires the user to enter the main key (Context optional) and never generates by itself. The user may save the page and write manual components without generating. **Generate** evaluates the deck's configured content module instances from the main key and Context.

After creation, captured and manually created pages behave the same.

## Editing and generation again

Editing the main key changes the input for subsequent generation. It does not run modules, remove existing generated or manually written content, or change prior generation outcomes. Editing another component does not redefine the main key.

The user must explicitly request generation again to produce content from the updated key. The action uses the main key and saved Context at the time of the request, with interpretation appropriate to them. It must not use the original captured selection or an earlier key's interpretation. Content that remains from earlier attempts can therefore describe a different input from the current key.

Generation always uses the deck's **current** configuration. Changing the configuration never changes existing pages until the user explicitly generates or retries on them. There is no pinned layout revision.

Main key and Context edits follow the explicit save and draft-preservation rules for manual editing. Saving is distinct from requesting generation. Finish editing with **Save** or **Cancel** before starting generation or a retry. Save recovery resubmits a save; it does not generate.

## Acceptance scenarios

1. Capturing `john cena` initializes the page's main key to `john cena`, shows it first, and generates one component per configured content module instance from it.
2. Manually creating a page with `john cena` supplies the same generation input. Saving without clicking **Generate** creates no generation attempt and preserves manually entered components.
3. **Generate** on that manual page evaluates every configured content module instance using `john cena`; manual origin does not disable generation.
4. Changing the main key from `john cena` to `Bismarck` and saving updates the displayed key while preserving existing John Cena content and prior outcomes. No generation request occurs as a side effect.
5. Retrying after that edit uses `Bismarck` and interpretation appropriate to it, rather than the original key. Replacement and failure behavior follow the generation specification for the targeted components.
6. Editing a generated explanation without editing the main key leaves subsequent generation input unchanged. The next retry of that explanation asks for confirmation and replaces the edit.
7. A page with no input-printing module, no applicable module output, or a failed generation still shows its main key.
8. Capturing with Context on initializes the page's Context alongside its main key; capturing with Context off, or manual creation without supplied context, leaves the page with no Context.
9. Editing the Context and saving preserves existing content and prior outcomes exactly like a main-key edit. Generation after that edit uses the updated key and Context.
10. Adding a content module instance to the deck leaves existing pages unchanged. **Generate missing** on an existing page creates only the new instance's component.
11. Removing a content module instance from the deck leaves its components on existing pages, marked as no longer configured. Page retry does not change them.
12. A manual component survives **Generate missing** and page retry unchanged.

## Implementation details still to specify

Before implementing the page editor, specify main key validation and whitespace rules, the treatment of main key and Context edits during active generation, and exact control labels and placement. Keep these decisions consistent with the required main key and existing recovery protections.
