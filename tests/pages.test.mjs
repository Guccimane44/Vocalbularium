import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { Generation } from '../src/server/generation.mjs';
import { sortPages } from '../extension/sorting.ts';
import { complete, component, confirmed, generated, text, textBlocks, useModules } from './helpers/pages.mjs';

const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) {
  const store = await createTestStore(t);
  t.after(async () => (await store.close()));
  await store.openSession('open', session);
  return store;
}
const target = (scope, componentId) => ({ scope, ...(componentId ? { componentId } : {}) });

test('manual pages keep their text, never generate by themselves, and operation receipts prevent duplication', async (t) => {
  const store = await fixture(t), deck = await store.snapshot();
  const payload = { deckId: deck.id, mainKey: 'john cena', context: 'wrestler', manual: [textBlocks('== literal ==\n: text')] };
  const first = await store.createPage('create', payload);
  assert.equal((await store.createPage('create', payload)).pageId, first.pageId);
  assert.equal((await store.pages()).length, 1);
  const page = await store.page(first.pageId);
  assert.equal(page.selectedText, null); assert.equal(page.status, null);
  assert.deepEqual(page.components.map(item => [item.kind, text(item), item.status]),
    [['main_key', 'john cena', null], ['context', 'wrestler', null], ['manual', '== literal ==\n: text', null]]);
  await assert.rejects(store.createPage('blank', { deckId: deck.id, mainKey: '  ' }), { code: 'invalid' });

  // Generate creates the configured components from the main key; it needs no confirmation.
  const { attemptIds } = await store.generate('generate', { pageId: page.id, target: target('missing'), session });
  assert.equal(attemptIds.length, 1);
  const generatedPage = await store.page(page.id);
  assert.deepEqual(generated(generatedPage).map(item => [item.moduleInstanceId, item.status]), [[deck.modules[0].id, 'loading']]);
  assert.equal(text(component(generatedPage, 'manual')), '== literal ==\n: text');
  assert.deepEqual((await store.generate('generate-again', { pageId: page.id, target: target('missing'), session })).attemptIds, []);
});

test('edits preserve creation time and other components; Context can be set and cleared; stale saves fail', async (t) => {
  const store = await fixture(t), deck = await store.snapshot();
  const { pageId } = await store.createPage('new', { deckId: deck.id, mainKey: 'first' });
  const created = (await store.page(pageId)).createdAt;
  const key = component(await store.page(pageId), 'main_key');
  await store.savePage('rename', { pageId, changes: [{ componentId: key.id, content: textBlocks('Bismarck') }] });
  await store.savePage('context', { pageId, changes: [], context: textBlocks('Otto von Bismarck') });
  await store.savePage('add', { pageId, changes: [], added: [textBlocks('my note')] });
  let page = await store.page(pageId);
  assert.deepEqual(page.components.map(item => text(item)), ['Bismarck', 'Otto von Bismarck', 'my note']);
  assert.equal(page.createdAt, created);
  assert.deepEqual((await store.listPages(deck.id, { order: 'az' })).pages.map(item => item.mainKey), ['Bismarck']);
  await assert.rejects(store.savePage('second-context', { pageId, changes: [], context: textBlocks('again') }), { code: 'invalid' });
  await assert.rejects(store.savePage('blank-key', { pageId, changes: [{ componentId: key.id, content: textBlocks(' ') }] }), { code: 'invalid' });
  await store.savePage('clear', { pageId, changes: [{ componentId: component(page, 'context').id, content: textBlocks('') }] });
  page = await store.page(pageId);
  assert.equal(component(page, 'context'), undefined);
  await store.deletePage('delete', pageId);
  await assert.rejects(store.savePage('late', { pageId, changes: [{ componentId: key.id, content: textBlocks('late') }] }), { code: 'deleted' });
  await store.deleteDeck('delete-deck', { deckId: deck.id });
  await assert.rejects(store.createPage('late-new', { deckId: deck.id, mainKey: 'late' }), { code: 'deleted' });
});

