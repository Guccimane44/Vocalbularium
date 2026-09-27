import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const page = (...types) => ({ id: randomUUID(), modules: types.map(type => ({ id: randomUUID(), type })) });
const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) { const store = await createTestStore(t); t.after(async () => (await store.close())); await store.openSession('open', session); return store; }
async function save(store, deck, extra = {}) { return await store.saveDeck(randomUUID(), { deck, basePageIds: deck.id ? (await store.deck(deck.id)).pages.map(page => page.id) : [], ...extra }); }
async function capture(store) { return (await store.capture(randomUUID(), { session, selectedText: '幸福', snapshot: (await store.snapshot()) })).cardId; }
async function fill(store, id) {
  for (const [index, p] of (await store.card(id)).pages.entries()) {
    await store.stage(p.attempt_id, { ok: true, text: `saved page ${index + 1}` });
    await store.publish(randomUUID(), { attemptId: p.attempt_id, session });
  }
}

test('deck creation validates layout, preserves default, and resubmits without making duplicates', async (t) => {
  const store = await fixture(t), initial = await store.snapshot();
  const deck = { name: '  Chinese  ', pages: [page('selected', 'selected-language'), page('german-explanation', 'german-examples'), page('sentence-usage', 'sentence-usage'), page()] };
  const payload = { deck };
  const saved = await store.saveDeck('new', payload);
  assert.equal((await store.saveDeck('new', payload)).deckId, saved.deckId);
  assert.equal((await store.deck(saved.deckId)).name, 'Chinese'); assert.equal((await store.snapshot()).id, initial.id);
  assert.equal((await store.account()).decks.length, 2);
  for (const invalid of [{ name: '', pages: [page()] }, { name: 'x', pages: [] }, { name: 'x', pages: Array.from({ length: 5 }, () => page()) }, { name: 'x', pages: [page('unsupported')] }]) {
    await assert.rejects(async () => (await save(store, invalid)), { code: 'invalid' });
  }
});

test('append empty pages, preserve saved content on module edits, and remove a middle page with current-content confirmation', async (t) => {
  const store = await fixture(t), cardId = await capture(store);
  await fill(store, cardId);
  const deck = await store.snapshot(); deck.pages.push(page('sentence-usage'), page());
  deck.pages[0].modules = [];
  await save(store, deck);
  assert.deepEqual((await store.card(cardId)).pages.map(p => [p.text, p.status]), [['saved page 1', 'completed'], ['saved page 2', 'completed'], ['', null], ['', null]]);
  await store.savePages('manual', { cardId, changes: [{ pageId: deck.pages[2].id, text: 'keep the former third page' }] });
  const removed = structuredClone(deck); removed.pages.splice(1, 1);
  let confirmation;
  await assert.rejects(async () => (await save(store, removed)), error => { confirmation = error.details.confirmation; return error.code === 'content_loss'; });
  assert.equal((await store.card(cardId)).pages.length, 4);
  await store.savePages('remote', { cardId, changes: [{ pageId: deck.pages[1].id, text: 'remote manual edit after warning' }] });
  await assert.rejects(async () => (await save(store, removed, { confirmation })), error => { assert.notEqual(error.details.confirmation, confirmation); confirmation = error.details.confirmation; return error.code === 'content_loss'; });
  await save(store, removed, { confirmation });
  assert.deepEqual((await store.card(cardId)).pages.map(p => p.text), ['saved page 1', 'keep the former third page', '']);
  assert.equal((await store.card(cardId)).pages[1].page_id, deck.pages[2].id);
});

test('front page stays permanent, retained pages keep order, and stale layout saves cannot recreate a deleted page', async (t) => {
  const store = await fixture(t), original = await store.snapshot();
  const reversed = structuredClone(original); reversed.pages.reverse();
  await assert.rejects(async () => (await save(store, reversed)), { code: 'front_page' });
  const shortened = structuredClone(original); shortened.pages.pop();
  await save(store, shortened);
  await assert.rejects(async () => (await store.saveDeck('stale', { deck: original, basePageIds: original.pages.map(p => p.id) })), { code: 'deleted' });
  assert.equal((await store.snapshot()).pages.length, 1);
});

test('configuration changes during generation preserve captured instructions and ignore removed-page results', async (t) => {
  const store = await fixture(t), cardId = await capture(store), card = await store.card(cardId);
  const deck = await store.snapshot(), first = card.pages[0];
  deck.pages[0].modules = [{ id: randomUUID(), type: 'selected-language' }];
  deck.pages.pop(); deck.pages.push(page('german-explanation'));
  await save(store, deck);
  assert.deepEqual((await store.attempt(first.attempt_id)).modules.map(m => m.type), ['selected']);
  await assert.rejects(async () => (await store.stage(card.pages[1].attempt_id, { ok: true, text: 'late' })), { code: 'deleted' });
  await store.stage(first.attempt_id, { ok: true, text: '幸福' });
  await store.publish('publish', { attemptId: first.attempt_id, session });
  assert.deepEqual((await store.card(cardId)).pages.map(p => [p.text, p.status]), [['幸福', 'completed'], ['', null]]);
});

test('deleting default requires replacement, deleting sole deck restores one empty My Deck, and stale operations fail', async (t) => {
  const store = await fixture(t), initial = await store.snapshot(), cardId = await capture(store);
  const otherId = (await save(store, { name: 'Other', pages: [page()] })).deckId;
  await assert.rejects(async () => (await store.deleteDeck('missing-replacement', { deckId: initial.id })), { code: 'replacement' });
  await store.deleteDeck('delete-default', { deckId: initial.id, replacementId: otherId });
  assert.equal((await store.snapshot()).id, otherId);
  await assert.rejects(async () => (await store.card(cardId)), { code: 'deleted' });
  await assert.rejects(async () => (await save(store, initial)), { code: 'deleted' });
  await store.deleteDeck('delete-last', { deckId: otherId });
  assert.equal((await store.account()).decks.length, 1); assert.equal((await store.snapshot()).name, 'My Deck');
  assert.equal((await store.snapshot()).pages.length, 2); assert.equal((await store.cards()).length, 0);
  const defaultId = (await store.snapshot()).id;
  await store.deleteDeck('delete-last', { deckId: otherId }); assert.equal((await store.snapshot()).id, defaultId);
});

test('capture preparation resolves the shared default once and replays that configuration after later account changes', async (t) => {
  const store = await fixture(t), original = await store.snapshot();
  const nextId = (await save(store, { name: 'Remote default', pages: [page('selected-language')] })).deckId;
  await store.setDefault('remote-default', nextId);
  const payload = { session, selectedText: '幸福' };
  const prepared = await store.prepareCapture('prepare', payload);
  assert.equal(prepared.snapshot.id, nextId);
  await store.setDefault('later-default', original.id);
  const updated = await store.deck(nextId); updated.pages[0].modules = [];
  await save(store, updated);
  const replay = await store.prepareCapture('prepare', payload);
  assert.deepEqual(replay.snapshot, prepared.snapshot);
  const captured = await store.capture('capture-prepared', { ...payload, snapshot: replay.snapshot });
  assert.equal((await store.card(captured.cardId)).deck_id, nextId);
  assert.equal((await store.attempt((await store.card(captured.cardId)).pages[0].attempt_id)).modules[0].type, 'selected-language');
});
