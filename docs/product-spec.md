# Vocabularium — product specification

Draft 0.6 · 5 September 2026 · Confirmed MVP scope and generation allowance.

## 1. Product promise

**“I do not understand this word. I may not even know which language it is. Explain it in the language(s) I choose, create my flashcard, and help me remember it.”**

Vocabularium is a public vocabulary-learning app with accounts, cross-device synchronization, and app-provided AI generation. Users share or paste a word or short expression. The app detects its source language, identifies its common dictionary meanings, and generates personalized learning content.

A vocabulary card has one front and separate language-specific backsides. Each backside covers the same common meanings, explained in its destination language. When Examples is enabled, every explanation has exactly one matching example.

Every flashcard has exactly one review schedule. At least one backside language is Essential. Each review selects one Essential language as that attempt's right/reference answer. Optional languages can appear in quizzes according to configuration, without creating additional schedules.

## 2. Confirmed MVP decisions

| Area | Confirmed behavior |
| --- | --- |
| Platforms | iOS app/share extension, Chrome capture extension, and browser study. |
| Accounts | Public app with email verification codes and Sign in with Apple. |
| Sync | Wordlists, settings, cards, generated content/status, and learning history synchronize across devices. |
| Generation | Vocabularium provides AI; learners never supply provider keys. |
| Free tier | A one-time allowance of 100 generations per account. Each generated language backside counts separately. |
| Commercial scope | Measure actual costs first; overall operating budget and paid tiers will be designed later. No subscriptions/payments in this MVP. |
| Interface language | English menus, settings, and system messages only; structure strings for later localization. |
| Content languages | User-configured; no fixed source/target pair or default content language. English UI does not imply English answers. |
| Modules | Explanation and Examples only. Keep the module architecture extensible. |
| Meanings | One card covers a word's common dictionary meanings. Do not automatically split them into separately scheduled cards. |
| Example count | Exactly one example for each explanation/meaning when Examples is on. No independent example-count setting. |
| Backside configuration | Separate destination-language pages with independent module selection and Essential/Optional roles. |
| Example presentation | Configurable once per wordlist; applies to every backside with Examples enabled. |
| Interesting languages | Separate user-selected set filtering tags about additional source-language matches; independent of backside languages. |
| Review | Mental recall → reveal → self-rate Again/Hard/Good/Easy. Select one Essential language per review and update one card schedule. |
| UI identity | Futuristic classicism: classical/Greco-Roman character integrated with precise contemporary interaction. |
| Existing resources | The owner currently has no Apple Developer, AI-provider, or hosting accounts and no domain. |

The product decisions above are settled. Proposed implementation defaults are labeled below and can be refined with evidence: rotation among Essential languages, same-account quota settlement/retry rules, common-meaning selection, and practical input limits.

Provider/model, hosting vendor, minimum OS versions, and numerical quality gates remain engineering choices. Production credentials, service setup, and distribution must be arranged before live verification. See [MVP setup and delivery](mvp-setup.md).

## 3. Core concepts and identity

| Concept | Responsibility |
| --- | --- |
| Account | Owns preferences, wordlists, cards, reviews, devices, and a one-time generation allowance. |
| Wordlist | Groups vocabulary from potentially different source languages; uses a preset and has example/quiz policies. |
| PresetVersion | Immutable ordered backside specifications: output languages, roles, and module settings. |
| Capture | Original expression, supplied context/source, destination list, and configuration snapshot. |
| Interpretation | Selected source-language/lexical interpretation, inferred/unknown status, and eligible alternative-language matches. |
| Vocabulary entry | One source-language expression with an ordered inventory of common meanings and original occurrences. |
| Meaning | Stable application-assigned ID, source-sense description, and part of speech where applicable. |
| Flashcard | One front linked to the vocabulary entry, separate backsides, and one scheduler state. |
| BacksideRevision | One language's explanation/example results keyed to a specific meaning-inventory revision. |
| QuizPolicy / ReviewAttempt | Essential-language set, optional visibility, and one frozen answer language/reference version per attempt. |
| ReviewEvent | One card rating, target-language/content snapshot, and one scheduling transition. |