test('component retry confirms first, uses the current main key and configuration, and leaves other components alone', async (t) => {
  const store = await fixture(t);
  const [selected, language] = await useModules(store, ['selected', 'german-examples']);
  const { pageId } = await store.capture('capture', { session, mainKey: 'original', snapshot: await store.snapshot() });
  await complete(store, await store.page(pageId), session, () => 'initial');
  let page = await store.page(pageId);
  const [first, second] = generated(page);
  await store.savePage('manual', { pageId, changes: [
    { componentId: component(page, 'main_key').id, content: textBlocks('edited') },
    { componentId: first.id, content: textBlocks('manual edit') }, { componentId: second.id, content: textBlocks('manual edit') }] });
  // Reconfigure the second instance's type in place: same instance, new instructions.
  const deck = await store.deck(page.deckId);
  await store.saveDeck('config', { deck: { ...deck, modules: [selected, { id: language.id, type: 'selected-language' }] } });

  const retry = { pageId, target: target('component', second.id), session };
  let confirmation;
  await assert.rejects(store.generate('retry', retry), error => { confirmation = error.details.confirmation; return error.code === 'confirmation_required'; });
  await store.savePage('remote-edit', { pageId, changes: [{ componentId: second.id, content: textBlocks('remote edit') }] });
  await assert.rejects(store.generate('retry', { ...retry, confirmation }), error => {
    const stale = confirmation; confirmation = error.details.confirmation;
    return error.code === 'confirmation_required' && confirmation !== stale;
  });

  const interpretations = [];
  const generation = await Generation.create(store, {
    interpret: async mainKey => { interpretations.push(mainKey); return { inputType: 'word_phrase', sourceLanguage: 'English' }; },
    generate: async () => assert.fail('the language tag must not generate') });
  t.after(() => generation.close());
  const result = await store.generate('retry', { ...retry, confirmation });
  await generation.start(pageId, result.attemptIds);
  page = await store.page(pageId);
  assert.equal(text(generated(page)[1]), ''); assert.equal(text(generated(page)[0]), 'manual edit');
  await assert.rejects(store.savePage('locked', { pageId, changes: [{ componentId: second.id, content: textBlocks('draft') }] }), { code: 'generating' });
  await store.savePage('other-editable', { pageId, changes: [{ componentId: first.id, content: textBlocks('still editable') }] });
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  await store.publish('finish', { attemptId: result.attemptIds[0], session });
  assert.deepEqual(interpretations, ['edited']);
  assert.deepEqual(generated(await store.page(pageId)).map(text), ['still editable', 'edited\nEnglish']);
  // A resubmission replays the confirmed operation, confirmation included.
  assert.deepEqual((await store.generate('retry', { ...retry, confirmation })).attemptIds, result.attemptIds);
  await assert.rejects(store.generate('retry', retry), { code: 'operation_reused' });
});

test('configuration changes never touch existing pages until Generate missing or a retry', async (t) => {
  const store = await fixture(t);
  const [kept, removed] = await useModules(store, ['selected', 'selected-language']);
  const { pageId } = await store.capture('capture', { session, mainKey: 'word', snapshot: await store.snapshot() });
  await complete(store, await store.page(pageId), session, item => `out ${item.moduleInstanceId}`);
  await store.savePage('mine', { pageId, changes: [], added: [textBlocks('my own')] });
  const deck = await store.deck((await store.page(pageId)).deckId);
  const added = { id: 'added-instance', type: 'selected' };
  await store.saveDeck('reconfigure', { deck: { ...deck, modules: [added, kept] } });

  let page = await store.page(pageId);
  assert.deepEqual(generated(page).map(item => [item.moduleInstanceId, item.configured, text(item)]),
    [[kept.id, true, `out ${kept.id}`], [removed.id, false, `out ${removed.id}`]]);
  const orphan = generated(page).find(item => item.moduleInstanceId === removed.id);
  await assert.rejects(confirmed(store, 'retry-orphan', { pageId, target: target('component', orphan.id), session }), { code: 'invalid' });

  const missing = await store.generate('missing', { pageId, target: target('missing'), session });
  assert.equal(missing.attemptIds.length, 1);
  assert.equal((await store.attempt(missing.attemptIds[0])).module.id, added.id);
  await complete(store, await store.page(pageId), session, () => 'new');
  const whole = await confirmed(store, 'retry-page', { pageId, target: target('page'), session });
  assert.equal(whole.attemptIds.length, 2);
  page = await store.page(pageId);
  assert.equal(text(generated(page).find(item => item.moduleInstanceId === removed.id)), `out ${removed.id}`);
  assert.equal(text(component(page, 'manual')), 'my own');
  assert.ok(generated(page).filter(item => item.configured).every(item => item.status === 'loading'));
});

test('four list orders use the current main key, deterministic ties, and creation time', () => {
  const make = (id, mainKey, createdAt) => ({ id, createdAt, mainKey });
  const pages = [make('b', 'apple', '2'), make('a', 'Apple', '2'), make('c', 'ａpple', '1'), make('d', 'Zebra', '3')];
  const ids = order => sortPages(pages, order).map(page => page.id);
  assert.deepEqual(ids('az'), ['a', 'b', 'c', 'd']); assert.deepEqual(ids('za'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(ids('newest'), ['d', 'a', 'b', 'c']); assert.deepEqual(ids('oldest'), ['c', 'a', 'b', 'd']);
  pages[3].mainKey = 'aardvark'; assert.deepEqual(ids('az'), ['d', 'a', 'b', 'c']);
});
