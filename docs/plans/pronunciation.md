# Plan: pronunciation as the first audio (0.14.0)

Proposed: 30 October 2026 (Europe/Berlin). Implements [D24](../architecture/traceability-map.md#entries), accepted by the owner on 30 October 2026 and applied to the specifications ([modules](../specs/modules.md#audio), [capture and generation](../specs/capture-and-generation.md#audio), [pages and editing](../specs/pages-and-editing.md#spoken-parts), [generation architecture](../architecture/generation.md#speech-provider), [scope](../product/scope.md)). Builds on 0.13.3 ([#255](https://github.com/Guccimane44/Vocalbularium/pull/255)). Tracker: [#256](https://github.com/Guccimane44/Vocalbularium/issues/256); decision record in [Notion](https://app.notion.com/p/409bb135020881e79d9aeb6198fb2f5d).

## Outcome

A page can play its main key aloud, and a Languages card can play its translation. A **Pronunciation** module, the first in the Sound family, identifies the language of the page's main key and speaks the key in it. A **Pronunciation** facet on German and Chinese speaks the translation the module's core wrote. Audio comes from ElevenLabs, a second kind of provider beside the text provider. It is the first heavy facet of [D17's direction](../architecture/d17-one-request.md#heavy-facets-direction): its own job after the text, with its own loading, failure and Retry. The text shows first, and the audio fills in when it is ready.

Not in 0.14.0: pronunciation of Examples or other facets, IPA or other written pronunciation, choosing a voice in the interface, speed control, downloading the audio, and pronunciation in Expertise modules.

## Owner decisions

From chat, 30 October 2026:

1. **ElevenLabs** is the speech provider.
2. **No caching.** Every attempt synthesizes again, as unique generation already requires; the same key on two pages calls ElevenLabs twice.
3. **A Pronunciation module** whose core is the pronunciation of the page's main key, with one flag: the key's original language.
4. **It joins the Sound family**, which the [module specification](../specs/modules.md#module-families) defines for pronunciation and which has its colour tokens (`fam-sound`) already; not Creative, which stays reserved for parents that write something new.
5. **Its card shows audio only**: the key's language in its top line and a player, no IPA.
6. **A Pronunciation facet** on the Languages modules speaks the translation, the module's core.
7. **No browser speech** as a first step.
8. **Eleven v4 Turbo** as the speech model, and the proposed defaults for K70–K77 (storage, what the facet speaks, clips, limits, unsupported languages, key, verification, release).

## The Pronunciation module

`packages/domain/src/catalog/sound/` gets the family definition, and `sound/pronunciation/` the module: `module.ts`, `module.prompt.md`, its page's text and samples in every interface language, a core with its prompts, no facets, and a golden set.

```js
// sound/pronunciation/module.ts
export default defineContentModule({
  id: 'pronunciation', kind: 'content', label: 'Pronunciation',
  description: 'Speaks the main key in its own language.',
  instances: 'at-most-one', source: 'generated', provider: 'text', speech: true,
  core, facets: []
});
```

`at-most-one` because a second Pronunciation card on a page would say the same. `ProviderKind` in `define.ts`, `'text'` only since 0.8.0 (K29), gains `'speech'` for the audio job; `speech: true` says the core is spoken. The module applies to a word and a sentence, up to the length limit (K73).

### Flag

One flag, `language`: the language the main key is written in, as an ISO 639-1 code from the languages the pinned ElevenLabs model speaks, or `other`. It changes two things, as every flag must ([D17](../architecture/d17-one-request.md#flags-per-module)): the language the audio is synthesized in, and the top line. The top line names the language in the interface language (*German* / *Deutsch* / *德语*), from the code with the browser's `Intl.DisplayNames`, never edited. `other` gives no audio job and the card says the language cannot be pronounced (K74).

```js
// sound/pronunciation/facets/core/facet.ts
const shape = object({
  language: oneOf([...SPOKEN_LANGUAGES, 'other'], "The key's language"),
  key: text('The key')
}, { own: true });
```

`SPOKEN_LANGUAGES` is listed in the catalog with the pinned model (K69): the ISO 639-1 codes of Eleven v4 Turbo's languages. The key is echoed for the top line, as every core's is; what is spoken is the page's saved main key, never the key as the model wrote it.

### Prompts

The text request is still one per module (D17). The composer adds its shared rules and schema as for every module; the files hold only the module's own wording.

`module.prompt.md`:

```text
Identify the language of the selection, and write no explanation, translation or other text about it.
```

`core.prompt.md`:

```text
In "core", write { "language": "<the ISO 639-1 code of the one language the selection is written in, such as de, en, fr or zh>", "key": "<the selection>" }, with "language" first. Decide from the selection's spelling, words and script; when its spelling fits more than one language, such as Gift or Chef, decide from the Context. When the selection mixes languages, choose the language of most of its words; a borrowed word keeps the language of the text around it only when the Context shows it. Write "other" when the language is not one of the listed codes.
```

`reading.prompt.md`, for a card's Retry that keeps its reading (D19):

```text
This entry was written before, and its core is supplied as "previous": that is how the selection was read. Write it again with the same "language", unless the Context clearly shows another.
```

There is no `retry.prompt.md`: a core-only module has no facet to Retry. The conformance test allows this for a module without facets.

### Its card

The card shows the top line (*German · Gift*) and a player: one play button, its duration and a progress line, in the Sound family's colour. While the text request runs, the card loads as every card does; once the flag is in, the player shows a loading state of its own until the audio arrives. **Retry** writes the flag again, then the audio. There is no **Edit** and no **Facet**.

## The Pronunciation facet on Languages

`languages/german/facets/pronunciation/` and `languages/chinese/facets/pronunciation/`, last in each module's facet order. The facet is written in the module's one text request like every facet: the model writes **the text to speak**, and the audio job speaks it afterwards. The facet keeps that text as its markdown, so D09 still holds for the text, and adds one audio clip per line.

```js
// languages/german/facets/pronunciation/facet.ts
export default defineFacet({
  id: 'pronunciation', label: 'Pronunciation', abbreviation: 'Pr',
  description: 'The German translation, spoken.',
  applies: ['word_phrase', 'sentence'], output: 'audio', speech: { language: 'de' },
  shape: list(text('the German to speak')),
  format: lines => lines.map(escapeMarkdown).join('\n')
});
```

Chinese is the same with `language: 'zh'` and its own wording. The language comes from the module, not from a flag.

### Prompts

German `prompt.md`:

```text
"pronunciation": ["<German to speak>", ...], what a German speaker would say aloud. For a word or phrase, one item per meaning, in the order of "meanings": the German word or phrase for that meaning, a noun with its article in the nominative singular, such as "das Ufer"; leave out an item that repeats an earlier one. For a sentence, one item: its German translation. When the selection is already in German, one item: the selection itself. Write only the words to speak: no explanations, brackets, numbering or punctuation that is not spoken.
```

Chinese `prompt.md`:

```text
"pronunciation": ["<Chinese to speak, in Hanzi>", ...], what a Mandarin speaker would say aloud. For a word or phrase, one item per meaning, in the order of "meanings": the Chinese word or phrase for that meaning; leave out an item that repeats an earlier one. For a sentence, one item: its Chinese translation. When the selection is already Chinese, one item: the selection itself. Write Simplified Hanzi only, never Pinyin, and only the words to speak: no explanations, brackets or numbering.
```

The facet's own Retry writes the lines again for the saved core (the existing `retry.prompt.md` covers it), then synthesizes them again.

### In the card

Each line shows beside its own play button, in the facet's place on the card. A line's audio loads, fails and retries on its own row; the facet's **Retry** redoes its text and every clip. The lines are not editable in 0.14.0: a changed line would not match its audio (K72).

## Speech provider

A second kind of provider, beside the text `Provider` ([generation architecture](../architecture/generation.md#providers)):

```js
// src/server/speech.mjs
export class SpeechProvider {
  // One clip: the bytes, their MIME type and the duration in milliseconds.
  async synthesize({ text, language }, signal, sessionId) { /* timeout, diagnostics, error codes */ }
}
// src/server/elevenlabs.mjs: extends SpeechProvider and implements send(...)
```

- **Transport:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with `xi-api-key`, body `{ text, model_id, language_code }`, `output_format=mp3_44100_128`.
- **Model (K69, owner 30 October 2026):** Eleven v4 Turbo, `model_id: "eleven_v4_turbo"`. ElevenLabs' [model documentation](https://elevenlabs.io/docs/models) (checked 30 October 2026) lists it for low latency, with 90+ languages and `language_code` (ISO 639-1) accepted; `SPOKEN_LANGUAGES` is taken from that list.
- **Configuration:** `SPEECH_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` (`eleven_v4_turbo` by default) and one voice per language, `ELEVENLABS_VOICES` (a JSON map of language code to voice ID with a default). One pinned speech model at a time, beside the one pinned text model (C32).
- **Shared with text:** the timeout, cancellation, diagnostics events and error codes. A missing key is `provider_unconfigured`, an exhausted quota or plan limit `provider_refused`, any other HTTP error `provider_response`, a reply that is not audio `provider_invalid`. The key joins the diagnostic secrets in `start.mjs`. Diagnostics record the text's length, the language and the voice, never the audio.
- **No caching** (owner decision 2).

## Jobs and limits

- An audio job starts once the text it speaks is saved: the Pronunciation core's flag, or a facet's lines. A card's clips run in parallel, so a new modality adds a branch, not a round (D17).
- Audio jobs have their own bounded capacity beside the text attempts ([capture and generation](../specs/capture-and-generation.md)), proposed as 4 active and 32 waiting per server (K73).
- A failed clip shows a failure on its own row with **Retry**; the text around it stays. This relaxes "no partial success within a component" for audio only (C31).
- Leaving the page does not cancel a job; deleting the component or page does, and deletes its audio.

## Storage and API

- **Migration `0018`** adds `component_audio`: component, part (the core or a facet), line index, the text and language to speak, a token naming the clip's current version, its state and error, MIME type, duration, bytes (`bytea`), created at, deleted with its component. Earlier components have none.
- **The generation record** of an audio facet adds the speech part: `{ "pronunciation": { "model": "deepseek-v4.1-flash", "prompt": "…", "speech": { "model": "<pinned>", "voice": "<voice id>" } } }`.
- **API:** `GET /api/pages/{pageId}/audio` lists the page's clips, each with its state (`waiting`, `generating`, `ready`, `failed` with its error code) and, when ready, its duration and URL, so the page's own response is unchanged; `GET /api/pages/{pageId}/audio/{componentId}/{part}/{line}` returns the MP3 for the signed-in owner; `POST …/retry` starts a clip again. The OpenAPI reference is regenerated.
- **Upgrade:** accounts, decks and pages stay; no audio is generated for earlier pages until the user adds the module or facet, or uses Retry.

## Increments

Each increment is one PR against the 0.13.3 base, green in CI before the next starts.

0. **Record the decision.** D24, its conflicts and clarifications in the traceability map, this plan, the Notion record as `Proposed` and the tracker. After the owner accepts it, update [modules](../specs/modules.md), [capture and generation](../specs/capture-and-generation.md), [pages and editing](../specs/pages-and-editing.md), [generation architecture](../architecture/generation.md) and [scope](../product/scope.md).
1. **Speech provider and audio jobs.** `SpeechProvider`, the ElevenLabs adapter, a controlled fake adapter for tests, migration `0018`, the audio job and its limits, the API and the generation record. No catalog change.
2. **Pronunciation module.** The Sound family, the module, its prompts and prompt snapshots (`tests/prompts/pronunciation.word_phrase.txt` and the others), page text and samples in every interface language, the player and the card states, and a golden set for the flag.
3. **Pronunciation facet.** The German and Chinese facets, their prompts and snapshots, page text, samples and per-line players, and their golden sets.

## Verification

- **Unit:** the adapter against a recorded ElevenLabs response and each error status; the job's states, limits and cancellation; the migration upgrading an 0.13.3 database; the catalog conformance test with an `audio` facet and a core-only module.
- **Prompt snapshots** show the new prompts in review.
- **Golden sets, live:** the flag on keys whose spelling fits several languages (*Gift*, *Chef*, *also*, *河*), with and without Context, checked automatically; the German and Chinese lines checked against the expected text.
- **Browser E2E** with the fake speech provider and the controlled text provider: capture → text appears → audio fills in → play; a failed clip and its Retry; `other`; deleting a component removes its audio.
- **Owner listening review** per language, for the pinned model and voices, before release (as C8 asks of a provider change). Chinese tones and German compound stress are the cases to listen for.
- **Not covered automatically:** audio quality, and ElevenLabs' live quota and latency.

## Open items

K69–K77 were answered by the owner on 30 October 2026: Eleven v4 Turbo for K69, the proposed defaults for K70–K77. C31–C33 in the [traceability map](../architecture/traceability-map.md) were resolved by the owner the same day with their proposed resolutions. No open items remain.
