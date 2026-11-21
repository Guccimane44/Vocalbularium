# Generation

Generation writes a page's content cards. Each content module instance on a page gets one **attempt**: one request to the text provider, whose answer is checked against the module's shapes, formatted into markdown per facet, staged in the store and then published into the component by the browser session that started it. A **run** groups the attempts one action starts. This page covers attempts, their states, capacity, Retry and the provider. What a module asks for and how its request is composed is in the [module catalog](module-catalog.md); audio is in [audio](audio.md); how a capture starts the first run is in [capture and save](capture-and-save.md).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Targets and runs | Which components an action targets (`capture`, `missing`, `page`, `component`, `facet`, `core`), the confirmation digest for content it replaces, and one attempt row per target with the module request it will send. | `generate`, `startRun`, `confirmationDigest` in [`store-generation.mjs`](../../src/core/store-generation.mjs); `generationTargets` in [`page-modules.ts`](../../packages/domain/src/page-modules.ts) |
| Admission | By default at most 4 attempts run and 16 wait per API (`GENERATION_MAX_ACTIVE`, `GENERATION_MAX_QUEUED` in [`config.mjs`](../../src/server/config.mjs)). A Retry or generate request reserves every slot it needs or none; a capture admits what fits. | `Generation` (`reserve`, `admit`, `pump`) in [`generation.mjs`](../../src/server/generation.mjs); the `/api/page/generate` route in [`routes.mjs`](../../src/server/routes.mjs) |
| Executing an attempt | Reads the page, composes the request, calls the provider, and turns the reply into the component's structured content: a whole card, a facet alone, or the core alone. | `Generation.execute` in [`generation.mjs`](../../src/server/generation.mjs); `generateComponent`, `generateFacet`, `generateCore` in [`modules.ts`](../../packages/domain/src/modules.ts) |
| Journal | A result is written to `DATA_DIR/generation-outbox/<attemptId>.json` before it is staged, so a failed database write or a restart loses nothing, unless writing the journal failed too. | `Generation.execute`, `Generation.initialize` in [`generation.mjs`](../../src/server/generation.mjs) |
| Stage and publish | `stage` stores the result on the attempt; only `publish`, sent by the originating session, moves it into the component, with its generation record. | `stage`, `publish`, `keepAfterFacetFailure` in [`store-generation.mjs`](../../src/core/store-generation.mjs) |
| Content | Checking a reply against the module's shapes, and formatting it into stored markdown per facet. | [`generated.ts`](../../packages/domain/src/generated.ts); `validateParentContent`, `parentDocument` in [`content.ts`](../../packages/domain/src/content.ts) |
| Provider | The 180-second timeout, cancellation, error codes, diagnostics and the reply's outer check, for every adapter; OpenCode is the one adapter. | `Provider` in [`provider.mjs`](../../src/server/provider.mjs); `OpenCodeProvider` in [`opencode.mjs`](../../src/server/opencode.mjs); `createProvider` in [`providers.mjs`](../../src/server/providers.mjs) |
| Cancelling | Deleting a page or component, or an ended session, aborts its running attempts and drops its queued ones. | `cancelObsolete` in [`generation.mjs`](../../src/server/generation.mjs) |

## Runtime path

