import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const page = (...types) => ({ id: randomUUID(), modules: types.map(type => ({ id: randomUUID(), type })) });
const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) { const store = await createTestStore(t); t.after(async () => (await store.close())); await store.openSession('open', session); return store; }
async function save(store, deck, extra = {}) { return await store.saveDeck(randomUUID(), { deck, baseSeiteIds: deck.id ? (await store.deck(deck.id)).seites.map(page => page.id) : [], ...extra }); }
async function capture(store) { return (await store.capture(randomUUID(), { session, selectedText: '幸福', snapshot: (await store.snapshot()) })).karteId; }
async function fill(store, id) {
  for (const [index, p] of (await store.karte(id)).seites.entries()) {
    await store.stage(p.attempt_id, { ok: true, text: `saved seite ${index + 1}` });
    await store.publish(randomUUID(), { attemptId: p.attempt_id, session });
  }
}

test('deck creation validates layout, preserves default, and resubmits without making duplicates', async (t) => {
  const store = await fixture(t), initial = await store.snapshot();
  const deck = { name: '  Chinese  ', seites: [page('selected', 'selected-language'), page('german-explanation', 'german-examples'), page('sentence-usage', 'sentence-usage'), page()] };
  const payload = { deck };
  const saved = await store.saveDeck('new', payload);
  assert.equal((await store.saveDeck('new', payload)).deckId, saved.deckId);
  assert.equal((await store.deck(saved.deckId)).name, 'Chinese'); assert.equal((await store.snapshot()).id, initial.id);
  assert.equal((await store.account()).decks.length, 2);
  for (const invalid of [{ name: '', seites: [page()] }, { name: 'x', seites: [] }, { name: 'x', seites: Array.from({ length: 5 }, () => page()) }, { name: 'x', seites: [page('unsupported')] }]) {
    await assert.rejects(async () => (await save(store, invalid)), { code: 'invalid' });
  }
});

test('append empty seites, preserve saved content on module edits, and remove a middle seite with current-content confirmation', async (t) => {
  const store = await fixture(t), karteId = await capture(store);
  await fill(store, karteId);
  const deck = await store.snapshot(); deck.seites.push(page('sentence-usage'), page());
  deck.seites[0].modules = [];
  await save(store, deck);
  assert.deepEqual((await store.karte(karteId)).seites.map(p => [p.text, p.status]), [['saved seite 1', 'completed'], ['saved seite 2', 'completed'], ['', null], ['', null]]);
  await store.saveSeites('manual', { karteId, changes: [{ seiteId: deck.seites[2].id, text: 'keep the former third seite' }] });
  const removed = structuredClone(deck); removed.seites.splice(1, 1);
  let confirmation;
  await assert.rejects(async () => (await save(store, removed)), error => { confirmation = error.details.confirmation; return error.code === 'content_loss'; });
  assert.equal((await store.karte(karteId)).seites.length, 4);
  await store.saveSeites('remote', { karteId, changes: [{ seiteId: deck.seites[1].id, text: 'remote manual edit after warning' }] });
  await assert.rejects(async () => (await save(store, removed, { confirmation })), error => { assert.notEqual(error.details.confirmation, confirmation); confirmation = error.details.confirmation; return error.code === 'content_loss'; });
  await save(store, removed, { confirmation });
  assert.deepEqual((await store.karte(karteId)).seites.map(p => p.text), ['saved seite 1', 'keep the former third seite', '']);
  assert.equal((await store.karte(karteId)).seites[1].seite_id, deck.seites[2].id);
});

test('front seite stays permanent, retained seites keep order, and stale layout saves cannot recreate a deleted seite', async (t) => {
  const store = await fixture(t), original = await store.snapshot();
  const reversed = structuredClone(original); reversed.seites.reverse();
  await assert.rejects(async () => (await save(store, reversed)), { code: 'front_seite' });
  const shortened = structuredClone(original); shortened.seites.pop();
  await save(store, shortened);
  await assert.rejects(async () => (await store.saveDeck('stale', { deck: original, baseSeiteIds: original.seites.map(p => p.id) })), { code: 'deleted' });
  assert.equal((await store.snapshot()).seites.length, 1);
});

test('configuration changes during generation preserve captured instructions and ignore removed-seite results', async (t) => {
  const store = await fixture(t), karteId = await capture(store), karte = await store.karte(karteId);
  const deck = await store.snapshot(), first = karte.seites[0];
  deck.seites[0].modules = [{ id: randomUUID(), type: 'selected-language' }];
  deck.seites.pop(); deck.seites.push(page('german-explanation'));
  await save(store, deck);
  assert.deepEqual((await store.attempt(first.attempt_id)).modules.map(m => m.type), ['selected']);
  await assert.rejects(async () => (await store.stage(karte.seites[1].attempt_id, { ok: true, text: 'late' })), { code: 'deleted' });
  await store.stage(first.attempt_id, { ok: true, text: '幸福' });
  await store.publish('publish', { attemptId: first.attempt_id, session });
  assert.deepEqual((await store.karte(karteId)).seites.map(p => [p.text, p.status]), [['幸福', 'completed'], ['', null]]);
});

test('deleting default requires replacement, deleting sole deck restores one empty My Deck, and stale operations fail', async (t) => {
  const store = await fixture(t), initial = await store.snapshot(), karteId = await capture(store);
  const otherId = (await save(store, { name: 'Other', seites: [page()] })).deckId;
  await assert.rejects(async () => (await store.deleteDeck('missing-replacement', { deckId: initial.id })), { code: 'replacement' });
  await store.deleteDeck('delete-default', { deckId: initial.id, replacementId: otherId });
  assert.equal((await store.snapshot()).id, otherId);
  await assert.rejects(async () => (await store.karte(karteId)), { code: 'deleted' });
  await assert.rejects(async () => (await save(store, initial)), { code: 'deleted' });
  await store.deleteDeck('delete-last', { deckId: otherId });
  assert.equal((await store.account()).decks.length, 1); assert.equal((await store.snapshot()).name, 'My Deck');
  assert.equal((await store.snapshot()).seites.length, 2); assert.equal((await store.kartes()).length, 0);
  const defaultId = (await store.snapshot()).id;
  await store.deleteDeck('delete-last', { deckId: otherId }); assert.equal((await store.snapshot()).id, defaultId);
});

test('capture preparation resolves the shared default once and replays that configuration after later account changes', async (t) => {
  const store = await fixture(t), original = await store.snapshot();
  const nextId = (await save(store, { name: 'Remote default', seites: [page('selected-language')] })).deckId;
  await store.setDefault('remote-default', nextId);
  const payload = { session, selectedText: '幸福' };
  const prepared = await store.prepareCapture('prepare', payload);
  assert.equal(prepared.snapshot.id, nextId);
  await store.setDefault('later-default', original.id);
  const updated = await store.deck(nextId); updated.seites[0].modules = [];
  await save(store, updated);
  const replay = await store.prepareCapture('prepare', payload);
  assert.deepEqual(replay.snapshot, prepared.snapshot);
  const captured = await store.capture('capture-prepared', { ...payload, snapshot: replay.snapshot });
  assert.equal((await store.karte(captured.karteId)).deck_id, nextId);
  assert.equal((await store.attempt((await store.karte(captured.karteId)).seites[0].attempt_id)).modules[0].type, 'selected-language');
});
