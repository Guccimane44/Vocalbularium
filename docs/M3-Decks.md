# M3 deck configuration

The dashboard now has new-deck drafts and a three-dot menu for default selection, configuration, and confirmed deletion. Configuration has a module panel and a separately labeled showcase with examples for every page. All five module types share one catalog between the UI and server. Repeated instances, empty pages, module order, and the one-to-four-page limit are supported with explicit controls.

Saving validates stable page identities. Appending pages leaves existing cards empty on those pages; module changes leave stored text untouched. Removing a page shifts retained pages without changing their identity or text. Content-loss confirmation includes a digest of the currently affected saved text, so a remote edit after the warning requires fresh confirmation. Old configuration drafts cannot recreate deleted pages. Deletion cascades to pending attempts; late outputs cannot recreate removed objects.

## Checks performed

- 31 store/server/module tests passed locally, including five deck tests covering defaults, validation, uncertain resubmission, live content-loss revalidation, page migration, stale saves, and generation during configuration changes.
- Three product Chromium scenarios passed. The deck scenario covers new-draft cancellation, four-page previews, every library module, repeated sentence modules, rearrangement, default selection, canceled/confirmed page removal, and deletion with a replacement default.
- Syntax/JSON/whitespace checks and extension build passed. The four-page configuration was also inspected visually.

The generation runtime is exercised with controlled responses. Live all-module captures, hosted synchronization, and packaged Windows acceptance remain open in the delivery tracker; no model call is used for sample previews.
