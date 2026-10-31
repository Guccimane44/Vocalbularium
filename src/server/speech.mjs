import { randomUUID } from 'node:crypto';
import { failure } from './provider.mjs';

// What every speech provider shares (D24): the second provider kind, beside
// text (D11). It wraps the adapter's transport with the text provider's timeout,
// cancellation, diagnostics events and error codes, and checks that the reply
// is audio. An adapter extends SpeechProvider with
// `send({ text, language, voice }, signal, reply)`, which fills `reply` with the
// response's status, its MIME type and its bytes.

const TIMEOUT = 60000;

export class SpeechProvider {
  // The voice for a language: its own, or the default.
  /** @param {string} language */
  voiceFor(language) { return this.voices?.[language] ?? this.voices?.default ?? null; }
  // One clip of `text` spoken in `language` (an ISO 639-1 code): its bytes,
  // MIME type and duration in milliseconds, with the model and voice that spoke it.
  /** @param {{ text: string, language: string }} request @param {AbortSignal} [signal] @param {string} [sessionId] */
  async synthesize({ text, language }, signal, sessionId = randomUUID()) {
    const started = performance.now();
    const voice = this.voiceFor(language);
    // Diagnostics record the text's length, the language and the voice, never the audio.
    const trace = (event, extra = {}) => {
      try { this.diagnostic?.({ event, phase: 'speech', pageId: sessionId, model: this.model, language, voice, textLength: text.length, ...extra }); }
      catch { /* Logging never changes speech results. */ }
    };
    trace('speech.request', { outcome: 'started' });
    const reply = {};
    try {
      await this.send({ text, language, voice }, AbortSignal.any([AbortSignal.timeout(TIMEOUT), ...(signal ? [signal] : [])]), reply);
      if (!(reply.bytes instanceof Buffer) || !reply.bytes.length || typeof reply.mime !== 'string' || !reply.mime.startsWith('audio/')) {
        throw failure('provider_invalid', 'Speech returned no audio.');
      }
      const durationMs = this.durationOf(reply.bytes);
      trace('speech.response', { outcome: 'succeeded', status: reply.status, durationMs: Math.round(performance.now() - started), bytes: reply.bytes.length });
      return { bytes: reply.bytes, mime: reply.mime, durationMs, model: this.model ?? null, voice };
    } catch (error) {
      trace('speech.response', { outcome: 'failed', severity: 'error', status: reply.status, errorType: error.name,
        errorCode: error.code, durationMs: Math.round(performance.now() - started) });
      throw error;
    }
  }
  // A clip's length from its size, for audio at a constant bit rate.
  /** @param {Buffer} bytes */
  durationOf(bytes) { return Math.round(bytes.length * 8 / (this.bitRate ?? 128000) * 1000); }
}
