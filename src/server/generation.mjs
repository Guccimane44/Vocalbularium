import { renderSeite, validateInterpretation } from '../core/modules.mjs';
import { OpenCodeProvider } from './opencode.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { diagnosticContext } from './diagnostics.mjs';

export class Generation {
  constructor(store, provider = new OpenCodeProvider(), { maxActive = 4, maxQueued = 16, diagnostic = () => {}, emit = () => {} } = {}) {
    if (!Number.isSafeInteger(maxActive) || maxActive < 1 || !Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error('Generation limits must be non-negative safe integers with at least one active slot.');
    }
    this.store = store; this.provider = provider;
    this.tasks = new Map(); this.interpretations = new Map(); this.outputs = new Map();
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
  async interpretation(karte, attempt) {
    const current = (await this.store.karte(karte.id)).interpretation;
    if (current) return current;
    const key = `${karte.id}:${attempt.session_id}`;
    if (!this.interpretations.has(key)) {
      const controller = new AbortController();
      const attempts = karte.seites.filter(seite => seite.status === 'loading').map(seite => seite.attempt_id);
      const promise = this.provider.interpret(karte.selected_text, controller.signal, karte.id)
        .then(value => this.store.establishInterpretation(karte.id, validateInterpretation(value), attempts));
      this.interpretations.set(key, { promise, controller });
      promise.finally(() => this.interpretations.delete(key)).catch(() => {});
    }
    return this.interpretations.get(key).promise;
  }

  // Reservations keep a confirmed retry's destructive transition and its admission
  // together. They are held across the store transaction and consumed by start().
  reserve() {
    if (this.closed || this.occupied() >= this.maxActive + this.maxQueued) return null;
    const reservation = {};
    this.reservations.add(reservation);
    return reservation;
  }
  release(reservation) { if (reservation) this.reservations.delete(reservation); }
  occupied() { return this.tasks.size + this.queue.length + this.reservations.size; }
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
    if (reservation && !this.reservations.has(reservation)) throw new Error('Generation reservation is invalid.');
    if (reservation) this.reservations.delete(reservation);
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
    this.tasks.set(job.attemptId, { task, controller, karteId: job.karteId, sessionId: job.sessionId });
    task.finally(() => {
      this.tasks.delete(job.attemptId);
      this.pump();
      if (![...this.tasks.values()].some(task => task.karteId === job.karteId) &&
        !this.queue.some(waiting => waiting.karteId === job.karteId)) {
        for (const key of this.outputs.keys()) if (key.startsWith(`${job.karteId}:`)) this.outputs.delete(key);
      }
      this.record('settled', controller.signal.aborted ? 'canceled' : job.outcome ?? 'finished', job.attemptId,
        Math.round(performance.now() - started));
      this.contexts.delete(job.attemptId);
    }).catch(() => {});
  }
  async execute(job, controller) {
    const { attemptId, karteId } = job;
    let result;
    try {
      // Queued work can become obsolete before it reaches the active pool.
      const attempt = await this.store.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result || controller.signal.aborted) return;
      await this.store.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      const karte = await this.store.karte(karteId);
      if (!karte.seites.some(seite => seite.attempt_id === attemptId && seite.status === 'loading') || controller.signal.aborted) return;
      const needed = attempt.modules.some(module => module.type !== 'selected');
      this.emit({ event: 'generation.input', attemptId, karteId, outcome: 'started', content: { selectedText: karte.selected_text } });
      const interpretation = needed ? await this.interpretation(karte, attempt) : null;
      if (controller.signal.aborted) return;
      const text = await renderSeite({
        selectedText: karte.selected_text, modules: attempt.modules, interpretation,
        generate: input => this.provider.generate({ ...input, sessionId: karte.id }, controller.signal),
        claimOutput: (type, output) => {
          if (!['german-examples', 'sentence-usage'].includes(type)) return true;
          const key = `${karte.id}:${type}`;
          const seen = this.outputs.get(key) ?? new Set();
          if (seen.has(output)) return false;
          seen.add(output); this.outputs.set(key, seen); return true;
        }
      });
      if (controller.signal.aborted) return;
      result = { ok: true, text };
      this.emit({ event: 'generation.output', attemptId, karteId, outcome: 'succeeded', content: { output: text } });
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
  async start(karteId, seiteId, { reservation } = {}) {
    const karte = await this.store.karte(karteId);
    for (const seite of karte.seites) {
      if (seiteId && seite.seite_id !== seiteId) continue;
      if (seite.status !== 'loading' || this.tasks.has(seite.attempt_id) ||
        this.queue.some(job => job.attemptId === seite.attempt_id)) continue;
      const attempt = await this.store.attempt(seite.attempt_id);
      if (attempt.result) continue;
      this.contexts.set(attempt.id, { ...diagnosticContext.getStore(), karteId, seiteId: seite.seite_id, attemptId: attempt.id });
      if (!this.admit({ attemptId: attempt.id, karteId, sessionId: attempt.session_id, admittedAt: performance.now() }, reservation)) {
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
      if (!active.some(attempt => `${attempt.karte_id}:${attempt.session_id}` === key)) controller.abort();
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
