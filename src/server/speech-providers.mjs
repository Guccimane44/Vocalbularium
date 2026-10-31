import { ElevenLabsProvider } from './elevenlabs.mjs';

// The speech provider is chosen by configuration (D24), one pinned model per
// provider kind (C32). ElevenLabs is the only adapter.
const ADAPTERS = { elevenlabs: ElevenLabsProvider };

export function createSpeechProvider(name = process.env.SPEECH_PROVIDER ?? 'elevenlabs', options) {
  const Adapter = ADAPTERS[name];
  if (!Adapter) throw new Error(`Unknown speech provider "${name}".`);
  return new Adapter(options);
}
