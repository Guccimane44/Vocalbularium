// @ts-check
import { generateComponent, generateFacet } from '@vocabularium/domain/modules';
import { composeModule, promptVersion } from '@vocabularium/domain/composer';
import { mainKeyOf, notePlain } from '@vocabularium/domain/pages';
import { parentContentOf } from '@vocabularium/domain/content';
/** @import { BrowserSession, Component } from '@vocabularium/contracts' */
/** @import { GenerateModule } from '@vocabularium/domain/modules' */
/** @import { AccountStore } from '../core/store.mjs' */
/** @import { Attempt, AttemptResult } from '../core/store-records.js' */
// What generation needs of a provider (D11); see Provider in provider.mjs.
/** @typedef {{ generate(request: Parameters<GenerateModule>[0] & { context?: string, language?: import('@vocabularium/contracts').InterfaceLanguage, sessionId: string }, signal: AbortSignal): Promise<unknown>, model?: string | null }} GenerationProvider */
// An admitted attempt, queued or active.
/** @typedef {{ attemptId: string, pageId: string, sessionId: string, admittedAt: number, outcome?: string }} Job */
/** @typedef {{ count: number }} Reservation */
/** @typedef {{ pageId: string, mainKey: string, context?: string }} GenerationInput */

// The saved Context, when the page has a non-empty one, is the only other
// generation input, read as plain text (it is markdown since 0.7.5).
/** @param {readonly Component[]} components */
function contextOf(components) {
  const context = components.find(component => component.moduleType === 'context');
  const text = context ? notePlain(context.content).trim() : '';
  return text || undefined;
}
import { createProvider } from './providers.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { diagnosticContext } from './diagnostics.mjs';

// The content a facet's own Retry builds on: the component's structured data.
/** @param {Component} component */
function existingContent(component) {
  const content = parentContentOf(component.content);
  if (!content) throw new Error('The component has no structured content to keep.');
  return content;
}