Several meanings within the selected source language belong to the same vocabulary card. An identical spelling in another source language is a separate lexical interpretation, discoverable through interesting-language tags. Do not merge unrelated languages into one meaning inventory.

Use stable entry, meaning, backside, card, and mutation IDs. Adding a backside does not duplicate the word. Repeated captures of the same lexical entry in the same account/list may add source occurrences without generating duplicate cards or charging again.

## 4. Main journeys

### Account and wordlist setup

1. Sign in through an email verification code or Sign in with Apple.
2. Name a wordlist and explicitly select one or more backside languages.
3. Configure Explanation/Examples per backside and mark at least one language Essential.
4. Arrange page order and configure the wordlist's example presentation and optional quiz visibility.
5. Save the preset and choose a default destination list for quick capture.

Explanation supplies the MVP's answer content and is required on Essential pages. Examples depends on explanation entries and cannot be enabled without them. An optional backside may be omitted from quizzes without changing its saved content.

Source language uses Detect automatically. Users can supply a hint or correction, but knowing the source language is never a capture prerequisite. A list can contain words from French, Japanese, German, or other languages with the same output settings.

Interesting languages is a separate account preference. Do not infer it from output languages or device locale. An empty set disables alternative-language tags, not generation.

### Capture on iOS

Select text in a source app, choose Vocabularium from the share sheet, confirm the destination, and tap Add. Save the capture durably before acknowledging it. Submit generation when authenticated and connected, then let the user return to the source app.

Provide Paste a word in the main app and read the clipboard only after that action. Accept short expressions; reject empty input. Proposed input limit: 120 user-perceived characters. Offer a way to select the intended expression from longer input instead of silently truncating it.

The extension receives only the items the source app supplies. Selected text, surrounding context, and URLs are not universally available. URL-only input needs a word-selection/paste fallback. Verify representative host apps on a real device. [Apple Share extension guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html)

### Chrome capture and browser study

The extension provides Add to Vocabularium in the selection context menu, with account sign-in, destination selection, and pending/failure status. Chrome can supply the selection and page URL; surrounding sentences require a separate, explicitly scoped capability. [Chrome context-menu API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus)

The browser interface supports wordlists, presets, card browsing, and full review using the same account and separate language pages as iOS. Desktop Chrome is the proposed extension target.

### Study

1. Select a due card once.
2. Choose one Essential language and freeze the attempt's policy/content versions. Display “Answer in …” with the front expression.
3. Attempt recall, reveal the selected language's explanations, and inspect its paired examples if enabled.
4. Explore other backsides separately after reveal, subject to optional visibility settings.
5. Give one Again/Hard/Good/Easy rating based on recall of the selected Essential answer.
6. Persist one review event and one new due time, then synchronize.

The selected answer page covers the included common meanings. Proposed MVP self-assessment instruction: assess recall of that page's meaning set as a whole; do not silently select a single sense, issue per-meaning grades, or create per-meaning schedules. Again indicates forgotten required content; Hard indicates recall with difficulty. No typed-answer checking, multiple-choice scoring, or LLM grading is included.

When multiple languages are Essential, select exactly one per attempt. Proposed selection method: rotate through the configured Essential-language order across completed reviews. Persist the selection so restart, retry, page navigation, and abandoned attempts cannot reroll it or advance the schedule.

If German is Essential and English Optional, English cannot satisfy or override the German assessment. If both are Essential, a review might test German and the next English; both update the same card schedule.

### Edit configuration and recover content

Offer Regenerate, Correct interpretation, Report an issue, and Delete without requiring manual card authoring. A module/backside regeneration keeps the entry's meaning inventory fixed and preserves valid siblings and review history.

Changes to the actual meaning inventory create a new coordinated entry revision. All current backside results must reference compatible meaning IDs; prepare replacements without mixing old and new inventories. Preserve prior content/review snapshots and existing schedule by default, and indicate changed learning content. A correction to a different source-language/lexical identity creates the appropriate new card and retains/archives the previous one.

Preset changes affect future captures unless explicitly applied to existing content. Quiz-role changes can be applied without content regeneration if required explanations already exist. Reject removal/demotion of the last Essential language. Freeze active attempts so mid-session updates affect subsequent attempts.

