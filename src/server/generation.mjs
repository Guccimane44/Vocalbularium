import { renderPage, validateInterpretation } from '../core/modules.mjs';
import { OpenAIProvider } from './openai.mjs';

export class Generation {
  constructor(store, provider = new OpenAIProvider()) {
    this.store = store; this.provider = provider;
    this.tasks = new Map(); this.interpretations = new Map(); this.outputs = new Map();
    // A server restart cannot resume model calls that it no longer owns.
    for (const { id } of store.db.prepare("SELECT id FROM attempts WHERE state = 'loading' AND result IS NULL").all()) store.failAttempt(id);
  }
  async interpretation(card, attempt) {
    const current = this.store.card(card.id).interpretation;
    if (current) return current;
    const key = `${card.id}:${attempt.session_id}`;
    if (!this.interpretations.has(key)) {
      const controller = new AbortController();
      const attempts = card.pages.filter(page => page.status === 'loading').map(page => page.attempt_id);
      const promise = this.provider.interpret(card.selected_text, controller.signal)
        .then(value => this.store.establishInterpretation(card.id, validateInterpretation(value), attempts));
      this.interpretations.set(key, { promise, controller });
      promise.finally(() => this.interpretations.delete(key)).catch(() => {});
    }
    return this.interpretations.get(key).promise;
  }
  start(cardId, pageId) {
    const card = this.store.card(cardId);
    for (const page of card.pages) {
      if (pageId && page.page_id !== pageId) continue;
      if (page.status !== 'loading' || this.tasks.has(page.attempt_id)) continue;
      const attempt = this.store.attempt(page.attempt_id);
      if (attempt.result) continue;
      const controller = new AbortController();
      const task = (async () => {
        try {
          const needed = attempt.modules.some(module => module.type !== 'selected');
          const interpretation = needed ? await this.interpretation(card, attempt) : null;
          const text = await renderPage({
            selectedText: card.selected_text, modules: attempt.modules, interpretation,
            generate: input => this.provider.generate(input, controller.signal),
            claimOutput: (type, output) => {
              if (!['german-examples', 'sentence-usage'].includes(type)) return true;
              const key = `${card.id}:${type}`;
              const seen = this.outputs.get(key) ?? new Set();
              if (seen.has(output)) return false;
              seen.add(output); this.outputs.set(key, seen); return true;
            }
          });
          this.store.stage(attempt.id, { ok: true, text });
        } catch (error) {
          try { this.store.stage(attempt.id, { ok: false }); }
          catch (stale) {
            if (!['deleted', 'stale_session', 'stale_attempt'].includes(stale.code)) console.error(stale);
          }
        }
      })();
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
}
