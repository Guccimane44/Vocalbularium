import { failure } from '../../src/server/provider.mjs';
import { SpeechProvider } from '../../src/server/speech.mjs';

// A controlled speech provider (D24): each clip is the text's bytes as audio,
// unless `fail` names an error code for that text, and `hold` keeps a clip
// generating until `release(text)` is called.
export class FakeSpeechProvider extends SpeechProvider {
  bitRate = 128000;
  constructor({ fail = {}, hold = [] } = {}) {
    super();
    this.model = 'fake-speech'; this.voices = { default: 'fake-voice' };
    this.fail = fail; this.held = new Map(hold.map(text => [text, Promise.withResolvers()]));
    this.calls = [];
  }
  release(text) { this.held.get(text)?.resolve(); }
  async send({ text, language, voice }, signal, reply) {
    this.calls.push({ text, language, voice });
    const held = this.held.get(text);
    if (held) await Promise.race([held.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))]);
    signal.throwIfAborted();
    if (this.fail[text]) throw failure(this.fail[text], 'Controlled speech failure.');
    reply.status = 200; reply.mime = 'audio/mpeg'; reply.bytes = Buffer.from(`${language}:${text}`);
  }
}