## 5. Explanation and Examples modules

### A shared meaning inventory

First identify a source-language lexical entry and its common, distinct dictionary-style meanings. Assign stable meaning IDs before generating backside content. Use the same IDs and ordering in every language.

“Dictionary-style” describes organization; the MVP does not claim to reproduce a specific dictionary or every historical/technical sense. Proposed selection rule: include distinct everyday meanings, with specialized meanings when the supplied context warrants them. Context can prioritize or mark a relevant meaning, but must not silently reduce an ordinary multi-meaning word to one explanation. Avoid duplicate paraphrases counted as new senses. Establish practical coverage/output bounds through evaluation and disclose incomplete results instead of claiming exhaustive coverage.

Different source-language interpretations remain separate from multiple meanings within one source language. A Tagalog alternative discovered through interest filtering does not become an extra meaning on an English lexical entry.

### Per-backside configuration

Illustrative user choices, not default languages:

| Setting | English backside | German backside |
| --- | --- | --- |
| Role | Optional | Essential |
| Explanation | On | On |
| Examples | Off | On |

With three included meanings, English has three explanation entries; German has three explanation entries and three matching examples. Both pages refer to the same three meaning IDs. They remain separate pages.

- **Explanation:** one concise explanation per meaning in the backside language, with appropriate part-of-speech/context distinctions.
- **Examples:** exactly one natural, original example per explanation/meaning when enabled. Its language presentation follows the wordlist policy.
- **Examples off:** no example records are generated or rendered on that page.

The invariant is based on a one-to-one relationship, not just equal array lengths: every explanation's meaning ID must have exactly one corresponding example, with no duplicates, missing matches, unrelated examples, or extra meanings. Three explanations paired with three examples all illustrating the first meaning is invalid.

An example plus its translation is one semantic example, not two. When original sentences are reused across backsides, translations must preserve that same meaning. A translated explanation can need different wording, but it cannot merge/split sense IDs independently on one page.

Examples has no separate numeric count setting. Enabling it derives the number from the explanation inventory. In the MVP, Explanation is the base module; Examples depends on it. Keep the registry/interfaces extensible for future modules, while exposing only implemented functionality.

### Wordlist-level example presentation

Proposed option labels:

- **Original + translated:** one sentence in the source language, with its translation into the current backside language.
- **Original only:** one source-language sentence per meaning; any accompanying prose uses the current backside language.
- **Backside language only:** one sentence in the backside language illustrating that meaning's equivalent; do not claim it demonstrates the original expression's grammar.

Apply the selected policy to every backside with Examples enabled. If source and backside language coincide, avoid duplicate rendering. A German page never gains English translations merely because English is another configured backside.

Version and snapshot the policy with generation settings. Changes affect future generation; regenerating existing example content is explicit and preserves scheduling.

### Validation and publication

A completed backside must have all explanation entries for its referenced meaning inventory and, when enabled, all matching examples. Missing explanations/examples create an incomplete/failed result eligible for bounded repair, not a silently “complete” page. Never fabricate extra meanings to satisfy a count.

Preserve old valid revisions while regenerating. Require usable completed Essential pages before scheduled review; a failed Optional page does not block an otherwise usable card. Show per-page status without silently substituting an optional language for a missing Essential answer.

