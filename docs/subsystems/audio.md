# Audio

Some modules and facets are **spoken**: after their text is published, a speech provider reads each of their lines aloud, one **clip** per line, and the card plays them beside the text. Audio jobs run on their own, after the text attempt and with their own capacity, so a failed clip never fails its card. The text attempt is in [generation](generation.md); which parts are spoken is declared in the [module catalog](module-catalog.md).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Spoken parts | Which parts of a published card are spoken, in which language, and their lines. | `spokenParts`, `isSpokenFacet` in [`spoken.ts`](../../packages/domain/src/spoken.ts); each facet's `spoken` in its `facet.ts` |
| Jobs | Starts a job per clip after a publish, admits at most 4 running and 32 waiting, retries one clip, cancels jobs of deleted components, and fails the clips a restart interrupted. | `Audio` (`afterPublish`, `speak`, `retry`, `admit`, `execute`, `cancelObsolete`, `initialize`) in [`audio.mjs`](../../src/server/audio.mjs) |
| Clips | One `component_audio` row per component, part and line, with its state, error, MIME type, duration and bytes; a token per clip so a job for an earlier version never stores its audio. | `replaceClips`, `claimClip`, `finishClip`, `failClip`, `restartClip`, `dropClips`, `clips`, `clipAudio` in [`store-audio.mjs`](../../src/core/store-audio.mjs) |
| Speech provider | The 60-second timeout per clip, cancellation, diagnostics and error codes, for every speech adapter; ElevenLabs is the one adapter. | `SpeechProvider` in [`speech.mjs`](../../src/server/speech.mjs); [`elevenlabs.mjs`](../../src/server/elevenlabs.mjs); `createSpeechProvider` in [`speech-providers.mjs`](../../src/server/speech-providers.mjs) |
| Routes | `GET /api/pages/:pageId/audio` lists a page's clips, `GET …/:componentId/:part/:line` serves one as MP3, `POST …/retry` speaks it again. | [`routes.mjs`](../../src/server/routes.mjs) |
| Player | A play button per line, its state, and its **Retry**. | [`audio.tsx`](../../extension/audio.tsx) |

## Runtime path

