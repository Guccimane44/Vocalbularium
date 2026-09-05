# Implementation status

Updated 5 September 2026. This delivery is a working browser development milestone with native-client source. The full production MVP remains subject to the acceptance work below.

## Delivered

- Browser capture, wordlists, explicitly selected answer languages, per-language Explanation/Examples settings, separate meaning pages, search, review, interests, allowance, export, and deletion.
- One FSRS schedule per card, frozen Essential-language review attempts, reveal-before-rating, language rotation, and retained concurrent review observations with one canonical scheduling transition.
- Account-owned D1 persistence, durable mutation receipts, atomic quota reservation/settlement, generation leases, bounded retries, partial page recovery, and protection against late publication after deletion.
- Account-scoped browser snapshots and persistent mutation outboxes, foreground synchronization, and a production offline-shell worker.
- Explicit sample generation and a server-only OpenAI Responses adapter with structured validation, bounded repairs, usage records, and optional configured cost estimates.
- Email-code and Apple identity-token authentication adapters. The private browser preview uses a separate platform-authenticated identity namespace.
- Chrome capture extension with durable pending captures, account isolation, and restart-safe retry identifiers.
- SwiftUI app and share-extension sources, App Group capture storage, Keychain sessions, cached prepared reviews, and foreground upload.

The repository is [Guccimane44/Vocalbularium](https://github.com/Guccimane44/Vocalbularium), intentionally retaining the owner's repository spelling. Product naming remains Vocabularium.

## Verification evidence

| Check | Result and practical scope |
| --- | --- |
| Automated suite | 31 passing tests: 22 domain/persistence/review tests, four authentication tests, three Chrome worker simulations, and two mocked provider tests. |
| Type checking | Browser/server TypeScript check passed. |
| Production build | Browser Worker/client build and monorepo deployment staging passed. |
| Native syntax | Swift frontend parsing passed for all four Swift sources. This does not establish iOS SDK compilation or runtime correctness. |
| Script syntax | Chrome scripts and browser service worker passed JavaScript syntax checks. |
| Dependency audit | No production dependency advisories at verification time. Four moderate development-only advisories remain in Drizzle tooling's transitive dependencies. |
| Browser interaction | Private local sign-in, explicit English/German sample onboarding, capture/review navigation, hidden answers before reveal, separate language pages, multi-meaning answers, and a completed Good rating were exercised. |
| Visual review | Desktop light/dark and a 390 px mobile viewport were reviewed through the browser. A mobile tabs layout defect was corrected and rechecked. |
| Allowance behavior | Browser review preserved the six already-completed sample page charges; automated tests cover reservation races, insufficient allowance, partial failures, and replay. |

The tests include reopen-after-persistence, deletion during generation, account deletion without resurrection, stale configuration rejection, immutable review attempts, clock bounds, quota conservation, and a pinned FSRS fixture. Provider tests mock network responses and authentication tests substitute email delivery. Neither proves real provider quality or email deliverability. Chrome tests execute the actual background script in a simulated extension environment; they do not replace a real installation test.

## Remaining acceptance work

1. **Configure and verify live services.** Supply model credentials and a selected model, a verified email sender and authentication secret, and Apple app/web identifiers. Measure multilingual quality, real usage/cost, failure behavior, delivery, and cross-platform authentication. The preview currently supports documented sample expressions; arbitrary-word generation is not live.
2. **Complete identity lifecycle.** Email and Apple identities currently remain separate. Implement explicit verified linking/merging, complete Apple revocation/deletion requirements, and validate account recovery before distribution.
3. **Build and test iOS with full Xcode.** Only Command Line Tools are available in this workspace. SDK type checking, simulator/device runs, signing, actual share-sheet intake, background/foreground behavior, and device accessibility remain unverified. Native preference editing and conflict-resolution controls also need browser parity.
4. **Exercise real external clients.** Install Chrome unpacked, verify selection/paste intake and service-worker restart, then test independent-device convergence with iOS and browser. The private Sites platform gate does not accept an application bearer token by itself; a suitable hosted API access configuration is required before those hosted-client checks.
5. **Provision autonomous recovery.** Generation currently runs through Worker lifetime extension and client foreground/alarm invocations. A scheduled or queue worker is needed to guarantee recovery after interrupted execution when no client returns.
6. **Finish production acceptance checks.** Test a production offline reload, offline review/upload conflicts across independent devices, device account switching, deletion propagation, keyboard/screen-reader accessibility, and representative language/script quality with speakers.
7. **Plan larger-library storage before expanding limits.** The bounded MVP stores an account aggregate and returns a full snapshot when its revision changes. Indexed records, delta feeds, and history compaction remain future migration work.

No subscriptions, purchases, or monthly allowance resets are implemented. The allowance is a one-time grant of 100 successful language-page generations per account.

See [service setup](service-setup.md), [architecture](architecture.md), [Chrome setup](../apps/chrome/README.md), and [iOS setup](../apps/ios/README.md) for the concrete continuation steps.
