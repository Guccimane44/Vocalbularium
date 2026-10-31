// Shared by the generation, recovery and OpenCode tests: fixtures, the
// German results they stage, and an OpenCode completion as the service sends it.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestStore } from './database.mjs';
import { confirmed, generated, text, useModules, wordResult } from './pages.mjs';
import { Generation } from '../../src/server/generation.mjs';
import { moduleInstructions, moduleSchema, promptVersion } from '@vocabularium/domain/composer';
import { facetsOf } from '@vocabularium/domain/parents';
import { formatContent, withKeyHighlighted } from '@vocabularium/domain/content';

// The prompt version of German's whole attempt on a word (D11); the fake provider names no model.
export const GERMAN_WORD_PROMPT = promptVersion({ instructions: moduleInstructions('german', facetsOf('german')), schema: moduleSchema('german', facetsOf('german')) });
// Generated content as stored: formatted, with the main key highlighted.
export const keyed = (value, key = 'bank') => withKeyHighlighted(formatContent('german', value), key);
export const session = { installationId: 'test-installation', sessionId: 'test-browser', epoch: 1 };
export const modules = (...types) => types.map(type => ({ id: randomUUID(), type }));
// Without explicit types the deck has a sentence example, which completes empty for a word
// without a model call, followed by an explanation.
// One German parent by default: every parent applies to every input (D08).
export async function fixture(t, provider, types = ['german'], options) {
  const store = await createTestStore(t);
  await useModules(store, types);
  const generation = await Generation.create(store, provider, options);
  await store.openSession('open', session);
  t.after(async () => { await generation.close(); await store.close(); });
  async function capture(mainKey = '幸福') {
    const result = await store.capture(randomUUID(), { session, mainKey, snapshot: (await store.snapshot()) });
    await generation.start(result.pageId); return await store.page(result.pageId);
  }
  return { store, generation, capture };
}
export async function finish(store, generation) {
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  for (const attempt of (await store.pendingAttempts(session))) {
    assert.ok(attempt.result);
    await store.publish(randomUUID(), { attemptId: attempt.id, session });
  }
}
export const outcome = async (store, page) => generated(await store.page(page.id)).map(item => [text(item), item.status]);
export const retryComponent = (store, id, page, index, retrySession = session) =>
  confirmed(store, id, { pageId: page.id, target: { scope: 'component', componentId: generated(page)[index].id }, session: retrySession });

export async function parentFixture(t, provider, facets = ['article', 'examples', 'synonyms', 'antonyms']) {
  const result = await fixture(t, provider, []);
  const deck = await result.store.deck((await result.store.snapshot()).id);
  await result.store.saveDeck('german', { deck: { ...deck, modules: [deck.modules[0], { id: 'g', type: 'german', facets }] } });
  return result;
}
// A German noun (D17): its grammatical role lets Article apply.
export const BANK = (({ core, facets }) => ({ core: { ...core, gramRole: 'noun' }, facets }))(wordResult(['Ufer'], { article: { singular: 'das Ufer', plural: 'die Ufer' },
  examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }] }, { key: 'bank' }));
export const data = async (store, page) => (await store.page(page.id)).components.filter(item => item.moduleType === 'german').map(item => item.content.blocks[0]);

export function completion(content, finish_reason = 'stop', extra = {}) {
  return { choices: [{ finish_reason, message: { role: 'assistant', content, ...extra } }] };
}
// One German request and a valid reply to it (D17: one request per module).
export const GERMAN = { module: { id: 'g', type: 'german' }, selectedText: '幸福', facets: [] };
export const REPLY = { core: { kind: 'word', language: 'Chinesisch', key: '幸福', meanings: ['Glück'] }, facets: {} };
