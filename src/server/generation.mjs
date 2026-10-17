import { generateComponent, generateCore, generateFacet, validateInterpretation } from '@vocabularium/domain/modules';
import { mainKeyOf, notePlain } from '@vocabularium/domain/pages';
import { parentContentOf } from '@vocabularium/domain/content';

// The saved Context, when the page has a non-empty one, is the only other
// generation input, read as plain text (it is markdown since 0.7.5).
function contextOf(components) {
  const context = components.find(component => component.moduleType === 'context');
  const text = context ? notePlain(context.content).trim() : '';
  return text || undefined;
}
import { OpenCodeProvider } from './opencode.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { diagnosticContext } from './diagnostics.mjs';

// The content a facet's own Retry builds on: the component's structured data.
function existingContent(component) {
  const content = parentContentOf(component.content);
  if (!content) throw new Error('The component has no structured content to keep.');
  return content;
}

export class Generation {
  constructor(store, provider = new OpenCodeProvider(), { maxActive = 4, maxQueued = 16, diagnostic = () => {}, emit = () => {} } = {}) {
    if (!Number.isSafeInteger(maxActive) || maxActive < 1 || !Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error('Generation limits must be non-negative safe integers with at least one active slot.');
    }
    this.store = store; this.provider = provider;
    this.tasks = new Map(); this.interpretations = new Map();
    this.queue = []; this.reservations = new Set();
    this.maxActive = maxActive; this.maxQueued = maxQueued;
    this.admitted = 0; this.rejected = 0; this.closed = false;
    this.diagnostic = diagnostic;
    this.emit = emit; this.contexts = new Map();
    this.pendingResults = new Map();
    this.failedResults = new Set();
    this.outbox = store.outbox;
  }
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
        } catch (error) {
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
  // One interpretation per run, shared by every attempt in it.
  async interpretation(input, attempt) {
    const current = (await this.store.run(attempt.run_id)).interpretation;
    if (current) return current;
    const key = attempt.run_id;
    if (!this.interpretations.has(key)) {
      const controller = new AbortController();
      const promise = this.provider.interpret(input.mainKey, controller.signal, input.pageId, input.context)
        .then(value => this.store.establishInterpretation(key, validateInterpretation(value)));
      this.interpretations.set(key, { promise, controller });
      promise.finally(() => this.interpretations.delete(key)).catch(() => {});
    }
    return this.interpretations.get(key).promise;
  }

  // Reservations keep a confirmed retry's destructive transition and its admission
  // together. They are held across the store transaction and consumed by start().
  // A request is admitted whole or not at all, so it reserves every attempt it starts.
  reserve(count = 1) {
    if (this.closed || this.occupied() + count > this.maxActive + this.maxQueued) return null;
    const reservation = { count };
    this.reservations.add(reservation);
    return reservation;
  }
  release(reservation) { if (reservation) this.reservations.delete(reservation); }
  occupied() { return this.tasks.size + this.queue.length + [...this.reservations].reduce((sum, { count }) => sum + count, 0); }
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
  category(error, controller) {
    if (controller.signal.aborted || error?.name === 'AbortError') return 'canceled';
    if (error?.name === 'TimeoutError') return 'timeout';
    if (['provider_unconfigured', 'provider_response', 'provider_invalid', 'provider_incomplete', 'provider_refused'].includes(error?.code)) return error.code;
    if (error?.name === 'TypeError') return 'provider_transport';
    return 'generation_failure';
  }
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
      this.startActive(this.queue.shift());
    }
  }
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
      const interpretation = await this.interpretation(input, attempt);
      if (controller.signal.aborted) return;
      const generate = request => this.provider.generate({ ...request, context: input.context, sessionId: pageId }, controller.signal);
      // A facet's own Retry (0.7.3) replaces only its section of the content kept meanwhile.
      // The core's own Retry (D10, amended) replaces only the core.
      const output = attempt.module.retryCore
        ? await generateCore({ mainKey: input.mainKey, module: attempt.module, existing: existingContent(target), interpretation, generate })
        : attempt.module.retry
        ? await generateFacet({ mainKey: input.mainKey, module: attempt.module, facet: attempt.module.retry, existing: existingContent(target), interpretation, generate })
        : await generateComponent({ mainKey: input.mainKey, module: attempt.module, interpretation, generate });
      if (controller.signal.aborted) return;
      // Structured content (D09), journalled and staged as data.
      result = { ok: true, content: output };
      this.emit({ event: 'generation.output', attemptId, pageId, componentId: attempt.component_id, outcome: 'succeeded', content: { output } });
    } catch (error) {
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
    catch (error) {
      if (['deleted', 'stale_session', 'stale_attempt'].includes(error.code)) this.clearResult(attemptId);
      else { job.outcome = 'failed'; this.failedResults.add(attemptId); this.record('failed', 'persistence_failure', attemptId); }
    }
  }
  // Admits the page's loading attempts, or only those listed.
  async start(pageId, attemptIds, { reservation } = {}) {
    const page = await this.store.page(pageId);
    for (const component of page.components) {
      if (attemptIds && !attemptIds.includes(component.attemptId)) continue;
      if (component.status !== 'loading' || this.tasks.has(component.attemptId) ||
        this.queue.some(job => job.attemptId === component.attemptId)) continue;
      const attempt = await this.store.attempt(component.attemptId);
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
    for (const { controller } of this.interpretations.values()) controller.abort();
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
    for (const [key, { controller }] of this.interpretations) {
      if (!active.some(attempt => attempt.run_id === key)) controller.abort();
    }
    this.pump();
  }
  async saveResult(attemptId, session) {
    if (!this.pendingResults.has(attemptId)) return;
    await this.store.requireSession(session);
    const attempt = await this.store.attempt(attemptId);
    if (attempt.installation_id !== session.installationId || attempt.session_id !== session.sessionId) return;
    await this.store.stage(attemptId, this.pendingResults.get(attemptId));
    this.clearResult(attemptId);
    this.emit({ event: 'recovery.completed', attemptId, phase: 'result_staging', outcome: 'succeeded' });
  }
  clearResult(attemptId) {
    this.pendingResults.delete(attemptId);
    this.failedResults.delete(attemptId);
    if (this.outbox) {
      rmSync(join(this.outbox, `${attemptId}.json`), { force: true });
      rmSync(join(this.outbox, `${attemptId}.json.tmp`), { force: true });
    }
  }
}
