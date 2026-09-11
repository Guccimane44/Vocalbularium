import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AccountStore } from '../src/core/store.mjs';
const page = (...types) => ({ id: randomUUID(), modules: types.map(type => ({ id: randomUUID(), type })) });
const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
function fixture(t) { const store = new AccountStore(); t.after(() => store.close()); store.openSession('open', session); return store; }
function save(store, deck, extra = {}) { return store.saveDeck(randomUUID(), { deck, basePageIds: deck.id ? store.deck(deck.id).pages.map(page => page.id) : [], ...extra }); }
function capture(store) { return store.capture(randomUUID(), { session, selectedText: '幸福', snapshot: store.snapshot() }).cardId; }
function fill(store, id) {
  for (const [index, p] of store.card(id).pages.entries()) {
    store.stage(p.attempt_id, { ok: true, text: `saved page ${index + 1}` });
    store.publish(randomUUID(), { attemptId: p.attempt_id, session });
  }
}

test('deck creation validates layout, preserves default, and resubmits without making duplicates', t => {
  const store = fixture(t), initial = store.snapshot();
  const deck = { name: '  Chinese  ', pages: [page('selected', 'selected-language'), page('german-explanation', 'german-examples'), page('sentence-usage', 'sentence-usage'), page()] };
  const payload = { deck };
  const saved = store.saveDeck('new', payload);
  assert.equal(store.saveDeck('new', payload).deckId, saved.deckId);
  assert.equal(store.deck(saved.deckId).name, 'Chinese'); assert.equal(store.snapshot().id, initial.id);
  assert.equal(store.account().decks.length, 2);
  for (const invalid of [{ name: '', pages: [page()] }, { name: 'x', pages: [] }, { name: 'x', pages: Array.from({ length: 5 }, () => page()) }, { name: 'x', pages: [page('unsupported')] }]) {
    assert.throws(() => save(store, invalid), { code: 'invalid' });
  }
});

test('append empty pages, preserve saved content on module edits, and remove a middle page with current-content confirmation', t => {
  const store = fixture(t), cardId = capture(store); fill(store, cardId);
  const deck = store.snapshot(); deck.pages.push(page('sentence-usage'), page());
  deck.pages[0].modules = [];
  save(store, deck);
  assert.deepEqual(store.card(cardId).pages.map(p => [p.text, p.status]), [['saved page 1', 'completed'], ['saved page 2', 'completed'], ['', null], ['', null]]);
  store.savePages('manual', { cardId, changes: [{ pageId: deck.pages[2].id, text: 'keep the former third page' }] });
  const removed = structuredClone(deck); removed.pages.splice(1, 1);
  let confirmation;
  assert.throws(() => save(store, removed), error => { confirmation = error.details.confirmation; return error.code === 'content_loss'; });
  assert.equal(store.card(cardId).pages.length, 4);
  store.savePages('remote', { cardId, changes: [{ pageId: deck.pages[1].id, text: 'remote manual edit after warning' }] });
  assert.throws(() => save(store, removed, { confirmation }), error => { assert.notEqual(error.details.confirmation, confirmation); confirmation = error.details.confirmation; return error.code === 'content_loss'; });
  save(store, removed, { confirmation });
  assert.deepEqual(store.card(cardId).pages.map(p => p.text), ['saved page 1', 'keep the former third page', '']);
  assert.equal(store.card(cardId).pages[1].page_id, deck.pages[2].id);
});

test('front page stays permanent, retained pages keep order, and stale layout saves cannot recreate a deleted page', t => {
  const store = fixture(t), original = store.snapshot();
  const reversed = structuredClone(original); reversed.pages.reverse();
  assert.throws(() => save(store, reversed), { code: 'front_page' });
  const shortened = structuredClone(original); shortened.pages.pop(); save(store, shortened);
  assert.throws(() => store.saveDeck('stale', { deck: original, basePageIds: original.pages.map(p => p.id) }), { code: 'deleted' });
  assert.equal(store.snapshot().pages.length, 1);
});

test('configuration changes during generation preserve captured instructions and ignore removed-page results', t => {
  const store = fixture(t), cardId = capture(store), card = store.card(cardId);
  const deck = store.snapshot(), first = card.pages[0];
  deck.pages[0].modules = [{ id: randomUUID(), type: 'selected-language' }];
  deck.pages.pop(); deck.pages.push(page('german-explanation'));
  save(store, deck);
  assert.deepEqual(store.attempt(first.attempt_id).modules.map(m => m.type), ['selected']);
  assert.throws(() => store.stage(card.pages[1].attempt_id, { ok: true, text: 'late' }), { code: 'deleted' });
  store.stage(first.attempt_id, { ok: true, text: '幸福' }); store.publish('publish', { attemptId: first.attempt_id, session });
  assert.deepEqual(store.card(cardId).pages.map(p => [p.text, p.status]), [['幸福', 'completed'], ['', null]]);
});

test('deleting default requires replacement, deleting sole deck restores one empty My Deck, and stale operations fail', t => {
  const store = fixture(t), initial = store.snapshot(), cardId = capture(store);
  const otherId = save(store, { name: 'Other', pages: [page()] }).deckId;
  assert.throws(() => store.deleteDeck('missing-replacement', { deckId: initial.id }), { code: 'replacement' });
  store.deleteDeck('delete-default', { deckId: initial.id, replacementId: otherId });
  assert.equal(store.snapshot().id, otherId);
  assert.throws(() => store.card(cardId), { code: 'deleted' });
  assert.throws(() => save(store, initial), { code: 'deleted' });
  store.deleteDeck('delete-last', { deckId: otherId });
  assert.equal(store.account().decks.length, 1); assert.equal(store.snapshot().name, 'My Deck');
  assert.equal(store.snapshot().pages.length, 2); assert.equal(store.cards().length, 0);
  const defaultId = store.snapshot().id;
  store.deleteDeck('delete-last', { deckId: otherId }); assert.equal(store.snapshot().id, defaultId);
});