1. A text attempt is published ([generation](generation.md#runtime-path)). The publish route calls `Audio.afterPublish` with the component's new content; a failure here never fails the publish.
2. `spokenParts` finds the card's spoken parts. For each, `replaceClips` writes one waiting clip per line with a fresh token, replacing the clips of that part.
3. Each clip is admitted, or failed at once when 4 are running and 32 waiting. `execute` claims the clip, calls `synthesize({ text, language })`, and `finishClip` stores the audio only if the clip still carries the job's token.
4. The extension lists the page's clips and plays a ready one from its route. A failed clip shows its error and its **Retry**, which goes through `restartClip` and a new job.

## Behaviour

### Spoken parts

Audio is an output that is not markdown, and a **heavy facet** in the sense of [D17's direction](../decisions/d17-one-request.md#heavy-facets-direction) ([D24](../decisions/d24.md)).

- **What is spoken.** A spoken core speaks the page's saved main key in the language its flag names, never the key as the model wrote it; a spoken facet (`spoken` in its `facet.ts`) speaks each of its lines in its parent's language. The text stays markdown as every facet's does; the audio is attached to the component beside it, one **clip** per spoken line.
- **Where it comes from.** A speech provider, ElevenLabs, with one pinned speech model, Eleven v4 Turbo, beside the one pinned text model ([generation architecture](generation.md#the-text-provider)), and a voice per language from `ELEVENLABS_VOICES`. Changing the model or a voice needs the owner's listening review.
- **When.** A clip is generated once its text is saved, in parallel with the card's other clips; the card shows its text first, and each clip fills in when it is ready. A clip succeeds or fails on its own, with its own **Retry**, and the text around it stays ([capture and generation](#audio-jobs)).
- **Not spoken.** A language `other`, a language the pinned model does not speak, and a line over 500 characters start no audio; the card says why and offers **Retry**. These are not failures.
- **Format.** MP3 at 44.1 kHz and 128 kbit/s, played on the card ([pages and editing](../specs/pages-and-editing.md#spoken-parts)); there is no download or export.
- **Editing.** Spoken lines are shown but not editable, because an edited line would no longer match its audio.

### Audio jobs

A spoken part's audio is generated in jobs of its own, one per **clip**, after the text ([modules](#spoken-parts)).

- **Start.** A clip's job starts once the attempt that writes its text has completed: the Pronunciation core's `language`, or a Pronunciation facet's lines. A card's clips run in parallel. The component's attempt state describes its text; the card is **Completed** while its clips are still generating.
- **States.** Each clip is **waiting**, **generating**, **ready** or **failed**. A failed clip names its error and keeps its own **Retry**; the card's text and its other clips stay. A failed clip does not make the page's overall outcome **Failed**.
- **Capacity.** Audio jobs have their own bounds beside the text attempts: 4 active and 32 waiting per server. A clip that cannot be admitted fails without a provider call and can be retried.
- **Not spoken.** `other`, a language the pinned model does not speak, and a main key over 500 characters start no job; that is not a failure.
- **Errors.** As for text: no speech key on the server is `provider_unconfigured`, an exhausted quota or plan limit `provider_refused`, any other HTTP error `provider_response`, a reply that is not audio `provider_invalid`. A clip's **Retry** after the key is set works.
- **Unique.** Audio is never cached: every attempt and every **Retry** speaks the text anew.
- **Deleting** a component or page cancels its audio jobs and deletes its audio.

### Speech provider

A second **provider kind** ([D24](../decisions/d24.md)) speaks the audio of spoken parts ([modules](#spoken-parts)). A `SpeechProvider` (`src/server/speech.mjs`) takes `synthesize({ text, language }, signal, sessionId)` and returns one clip: its bytes, MIME type and duration. It shares the text provider's cancellation, diagnostics events and error codes; its timeout stays 60 seconds per clip. Diagnostics record the text's length, the language and the voice, never the audio.

ElevenLabs is the only speech adapter (`src/server/elevenlabs.mjs`): `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with `xi-api-key`, the body `{ text, model_id, language_code }`, and `output_format=mp3_44100_128`. `SPEECH_PROVIDER` chooses it (`elevenlabs`), `ELEVENLABS_API_KEY` holds the key, which joins the diagnostic secrets, `ELEVENLABS_MODEL` the pinned model (`eleven_v4_turbo`, Eleven v4 Turbo, which accepts `language_code` in ISO 639-1), and `ELEVENLABS_VOICES` a JSON map of voice IDs, looked up for each clip by its part (`<module>.<part>`, such as `german.pronunciation` or `pronunciation.core`), then its language (`de`, `zh`), then `default`, so a facet can have a native voice while the Pronunciation module keeps another. There is one pinned model per provider kind; changing the speech model or a voice needs the owner's listening review. The flag values of Pronunciation's `language` are the pinned model's languages, listed in the catalog with it.

An audio job runs per clip after the text it speaks is saved, with its own capacity of 4 active and 32 waiting per server ([capture and generation](#audio-jobs)). Nothing is cached. Clips are stored in `component_audio` (migration `0018`), one row per component, facet and line, holding the MIME type, duration and bytes (`bytea`), deleted with their component. The API lists a page's clips with their states (`GET /api/pages/{pageId}/audio`), serves a ready clip as MP3 to the signed-in owner (`GET /api/pages/{pageId}/audio/{componentId}/{part}/{line}`) and speaks one again (`POST …/retry`). Audio starts when a completed attempt is published (`Audio.afterPublish`, `src/server/audio.mjs`); which parts of a module are spoken comes from the catalog. A token on each clip keeps a job started for an earlier version of it from storing its audio, and a server restart fails the clips it was still speaking (`interrupted`).


## Constraints and failure behaviour

- **Audio is never cached.** Every attempt and every Retry speaks the text anew; nothing is reused between clips, cards or pages.
- **A clip never fails its card.** The card is completed once its text is; each clip succeeds or fails on its own.
- **A restart fails the clips in flight** (`interrupted`); the user retries them.
- **Diagnostics record the text's length, the language and the voice**, never the audio.
- **The speech model and voices are pinned.** Changing either needs the owner's listening review.

## Verification

| Check | What it covers |
| --- | --- |
| [`tests/audio.test.mjs`](../../tests/audio.test.mjs) | The ElevenLabs request and its error codes, clips per line, a clip failing alone and its Retry, the bounds, deleting, and a clip spoken again while generating |
| [`tests/browser/audio.test.mjs`](../../tests/browser/audio.test.mjs) | A Pronunciation card and a German Pronunciation facet in the real extension: generating, failing, Retry and playing |
| [`tests/catalog.test.mjs`](../../tests/catalog.test.mjs) | Every spoken part names a language the pinned speech model speaks |
