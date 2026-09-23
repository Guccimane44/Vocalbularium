import { renderPage, validateInterpretation } from '../core/modules.mjs';
import { OpenCodeProvider } from './opencode.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export class Generation {
  constructor(store, provider = new OpenCodeProvider(), { maxActive = 4, maxQueued = 16, diagnostic = () => {} } = {}) {
    if (!Number.isSafeInteger(maxActive) || maxActive < 1 || !Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error('Generation limits must be non-negative safe integers with at least one active slot.');
    }
    this.store = store; this.provider = provider;
    this.tasks = new Map(); this.interpretations = new Map(); this.outputs = new Map();
    this.queue = []; this.reservations = new Set();
    this.maxActive = maxActive; this.maxQueued = maxQueued;
    this.admitted = 0; this.rejected = 0; this.closed = false;
    this.diagnostic = diagnostic;
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
    if (this.outbox) {
      mkdirSync(this.outbox, { recursive: true });
      for (const file of readdirSync(this.outbox).filter(file => file.endsWith('.json'))) {
        const id = file.slice(0, -5);
        try {
          const result = JSON.parse(readFileSync(join(this.outbox, file), 'utf8'));
          this.pendingResults.set(id, result);
          await this.store.stage(id, result);
          this.clearResult(id);
        } catch (error) {
          if (['deleted', 'stale_session', 'stale_attempt'].includes(error.code)) this.clearResult(id);
          else this.failedResults.add(id);
        }
      }
    }
    // A server restart cannot resume model calls that it no longer owns.
    for (const { id } of (await store.loadingAttempts()).filter(attempt => !attempt.result)) {
      if (!this.pendingResults.has(id)) await store.failAttempt(id);
    }
  }
  async interpretation(card, attempt) {
    const current = (await this.store.card(card.id)).interpretation;
    if (current) return current;
    const key = `${card.id}:${attempt.session_id}`;
    if (!this.interpretations.has(key)) {
      const controller = new AbortController();
      const attempts = card.pages.filter(page => page.status === 'loading').map(page => page.attempt_id);
      const promise = this.provider.interpret(card.selected_text, controller.signal, card.id)
        .then(value => this.store.establishInterpretation(card.id, validateInterpretation(value), attempts));
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
      this.diagnostic({ event, category, attemptId, ...(durationMs === undefined ? {} : { durationMs }),
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
    const task = this.store.background(() => this.execute(job, controller));
    this.tasks.set(job.attemptId, { task, controller, cardId: job.cardId, sessionId: job.sessionId });
    task.finally(() => {
      this.tasks.delete(job.attemptId);
      this.pump();
      if (![...this.tasks.values()].some(task => task.cardId === job.cardId) &&
        !this.queue.some(waiting => waiting.cardId === job.cardId)) {
        for (const key of this.outputs.keys()) if (key.startsWith(`${job.cardId}:`)) this.outputs.delete(key);
      }
      this.record('settled', controller.signal.aborted ? 'canceled' : 'finished', job.attemptId,
        Math.round(performance.now() - started));
    }).catch(() => {});
  }
  async execute(job, controller) {
    const { attemptId, cardId } = job;
    let result;
    try {
      // Queued work can become obsolete before it reaches the active pool.
      const attempt = await this.store.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result || controller.signal.aborted) return;
      await this.store.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      const card = await this.store.card(cardId);
      if (!card.pages.some(page => page.attempt_id === attemptId && page.status === 'loading') || controller.signal.aborted) return;
      const needed = attempt.modules.some(module => module.type !== 'selected');
      const interpretation = needed ? await this.interpretation(card, attempt) : null;
      if (controller.signal.aborted) return;
      const text = await renderPage({
        selectedText: card.selected_text, modules: attempt.modules, interpretation,
        generate: input => this.provider.generate({ ...input, sessionId: card.id }, controller.signal),
        claimOutput: (type, output) => {
          if (!['german-examples', 'sentence-usage'].includes(type)) return true;
          const key = `${card.id}:${type}`;
          const seen = this.outputs.get(key) ?? new Set();
          if (seen.has(output)) return false;
          seen.add(output); this.outputs.set(key, seen); return true;
        }
      });
      if (controller.signal.aborted) return;
      result = { ok: true, text };
    } catch (error) {
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
    try { await this.store.stage(attemptId, result); this.clearResult(attemptId); }
    catch (error) {
      if (['deleted', 'stale_session', 'stale_attempt'].includes(error.code)) this.clearResult(attemptId);
      else { this.failedResults.add(attemptId); this.record('failed', 'persistence_failure', attemptId); }
    }
  }
  async start(cardId, pageId, { reservation } = {}) {
    const card = await this.store.card(cardId);
    for (const page of card.pages) {
      if (pageId && page.page_id !== pageId) continue;
      if (page.status !== 'loading' || this.tasks.has(page.attempt_id) ||
        this.queue.some(job => job.attemptId === page.attempt_id)) continue;
      const attempt = await this.store.attempt(page.attempt_id);
      if (attempt.result) continue;
      if (!this.admit({ attemptId: attempt.id, cardId, sessionId: attempt.session_id }, reservation)) {
        this.rejected++;
        await this.store.failAttempt(attempt.id);
        this.record('rejected', 'generation_busy', attempt.id);
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
      if (!active.some(attempt => `${attempt.card_id}:${attempt.session_id}` === key)) controller.abort();
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