1. An action reaches the store: a capture (`capture`), or `/api/page/generate` for a card's, a facet's or the core's **Retry**. `generate` checks the session, refuses a target that is already generating (`generating`), and, when the target holds content, requires the client to echo the digest of what it will replace (`confirmation_required` returns the digest). Just before any attempt is written, `generate` reserves capacity for all of them; with no room it answers busy and changes nothing.
2. `startRun` writes one `component_attempts` row per target, with the module request (its type, facets in the parent's order, and for a facet or core Retry the facet and the component's prior state), and sets the component to `loading`. A whole attempt empties the component; a facet's or the core's keeps it.
3. After the commit, `Generation.start` admits the attempts. `execute` checks that the attempt is still loading and its session still current, reads the page's main key and Context and the account's language, and composes the request ([module catalog](module-catalog.md#prompts)).
4. The provider answers. The domain checks the reply against the module's shapes, drops a facet the core's flags rule out (logging the mismatch, never the text), and builds the structured content.
5. The result (or `{ ok: false }`) goes to the journal, then `stage` stores it on the attempt. A stale attempt (`deleted`, `stale_session`, `stale_attempt`) is discarded.
6. The browser polls `/api/poll`, sees the attempt ready, and sends `/api/publish` with operation `publish-<attemptId>` ([capture and save](capture-and-save.md#runtime-path)). `publish` writes the content and the generation record into the component only if it is still on this attempt, sets it `completed` or `failed`, and audio starts for its spoken parts ([audio](audio.md)).

## Behaviour

### Input interpretation

There is no interpretation shared by the run ([D17](../decisions/d17.md)). Each attempt reads the main key and Context in its own request and records its reading as the core's flags, such as word or sentence for a Languages parent, which its card's header shows ([the main key](../screens/page.md#the-main-key)). No reading chooses a source language for the page: each parent reads the language from the key and Context. Target languages are defined by the parent modules, not by a fixed language-pair setting for the deck. A failed attempt fails only its own component.

The reading and applicability rules are in the module catalog, under [input and applicability](module-catalog.md#input-and-applicability).

### Generation actions

All generation actions use the page's current main key and saved Context and the page's own content module instances. Finish manual editing with **Save** or **Cancel** before starting one.

| Action | Targets | Confirmation |
| --- | --- | --- |
| Capture | Every content module instance on the new page | None; runs automatically |
| **Retry** (in a card), empty component | One content component with nothing in it: one that never generated, failed, or generated nothing | None; nothing is replaced |
| **Retry** (in a card), with content | One content component that has generated, or that the user wrote into | Always |

The extension offers generation per card only. The API also accepts generating every not-yet-generated component of a page and retrying a whole page, with the same confirmation rule.

No action touches an input module's component (main key, Context, Text), and none recreates a component the user deleted. Manual creation and manual edits never start generation.

### Component completion and failure

Generation-status labels describe actual generation attempts. A component that has never had a generation attempt shows no status label. A page with no generation attempts shows no overall status label. Components not generated yet are shown as empty, with only their index tab ([components as cards](../screens/page.md#components-as-cards)), not as failed.

Each component attempt has one of these states:

- **Loading:** the component's generation is in progress.
- **Completed:** the instance completed. Publish its output, the core and its applicable facets, as the component's content. A facet that does not apply is left out and does not count as a failure.
- **Failed:** the instance failed. Discard any partial output from that attempt and show a failure indicator on the empty component. There is no partial success within a component's text; only its audio clips succeed or fail on their own ([audio](audio.md#audio-jobs)).

Components fail and complete independently. For example, if a page has two `German` instances and only one succeeds, the successful one is published and the other component fails. A later retry of the failed component generates only that one.

A page's overall generation outcome is derived from its components that have had attempts: **Failed** if any such component's current state is **Failed**, otherwise **Loading** while any attempt is running, otherwise **Completed**. Confirming a retry moves each target component to **Loading**, then to **Completed** or **Failed** by its own attempt's outcome. Saving a page or manually adding content does not turn a failed attempt into a successful one; outside an active retry, a component's failure indicator describes its last attempt.

The main key is always shown, regardless of empty or failed components. A manual page that has not generated still shows its main key without a status label. Editing the main key or Context alone does not change any attempt's outcome.

#### Generation capacity

The local API admits only a bounded number of active and waiting component attempts. When a capture is saved while generation capacity is full, the page remains saved and accessible. Each attempt that cannot be admitted becomes **Failed** without a provider call. The user can explicitly retry failed components later. A successful page save or capture feedback does not imply that generation was admitted or completed.

If capacity cannot admit every attempt of a **Retry**, report that generation is busy and leave the page's components and states unchanged. The user may start the action again later. The rejected request is not kept as an automatic or **Try saving again** generation request. An admitted retry follows the replacement rules below.

### Retry

**Retry** is available in the page editor for one content component and for one facet of a parent component ([below](#retrying-one-facet)); the API also retries a whole page. Completed, failed, empty, missing, or manually edited components can be targets. Capture origin does not matter: a manually created page has a main key and can retry like a captured one.

Before replacing content, always ask. For one component the question is asked beside the card's tab, as for **Delete** ([components as cards](../screens/page.md#components-as-cards)): "Are you sure?" with a final **Retry** and **Cancel**. If the content changed after the user answered, for example in another browser, the warning below is shown before anything is replaced:

> Retry will replace this component's content, including your edits to it. The main key, Context, and other components will not change.

For the whole page:

> Retry will replace the content of every generated component on this page, including your edits to them. The main key, Context, and your Text components will not change.

- **Cancel** leaves the page unchanged.
- **Confirm** discards the targeted components' current content and starts a fresh attempt for each. Previous edits and generated output are not preserved or merged into the replacement. If an attempt fails, its component stays empty with a failure indicator; the discarded content is not restored.

Retry uses the page's current saved main key and Context and its content module instances at confirmation time. Each retry generates anew from them: nothing from an earlier attempt is reused ([D28](../decisions/d28.md)), and generated content is never cached. A retry generates the parent's core and every facet it currently has, including facets added since its last attempt, and never a facet the user deleted.

<a id="keeping-the-reading"></a>**A Retry starts over** ([D28](../decisions/d28.md)). A Retry of a content card, alone or as part of the whole page's Retry, sends the same request as the card's first attempt: the main key, its Context and the instance. Nothing from the card goes with it, neither its core nor the user's edits, so the model reads the key afresh, whatever the card held or whatever main key it was written for. To keep the reading and write the meanings again, the user retries the core alone ([below](#retrying-the-core)).

#### Retrying one facet

Each facet of a parent component has its own **Retry** beside its label ([components as cards](../screens/page.md#components-as-cards)). It regenerates that facet alone: the facet's markdown is replaced with its new JSON formatted as markdown, or added when the facet had none, and the core and the other facets stay exactly as they are, edits included. A facet waiting for **Retry** can be generated this way without regenerating the rest. Every facet of a parent with a core can be retried alone ([render contracts](module-catalog.md#render-contracts)).

- **Asking.** Beside its label, a facet with content asks "Are you sure?", with a final **Retry** and **Cancel**; one with nothing in it starts at once. If the facet's content changed after the user answered, the dialog warns: "Retry will replace this facet's content, including your edits to it. The rest of the component will not change."
- **Input.** The attempt uses the page's saved main key and Context and the component's current core, with its flags, so the facet follows the core it joins. The provider writes only that facet for the core; anything else it returns is discarded. A facet that does not apply to the core's flags is left out, as in a whole attempt.
- **While it runs.** The component keeps its content and stays open; the spark runs round the facet's tab; a facet without content shows its heading and gains its text if it comes back with content; the component is locked as during any attempt.
- **Failure.** A failed or interrupted facet attempt leaves the content and the component's state as they were before it, and the facet's tag says its Retry failed until the component's next attempt. A facet that was waiting still waits.
- **Spoken facets.** A Pronunciation facet's **Retry** writes its lines again for the saved core, then speaks every line anew. A whole component's **Retry** does the same for every spoken part it has.

<a id="retrying-the-core"></a>**Retrying the core** ([D28](../decisions/d28.md)). The core has its own **Retry** beside its Edit, at the end of its top line. It keeps the card's reading and writes the core's text again: a Languages card's meanings (and its context meaning, D29), an Expertise card's explanation.

- **Asking.** As a facet's: "Are you sure?", with a final **Retry** and **Cancel**, in place of the core's Edit and Retry.
- **Input.** The attempt sends the module's core prompt, then its `reading.prompt.md`, with the saved core (edits included) as `previous`, and asks for no facet. The model copies the flags and the key as given.
- **The flags never change.** Whatever the provider writes for them, the stored core keeps the flags and the top line it had (`kind`, `language`, German's `gramRole`, an Expertise card's `relevance` and its formula or code flag), so the facets that follow them stay in step. To read the key differently, the user retries the card.
- **While it runs.** The card stays open; the core's text dims inside a ring in the family colour, and every facet keeps its text. The card is locked as during any attempt.
- **Failure.** The content stays as it was, and the core says its Retry failed until the card's next attempt.
- **Not offered** on a card without a core (never generated, failed or empty), on a core written for another main key (its top line's key, trimmed, differs from the main key), or on a spoken core (Pronunciation). The API refuses those too.

<a id="retrying-one-clip"></a>**Retrying one clip.** A clip has its own **Retry** beside its play button. It speaks that line again and leaves the text and the other clips as they are. It starts at once without asking, since a clip holds no edits.

The warning describes the content shown when it opened. If a targeted component changes before the user confirms, for example through a save from another installation, Retry warns again with the current content instead of replacing content the user has not seen.

Retry updates the same components of the same page and saves the new outcomes automatically. It does not create another page or change any component it did not target. The page's identity and creation time stay the same. The targets stay the same even if the user navigates elsewhere while generation runs.

While an attempt is running on a component, another retry targeting it and manual editing of it are unavailable. Other components remain editable.

The generation lock applies across installations. Another installation may already have an unsaved draft when a component's generation starts. If a manual save arrives that changes any component that is generating, reject that save immediately rather than queueing it. For a save containing several changed components, reject the whole save without updating any of them. Preserve all the user's drafts and explain that a component is still generating. After the attempt finishes, the user can explicitly select **Save** or **Try saving again**; the new save follows the normal server-arrival order. Do not automatically apply the previously rejected save when generation ends.

### Editing after capture

Generated content remains editable. The user opens the page editor to change any component, edit the main key or its Context, write in Text components, or delete the page. Adding, deleting, and moving components is described in [shaping a page](../screens/page.md#shaping-a-page). Manual edits require an explicit **Save**. Select and Add and confirmed retries save their outcomes automatically. A later confirmed **Retry** discards the edits on the components it targets along with their previous generation; edits on other components remain unchanged.

### Generation record

Each generated facet of a parent, the core included, records with its component the model and the version of the prompt that produced it ([how the record is stored](#how-the-record-is-stored)). A facet's own Retry records them for that facet only, and the other facets keep theirs. A user's edit does not change the record. A spoken part's record adds the speech model and voice that spoke it. The interface does not show the record.


## Providers

### The text provider

A **provider adapter** only transports a composed request. It extends `Provider` (`src/server/provider.mjs`) with two methods:

```js
prompts(request)                                   // what it sends, as diagnostics record it
send(request, prompts, signal, sessionId, reply)   // fills reply.status, reply.raw and reply.content
```

It declares whether it supports a native JSON schema (`nativeSchema`); otherwise the schema is sent inside the instructions, as OpenCode needs today. `Provider.complete(request, signal, sessionId)` wraps every adapter the same way: the 180-second timeout and cancellation, the diagnostics events, the error codes (`provider_unconfigured`, `provider_response`, `provider_invalid`, `provider_incomplete`, `provider_refused`), and the result's outer check (one JSON object with only the schema's top-level fields, each required part present). Before that check, a module's reply that is not JSON only because its core lacks the `}` before `"facets"` is repaired with that one brace; the repaired object passes the same checks, and any other malformed reply stays `provider_invalid`, never retried automatically. The domain also moves facet entries the provider wrote inside the core, named by the instance's facets, into `facets` before checking the shape (Q50, the owner's answer of 7 October 2026), and, for a card and for the core's own Retry ([D28](../decisions/d28.md)), drops a field the core's shape does not name when it is blank: null, empty or whitespace text, `{}` or `[]` (owner, 6 November 2026: “B: ignore blank extras”, amending [D09](../decisions/d09.md)). deepseek-v4.1-flash writes such fields in about 0.4% of cards before D29 and 1–3% with D29's `contextual`, such as `"contextual_note": ""` or `"facets": {}`; neither the prompt nor a native schema removed them without new failures. Any other stray field, one with a value, still fails the attempt, and the shapes themselves stay strict. `generate` composes the request and calls `complete`. The domain validates the content against the module's shapes; an adapter never checks content.

OpenCode is the only adapter (`src/server/opencode.mjs`). `GENERATION_PROVIDER` chooses the provider (`opencode` by default, `src/server/providers.mjs`) and `OPENCODE_MODEL` its model, one pinned model at a time (Q46, the owner's answer of 7 October 2026). Changing either needs its own golden-set review ([C8](../decisions/conflicts.md#c8)).

### How the record is stored

Each generated facet, the core included, records with its component the **model** and the **prompt version** that produced it. The prompt version is a fingerprint (a hash) of the composed request's instructions and schema, so it changes whenever a prompt file, the rules, a writing guide or a shape changes; a guide changes it for its language only. A whole attempt writes the record for the core and every facet it generated; a facet's own Retry rewrites only that facet's record. The record is evidence for comparing prompts and models and for finding components made with an earlier prompt; the interface does not show it.

It is stored as JSON in the component's `generation` column (migration `0015`), keyed by part, and read with `store.generationRecords(pageId)`:

```json
{ "core": { "model": "claude-haiku-5-5", "prompt": "3f9a0c1e8b27d455" },
  "examples": { "model": "claude-haiku-5-5", "prompt": "b81e44c09d3a7f12" } }
```

A spoken part's entry adds `speech`, the speech model and voice that spoke it, such as `"pronunciation": { "model": "claude-haiku-5-5", "prompt": "…", "speech": { "model": "eleven_v4_turbo", "voice": "<voice id>" } }`; a clip's own Retry rewrites only `speech`.

The prompt version is the first 16 hex digits of a SHA-256 over the instructions and the schema (`promptVersion` in the composer); provider diagnostics events carry the same value. A whole attempt records only the parts that came back with content, and a whole attempt that fails, or a facet that comes back empty, leaves no entry for it. Manual saves change only the content, never the record.


## Constraints and failure behaviour

- **Provider calls never run inside a transaction or the ordered executor.** `execute` reads, calls the provider with no transaction open, then stages in a new one. One test holds the executor part ([`tests/postgres.test.mjs`](../../tests/postgres.test.mjs)); nothing holds the transaction part, so a reviewer checks.
- **A staged result is not content.** Only `publish` from the originating session writes a component, and only while the component is still on that attempt (`stale_attempt` otherwise), so a late result never overwrites a later save or Retry.
- **A Retry is admitted whole or not at all.** A generate or Retry request reserves every attempt it starts. A capture admits the attempts that fit and fails the rest, without a provider call; its page is saved either way.
- **A malformed reply fails the attempt.** One missing `}` before `"facets"` is repaired; anything else that isn't the schema's JSON is `provider_invalid`, never retried automatically.
- **Nothing is cached or reused.** Every attempt sends a fresh request.

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/generation.test.mjs`](../../tests/generation.test.mjs) | Attempts, targets, confirmation, facet and core Retry, flags and mismatches, the generation record |
| [`tests/generation-recovery.test.mjs`](../../tests/generation-recovery.test.mjs) | Capacity and busy Retry, reservations, cancelling, late replies, the journal across a failed write and a restart |
| [`tests/opencode.test.mjs`](../../tests/opencode.test.mjs) | The OpenCode adapter, cancellation, error codes and the reply's outer check |
| [`tests/foundation.test.mjs`](../../tests/foundation.test.mjs), [`tests/postgres.test.mjs`](../../tests/postgres.test.mjs) | Stage versus publish, the generation lock on saves, fencing late results |
| [`tests/browser/facet-retry.test.mjs`](../../tests/browser/facet-retry.test.mjs), [`tests/browser/reliability.test.mjs`](../../tests/browser/reliability.test.mjs) | Retry and recovery in the real extension |
| `npm run drive` with [the retry journey](../../.agents/skills/vocabularium-drive/journeys/retry-a-failed-card.mjs) | A failed card retried on a disposable account |
| `npm run gate -- <module>` | A module's live output: golden set, checks and the calibrated judge ([module catalog](module-catalog.md#verification)) |
