# Conflicts

Full text of the [traceability map](../traceability-map.md#conflicts)'s conflicts.

Contradictions between entries, or between an entry and the specs. Numbering continues across entries; new conflicts go on top. C1–C14 came from the questionnaire pass and are all resolved: each records the original contradiction and the decision, and the affected answers were updated to match.

<a id="c33"></a>
**C33. Every facet is markdown versus audio — RESOLVED (D24: text stays markdown, audio attached).** [D09](../traceability-map.md#entries) stores each facet as markdown, and [modules](../../specs/modules.md) has only text outputs. *Resolution* (owner, 30 October 2026): a facet's text stays markdown (the Pronunciation facet's lines; the Pronunciation core's top line); audio is an attachment to its component, one clip per line, in its own table, and resolves K29 for audio only. Images and notation stay deferred.

<a id="c32"></a>
**C32. One pinned model versus a speech provider — RESOLVED (D24: one pinned model per provider kind).** [Q46](../questionnaire/answers/answers-09-generation-and-llm.md#q46) and [K28](../traceability-map.md#clarifications) keep one pinned model, OpenCode the only provider. *Resolution* (owner, 30 October 2026): one pinned model **per provider kind**: one text model, one ElevenLabs speech model; changing either needs its own review ([C8](../traceability-map.md#conflicts)), the speech one a listening review.

<a id="c31"></a>
**C31. No partial success within a component versus audio that fills in later — RESOLVED (D24: per-clip success for audio only).** [Capture and generation](../../specs/capture-and-generation.md) discards a failed attempt's partial output, and D08 allows no partial success within a component. *Resolution* (owner, 30 October 2026): as D17's heavy-facets direction foresaw, for audio only: the text attempt keeps its all-or-nothing rule; each clip succeeds or fails on its own, with its own Retry, and the card's text stays.

<a id="c29"></a>
**C29. Explanations in a dialog and beneath a facet-window row versus pages in one sheet — RESOLVED (D20: pages in one sheet).** [Modules](../../specs/modules.md#explanations), [shared UI](../../specs/shared-ui.md#module-window) and [pages and editing](../../specs/pages-and-editing.md#facet-window) open a module's explanation in a dialog from a round ⓘ (D13, D18), expand a facet's beneath its row in the facet window (D13) and open it in a dialog from a facet's About on a card (D18). D20 replaces all three with pages in one sheet.
*Resolution* (owner, 29 October 2026): D20 supersedes those parts of D13 and D18; the facet window keeps its ticks and gains a › per row, the module window's ⓘ becomes **About German**, and acceptance criteria 31–32 of pages and editing are rewritten for the sheet.

<a id="c30"></a>
**C30. The deck-settings preview's sample versus the retired 幸福 sample — RESOLVED (D20: the new samples in the interface language).** A module's `sample.json` is both its explanation's sample and the sample the deck-settings preview shows ([modules](../../specs/modules.md#explanations), [generation](../generation.md#module-catalog)). D20 retires the 幸福 sample and adds a sample set per interface language.
*Resolution* (owner, 29 October 2026): the deck-settings preview shows the new set's word sample in the interface language (*language* in English, 语言 in Chinese), with the facets the deck has; `sample.json` is replaced by the per-language samples.

<a id="c28"></a>
**C28. A Retry that keeps the card's reading versus D17's "nothing from an earlier attempt is reused" — RESOLVED (D19: the reading is a hint, never the text).** [Capture and generation](../../specs/capture-and-generation.md#retry) says each Retry generates anew and reuses nothing from an earlier attempt, and D17 says every generation is unique and never cached. D19 sends the card's current core with a Retry.
*Resolution* (owner, 29 October 2026): D19 reuses the card's reading as a hint, not its text: every core and facet text is written anew, and nothing is cached. The spec sentence becomes "nothing from an earlier attempt is reused except the card's reading, given as a hint".

<a id="c27"></a>
**C27. A Formula facet versus D16's rejected formula control flow — RESOLVED (D17: an opt-in facet for subject keys).** The D16 ranking found no support for a control flow that adds a formula when the concept has one; D17 adds a Formula facet decided by a flag.
*Resolution:* The Formula facet is opt-in, applies only to keys in the subject, and leaves the core as D16 defines it; the owner's review (K55) decides whether it stays.

<a id="c26"></a>
**C26. One interpretation per run versus a classification per Languages card — RESOLVED (D17: per card, in its header).** D08 has one interpretation per run, shown under the main key, that chooses each parent's core and facets; D17 lets each Languages core decide word or sentence and show it in its header.
*Resolution:* D17 supersedes D08's interpretation. It stays not correctable, as in D08.

<a id="c25"></a>
**C25. A module already on the page marked in the window versus no mark — RESOLVED (D13: no mark).** The [module window](../../specs/shared-ui.md#module-window) says when a module is already on the page (**Already here**), since the families of modules present also start open. D13 removes the mark.
*Resolution:* the mark goes; the families of modules on the page still start open, and the 12-module and single-Context limits still disable a module with their reason.

<a id="c24"></a>
**C24. Facets in the module window versus facets chosen on the parent — RESOLVED (D13: a facet window on the parent; first raised by D12, rejected).** D08 lists facets beneath their parent in the module window, added by dragging or with their **+**, and 0.7.2 places a **+** with several parents that would take the facet by a ghost of its tag on each. D12 moved the choice onto the parent and was rejected; D13 proposes it again for 0.8.1.
*Resolution:* **Facet** among a parent's actions, on a page and in deck settings, opens the facet window; the module window lists no facets, and ghost tags, which served only its **+**, are retired. K23's resolution still holds for a parent added with its core only.

<a id="c23"></a>
**C23. An empty component as only its tab versus folded — NOT PURSUED (D12 rejected).** D12 proposed that an empty component start folded instead of being only its tab ([D06](../traceability-map.md#entries), [D07](../traceability-map.md#entries)). D12 was rejected and D13 does not take this up, so an empty component stays only its tab.

<a id="c22"></a>
**C22. Live markdown formatting versus a toolbar editor — RESOLVED (D10: toolbar, no markdown in the editor).** D09's amendment edited each part with live formatting: typed markdown (`**`, `*`, `- `, `1. `, `` ` ``, `==`) turned into formatting as the user typed. The owner found it too technical and chose an editor that never reacts to markdown, with a formatting toolbar instead. Storage stays markdown per facet; what the user types is stored escaped.

<a id="c21"></a>
**C21. Render-only parsing versus structured content — RESOLVED (D09: structured content).** [C17](../traceability-map.md#conflicts) kept content stored as each module's markup text and parsed it only for display, so one malformed line made a whole card plain text, and editing exposed the markup. D09 stores a parent's content as structured data that the provider returns as JSON, renders it into fixed containers and edits it through fields, as [Q13](../questionnaire/answers/answers-03-frontend.md#q13)'s typed module blocks anticipated. The Context and Text modules keep plain text.

<a id="c20"></a>
**C20. Generation inputs versus a second parent of the same type — RESOLVED (D08: independent generation).** The [model](../../product/model.md#page-and-main-key) makes the main key and Context the only text inputs for module generation, and repeated generative instances generate independently. D08 has a second parent of the same type take a sense the others did not, which needs the senses those parents chose.
*Resolution:* the owner dropped the different-sense rule on 14 October 2026. A second parent of the same type is another independent generation, so the main key and Context stay the only text inputs.

<a id="c19"></a>
**C19. Module applicability versus the always-applicable core — RESOLVED (D08).** The [model](../../product/model.md#module-type-instance-and-output) and [modules](../../specs/modules.md#input-and-applicability) let a whole instance be inapplicable to the run's word/phrase-or-sentence interpretation, completing its component empty; every current type serves only one of the two. D08 makes a parent's core apply to both and moves applicability to facets.
*Resolution:* the interpretation keeps only word/phrase or sentence and selects the core's behaviour; it no longer chooses a source language, because the language of a key is often ambiguous (owner, 14 October 2026), so each parent's generation reads it from the key; applicability is judged per facet, and an inapplicable facet is left out of the component rather than shown empty. A whole parent can still be inapplicable only for an input it cannot serve at all, which no first-catalog parent has.

<a id="c18"></a>
**C18. Six module families versus the Translation family — RESOLVED (D08: Translation is a seventh family).** [D05](../traceability-map.md#entries) defined six families (Meaning, Usage, Roots, Connections, Sound, Notes) and allows a seventh only when a group fits none of them ([modules](../../specs/modules.md#module-families)). The owner names the families of this round Translation and Notes; a translation parent's facets span Meaning (core), Usage (Examples), Connections (Synonyms, Antonyms) and Sound (Pinyin).
*Resolution:* the owner chose on 14 October 2026 to add Translation as a seventh family. A parent belongs to one family, which colours its tab; facets have no family. Meaning, Usage, Roots, Connections and Sound stay defined without modules.

<a id="c17"></a>
**C17. Plain-text content versus rendered structure — RESOLVED (D05: render-only parsing); superseded for parent modules by D09 ([C21](../traceability-map.md#conflicts)).** [Shared UI](../../specs/shared-ui.md#text-content) shows component content as plain text with markup shown literally, leaving rich rendering to Q13 and Q59, which are still `Proposed`. D05 asks for numbered meanings and example–translation pairs, and the provider returns wiki-style markup (`== … ==`, `: [1]`, `::`).
*Resolution:* the owner decided on 12 October 2026 that the extension renders the current text format per content module and falls back to plain text when it does not recognise it. Stored content, prompts and the API stay unchanged, and the renderer builds elements, never HTML. Q13 and Q59 stay `Proposed` for a later block model.

<a id="c16"></a>
**C16. Capture with Context setting versus the Context module — RESOLVED (D02).** Q07, implemented in 0.4.1, made Capture with Context an on/off deck setting. D02 makes the Context a movable, deletable module.
*Resolution:* the owner decided on 10 October 2026 that the Context module replaces the setting: a deck captures Context when its configuration has the Context module. Release 0.4.1 keeps the setting until D02 is built.

<a id="c15"></a>
**C15. Live deck configuration versus page-owned modules — RESOLVED (D02).** Q72 had generation and retry use the deck's live configuration, so deck changes reached existing pages: added instances appeared as missing components and removed ones stayed marked as no longer configured. The owner wants each page shaped freely after creation, including deleting components for good.
*Resolution:* the owner decided on 10 October 2026 (D02). The deck configuration is copied onto a page when it is created and never affects it afterwards; generation and retry use the page's own module instances. Q72's page → component structure stands. Release 0.4.1 still implements the live configuration until D02 is built.

<a id="c14"></a>
**C14. Karte/seite model versus per-module generation — RESOLVED (Q72: deck → page → component).** Originally, Q29, Q31, Q32 and Q34 assumed a karte made of seites, each seite joining several module outputs, with a pinned layout revision per karte. Q13 versioned content per seite and Q53 referenced karte/seite IDs. Per-module retry and editing had no place in that model.
*Resolution:* the owner decided on 10 October 2026 ([plan](../../history/plans/page-component-refactor.md)). A page is an ordered list of components, one per content module instance; generation and retry use the deck's live configuration; views present pages, with only the default view in scope. Q31 is superseded; Q13, Q14, Q29, Q32, Q34 and Q53 are amended, and Q45 is answered. Existing content is discarded on upgrade, so C1's plain-text migration of existing seites no longer applies. Release 0.4.0 implements the model ([#81](https://github.com/Guccimane44/Vocalbularium/issues/81)); the specs, questions and answers now use page and component.

<a id="c13"></a>
**C13. Diagnostic content retention — RESOLVED (full content is development-only).** Originally, the [local diagnostics decision](https://app.notion.com/p/3ecbb1350208818b8156f754e52d4e4a) (Implemented, 2 October 2026) kept selected text, prompts and model outputs by default with no automatic expiry, while Q63 required redacted-by-default logs with per-page consent and expiry, Q39 time-limited logs, and C12 committed to GDPR deletion.
*Resolution:* full-content diagnostics remain a development-only mode (local backend, the owner's own data). The hosted product follows Q63 and Q39: redacted by default, user text only with per-page consent and expiry, time-limited retention. The local diagnostics decision is narrowed to development diagnostics. `codex/logging-system`, including the approved `observability.md` spec, is merged into this branch, so the refactor starts from that spec.

<a id="c1"></a>
**C1. Rich rendering — RESOLVED (option B: blocks at 1.0).** Originally, Q13 chose *Block JSON*, while Q59 chose *text-only rendering* and Q29 stored *no per-module blocks*.
*Resolution:* Q13 stands. Q29 now stores component content as a versioned block document (per component since Q72). Q59 now uses per-module render contracts: allowlisted block types, with all text escaped. The plain-text migration of existing seites was dropped when Q72 discarded that content. Q71 step 5 ("rendering/editor") now means refining the block editor, not introducing blocks.

<a id="c2"></a>
**C2. Identity provider — RESOLVED (OAuth + passkeys at 1.0).** Originally, Q17 chose *external identity*, while Q58 chose *passwords first, OAuth later*.
*Resolution:* Q17 stands. Q58 now uses delegated identity at 1.0 with no password store; server-side sessions, CSRF protection, and throttling stay. Providers, account linking, and recovery are open as K13.

<a id="c3"></a>
**C3. Client and platform list — RESOLVED (Chrome, Firefox, web app at 1.0).** Originally, Q01 named Chrome, Firefox, and iOS, while Q06 named Chrome, web, Firefox/Safari, and a desktop hotkey. Q10 assumed the hotkey was out, and Q11 planned only two shells.
*Resolution:* 1.0 clients are the Chrome extension, the Firefox extension, and the hosted web app. Safari, iOS, and the desktop hotkey are post-1.0. Q01 and Q06 are updated. Q10 (capture tokens deferred) and Q11 (extension shell + web shell) are now consistent as written.

<a id="c4"></a>
**C4. Version compatibility and updates — RESOLVED (N−1 window + store auto-update).** Originally, Q14 set a hard major.minor gate, while Q27 and Q64 set an N−1 window. Q15 chose a managed updater, while Q64 chose Web Store auto-update.
*Resolution:* the backend supports extension versions N and N−1 via `minCompatibleExtension`; older extensions see a "version too old, update from your store" message. The rest of Q14 stands: online-required, retired legacy terms, `incarnationId` reset detection. Q15 and Q64 now use browser-store auto-update for Chrome and Firefox, with no separate updater. The web app deploys with the backend and needs no window.

<a id="c5"></a>
**C5. Semantic referent — RESOLVED (string only by default; opt-in interpretation line).** Originally, Q29/Q30 chose *string only*, while Q71 step 2 was *main-key + semantic referent*, and the [model](../../product/model.md) promises "semantic continuity".
*Resolution:* there is no referent at 1.0. String only (main key + Context) is the default. A setting, off by default, adds an editable interpretation line per page that later generations use. Q71 step 2 is now "main key + Context (+ opt-in interpretation)". The model's continuity section becomes: interpretation line at 1.0, full referent post-1.0. Details are open as K14.

<a id="c6"></a>
**C6. Automatic retry — RESOLVED (invisible infrastructure retry, explicit user retry).** Originally, Q50 chose *explicit retry only*, while Q25 had the worker retry transient failures up to 3 times.
*Resolution:* the worker silently retries transport and timeout failures up to 3 times with backoff; the Q24 idempotency key prevents double billing. Content-level failures are never auto-retried. After retries run out, the user sees one failure and an explicit Retry. Q25 and Q50 are updated.

<a id="c7"></a>
**C7. Accessibility and performance — RESOLVED (WCAG 2.2 AA + latency targets).** Originally, Q16 chose *best-effort*, while Q68 chose *WCAG 2.2 AA audited per release*, and Q55 gave a size but no latency numbers.
*Resolution:* Q68 stands for accessibility. Q16 now sets release-check targets: capture receipt under 1 s p95 warm (cold start up to ~3 s, never blocking), dashboard interactive under 2 s at 5,000 pages, no generation latency budget (60 s timeout + visible queue).

<a id="c8"></a>
**C8. Generation-quality evaluation — RESOLVED (owner-reviewed golden set per module).** Originally, Q49 chose *ad-hoc sampling*, while Q05 required an *eval sample per module proposal* and Q71 required quality validation before expanding the catalog.
*Resolution:* each module has a golden set of about 20–30 inputs. It runs before a module ships and before any prompt change merges, and the owner reviews the output diff against a short checklist. It doubles as Q05's eval sample and as Q71's quality bar. No LLM judge at 1.0.

<a id="c9"></a>
**C9. Quotas and metering — RESOLVED.** Q48, Q65, Q25, and Q56 fit together but left the quota undefined.
*Resolution:* the unit is one provider call: each component generation and each run's interpretation call (amended 10 October 2026 after Q72, when one generation run became one interpretation call plus one call per generative component), with token counts stored per call. User generation and explicit Retry count; invisible transport retries do not; a cancel counts only after the provider call started. The allowance is monthly per account (amount open, K8). At the limit, Q25's degrade rule applies with a "monthly quota reached" message. Metering and usage display ship at 1.0; enforcement follows once the amount is set.

<a id="c10"></a>
**C10. Sharing versus ordering and tenancy — RESOLVED (sharing deferred).** Originally, Q20 added collaborator sharing, while Q26, Q19, Q35, and Q57 assumed every karte (now page) belongs to one account.
*Resolution:* sharing is deferred and left out of the product specs. Every deck and page belongs to exactly one account, so Q19, Q26, Q35, and Q57 stand as written.

<a id="c11"></a>
**C11. Attempt history — RESOLVED (current content only + usage ledger).** Originally, Q33 kept only the latest outcome per seite (now component), while Q29, Q32, and Q48 needed records per attempt.
*Resolution:* at 1.0, components store only current content and the latest outcome; there is no content or edit history. A separate append-only usage ledger records every provider call (model, prompt version, tokens, cost, outcome) for quota, cost, and debugging; it is not shown as page history. Q29, Q32, and Q33 are updated.

<a id="c12"></a>
**C12. Compliance level — RESOLVED (store-minimum + GDPR baseline).** Originally, Q61 chose *store-minimum*, although Q02 (public users, likely including the EU) and Q60 (captures sent to an LLM provider) bring GDPR into scope.
*Resolution:* Q61 now adds DPAs with every provider, a transfer basis for non-EU providers, a production LLM provider whose terms cover user content, account deletion that cascades and ages out of backups, a provider list in the privacy policy, a one-page breach process, and a legal review before public launch. This narrows K4: OpenCode Go is development-only.
