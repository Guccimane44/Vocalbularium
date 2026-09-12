# M2 capture implementation

The product extension now connects exact selected text to the authenticated account, an immediate three-second receipt, page generation, and plain-text card viewing. Dashboard outcomes include local requests awaiting their first account save and saved captures from either installation. The context-menu action is initialized after login and removed on logout.

Each action has a durable local receipt and a separate operation identity, so two identical selections create two cards. The account saves the card before generation begins. All dependent modules share one stored interpretation, and each page publishes its complete result atomically. Provider results are staged until the originating browser publishes them; an interrupted browser session cannot publish late results. Pending publication writes require explicit resubmission after failure. Detailed behavior remains in [Select and Add](MVP-Product-spec-select-and-add.md).

## Provider

The server now uses [OpenCode Go](https://opencode.ai/docs/go/) Chat Completions with `deepseek-v4.1-flash` for owner testing. It sends only the selected text, shared interpretation, module instructions, and prior outputs needed for distinct examples. The adapter requests JSON through its instructions and validates completion status and the expected fields locally. No webpage context or API credentials enter the extension's capture payload. Missing credentials, refusal, incomplete output, and invalid JSON or fields fail the dependent page. There is no automatic fallback to a different model.

## Verification performed

- 26 store, server, module, and provider-contract tests passed locally. These cover shared interpretation, exact whitespace, literal formatting, empty/inapplicable pages, atomic failure, repeated examples, late interpretation, and idempotent capture recovery.
- Two product Chromium scenarios passed: account synchronization/recovery and the complete capture flow. Capture checks include two identical selections, independent three-second receipts, manual dismissal, plain-text navigation from another profile, sentence inapplicability, controlled failure, dashboard closure, Chrome reopening with a late staged result, and a first-save failure followed by explicit resubmission.
- Syntax/JSON/whitespace checks and the extension build passed.

The product browser test calls the capture event handler through a hook appended only to its disposable test copy; no hook is shipped. Native context-menu activation was checked in the M0 prototype; native product and packaged Windows checks remain part of acceptance. Automated generation responses are controlled fixtures, not evidence of live model quality.

## Open acceptance

The owner configured the Go API key and approved storing it in Render's secret settings. The live word/sentence provider smoke passed; its [sample output](evidence/deepseek-v4.1-flash-smoke-2026-09-12.json) records interpretation, applicability, German formatting/translations, and distinct sentence examples. The deployed backend also passes [word/phrase/sentence generation and explicit page retry](evidence/render-smoke-2026-09-12.json), and two real extension installations display its generated pages and synchronize manual edits. These hosted API captures do not exercise native context-menu selection. Native product/Windows capture and popup presentation, background-mode behavior, and the final publish-versus-browser-exit boundary remain open. M2 remains open for its native capture acceptance gate.