Use language tags including script/region variants where appropriate, Unicode-safe storage, and per-field reading direction. Respect user-selected Chinese script variants. [BCP 47 language tags](https://www.rfc-editor.org/rfc/rfc5646)

Standalone Translation, Synonyms, Etymology, pronunciation/audio, images, and custom modules are deferred. Explanations in chosen destination languages still provide multilingual understanding; “Translation” need not be a separate MVP field. Do not expose empty/unavailable etymology or synonym switches in the MVP settings.

## 6. Source detection and interesting-language tags

Use selected text, supplied context, and explicit hints/corrections to resolve the lexical entry. Page language is weak evidence; output languages, presumed nationality, device locale, or script alone do not establish source language.

Preserve original spelling, capitalization, and context. Represent a resolved/inferred entry, mixed-language expression, or honest unknown/unsupported result. Do not silently “correct” unfamiliar words.

For usable cross-language interpretations, choose the most plausible primary entry and mark it inferred when context is insufficient. Show nonblocking tags for supported additional language matches that are in the interesting-language set and differ from the selected source. An unverified model suggestion should not be presented as an established lexical match.

With English/German/French interesting, an additional Tagalog match alone produces no tag; a French match can produce a tag even with only English/German backsides. Interesting languages filter hints, not the permitted input languages: a well-supported Tagalog input is still processable.

Opening a tag shows alternative meaning previews in the current backside language, one language page at a time. It does not rewrite a card, create another schedule, or initiate full generation automatically. Explicitly learning another source-language entry creates a separate card and requests its own backsides subject to allowance.

Filter known matches using current preferences. Removing an interest hides its tags without altering schedules. Adding one may require bounded enrichment, not regeneration of all answer pages. Absence of a tag is not proof that a word exists in no other language.

Unknown input stays saved with an option to add context or correct the expression. Cross-language overlap alone does not block generation. Model self-reported confidence is not a sufficient quality gate.

## 7. Free allowance and generation harness

### One-time 100-generation allowance

Grant 100 units once to the account. One successfully completed language backside consumes one unit, including its enabled modules and all meanings.

Examples:

| Request | Units |
| --- | ---: |
| One word, three meanings, English backside | 1 |
| One word, three meanings, English and German backsides | 2 |
| Add a French backside to an existing English/German card | 1 |

Proposed settlement rules for implementation:

- Reserve required units atomically before starting requested backside work. Require enough available units for the submitted set; let the user explicitly reduce it if needed rather than silently dropping languages.
- Commit one reserved unit when that requested backside is valid and published. Release reservations for terminal failure/cancellation. A partial job charges completed pages only.
- Network retries, automatic content repair, delivery duplicates, and resuming the same logical request do not consume additional user units. Repeated ordinary capture of an already-generated entry reuses it without charging.
- An explicit user-requested successful regeneration of a backside consumes one unit, even when regenerating a module. State this before submission. This is a draft billing rule, distinct from free automatic repair.
- Browsing, review, sync, settings changes without generation, and hiding/showing optional pages consume no units.
- The allowance does not renew monthly or reset on sign-in, reinstall, or adding another sign-in method to the same account.
- At exhaustion, keep existing review/browsing/sync functional and retain saved captures. Explain that further generation is unavailable. Do not show an unimplemented paid checkout or invent a renewal date.

The 100 free units are a user-facing allowance, not a provider-cost estimate or authorization for unlimited service spending. Track actual requests, input/output usage when available, meaning count, backside count, repair attempts, latency, and cost. Design an overall budget and paid tiers after measurements. Keep operational request/output/concurrency/attempt limits even while commercial pricing is deferred.

### Harness pipeline

1. Persist capture and snapshots locally; distinguish local save from authenticated durable server acceptance.
2. Authorize ownership, validate input/configuration, and reserve quota for requested backsides.
3. Resolve source entry and create/reuse a stable common-meaning inventory; identify eligible alternative-language tags.
4. Generate per-language explanations and, when enabled, one matching example per meaning.
5. Validate schemas, language/script, sense-ID coverage, example pairing, semantic consistency, and requested presentation.
6. Repair/retry within bounds, independently per failed page; preserve valid siblings.
7. Publish compatible content revisions atomically and settle quota exactly once.
8. Record provenance and actual provider usage without routine logging of private text or secrets.

Selected text and context are untrusted data, not instructions. The generator gets no arbitrary execution tools. Render structured content safely. Schema correctness alone does not prove linguistic accuracy; evaluate meanings and examples with speaker review.

Capture, interpretation, page generation, quota reservation, and sync each have explicit durable states. Timeouts or app termination must not leave a capture lost, a reservation permanently stranded, or a published backside double-charged.

## 8. Scheduling

Use a maintained FSRS implementation, pinned to a documented version and verified with fixtures. Proposed starting desired retention: 90%; it is a scheduling target rather than a learning guarantee. [FSRS algorithm documentation](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm), [Anki FSRS guide](https://docs.ankiweb.net/deck-options.html#fsrs)

- Exactly one scheduler state/due time per card, never per meaning or backside.
- One completed review attempt gives one rating and one scheduling transition.
- Page views, language navigation, generation, and adding examples never advance the scheduler.
- Proposed daily new-card allowance: 10, configurable; prioritize due reviews.
- Save review events and state atomically, with selected Essential language, meaning/content revision, policy, device, occurrence/receipt times, and base scheduler revision.
- Freeze the answer language and reference content during an attempt.
- Store due instants in UTC; define local day boundaries and clock-skew handling.
- Support offline review and recovery after restart.
- Use compatible client/server algorithm and parameter versions.

Changes to generated wording, example settings, and page roles preserve history/schedule. Keep the tested meaning/content revision on past reviews. Reverse/cloze modes, automatic learner grading, and parameter optimization are outside the MVP.

## 9. Architecture, authentication, and synchronization

Proposed components: native iOS app/share extension with local persistence; Chrome capture extension; browser learning interface; authenticated backend/database; durable generation workers; explicit sync APIs. Framework/provider selections remain engineering choices.

The iOS app and extension should coordinate durable writes in an App Group container. After server acceptance, generation continues independently; before acceptance, preserve local pending captures and resume through supported delivery opportunities. Test interruption/background transfer on devices. [Apple shared-container/background-transfer guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html)

Chrome pending work must survive service-worker termination and resume from storage on appropriate events. [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

### Authentication and service setup

Implement email verification codes and Sign in with Apple on the relevant clients through the same account system. Configure production email delivery and Apple app/web integration when services exist. Development substitutes must be explicit and restricted to development; they do not verify real sign-in.

Enforce ownership on every object, job, allowance, and sync operation. Use bounded, expiring, single-use email codes and request/attempt limits. Session expiration, sign-out, and account switching must not expose another account's cache or submit its outbox. Link sign-in methods only through verified account flows; do not merge accounts merely because a client claims the same email.

Keep provider credentials server-side. Support account export/deletion. Cancel deleted work and prevent late jobs from recreating deleted data. Minimize source/context shared with the generation service and avoid collecting entire pages/history by default.

### Sync contract

Synchronize wordlists/policies, interests, presets, captures/interpretations, meaning inventories, backside revisions/status, quota availability, card schedules, reviews, and deletions.

Use durable client outboxes, stable mutation IDs, entity revisions, change cursors, and deletion markers. Retain conflicting edits or surface them rather than overwriting newer configuration with stale offline edits.

Reconcile concurrent reviews deterministically per card even when devices selected different Essential languages. Preserve actual language/content snapshots and identify which events affect scheduling/rotation. Do not fork schedules by language, apply duplicates twice, or use last-write-wins on review history. Return the canonical card schedule.

Prevent stale clients from resurrecting deleted entries. Refresh on foreground and expose last-sync/errors. Proposed test target: active online clients converge within five seconds under normal conditions, not an OS background-delivery guarantee.

## 10. Minimum data model

| Entity | Essential responsibilities |
| --- | --- |
| Account / Device | Identity, linked sign-ins, output/interest preferences, sessions, device ID. |
| AllowanceGrant / Usage | One-time 100-unit grant, atomic reservations, committed per-backside usage, releases, measured provider cost. |
| Wordlist / PresetVersion | Owner, backside roles/modules/order, example/quiz policy snapshots. |
| Capture / Interpretation | Original text/context, lexical/source identity, hints, alternative matches, delivery state. |
| Entry / MeaningInventory | Stable lexical entry; immutable ordered meaning IDs/descriptions and source metadata. |
| GenerationJob / BacksideWork | Requested pages, stable IDs, reservations, attempts/status, provenance. |
| BacksideRevision | Language, meaning-inventory version, explanations keyed by meaning ID, optional paired examples, validation state. |
| Card / QuizPolicy | Front/entry, pages, Essential set, select-one strategy, optional visibility. |
| ReviewAttempt / ReviewEvent | Stable attempt, selected language, meaning/content/policy snapshots, one rating/transition. |
| ReviewState / Sync metadata | One schedule per card, selection metadata, entity revisions/cursors/deletion markers. |

Generated array positions and model-written labels are not stable identity. A page may not publish against a different meaning inventory than its card's current revision. Credentials are excluded from exports and source control.

## 11. UI and delivery

Follow [UI and visual guidelines](ui-guidelines.md): **futuristic classicism**, with the creative brief “a classical library imagined in the near future.” Use sculptural typography, architectural spacing, mineral reading surfaces, a distinctive page index, and precise contemporary behavior.

The MVP interface is English; generated pages use user-selected languages. Present meanings as ordered explanation entries with their paired example directly associated when enabled. Keep different backside languages on separate pages. Support multilingual fonts, right-to-left fields, enlargement, light/dark appearance, keyboard/screen-reader operation, and reduced motion. English chrome must not leak into generated explanations.

Screens: sign-in/onboarding; Review; Wordlists/search; Add/share; per-language Explanation/Examples preset controls and wordlist quiz/example settings; account/interests/allowance/sync/export/deletion settings. Do not expose later modules or payment screens.

Milestones:

1. **Foundation:** contracts for multi-meaning entries, per-backside modules/quota, one card schedule, auth/sync, and local development substitutes. Prove iOS share intake once Xcode is available.
2. **iOS learning loop:** real account → capture → common meanings → per-language content → self-rated review → synchronized schedule; verify on a second installation/device.
3. **Chrome and browser:** authenticated selection capture and full study against the same account, with offline/conflict recovery.
4. **Live verification:** configure required services, test actual email/Apple sign-in, AI generation/usage, synchronization, device sharing, and distribution readiness. Record which checks were actually performed.

Local work need not wait for commercial setup. A development generator/auth substitute is useful, but does not fulfill live integration or production readiness.

## 12. Acceptance and evaluation

- English menus coexist with independently chosen generated languages and mixed-source wordlists.
- Sign-in works through both email codes and Apple once configured; development substitutes are labeled.
- Only Explanation and Examples are available as MVP modules.
- One word with three common meanings remains one card: three explanation entries per language page, and exactly three meaning-matched examples when enabled.
- Examples off yields no examples. A translated example pair counts as one example. No fixed example-count setting exists.
- All pages share compatible meaning IDs/order; duplicate or mismatched examples fail validation.
- Context can prioritize a meaning without silently discarding the rest of the common inventory.
- An English explanation-only page and German explanation-plus-examples page remain separate.
- Each account receives 100 units once. One generated English page costs one; English plus German costs two, regardless of the included sense count.
- Quota reservation/settlement is atomic across concurrent devices; duplicates and automatic repair do not double-charge.
- Failed/cancelled work releases reservations; successful pages of a partial job charge exactly once.
- Exhausted allowance preserves capture/browsing/review/sync without an invented reset or checkout.
- At least one language is Essential; one Essential language is selected per attempt and one card schedule advances once.
- Multiple meanings, page changes, and optional-page exposure never create additional schedules.
- Generation/role/content updates preserve appropriate history and active-attempt snapshots.
- Capture survives share dismissal, interrupted delivery, offline restart, and worker termination.
- Interest-filtered tags respect the independent interesting-language set.
- Account isolation, safe account switching, export/deletion, stale-client reconciliation, and no resurrection are verified.
- Scheduling matches pinned-version fixtures; concurrent offline observations are retained without duplicated transitions.
- Implemented main screens meet the companion visual guideline across scripts, layouts, appearances, and accessibility settings.

Evaluate common-meaning coverage, duplicates/omissions, meaning-example semantic pairing, cross-page alignment, false source-language tags, unknown input, shared scripts, inflection, transliteration, same-source/target explanations, Chinese variants, and right-to-left content. Include speaker evaluation; structural checks/model confidence do not establish universal language quality.

Measure generation cost per completed backside, sense count, enabled modules, language/script, repairs, failure rate, latency, and user intervention. Use these observations to design later budget and paid tiers.

Deferred: standalone Translation, Synonyms, Etymology and its reference integration, audio/images/OCR, voice input, bulk document mining, social decks, full manual editor, Android, reverse/cloze modes, automatic learner grading, exact Anki interchange, non-English interface localization, subscriptions, and payment processing.
