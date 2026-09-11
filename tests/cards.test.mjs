import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountStore } from '../src/core/store.mjs';
import { Generation } from '../src/server/generation.mjs';
import { sortCards } from '../extension/sorting.js';

function fixture(t) { const store = new AccountStore(); t.after(() => store.close()); return store; }
test('manual cards keep plain text, have no generation status or retry, and operation receipts prevent duplication', t => {
  const store = fixture(t), deck = store.snapshot();
  const payload = { deckId: deck.id, pages: deck.pages.map((page, index) => ({ pageId: page.id, text: index ? '== literal ==\n: text' : '' })) };
  const first = store.createManual('save', payload);
  assert.equal(store.createManual('save', payload).cardId, first.cardId);
  assert.equal(store.cards().length, 1);
  const card = store.card(first.cardId);
  assert.equal(card.selected_text, null); assert.equal(card.status, null);
  assert.deepEqual(card.pages.map(page => page.status), [null, null]);
  assert.equal(card.pages[1].text, '== literal ==\n: text');
  const session = { installationId: 'a', sessionId: 'browser', epoch: 1 }; store.openSession('open', session);
  assert.throws(() => store.retry('retry', { cardId: card.id, pageId: card.pages[0].page_id, session }), { code: 'manual_card' });
});

test('manual edits preserve creation time and other-page changes; delayed saves cannot recreate deleted pages/cards/decks', t => {
  const store = fixture(t), deck = store.snapshot();
  const payload = { deckId: deck.id, pages: deck.pages.map(page => ({ pageId: page.id, text: '' })) };
  const { cardId } = store.createManual('new', payload), created = store.card(cardId).created_at;
  store.savePages('a', { cardId, changes: [{ pageId: deck.pages[0].id, text: 'A' }] });
  store.savePages('b', { cardId, changes: [{ pageId: deck.pages[1].id, text: 'B' }] });
  assert.deepEqual(store.card(cardId).pages.map(page => page.text), ['A', 'B']); assert.equal(store.card(cardId).created_at, created);
  store.deleteCard('delete', cardId);
  assert.throws(() => store.savePages('late', { cardId, changes: [{ pageId: deck.pages[0].id, text: 'late' }] }), { code: 'deleted' });
  store.deleteDeck('delete-deck', { deckId: deck.id });
  assert.throws(() => store.createManual('late-new', payload), { code: 'deleted' });
});

test('current-page retry uses original input, established interpretation and current saved modules, preserving other pages', async t => {
  const store = fixture(t), session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
  store.openSession('open', session);
  const { cardId } = store.capture('capture', { session, selectedText: 'original', snapshot: store.snapshot() });
  const interpretation = { inputType: 'word_phrase', sourceLanguage: 'English' };
  store.establishInterpretation(cardId, interpretation);
  for (const page of store.card(cardId).pages) { store.stage(page.attempt_id, { ok: true, text: 'initial' }); store.publish(page.page_id, { attemptId: page.attempt_id, session }); }
  const card = store.card(cardId), target = card.pages[1].page_id;
  store.savePages('manual', { cardId, changes: card.pages.map(page => ({ pageId: page.page_id, text: 'manual edit' })) });
  const deck = store.snapshot(); deck.pages[1].modules = [{ id: 'language', type: 'selected-language' }];
  store.saveDeck('config', { deck, basePageIds: deck.pages.map(page => page.id) });
  const generation = new Generation(store, { interpret: async () => assert.fail('established interpretation must be reused'), generate: async () => assert.fail('tag must not generate') });
  const retry = store.retry('retry', { cardId, pageId: target, session }); generation.start(cardId, target);
  assert.equal(store.card(cardId).pages[1].text, ''); assert.equal(store.card(cardId).pages[0].text, 'manual edit');
  assert.throws(() => store.savePages('locked', { cardId, changes: card.pages.map(page => ({ pageId: page.page_id, text: 'concurrent draft' })) }), { code: 'generating' });
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  store.publish('finish', { attemptId: retry.attemptId, session }); await generation.close();
  assert.deepEqual(store.card(cardId).pages.map(page => page.text), ['manual edit', 'original\nEnglish']);
  assert.equal(store.card(cardId).created_at, card.created_at);
  assert.equal(store.retry('retry', { cardId, pageId: target, session }).attemptId, retry.attemptId);
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
