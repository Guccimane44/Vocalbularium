# Decks and configuration

## Purpose and status

This specification defines the owner-approved deck configuration for the deck → page → component model. Release 0.4.0 implements it; [current scope](../product/scope.md) lists what is supported. Deck browsing, creation, renaming, deletion, and default-deck selection remain defined by the applicable [MVP dashboard](../history/mvp/MVP-Product-scope.md#4-dashboard) and [default deck](../history/mvp/MVP-Product-scope.md#6-default-deck) rules.

The [product model](../product/model.md) defines decks, configuration, content module instances, and views. [Modules](modules.md) owns the module catalog and contracts. [Pages and editing](pages-and-editing.md) owns how pages hold the components these instances produce.

## Configuration

A deck's configuration has:

- its **name**;
- an ordered list of **content module instances**: at most 12 per deck. The same module type may appear more than once;
- its **view**: the default view, which shows each page as its ordered component list;
- **Capture with Context**: on or off, on for a new deck. It decides whether capture into the deck takes the selection's surrounding block ([Pages and editing](pages-and-editing.md#context)).

The user edits the configuration in **deck settings**: add, remove, and reorder content module instances, and turn Capture with Context on or off. Deck settings can preview the configured instances using word and sentence examples. Configuration edits follow the explicit save and draft rules for deck configuration.

A configuration with no content module instances is valid. Its pages hold only the main key, Context, and manual components.

## Effect on pages

Generation always uses the deck's current configuration: a new page and every generation or retry. Saving a configuration change never rewrites existing pages:

- **Instance added:** existing pages have no component for it until the user generates. **Generate missing** and page retry fill it.
- **Instance removed:** components it produced stay on existing pages as saved content, marked as no longer configured. Page retry does not touch them.
- **Instances reordered:** each page's content components follow the new order.

A generation attempt that is already running uses the configuration it started with. A page moved to another deck keeps its components, and its next retry uses the target deck's configuration.

## Views

Every deck shows its pages through the default view. Choosing among several views per deck, switching views, and configuring other view modules (such as the card view module) are later work. When they arrive, they follow the [Notion-style model](../product/model.md#view): views are alternative ways to show a deck's pages, with one default per deck.

## Default deck

Every account has exactly one default deck, the destination for capture. A new account starts with **My Deck** as its default deck. Its initial configuration is defined in [Select and Add](capture-and-generation.md#initial-default-deck-example).

When the refactor is installed, existing decks and their pages are discarded. Each existing account starts again with one fresh default deck configured like a new account's.
