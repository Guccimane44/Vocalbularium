// @ts-check
import { createSpeechProvider } from './speech-providers.mjs';
/** @import { AccountStore } from '../core/store.mjs' */
/** @import { ClipKey } from '../core/store-records.js' */
// What audio needs of a speech provider (D24); see SpeechProvider in speech.mjs.
/** @typedef {{ synthesize(request: { text: string, language: string }, signal: AbortSignal, sessionId?: string): Promise<{ bytes: Buffer, mime: string, durationMs: number, model: string | null, voice: string | null }>, model?: string | null, apiKey?: string, diagnostic?: (event: Record<string, unknown>) => void }} AudioProvider */
// A spoken part of a component: the text to speak, line by line, and its language.
/** @typedef {{ part: string, language: string, lines: readonly string[] }} SpokenPart */
/** @typedef {(moduleType: string, content: unknown) => readonly SpokenPart[]} SpokenParts */

const keyOf = (/** @type {ClipKey} */ key) => `${key.pageId}/${key.componentId}/${key.part}/${key.line}`;
// A line longer than this, such as a main key over 500 characters, is not
// spoken (K73): every clip is billed by character.
export const MAX_SPOKEN_LENGTH = 500;

// Audio jobs (D24): one per clip of a spoken part, after the text it speaks is
// published, in parallel and with their own bounds beside the text attempts
// (C31). A clip succeeds or fails on its own; nothing is cached.
export class Audio {
  /** @param {AccountStore} store @param {AudioProvider} [provider] @param {{ maxActive?: number, maxQueued?: number, spokenParts?: SpokenParts, emit?: (event: Record<string, unknown>) => void }} [options] */
  constructor(store, provider = createSpeechProvider(), { maxActive = 4, maxQueued = 32, spokenParts = () => [], emit = () => {} } = {}) {
    if (!Number.isSafeInteger(maxActive) || maxActive < 1 || !Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error('Audio limits must be non-negative safe integers with at least one active slot.');
    }
    this.store = store; this.provider = provider;
    this.maxActive = maxActive; this.maxQueued = maxQueued;
    // Which parts of a module's content are spoken; the catalog supplies it from
    // increment 2, and until then nothing is.
    this.spokenParts = spokenParts;
    this.emit = emit; this.closed = false;
    this.tasks = /** @type {Map<string, { task: Promise<void>, controller: AbortController }>} */ (new Map());
    this.queue = /** @type {ClipKey[]} */ ([]);
  }
  /** @param {AccountStore} store @param {AudioProvider} [provider] @param {ConstructorParameters<typeof Audio>[2]} [options] */
  static async create(store, provider, options) {
    const audio = new Audio(store, provider, options);
    await audio.initialize();
    return audio;
  }
  // A server restart cannot resume speech calls it no longer owns.
  async initialize() {
    for (const key of await this.store.pendingClips()) {
      await this.store.failClip(key, 'interrupted');
      this.record('interrupted', key);
    }
  }
  /** @param {string} event @param {ClipKey} [key] @param {Record<string, unknown>} [extra] */
  record(event, key, extra = {}) {
    // Whitelist fields: the spoken text and the audio never enter operational events.
    try {
      this.emit({ event: 'audio.work', phase: event, ...(key ? { pageId: key.pageId, componentId: key.componentId, category: `${key.part}.${key.line}` } : {}),
        active: this.tasks.size, queued: this.queue.length, ...extra });
    } catch { /* Diagnostics cannot fail a clip. */ }
  }
  /** @param {any} error a thrown value @param {AbortController} controller */
  category(error, controller) {
    if (controller.signal.aborted || error?.name === 'AbortError') return 'canceled';
    if (error?.name === 'TimeoutError') return 'timeout';
    if (['provider_unconfigured', 'provider_response', 'provider_invalid', 'provider_refused'].includes(error?.code)) return error.code;
    if (error?.name === 'TypeError') return 'provider_transport';
    return 'speech_failure';
  }
  occupied() { return this.tasks.size + this.queue.length; }
  // A published attempt's audio (D24). A completed component speaks each of its
  // spoken parts anew, or only the facet a facet's own Retry wrote; a failed one,
  // or a part with nothing to speak, keeps no clips.
  /** @param {{ pageId: string, componentId: string, moduleType: string, content: unknown, state: string, retry?: string }} published */
  async afterPublish({ pageId, componentId, moduleType, content, state, retry }) {
    if (this.closed) return;
    if (state !== 'completed') {
      if (!retry) await this.store.dropClips(pageId, componentId);
      await this.cancelObsolete();
      return;
    }
    const parts = this.spokenParts(moduleType, content).filter(part => !retry || part.part === retry);
    const spoken = parts.filter(part => part.lines.length && part.lines.every(line => line.length <= MAX_SPOKEN_LENGTH));
    await this.store.dropClips(pageId, componentId, retry ? [retry] : undefined);
    try {
      for (const { part, language, lines } of spoken) await this.speak(pageId, componentId, part, lines, language);
    } catch (/** @type {any} */ error) {
      // The component moved on, to another attempt or away, while it was published.
      if (error?.code !== 'deleted') throw error;
    }
    await this.cancelObsolete();
  }
  // Speaks a part's lines anew, one clip each, replacing the clips it had.
  /** @param {string} pageId @param {string} componentId @param {string} part @param {readonly string[]} lines @param {string} language */
  async speak(pageId, componentId, part, lines, language) {
    const keys = await this.store.replaceClips(pageId, componentId, part, lines, language);
    for (const key of keys) await this.admit(key);
  }
  // A clip's own Retry: speaks it again, unless it is still waiting or generating.
  /** @param {ClipKey} key */
  async retry(key) {
    if (!await this.store.restartClip(key)) return false;
    await this.admit(key);
    return true;
  }
  // A clip that cannot be admitted fails without a provider call.
  /** @param {ClipKey} key */
  async admit(key) {
    const id = keyOf(key);
    // A clip spoken again replaces the job still speaking its earlier version.
    this.tasks.get(id)?.controller.abort();
    this.queue = this.queue.filter(queued => keyOf(queued) !== id);
    if (this.closed || this.occupied() >= this.maxActive + this.maxQueued) {
      await this.store.failClip(key, 'generation_busy');
      this.record('rejected', key);
      return;
    }
    this.queue.push(key);
    this.record('admitted', key);
    this.pump();
  }
  pump() {
    while (!this.closed && this.queue.length && this.tasks.size < this.maxActive) {
      const key = /** @type {ClipKey} */ (this.queue.shift());
      const id = keyOf(key);
      if (this.tasks.has(id)) { this.queue.push(key); break; }
      const controller = new AbortController();
      const started = performance.now();
      const entry = { controller, task: Promise.resolve() };
      entry.task = this.store.background(() => this.execute(key, controller)).finally(() => {
        if (this.tasks.get(id) === entry) this.tasks.delete(id);
        this.record('settled', key, { durationMs: Math.round(performance.now() - started), outcome: controller.signal.aborted ? 'canceled' : 'finished' });
        this.pump();
      });
      this.tasks.set(id, entry);
      entry.task.catch(() => {});
    }
  }
  /** @param {ClipKey} key @param {AbortController} controller */
  async execute(key, controller) {
    let token;
    try {
      const clip = await this.store.claimClip(key);
      if (!clip || controller.signal.aborted) return;
      token = clip.token;
      this.record('started', key);
      const audio = await this.provider.synthesize({ text: clip.text, language: clip.language }, controller.signal, key.pageId);
      if (controller.signal.aborted) return;
      if (await this.store.finishClip(key, token, audio)) this.record('ready', key);
    } catch (/** @type {any} */ error) {
      const category = this.category(error, controller);
      this.record('failed', key, { errorCode: category });
      if (category === 'canceled' || error?.code === 'deleted') return;
      if (token) await this.store.failClip(key, category, token).catch(() => {});
    }
  }
  // Stops the jobs whose clips were deleted or replaced, such as a deleted
  // component's or page's.
  async cancelObsolete() {
    const pending = new Set((await this.store.pendingClips()).map(keyOf));
    this.queue = this.queue.filter(key => {
      if (pending.has(keyOf(key))) return true;
      this.record('canceled', key);
      return false;
    });
    for (const [id, { controller }] of this.tasks) if (!pending.has(id)) controller.abort();
    this.pump();
  }
  async close() {
    this.closed = true;
    this.queue = [];
    for (const { controller } of this.tasks.values()) controller.abort();
    await Promise.allSettled([...this.tasks.values()].map(({ task }) => task));
  }
}
