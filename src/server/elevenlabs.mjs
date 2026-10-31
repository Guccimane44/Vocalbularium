import { failure } from './provider.mjs';
import { SpeechProvider } from './speech.mjs';

// The ElevenLabs adapter (D24): transport only. One pinned model, Eleven v4
// Turbo by default, which accepts `language_code` (ISO 639-1); one voice per
// language from ELEVENLABS_VOICES, a JSON map with a default.
export const OUTPUT_FORMAT = 'mp3_44100_128';

// A reply that says the account's quota or plan does not allow the request.
/** @param {number} status @param {string} body */
function refused(status, body) {
  return status === 402 || status === 429 || (status === 401 && /quota|limit|payment/i.test(body));
}

/** @param {string | undefined} value */
export function parseVoices(value) {
  if (!value) return {};
  let voices;
  try { voices = JSON.parse(value); } catch { throw new Error('ELEVENLABS_VOICES must be a JSON object.'); }
  if (!voices || typeof voices !== 'object' || Array.isArray(voices) || Object.values(voices).some(voice => typeof voice !== 'string' || !voice)) {
    throw new Error('ELEVENLABS_VOICES must map language codes to voice IDs.');
  }
  return voices;
}

export class ElevenLabsProvider extends SpeechProvider {
  bitRate = 128000;
  constructor({ apiKey = process.env.ELEVENLABS_API_KEY, model = process.env.ELEVENLABS_MODEL ?? 'eleven_v4_turbo',
    voices = parseVoices(process.env.ELEVENLABS_VOICES), fetchImpl = fetch } = {}) {
    super();
    this.apiKey = apiKey; this.model = model; this.voices = voices; this.fetch = fetchImpl;
  }
  /** @param {{ text: string, language: string, voice: string | null }} request @param {AbortSignal} signal @param {Record<string, any>} reply */
  async send({ text, language, voice }, signal, reply) {
    if (!this.apiKey || !voice) throw failure('provider_unconfigured', 'Speech is not configured on the server.');
    const response = await this.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: this.model, language_code: language }),
      signal
    });
    reply.status = response.status;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (refused(response.status, body)) throw failure('provider_refused', 'The speech service did not allow this request.');
      throw failure('provider_response', 'The speech service could not complete this request.');
    }
    reply.mime = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    reply.bytes = Buffer.from(await response.arrayBuffer());
  }
}
