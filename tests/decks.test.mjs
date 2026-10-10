import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { complete, generated, text } from './helpers/pages.mjs';

const instances = (...types) => types.map(type => ({ id: randomUUID(), type }));
const withKey = (...types) => instances('main-key', ...types);
const view = { module: 'default' };
const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) { const store = await createTestStore(t); t.after(async () => (await store.close())); await store.openSession('open', session); return store; }
const save = (store, deck) => store.saveDeck(randomUUID(), { deck });
async function capture(store, context) {
  return (await store.capture(randomUUID(), { session, mainKey: '幸福', ...(context ? { context } : {}), snapshot: (await store.snapshot()) })).pageId;
}
const types = page => page.components.map(component => component.moduleType);

test('deck creation validates its modules and view, preserves the default, and resubmits without duplicates', async (t) => {
  const store = await fixture(t), initial = await store.snapshot();
  const deck = { name: '  Chinese  ', modules: withKey('context', 'text', 'german-examples', 'sentence-usage', 'sentence-usage'), view };
  const saved = await store.saveDeck('new', { deck });
  assert.equal((await store.saveDeck('new', { deck })).deckId, saved.deckId);
  const read = await store.deck(saved.deckId);
  assert.equal(read.name, 'Chinese'); assert.deepEqual(read.modules, deck.modules); assert.deepEqual(read.view, view);
  assert.equal((await store.snapshot()).id, initial.id);
  assert.equal((await store.account()).decks.length, 2);
  assert.ok(await save(store, { name: 'Only the key', modules: withKey(), view }));
  assert.ok(await save(store, { name: 'Twelve', modules: withKey(...Array(11).fill('text')), view }));
  const key = withKey()[0];
  for (const invalid of [
    { name: '', modules: withKey(), view }, { name: 'x', modules: [], view },
    { name: 'x', modules: instances('german-examples'), view }, { name: 'x', modules: withKey(...Array(12).fill('text')), view },
    { name: 'x', modules: withKey('context', 'context'), view }, { name: 'x', modules: [key, key], view },
    { name: 'x', modules: withKey('unsupported'), view }, { name: 'x', modules: withKey('selected'), view },
    { name: 'x', modules: withKey(), view: { module: 'card' } }, { name: 'x', modules: [deck.modules[0]], view }]) {
    await assert.rejects(save(store, invalid), { code: 'invalid' }, JSON.stringify(invalid));
  }
});

test('a new page copies the deck modules; later deck changes never reach it', async (t) => {
  const store = await fixture(t), pageId = await capture(store, 'Wir sind 幸福.');
  let page = await store.page(pageId);
  assert.deepEqual(types(page), ['main-key', 'context', 'german-examples']);
  const deck = await store.deck(page.deckId);
  assert.ok(page.components.every(component => !deck.modules.some(module => module.id === component.moduleInstanceId)), 'page instance IDs are its own');
  await complete(store, page, session, () => 'saved explanation');
  await save(store, { ...deck, modules: withKey('sentence-usage', 'text') });
  page = await store.page(pageId);
  assert.deepEqual(page.components.map(component => [component.moduleType, text(component)]),
    [['main-key', '幸福'], ['context', 'Wir sind 幸福.'], ['german-examples', 'saved explanation']]);
  assert.deepEqual(types(await store.page(await capture(store))), ['main-key', 'sentence-usage', 'text'], 'the next page uses the new template');
});

test('deck changes during generation leave the running attempt and its page alone', async (t) => {
  const store = await fixture(t), pageId = await capture(store), page = await store.page(pageId);
  const [running] = generated(page);
  const deck = await store.deck((await store.snapshot()).id);
  await save(store, { ...deck, modules: withKey('sentence-usage') });
  assert.equal((await store.attempt(running.attemptId)).module.type, 'german-examples');
  await store.stage(running.attemptId, { ok: true, text: 'late but owned' });
  await store.publish('publish', { attemptId: running.attemptId, session });
  assert.deepEqual(generated(await store.page(pageId)).map(item => [text(item), item.status]), [['late but owned', 'completed']]);
});

test('deleting default requires replacement, deleting sole deck restores one My Deck, and stale operations fail', async (t) => {
  const store = await fixture(t), initial = await store.deck((await store.snapshot()).id), pageId = await capture(store);
  const otherId = (await save(store, { name: 'Other', modules: withKey(), view })).deckId;
  await assert.rejects(store.deleteDeck('missing-replacement', { deckId: initial.id }), { code: 'replacement' });
  await store.deleteDeck('delete-default', { deckId: initial.id, replacementId: otherId });
  assert.equal((await store.snapshot()).id, otherId);
  await assert.rejects(store.page(pageId), { code: 'deleted' });
  await assert.rejects(save(store, initial), { code: 'deleted' });
  await store.deleteDeck('delete-last', { deckId: otherId });
  const restored = await store.deck((await store.snapshot()).id);
  assert.equal((await store.account()).decks.length, 1); assert.equal(restored.name, 'My Deck');
  assert.deepEqual(restored.modules.map(module => module.type), ['main-key', 'context', 'german-examples']); assert.equal((await store.pages()).length, 0);
  await store.deleteDeck('delete-last', { deckId: otherId }); assert.equal((await store.snapshot()).id, restored.id);
});

test('capture preparation resolves the shared default once; capture follows that deck’s configuration when it runs', async (t) => {
  const store = await fixture(t), original = await store.snapshot();
  const nextId = (await save(store, { name: 'Remote default', modules: withKey('german-explanation'), view })).deckId;
  await store.setDefault('remote-default', nextId);
  const payload = { session, mainKey: '幸福' };
  const prepared = await store.prepareCapture('prepare', payload);
  assert.equal(prepared.snapshot.id, nextId);
  await store.setDefault('later-default', original.id);
  const updated = await store.deck(nextId);
  await save(store, { ...updated, modules: [updated.modules[0], ...instances('sentence-usage', 'text')] });
  const replay = await store.prepareCapture('prepare', payload);
  assert.deepEqual(replay.snapshot, prepared.snapshot);
  const captured = await store.capture('capture-prepared', { ...payload, snapshot: replay.snapshot });
  const page = await store.page(captured.pageId);
  assert.equal(page.deckId, nextId);
  assert.deepEqual(types(page), ['main-key', 'sentence-usage', 'text']);
});

test('the Context module decides whether capture keeps the surrounding block', async (t) => {
  const store = await fixture(t), deck = await store.deck((await store.snapshot()).id);
  const contextOf = async pageId => (await store.page(pageId)).components.filter(component => component.moduleType === 'context').map(text);
  assert.deepEqual(await contextOf(await capture(store, 'Wir sind 幸福.')), ['Wir sind 幸福.']);
  assert.deepEqual(await contextOf(await capture(store)), [''], 'the Context module still gives the page an empty Context');
  await save(store, { ...deck, modules: deck.modules.filter(module => module.type !== 'context') });
  // Context sent while the deck had the module is not stored once it is removed.
  assert.deepEqual(await contextOf(await capture(store, 'Wir sind 幸福.')), []);
});
