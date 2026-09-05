# Vocabularium — initial build prompt

Draft 0.6 · Copy the prompt below into an AI coding agent with this repository available.

---

Build the MVP of **Vocabularium**, a public, iOS-first vocabulary-learning app with accounts, cross-device sync, app-provided AI generation, Chrome selection capture, and browser study.

The learner's intent is: **“I do not understand this word or know its source language. Explain it in the language(s) I choose, create my card, and help me remember it.”**

Read `docs/product-spec.md`, `docs/ui-guidelines.md`, `docs/mvp-setup.md`, and applicable repository instructions. Follow confirmed owner decisions over proposed defaults. A mockup or local-only demo does not fulfill the complete MVP, but local development should proceed while external services are being arranged.

## Confirmed scope

- iOS app and share extension, Chrome capture extension, and browser learning interface.
- Email verification codes plus Sign in with Apple; shared account-owned data across clients.
- English-only menus, settings, and system messages in the MVP. Generated languages remain user-configured with no fixed pair/default.
- Source-language detection per capture; wordlists may mix source languages.
- One vocabulary card covers the word's common dictionary meanings. Do not split senses into separately scheduled cards by default.
- One front and separate language-specific backsides. Each backside explains the same ordered meaning inventory in its own language.
- MVP content modules are **Explanation and Examples only**. Architecture is extensible; standalone Translation, Synonyms, and Etymology are deferred and absent from MVP controls.
- Every included meaning has one explanation. When Examples is enabled on a backside, every explanation has exactly one matching example. No independent example-count setting.
- Example-language presentation is configured once per wordlist; Example on/off remains per backside.
- Interesting languages independently filter nonblocking tags about other source-language matches. They are not output languages or a hard source whitelist.
- Every card has exactly one schedule. At least one language is Essential; select one Essential language per review. Optional pages appear according to quiz settings.
- Quiz interaction is mental recall → reveal the selected Essential answer → self-rate Again/Hard/Good/Easy. No typed-answer grading, multiple-choice scoring, or LLM grading.
- A one-time allowance of **100 generations per account**, counting **each language backside separately**, including all its meanings/modules. No monthly renewal or payment integration.
- Measure actual costs before designing the overall operating budget and paid tiers.
- The owner has no Apple Developer, AI-provider, hosting accounts, or domain yet.
- UI is **futuristic classicism**, expressing the classical character of Vocabularium's name and a contemporary identity.

Do not re-ask these settled decisions. Ask about material new ambiguities while continuing independent work. Select appropriate frameworks, providers, and minimum platform versions with current documentation. Proposed defaults in the spec—rotation, common-sense coverage, input limits, and regeneration/settlement rules—can be refined transparently during implementation.

## Model entries, meanings, pages, and schedules separately

Use stable IDs for accounts, captures, lexical entries, meaning inventories, individual meanings, cards, backsides, revisions, jobs, and review events.

Resolve the source lexical entry and create an ordered inventory of distinct common meanings before generating destination pages. “Dictionary-style” is a presentation/coverage goal, not a claim to copy a specific dictionary or enumerate every historical sense. Context can mark/prioritize a relevant meaning without silently reducing a multi-meaning word to one. Evaluate coverage and avoid duplicate paraphrases counted as new meanings.

All backside languages use the same meaning IDs and ordering. Store explanation and example results against those IDs, never only matching array positions or LLM labels. An identical spelling in another source language is an alternative lexical entry, not an extra sense mixed into this one.

Generate one explanation per meaning in each page's language. If Examples is on, validate exactly one matching example for every explanation: no missing IDs, duplicate examples, extra entries, or sentences that all illustrate one sense despite matching counts. A sentence with its translation is one example.

Each wordlist selects original plus current-page translation, original only, or current-page-language-only example presentation. The last mode illustrates the meaning's equivalent rather than necessarily the source word's grammar. Avoid duplicate rendering when languages coincide. Do not leak another configured output language into the active page.

Explanation is the MVP base answer module; Examples depends on it. Preserve module registration interfaces for settings, instructions, schemas, validators, and renderers. Expose only implemented modules; do not build placeholder etymology/synonym switches.

## Capture and generation

Provide explicit Paste and share-sheet capture with a default destination and optional change. Read clipboard only on user action. Save captures and configuration snapshots durably before confirmation; distinguish local save from authenticated server acceptance.

Do not assume every iOS app shares selected text/context. URL-only sharing needs a selection/paste fallback. Coordinate the app/share extension's durable storage in an App Group container. Preserve unsubmitted work through termination/offline restart; server generation continues after durable acceptance.

Chrome selection capture uses the same account and a persistent outbox. Its service worker must be restartable without losing jobs. Browser study provides the same separate language pages and review behavior.

The server harness owns authorization, bounded input/output, quota reservation, source/meaning resolution, structured generation, validation, bounded repair/retry, compatible revision publication, and provenance. One model call may cover compatible modules/pages, but retain per-page status, recovery, and usage settlement.

Preserve valid siblings and last-known-good revisions on failures. A completed page needs all explanation entries and matching enabled examples. Missing data is incomplete/failed, not silently complete. Require valid Essential pages for scheduled review; failed Optional pages do not block an otherwise usable card.

Treat source/context as untrusted data, never instructions. Keep provider keys server-side; give the generator no arbitrary execution tools. Render structured text safely and minimize private data in diagnostics. Structural validity alone does not establish linguistic quality.

## Source language and interest tags

Use expression, available sentence, and explicit hints/corrections. Page language is weak evidence. Output languages, interface locale, nationality, and script alone do not determine source language. Preserve original spelling, capitalization, diacritics, and context.

