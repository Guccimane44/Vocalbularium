// @ts-check
import { randomUUID } from 'node:crypto';
import { failure } from './provider.mjs';

// What every speech provider shares (D24): the second provider kind, beside
// text (D11). It wraps the adapter's transport with the text provider's timeout,
// cancellation, diagnostics events and error codes, and checks that the reply
// is audio. An adapter extends SpeechProvider with
// `send({ text, language, voice }, signal, reply)`, which fills `reply` with the
// response's status, its MIME type and its bytes.

// What an adapter's `send` fills in.
/** @typedef {{ status?: number, mime?: unknown, bytes?: unknown }} SpeechReply */
// What an adapter adds to SpeechProvider, and the server sets on it for diagnostics.
/** @typedef {{
  model?: string | null,
  voices?: Record<string, string>,
  bitRate?: number,
  diagnostic?: (event: Record<string, unknown>) => void,
  send(request: { text: string, language: string, voice: string | null }, signal: AbortSignal, reply: SpeechReply): Promise<void>
}} SpeechAdapter */
/** @typedef {Error & { code?: string }} SpeechError */

const TIMEOUT = 60000;

export class SpeechProvider {
  // The voice for a clip: the one named for the part that speaks it, such as
  // `german.pronunciation`, else the language's own, else the default. So a
  // module's facet can have a native voice while another part keeps the default.
  /** @param {string} language @param {string} [part] */
  voiceFor(language, part) {
    const { voices } = /** @type {SpeechProvider & SpeechAdapter} */ (/** @type {unknown} */ (this));
    return (part && voices?.[part]) || voices?.[language] || voices?.default || null;
  }
  // One clip of `text` spoken in `language` (an ISO 639-1 code): its bytes,
  // MIME type and duration in milliseconds, with the model and voice that spoke it.
  /** @param {{ text: string, language: string, part?: string }} request @param {AbortSignal} [signal] @param {string} [sessionId] */
  async synthesize({ text, language, part }, signal, sessionId = randomUUID()) {
    const adapter = /** @type {SpeechProvider & SpeechAdapter} */ (/** @type {unknown} */ (this));
    const started = performance.now();
    const voice = this.voiceFor(language, part);
    // Diagnostics record the text's length, the language and the voice, never the audio.
    /** @param {string} event @param {Record<string, unknown>} [extra] */
    const trace = (event, extra = {}) => {
      try { adapter.diagnostic?.({ event, phase: 'speech', pageId: sessionId, model: adapter.model, language, voice, textLength: text.length, ...extra }); }
      catch { /* Logging never changes speech results. */ }
    };
    trace('speech.request', { outcome: 'started' });
    /** @type {SpeechReply} */
    const reply = {};
    try {
      await adapter.send({ text, language, voice }, AbortSignal.any([AbortSignal.timeout(TIMEOUT), ...(signal ? [signal] : [])]), reply);
      if (!(reply.bytes instanceof Buffer) || !reply.bytes.length || typeof reply.mime !== 'string' || !reply.mime.startsWith('audio/')) {
        throw failure('provider_invalid', 'Speech returned no audio.');
      }
      const durationMs = this.durationOf(reply.bytes);
      trace('speech.response', { outcome: 'succeeded', status: reply.status, durationMs: Math.round(performance.now() - started), bytes: reply.bytes.length });
      return { bytes: reply.bytes, mime: reply.mime, durationMs, model: adapter.model ?? null, voice };
    } catch (caught) {
      const error = /** @type {SpeechError} */ (caught);
      trace('speech.response', { outcome: 'failed', severity: 'error', status: reply.status, errorType: error.name,
        errorCode: error.code, durationMs: Math.round(performance.now() - started) });
      throw error;
    }
  }
  // A clip's length from its size, for audio at a constant bit rate.
  /** @param {Buffer} bytes */
  durationOf(bytes) {
    const { bitRate } = /** @type {SpeechProvider & SpeechAdapter} */ (/** @type {unknown} */ (this));
    return Math.round(bytes.length * 8 / (bitRate ?? 128000) * 1000);
  }
}
