import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { complete, generated, text } from './helpers/pages.mjs';

const instances = (...types) => types.map(type => ({ id: randomUUID(), type }));
const view = { module: 'default' };
const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) { const store = await createTestStore(t); t.after(async () => (await store.close())); await store.openSession('open', session); return store; }
const save = (store, deck) => store.saveDeck(randomUUID(), { deck });
async function capture(store) { return (await store.capture(randomUUID(), { session, mainKey: '幸福', snapshot: (await store.snapshot()) })).pageId; }

test('deck creation validates its modules and view, preserves the default, and resubmits without duplicates', async (t) => {
  const store = await fixture(t), initial = await store.snapshot();
  const deck = { name: '  Chinese  ', modules: instances('selected', 'selected-language', 'german-examples', 'sentence-usage', 'sentence-usage'), view };
  const saved = await store.saveDeck('new', { deck });
  assert.equal((await store.saveDeck('new', { deck })).deckId, saved.deckId);
  const read = await store.deck(saved.deckId);
  assert.equal(read.name, 'Chinese'); assert.deepEqual(read.modules, deck.modules); assert.deepEqual(read.view, view);
  assert.equal((await store.snapshot()).id, initial.id);
  assert.equal((await store.account()).decks.length, 2);
  assert.ok(await save(store, { name: 'Empty', modules: [], view }));
  assert.ok(await save(store, { name: 'Twelve', modules: instances(...Array(12).fill('selected')), view }));
  for (const invalid of [{ name: '', modules: [], view }, { name: 'x', modules: instances(...Array(13).fill('selected')), view },
    { name: 'x', modules: instances('unsupported'), view }, { name: 'x', modules: [{ id: 'same', type: 'selected' }, { id: 'same', type: 'selected' }], view },
    { name: 'x', modules: [], view: { module: 'card' } }, { name: 'x', modules: [deck.modules[0]], view }]) {
    await assert.rejects(save(store, invalid), { code: 'invalid' });
  }
});

test('configuration edits keep existing pages and their content; removed instances stay as unconfigured components', async (t) => {
  const store = await fixture(t), pageId = await capture(store);
  await complete(store, await store.page(pageId), session, () => 'saved explanation');
  const deck = await store.deck((await store.snapshot()).id);
  const [original] = deck.modules;
  await save(store, { ...deck, modules: instances('sentence-usage', 'selected') });
  const page = await store.page(pageId);
  assert.deepEqual(generated(page).map(item => [item.moduleInstanceId, item.configured, item.status, text(item)]),
    [[original.id, false, 'completed', 'saved explanation']]);
  await save(store, { ...deck, modules: [original] });
  assert.equal(generated(await store.page(pageId))[0].configured, true);
});

test('configuration changes during generation keep the running instructions; results of removed instances still publish', async (t) => {
  const store = await fixture(t), pageId = await capture(store), page = await store.page(pageId);
  const [running] = generated(page);
  const deck = await store.deck((await store.snapshot()).id);
  await save(store, { ...deck, modules: instances('selected-language') });
  assert.equal((await store.attempt(running.attemptId)).module.type, 'german-examples');
  await store.stage(running.attemptId, { ok: true, text: 'late but owned' });
  await store.publish('publish', { attemptId: running.attemptId, session });
  assert.deepEqual(generated(await store.page(pageId)).map(item => [text(item), item.status, item.configured]), [['late but owned', 'completed', false]]);
});

test('deleting default requires replacement, deleting sole deck restores one My Deck, and stale operations fail', async (t) => {
  const store = await fixture(t), initial = await store.deck((await store.snapshot()).id), pageId = await capture(store);
  const otherId = (await save(store, { name: 'Other', modules: [], view })).deckId;
  await assert.rejects(store.deleteDeck('missing-replacement', { deckId: initial.id }), { code: 'replacement' });
  await store.deleteDeck('delete-default', { deckId: initial.id, replacementId: otherId });
  assert.equal((await store.snapshot()).id, otherId);
  await assert.rejects(store.page(pageId), { code: 'deleted' });
  await assert.rejects(save(store, initial), { code: 'deleted' });
  await store.deleteDeck('delete-last', { deckId: otherId });
  const restored = await store.deck((await store.snapshot()).id);
  assert.equal((await store.account()).decks.length, 1); assert.equal(restored.name, 'My Deck');
  assert.deepEqual(restored.modules.map(module => module.type), ['german-examples']); assert.equal((await store.pages()).length, 0);
  await store.deleteDeck('delete-last', { deckId: otherId }); assert.equal((await store.snapshot()).id, restored.id);
});

test('capture preparation resolves the shared default once; capture follows that deck’s configuration when it runs', async (t) => {
  const store = await fixture(t), original = await store.snapshot();
  const nextId = (await save(store, { name: 'Remote default', modules: instances('selected-language'), view })).deckId;
  await store.setDefault('remote-default', nextId);
  const payload = { session, mainKey: '幸福' };
  const prepared = await store.prepareCapture('prepare', payload);
  assert.equal(prepared.snapshot.id, nextId);
  await store.setDefault('later-default', original.id);
  const updated = await store.deck(nextId);
  const current = instances('selected');
  await save(store, { ...updated, modules: current });
  const replay = await store.prepareCapture('prepare', payload);
  assert.deepEqual(replay.snapshot, prepared.snapshot);
  const captured = await store.capture('capture-prepared', { ...payload, snapshot: replay.snapshot });
  const page = await store.page(captured.pageId);
  assert.equal(page.deckId, nextId);
  assert.deepEqual(generated(page).map(item => item.moduleInstanceId), current.map(module => module.id));
});

test('capture with Context is a deck setting: on by default, kept when omitted, and enforced at capture', async (t) => {
  const store = await fixture(t), deck = await store.deck((await store.snapshot()).id);
  assert.equal(deck.captureContext, true);
  const contextOf = async pageId => (await store.page(pageId)).components.filter(component => component.kind === 'context').map(text);
  const withContext = async () => (await store.capture(randomUUID(), { session, mainKey: '幸福', context: 'Wir sind 幸福.', snapshot: (await store.snapshot()) })).pageId;
  assert.deepEqual(await contextOf(await withContext()), ['Wir sind 幸福.']);
  await save(store, { ...deck, captureContext: false });
  assert.equal((await store.deck(deck.id)).captureContext, false);
  // Context sent under a stale "on" is not stored once the deck has turned it off.
  assert.deepEqual(await contextOf(await withContext()), []);
  const { captureContext, ...omitted } = deck;
  await save(store, { ...omitted, name: 'Renamed' });
  assert.equal((await store.deck(deck.id)).captureContext, false);
  assert.equal((await store.deck((await save(store, { name: 'Fresh', modules: [], view })).deckId)).captureContext, true);
  await assert.rejects(save(store, { ...deck, captureContext: 'yes' }), { code: 'invalid' });
});