export class Generation {
  /** @param {AccountStore} store @param {GenerationProvider} [provider] @param {{ maxActive?: number, maxQueued?: number, diagnostic?: (event: Record<string, unknown>) => void, emit?: (event: Record<string, unknown>) => void }} [options] */
  constructor(store, provider = createProvider(), { maxActive = 4, maxQueued = 16, diagnostic = () => {}, emit = () => {} } = {}) {
    if (!Number.isSafeInteger(maxActive) || maxActive < 1 || !Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error('Generation limits must be non-negative safe integers with at least one active slot.');
    }
    this.store = store; this.provider = provider;
    this.tasks = /** @type {Map<string, { task: Promise<void>, controller: AbortController, pageId: string, sessionId: string }>} */ (new Map());
    this.queue = /** @type {Job[]} */ ([]); this.reservations = /** @type {Set<Reservation>} */ (new Set());
    this.maxActive = maxActive; this.maxQueued = maxQueued;
    this.admitted = 0; this.rejected = 0; this.closed = false;
    this.diagnostic = diagnostic;
    this.emit = emit; this.contexts = /** @type {Map<string | undefined, Record<string, unknown>>} */ (new Map());
    this.pendingResults = /** @type {Map<string, AttemptResult>} */ (new Map());
    this.failedResults = /** @type {Set<string>} */ (new Set());
    this.outbox = store.outbox;
  }
  /** @param {AccountStore} store @param {GenerationProvider} [provider] @param {ConstructorParameters<typeof Generation>[2]} [options] */
  static async create(store, provider, options) {
    const generation = new Generation(store, provider, options);
    await generation.initialize();
    return generation;
  }
  async initialize() {
    const store = this.store;
    this.emit({ event: 'recovery.started', phase: 'generation_journal', outcome: 'started' });
    if (this.outbox) {
      mkdirSync(this.outbox, { recursive: true });
      for (const file of readdirSync(this.outbox).filter(file => file.endsWith('.json'))) {
        const id = file.slice(0, -5);
        try {
          const result = JSON.parse(readFileSync(join(this.outbox, file), 'utf8'));
          this.pendingResults.set(id, result);
          await this.store.stage(id, result);
          this.clearResult(id);
          this.emit({ event: 'recovery.completed', attemptId: id, phase: 'generation_journal', outcome: 'succeeded' });
        } catch (/** @type {any} */ error) {
          if (['deleted', 'stale_session', 'stale_attempt'].includes(error.code)) this.clearResult(id);
          else this.failedResults.add(id);
          this.emit({ event: 'recovery.failed', attemptId: id, phase: 'generation_journal', severity: 'error', outcome: 'failed', errorType: error.name, errorCode: error.code });
        }
      }
    }
    // A server restart cannot resume model calls that it no longer owns.
    for (const { id } of (await store.loadingAttempts()).filter(attempt => !attempt.result)) {
      if (!this.pendingResults.has(id)) {
        await store.failAttempt(id);
        this.emit({ event: 'recovery.completed', attemptId: id, phase: 'interrupted_attempt', outcome: 'failed' });
      }
    }
  }
  // Reservations keep a confirmed retry's destructive transition and its admission
  // together. They are held across the store transaction and consumed by start().
  // A request is admitted whole or not at all, so it reserves every attempt it starts.
  /** @returns {Reservation | null} */
  reserve(count = 1) {
    if (this.closed || this.occupied() + count > this.maxActive + this.maxQueued) return null;
    const reservation = { count };
    this.reservations.add(reservation);
    return reservation;
  }
  /** @param {Reservation | undefined | null} reservation */
  release(reservation) { if (reservation) this.reservations.delete(reservation); }
  occupied() { return this.tasks.size + this.queue.length + [...this.reservations].reduce((sum, { count }) => sum + count, 0); }
  /** @param {string} event @param {string} category @param {string} [attemptId] @param {number} [durationMs] */
  record(event, category, attemptId, durationMs) {
    // Whitelist fields: selected text, generated output, prompts, tokens and provider
    // responses must never enter operational events.
    try {
      this.diagnostic({ ...this.contexts.get(attemptId), event, category, attemptId, ...(durationMs === undefined ? {} : { durationMs }),
        ...(event === 'started' ? { queueMs: durationMs } : {}),
        active: this.tasks.size, queued: this.queue.length, reserved: this.reservations.size,
        admitted: this.admitted, rejected: this.rejected });
    } catch { /* Diagnostics cannot turn a committed capture or retry into a failed request. */ }
  }
  /** @param {any} error a thrown value @param {AbortController} controller */
  category(error, controller) {
    if (controller.signal.aborted || error?.name === 'AbortError') return 'canceled';
    if (error?.name === 'TimeoutError') return 'timeout';
    if (['provider_unconfigured', 'provider_response', 'provider_invalid', 'provider_incomplete', 'provider_refused'].includes(error?.code)) return error.code;
    if (error?.name === 'TypeError') return 'provider_transport';
    return 'generation_failure';
  }
  /** @param {Job} job @param {Reservation | undefined | null} reservation */
  admit(job, reservation) {
    if (reservation && (!this.reservations.has(reservation) || reservation.count < 1)) throw new Error('Generation reservation is invalid.');
    if (reservation && --reservation.count === 0) this.reservations.delete(reservation);
    if (this.closed || (!reservation && this.occupied() >= this.maxActive + this.maxQueued)) return false;
    this.admitted++;
    if (this.tasks.size < this.maxActive && !this.queue.length) this.startActive(job);
    else { this.queue.push(job); this.pump(); }
    this.record('admitted', 'accepted', job.attemptId);
    return true;
  }
  pump() {
    while (!this.closed && this.tasks.size < this.maxActive && this.queue.length) {
      this.startActive(/** @type {Job} */ (this.queue.shift()));
    }
  }
  /** @param {Job} job */
  startActive(job) {
    const controller = new AbortController();
    const started = performance.now();
    this.record('started', 'active', job.attemptId, Math.round(started - job.admittedAt));
    const task = this.store.background(() => diagnosticContext.run(this.contexts.get(job.attemptId) ?? {}, () => this.execute(job, controller)));
    this.tasks.set(job.attemptId, { task, controller, pageId: job.pageId, sessionId: job.sessionId });
    task.finally(() => {
      this.tasks.delete(job.attemptId);
      this.pump();
      this.record('settled', controller.signal.aborted ? 'canceled' : job.outcome ?? 'finished', job.attemptId,
        Math.round(performance.now() - started));
      this.contexts.delete(job.attemptId);
    }).catch(() => {});
  }
  /** @param {Job} job @param {AbortController} controller */
  async execute(job, controller) {
    const { attemptId, pageId } = job;
    let result;
    try {
      // Queued work can become obsolete before it reaches the active pool.
      const attempt = await this.store.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result || controller.signal.aborted) return;
      await this.store.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      const page = await this.store.page(pageId);
      const target = page.components.find(component => component.attemptId === attemptId && component.status === 'loading');
      if (!target || controller.signal.aborted) return;
      const input = { pageId, mainKey: mainKeyOf(page.components), context: contextOf(page.components) };
      this.emit({ event: 'generation.input', attemptId, pageId, componentId: attempt.component_id, outcome: 'started', content: { selectedText: input.mainKey } });
      // The prompt version of the request the provider receives (D11).
      /** @type {string | null} */
      let prompt = null;
      // The Expertise modules write in the account's interface language (D14, K36).
      const language = await this.store.language();
      /** @type {GenerateModule} */
      const generate = request => {
        prompt = promptVersion(composeModule({ ...request, context: input.context, language }));
        return this.provider.generate({ ...request, context: input.context, language, sessionId: pageId }, controller.signal);
      };
      // A facet's own Retry (0.7.3) replaces only its section of the content kept meanwhile.
      const output = attempt.module.retry
        ? await generateFacet({ mainKey: input.mainKey, module: attempt.module, facet: attempt.module.retry, existing: existingContent(target), generate })
        // One request writes the card (D17); a facet its core's flags rule out is dropped and counted, never with its text (K53).
        // A card's Retry keeps the reading of the core it had (D19).
        : await generateComponent({ mainKey: input.mainKey, module: attempt.module, previous: attempt.module.previous, generate,
          onMismatch: ({ module, facet }) => this.emit({ event: 'generation.facet_mismatch', attemptId, pageId, componentId: attempt.component_id,
            category: `${module}.${facet}`, severity: 'warn', outcome: 'rejected' }) });
      if (controller.signal.aborted) return;
      // Structured content (D09), journalled and staged as data.
      result = { ok: true, content: output, ...(prompt ? { generation: { model: this.provider.model ?? null, prompt } } : {}) };
      this.emit({ event: 'generation.output', attemptId, pageId, componentId: attempt.component_id, outcome: 'succeeded', content: { output } });
    } catch (/** @type {any} */ error) {
      job.outcome = 'failed';
      const category = this.category(error, controller);
      this.record('failed', category, attemptId);
      if (category === 'canceled' || ['deleted', 'stale_session', 'stale_attempt'].includes(error?.code)) return;
      result = { ok: false };
    }
    this.pendingResults.set(attemptId, result);
    if (this.outbox) {
      try {
        const path = join(this.outbox, `${attemptId}.json`);
        writeFileSync(path + '.tmp', JSON.stringify(result), { flush: true });
        renameSync(path + '.tmp', path);
      } catch { this.record('failed', 'journal_failure', attemptId); }
    }
    const staging = performance.now();
    try { await this.store.stage(attemptId, result); this.clearResult(attemptId); this.record('staged', 'persisted', attemptId, Math.round(performance.now() - staging)); }
    catch (/** @type {any} */ error) {
      if (['deleted', 'stale_session', 'stale_attempt'].includes(error.code)) this.clearResult(attemptId);
      else { job.outcome = 'failed'; this.failedResults.add(attemptId); this.record('failed', 'persistence_failure', attemptId); }
    }
  }
  // Admits the page's loading attempts, or only those listed.
  /** @param {string} pageId @param {readonly (string | null)[]} [attemptIds] @param {{ reservation?: Reservation | null }} [options] */
  async start(pageId, attemptIds, { reservation } = {}) {
    const page = await this.store.page(pageId);
    for (const component of page.components) {
      if (attemptIds && !attemptIds.includes(component.attemptId)) continue;
      // A loading component has its attempt.
      if (component.status !== 'loading' || this.tasks.has(/** @type {string} */ (component.attemptId)) ||
        this.queue.some(job => job.attemptId === component.attemptId)) continue;
      const attempt = await this.store.attempt(/** @type {string} */ (component.attemptId));
      if (attempt.result) continue;
      this.contexts.set(attempt.id, { ...diagnosticContext.getStore(), pageId, componentId: component.id, attemptId: attempt.id });
      if (!this.admit({ attemptId: attempt.id, pageId, sessionId: attempt.session_id, admittedAt: performance.now() }, reservation)) {
        this.rejected++;
        await this.store.failAttempt(attempt.id);
        this.record('rejected', 'generation_busy', attempt.id);
        this.contexts.delete(attempt.id);
      }
    }
  }
  async close() {
    this.closed = true;
    const waiting = this.queue.splice(0);
    for (const { controller } of this.tasks.values()) controller.abort();
    for (const job of waiting) await this.store.failAttempt(job.attemptId);
    await Promise.allSettled([...this.tasks.values()].map(({ task }) => task));
  }
  async cancelObsolete() {
    const active = await this.store.loadingAttempts();
    const ids = new Set(active.map(attempt => attempt.id));
    for (const id of this.pendingResults.keys()) if (!ids.has(id)) this.clearResult(id);
    this.queue = this.queue.filter(job => {
      if (ids.has(job.attemptId)) return true;
      this.record('canceled', 'obsolete', job.attemptId);
      return false;
    });
    for (const [id, { controller }] of this.tasks) if (!ids.has(id)) controller.abort();
    this.pump();
  }
  /** @param {string} attemptId @param {BrowserSession} session */
  async saveResult(attemptId, session) {
    if (!this.pendingResults.has(attemptId)) return;
    await this.store.requireSession(session);
    const attempt = await this.store.attempt(attemptId);
    if (attempt.installation_id !== session.installationId || attempt.session_id !== session.sessionId) return;
    await this.store.stage(attemptId, /** @type {AttemptResult} */ (this.pendingResults.get(attemptId)));
    this.clearResult(attemptId);
    this.emit({ event: 'recovery.completed', attemptId, phase: 'result_staging', outcome: 'succeeded' });
  }
  /** @param {string} attemptId */
  clearResult(attemptId) {
    this.pendingResults.delete(attemptId);
    this.failedResults.delete(attemptId);
    if (this.outbox) {
      rmSync(join(this.outbox, `${attemptId}.json`), { force: true });
      rmSync(join(this.outbox, `${attemptId}.json.tmp`), { force: true });
    }
  }
}
