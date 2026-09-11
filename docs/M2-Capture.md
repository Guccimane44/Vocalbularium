# M2 capture implementation

The product extension now connects exact selected text to the authenticated account, an immediate three-second receipt, page generation, and plain-text card viewing. Dashboard outcomes include local requests awaiting their first account save and saved captures from either installation. The context-menu action is initialized after login and removed on logout.

Each action has a durable local receipt and a separate operation identity, so two identical selections create two cards. The account saves the card before generation begins. All dependent modules share one stored interpretation, and each page publishes its complete result atomically. Provider results are staged until the originating browser publishes them; an interrupted browser session cannot publish late results. Pending publication writes require explicit resubmission after failure. Detailed behavior remains in [Select and Add](MVP-Product-spec-select-and-add.md).

## Provider

The server uses [OpenAI Responses](https://developers.openai.com/api/docs/guides/structured-outputs) with strict structured output and [gpt-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), pinned to `gpt-5.4-mini-2026-03-17` by default. It sends only the selected text, shared interpretation, module instructions, and prior outputs needed for distinct examples. No webpage context or API credentials enter the extension's capture payload. Missing credentials, refusal, incomplete output, and invalid structured output fail the dependent page.

## Verification performed

- 26 store, server, module, and provider-contract tests passed locally. These cover shared interpretation, exact whitespace, literal formatting, empty/inapplicable pages, atomic failure, repeated examples, late interpretation, and idempotent capture recovery.
- Two product Chromium scenarios passed: account synchronization/recovery and the complete capture flow. Capture checks include two identical selections, independent three-second receipts, manual dismissal, plain-text navigation from another profile, sentence inapplicability, controlled failure, dashboard closure, Chrome reopening with a late staged result, and a first-save failure followed by explicit resubmission.
- Syntax/JSON/whitespace checks and the extension build passed.

The product browser test calls the capture event handler through a hook appended only to its disposable test copy; no hook is shipped. Native context-menu activation was checked in the M0 prototype; native product and packaged Windows checks remain part of acceptance. Automated generation responses are controlled fixtures, not evidence of live model quality.

## Open acceptance

The owner will configure the API key locally, arrange Render access, and provide Windows testing later. Live word/phrase and sentence capture, hosted two-installation access, Windows popup presentation/background-mode behavior, and the final publish-versus-browser-exit boundary remain unverified. M2 stays open until the live-provider gate passes. The owner requested continued implementation while these dependencies are arranged.