Represent supported/inferred interpretations, mixed-language expressions, and honest unknown/unsupported results. Generate the plausible primary lexical entry and show supported additional-language tags only when the alternative language is interesting and differs from the selected source.

With English/German/French interesting, a Tagalog alternative alone yields no tag. A French match can yield a tag without a French backside. Empty interests disables hints, not generation. Preference changes filter/enrich hints without regenerating all pages.

Tags open meaning previews in the active backside language. Viewing them does not automatically generate another card or consume allowance. Explicitly learning another lexical entry requests its own backsides. Unknown input stays saved with context/correction options.

## One-time free allowance

Grant 100 units once per account. A completed English backside costs one; English and German cost two even if the word has three meanings and each page contains three examples.

Implement server-authoritative atomic reservations and settlement. Proposed rules: reserve the full requested page set before generation; charge once per valid published page; release failed/cancelled reservations; partial jobs charge only successes. Reject insufficient allowance with an actionable message rather than silently dropping languages.

Automatic repair/retry, duplicate delivery, and replay of the same logical request cannot charge again. Existing-card reuse, review, browsing, sync, and non-generating settings edits are free. Proposed rule for explicit successful user regeneration: one unit per requested backside, disclosed before submission; automatic repairs remain part of the original request.

No monthly renewal, reset on reinstall/login, or new allowance for linking another sign-in method to the same account. Exhaustion blocks new generation while preserving saved captures and existing learning. Do not create an unimplemented checkout or promise a reset date.

Record actual provider usage/cost, pages, meaning counts, modules, repairs, latency, and failures. The free grant is not an estimate of provider cost or authorization for unlimited paid services. Keep operational limits; design commercial budgets and paid tiers later.

## Quiz, configuration changes, and scheduling

One active scheduler state/due time belongs to the card, never a meaning or language page. Select exactly one Essential language before recall and freeze its content/meaning/policy version. Display the target language clearly and use its page as the right/reference answer.

Proposed self-assessment instruction: recall the included common meanings on the selected page as a whole. Do not silently introduce per-sense targets or scores. Users give one card rating. Optional pages cannot satisfy a forgotten Essential answer or lower successful Essential recall.

Rotate through Essential languages across completed reviews as the draft selection method. Persist the attempt so restart, retries, abandonment, or navigation cannot reroll the target or call the scheduler. After reveal, other pages are supplementary and follow visibility settings.

Reject zero-Essential configurations. Applying changed roles preserves history/schedule; newly required missing content queues generation and pauses eligibility. Module/page regeneration retains meaning IDs. Changing the meaning inventory creates coordinated entry/page revisions, preserving old tested snapshots and schedule by default. Correcting to a different source lexical identity creates the appropriate new card while retaining the old history.

Pin a maintained FSRS implementation and verify compatible client/server behavior with fixtures. Use documented defaults and proposed 90% desired retention. Store due instants in UTC; define local days, clock skew, and offline recovery.

Persist one review event and transition atomically, retaining device/time/base revision and actual selected language/meaning/content snapshots. Reconcile concurrent offline reviews per card deterministically even if target languages differ. Preserve observations and identify which affect scheduling/rotation; never fork language schedules, double-apply duplicates, or replace history with last-write-wins.

## Authentication, sync, and setup

Implement email verification codes and Sign in with Apple through one account system. Keep identity links verified, use expiring single-use codes with bounded attempts, and handle session expiry. Do not link accounts based solely on an unverified email claim.

Enforce account ownership for data, jobs, quota, and sync. Sign-out/switching cannot expose another account's cache or upload its outbox. Support export/deletion and prevent late jobs or stale devices from resurrecting deleted content.

Sync wordlists/policies, interests, presets, captures/interpretations, meaning inventories, backside revisions/status, allowance, card schedules, reviews, and deletions. Use durable outboxes, stable mutation IDs, revisions, cursors, deletion markers, and explicit stale-edit conflict handling.

No external service accounts exist yet. Prepare local development modes and provider/auth integration boundaries, setup instructions, and configuration examples without secrets. Real email/Apple sign-in, hosted AI, distribution, and deployed sync require later service configuration. Development substitutes must be restricted and labeled; do not present them as live verification.

## Futuristic classicism

Follow `docs/ui-guidelines.md`: a classical library imagined in the near future. Combine sculptural typography, architectural spacing, mineral surfaces, a distinctive page index, precise contemporary controls, and restrained light/depth. Keep ordinary screens identifiable even without illustration/motion; avoid a generic template or decorative historical props.

Present numbered meanings with their matched examples directly associated, within one language page. English interface labels remain separate from generated prose. Preserve correct script typography, Unicode/RTL, light/dark mode, enlargement, keyboard/screen-reader behavior, reduced motion, and no answer leakage. Develop the main review flow with real content early, then reuse tokens/components across capture, lists, presets, iOS, and browser.

## Delivery and verification

Implement the domain/generation/quota/auth/sync foundations and local development path, then the iOS loop and Chrome/browser clients. Prove real iOS share behavior when full Xcode/device setup is available. Deliver the complete confirmed platform scope; do not stop at mocks or a landing page.

Verify three-meaning entries, exact explanation/example pairing, Examples off, all page-language combinations, independently selected interests, stable sense IDs, wrong-language/invalid output, quota concurrency/partial failure/retry, 100-unit exhaustion, auth isolation, offline restart, conflicting reviews, and deletion during generation.

Use speaker evaluation for common-meaning coverage and natural examples across scripts/languages. Validate UI states with screenshots of real flows. Record actual cost measurements for later budget planning.

Deliver code, local setup and service-provisioning instructions, secret-free configuration examples, meaningful test/visual results, and concise limitations. Clearly distinguish local substitutes, implemented adapters, and integrations actually verified with real services/devices.
