import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { Generation } from '../src/server/generation.mjs';
import { sortCards } from '../extension/sorting.js';
async function fixture(t) { const store = await createTestStore(t); t.after(async () => (await store.close())); return store; }
test('manual cards keep plain text, have no generation status or retry, and operation receipts prevent duplication', async (t) => {
  const store = await fixture(t), deck = await store.snapshot();
  const payload = { deckId: deck.id, pages: deck.pages.map((page, index) => ({ pageId: page.id, text: index ? '== literal ==\n: text' : '' })) };
  const first = await store.createManual('save', payload);
  assert.equal((await store.createManual('save', payload)).cardId, first.cardId);
  assert.equal((await store.cards()).length, 1);
  const card = await store.card(first.cardId);
  assert.equal(card.selected_text, null); assert.equal(card.status, null);
  assert.deepEqual(card.pages.map(page => page.status), [null, null]);
  assert.equal(card.pages[1].text, '== literal ==\n: text');
  const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
  await store.openSession('open', session);
  await assert.rejects(async () => (await store.retry('retry', { cardId: card.id, pageId: card.pages[0].page_id, session })), { code: 'manual_card' });
});

test('manual edits preserve creation time and other-page changes; delayed saves cannot recreate deleted pages/cards/decks', async (t) => {
  const store = await fixture(t), deck = await store.snapshot();
  const payload = { deckId: deck.id, pages: deck.pages.map(page => ({ pageId: page.id, text: '' })) };
  const { cardId } = await store.createManual('new', payload), created = (await store.card(cardId)).created_at;
  await store.savePages('a', { cardId, changes: [{ pageId: deck.pages[0].id, text: 'A' }] });
  await store.savePages('b', { cardId, changes: [{ pageId: deck.pages[1].id, text: 'B' }] });
  assert.deepEqual((await store.card(cardId)).pages.map(page => page.text), ['A', 'B']); assert.equal((await store.card(cardId)).created_at, created);
  await store.deleteCard('delete', cardId);
  await assert.rejects(async () => (await store.savePages('late', { cardId, changes: [{ pageId: deck.pages[0].id, text: 'late' }] })), { code: 'deleted' });
  await store.deleteDeck('delete-deck', { deckId: deck.id });
  await assert.rejects(async () => (await store.createManual('late-new', payload)), { code: 'deleted' });
});

test('current-page retry uses original input, established interpretation and current saved modules, preserving other pages', async (t) => {
  const store = await fixture(t), session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
  await store.openSession('open', session);
  const { cardId } = await store.capture('capture', { session, selectedText: 'original', snapshot: (await store.snapshot()) });
  const interpretation = { inputType: 'word_phrase', sourceLanguage: 'English' };
  await store.establishInterpretation(cardId, interpretation);
  for (const page of (await store.card(cardId)).pages) {
    await store.stage(page.attempt_id, { ok: true, text: 'initial' });
    await store.publish(page.page_id, { attemptId: page.attempt_id, session });
  }
  const card = await store.card(cardId), target = card.pages[1].page_id;
  await store.savePages('manual', { cardId, changes: card.pages.map(page => ({ pageId: page.page_id, text: 'manual edit' })) });
  const deck = await store.snapshot(); deck.pages[1].modules = [{ id: 'language', type: 'selected-language' }];
  await store.saveDeck('config', { deck, basePageIds: deck.pages.map(page => page.id) });
  const generation = await Generation.create(store, { interpret: async () => assert.fail('established interpretation must be reused'), generate: async () => assert.fail('tag must not generate') });
  const retry = await store.retry('retry', { cardId, pageId: target, session });
  await generation.start(cardId, target);
  assert.equal((await store.card(cardId)).pages[1].text, ''); assert.equal((await store.card(cardId)).pages[0].text, 'manual edit');
  await assert.rejects(async () => (await store.savePages('locked', { cardId, changes: card.pages.map(page => ({ pageId: page.page_id, text: 'concurrent draft' })) })), { code: 'generating' });
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  await store.publish('finish', { attemptId: retry.attemptId, session }); await generation.close();
  assert.deepEqual((await store.card(cardId)).pages.map(page => page.text), ['manual edit', 'original\nEnglish']);
  assert.equal((await store.card(cardId)).created_at, card.created_at);
  assert.equal((await store.retry('retry', { cardId, pageId: target, session })).attemptId, retry.attemptId);
});

test('four list orders use current front text, deterministic ties, and empty text rather than the display placeholder', () => {
  const make = (id, text, date) => ({ id, created_at: date, pages: [{ text }] });
  const cards = [make('b', 'apple', '2'), make('a', 'Apple', '2'), make('c', '', '1'), make('d', 'Zebra', '3')];
  const ids = order => sortCards(cards, order).map(card => card.id);
  assert.deepEqual(ids('az'), ['c', 'a', 'b', 'd']); assert.deepEqual(ids('za'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(ids('newest'), ['d', 'a', 'b', 'c']); assert.deepEqual(ids('oldest'), ['c', 'a', 'b', 'd']);
  cards[3].pages[0].text = 'aardvark'; assert.deepEqual(ids('az'), ['c', 'd', 'a', 'b']);
  assert.equal(cards.some(card => Object.hasOwn(card, 'index')), false);
});
