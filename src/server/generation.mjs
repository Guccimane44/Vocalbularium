import { renderPage, validateInterpretation } from '../core/modules.mjs';
import { OpenCodeProvider } from './opencode.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export class Generation {
  constructor(store, provider = new OpenCodeProvider()) {
    this.store = store; this.provider = provider;
    this.tasks = new Map(); this.interpretations = new Map(); this.outputs = new Map();
    this.pendingResults = new Map();
    this.outbox = store.outbox;
  }
  static async create(store, provider) {
    const generation = new Generation(store, provider);
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
  async start(cardId, pageId) {
    const card = await this.store.card(cardId);
    for (const page of card.pages) {
      if (pageId && page.page_id !== pageId) continue;
      if (page.status !== 'loading' || this.tasks.has(page.attempt_id)) continue;
      const attempt = await this.store.attempt(page.attempt_id);
      if (attempt.result) continue;
      const controller = new AbortController();
      const task = this.store.background(async () => {
        let result;
        try {
          const needed = attempt.modules.some(module => module.type !== 'selected');
          const interpretation = needed ? await this.interpretation(card, attempt) : null;
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
          result = { ok: true, text };
        } catch (error) {
          result = { ok: false };
        }
        this.pendingResults.set(attempt.id, result);
        if (this.outbox) {
          try {
            const path = join(this.outbox, `${attempt.id}.json`);
            writeFileSync(path + '.tmp', JSON.stringify(result), { flush: true });
            renameSync(path + '.tmp', path);
          } catch { /* Still attempt the primary account write; retain the in-memory result if both writes fail. */ }
        }
        try { await this.store.stage(attempt.id, result); this.clearResult(attempt.id); }
        catch (error) {
          if (['deleted', 'stale_session', 'stale_attempt'].includes(error.code)) this.clearResult(attempt.id);
        }
      });
      this.tasks.set(attempt.id, { task, controller, cardId });
      task.finally(() => {
        this.tasks.delete(attempt.id);
        if (![...this.tasks.values()].some(task => task.cardId === cardId)) {
          for (const key of this.outputs.keys()) if (key.startsWith(`${cardId}:`)) this.outputs.delete(key);
        }
      }).catch(() => {});
    }
  }
  async close() {
    for (const { controller } of this.interpretations.values()) controller.abort();
    for (const { controller } of this.tasks.values()) controller.abort();
    await Promise.allSettled([...this.tasks.values()].map(({ task }) => task));
  }
  async cancelDeleted() {
    const active = await this.store.loadingAttempts();
    const ids = new Set(active.map(attempt => attempt.id));
    for (const id of this.pendingResults.keys()) if (!ids.has(id)) this.clearResult(id);
    for (const [id, { controller }] of this.tasks) if (!ids.has(id)) controller.abort();
    for (const [key, { controller }] of this.interpretations) {
      if (!active.some(attempt => attempt.card_id === key.split(':')[0])) controller.abort();
    }
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
    if (this.outbox) {
      rmSync(join(this.outbox, `${attemptId}.json`), { force: true });
      rmSync(join(this.outbox, `${attemptId}.json.tmp`), { force: true });
    }
  }
}
