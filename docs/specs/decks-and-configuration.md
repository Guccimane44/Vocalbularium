# Decks and configuration

## Purpose and status

This specification defines decks, the dashboard, the default deck, and deck configuration. [Current scope](../product/scope.md) records which parts are implemented.

The [product model](../product/model.md) defines decks, configuration, content module instances, and views. [Modules](modules.md) owns the module catalog and contracts. [Pages and editing](pages-and-editing.md) owns what happens to a page after it is created.

## Navigation

Every signed-in view shows a **deck sidebar** on the left: the wordmark, **Home** (the dashboard), the account's decks, each with its deck colour, name, and page count, and **+ New deck**, and the account menu at its foot. The deck being shown is marked as current. The decks scroll within the sidebar while the account menu stays at the foot. On a narrow window the sidebar becomes a menu button in the header.

The **account menu** sits at the foot of the sidebar. Its trigger shows the account's initial in a round mark, the account's name, *admin*, and beneath it the server it is signed in to (such as `127.0.0.1:4318`); its accessible name is "Account: admin". An API that sends no name leaves the trigger reading **Account**. The menu opens upward over the trigger, as wide as it, and holds, in order: **Appearance** with its three choices as icons on the same row ([shared UI](shared-ui.md#appearance)); the **Language** row ([shared UI](shared-ui.md#interface-language)); **Diagnostic logs**; and, after a rule, **Log out**. Each row has its icon. Escape or a click outside closes it and Escape returns the focus to the trigger.

A deck's colour is one of the six family colours ([modules](modules.md#module-families)), chosen in [deck settings](#configuration) and the same in every view and installation. A new deck starts with one of them at random; a deck whose colour has never been chosen shows a colour derived from its identity. It identifies the deck only and says nothing about its modules, so deck settings name the colours by hue (Blue, Green, Amber, Violet, Rose, Sage), not by family.

## Dashboard

The dashboard is the main view, titled **Your decks**. It shows every deck of the account as a card in batches of 40, with **Load more decks** when more exist. Each deck card shows its colour, its name, its page and module counts, and a **Default** label on the default deck. Below the decks, **Recent captures** lists the twenty most recent captures and any capture receipts not yet saved ([capture and generation](capture-and-generation.md#capture-scenario)) as compact entries: the main key, its deck, and the time. Each entry is one link to its page; an entry that is saving or not saved shows its state and button as in a page list ([shared UI](shared-ui.md#list-state-presentation)).

- **Add new deck** (and **+ New deck** in the sidebar) opens deck settings for a new deck, starting with the same configuration as a new account's **My Deck**. **Save** creates the deck; **Cancel** discards the draft. Creating a deck does not change the default deck.
- Clicking a deck opens its page list ([pages and editing](pages-and-editing.md#page-list)).
- Each deck's **•••** menu offers **Set as default**, **Configure deck**, and **Delete deck**. The same menu appears on the deck's page list. **Set as default** is disabled on the current default. The menu closes after an action, on navigation or rerender, on Escape, and on a click outside it. It is keyboard operable, and closing it returns focus to its trigger when that still exists.

### Deleting a deck

**Delete deck** asks for confirmation that the deck and all its pages will be deleted. Cancel leaves everything unchanged. Deleting the default deck requires choosing another deck as the new default in the same dialog. Deleting the only deck replaces it with a new, empty **My Deck** with the initial configuration. Deleting the deck currently shown returns to the dashboard. Deleting a deck cancels pending generation on its pages.

## Default deck

Every account has exactly one default deck, the destination for capture. Default is a role a deck holds, not a kind of deck. A new account starts with **My Deck** as its default deck, created once when the account is initialized. Its initial configuration is defined in [capture and generation](capture-and-generation.md#initial-default-deck-example). **Set as default** moves the role to another deck; the choice synchronizes with the account.

## Configuration

A deck's configuration has:

- its **name**;
- its **colour** ([navigation](#navigation));
- an ordered list of **module instances**, at most 12 in total:
  - the **main key module**: compulsory and always first; it cannot be removed or moved;
  - the **Context module**: optional, at most one. When the deck has it, capture into the deck also takes the selection's surrounding block ([pages and editing](pages-and-editing.md#context));
  - **Text module instances**: optional and repeatable; each gives new pages an empty Text component for the user's own writing;
  - **content module instances**, each a [parent module](modules.md#parent-modules-and-facets) with the facets chosen for it: the same type may appear more than once, and facets do not count toward the 12;
- its **view**: the default view, which shows each page as its ordered component list.

The user edits the configuration in **deck settings**: name the deck, choose its colour from six swatches, add, remove, and reorder the Context, Text, and content module instances, and add or remove a parent's facets as on a page ([pages and editing](pages-and-editing.md#shaping-a-page)); the main key stays first. Configuration edits are a draft until **Save**; **Cancel** discards them. A failed save keeps the draft and offers **Try saving again**. Deck settings keep the page view's layout: the module list beside the module window. A module's samples are on its own [page](modules.md#explanations).

Deck settings hold modules without content, so each module is drawn as a folded card is on a page and never unfolds: a slim band under its index tab, ruled in its family colour, which offers no **Fold** or **Unfold** ([D22](../architecture/decisions/d22.md)).

- **The main key** is shown first in the list like the other modules: its tab is outlined, on a band ruled in the line colour, with no six-dot menu, drag, actions or **Remove**.
- **Each other module's tab** is numbered like a page's when the same module appears more than once, drags it and, clicked, ejects **About** first, which opens its [module page](modules.md#explanations) in the pages' sheet, the same page as from the module window or a card; then, on a parent, **Facet**, which opens its [facet window](pages-and-editing.md#facet-window) on the draft; then **Remove**.
- **Facets.** A parent's facets hang from the end of its band's bottom edge as [facet tags](pages-and-editing.md#facet-tags), as on a folded card, fly there from the facet window when added, and pop when removed. Deck settings hold no content, so removing a facet there never asks.
- **Menus over tags.** An open six-dot menu or facet window stands over the tags.

A configuration with only the main key module is valid. Its new pages hold only the main key and whatever the user adds.

### Module window

Deck settings show the module list on the left and the **module window** on the right ([shared UI](shared-ui.md#module-window)). The user adds an instance by dragging a module from the window into the configuration and reorders instances by dragging their icon and name, which fill the module's row from the six dots to **Remove**, with the pointer or from the keyboard (Space, the arrow keys, Space). The six dots before the name open the instance's menu, whose entries, **Duplicate** and **Copy to another deck…**, are placeholders marked *Coming soon*. **Remove** stays on each instance. The page view shows the same window ([pages and editing](pages-and-editing.md#shaping-a-page)), so shaping a deck and shaping a page use the same gesture.

## Configuration and pages

The configuration is the template for page creation. Capture and manual creation give the new page a copy of the deck's content module instances, in configured order ([capture and generation](capture-and-generation.md#capture-scenario)). From then on the page owns its modules:

- Saving a configuration change never changes existing pages. Only pages created afterwards use it.
- Generation and retry on an existing page use the page's own module instances, not the deck's.
- A page moved to another deck keeps its modules and components.

A generation run already in progress when the configuration changes is unaffected.

## Views and layouts

Every page is shown through the default view. Choosing among several views per deck, switching views, and configuring other view modules (such as the card view module) are later work. When they arrive, they follow the [Notion-style model](../product/model.md#view): a view shows one page, with one default per deck.

How a deck **lists** its pages is a separate choice, its page list **layout**: List (the default), Table, or Gallery ([pages and editing](pages-and-editing.md#page-list)). The layout is remembered per deck on each installation and is not part of the deck configuration. To fill every layout without loading each page, a page summary from the backend (the deck's page list and the recent captures) carries, besides the main key, capture date and page status, the page's meaning line and, for each component after the main key, its module type, status, and whether it has content. It never carries the content itself.
