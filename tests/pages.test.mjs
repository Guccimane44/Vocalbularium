import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { Generation } from '../src/server/generation.mjs';
import { sortPages } from '../extension/sorting.ts';
import { complete, component, confirmed, generated, text, textBlocks, useModules, resultFor, fieldEdit } from './helpers/pages.mjs';

const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) {
  const store = await createTestStore(t);
  t.after(async () => (await store.close()));
  await store.openSession('open', session);
  return store;
}
const target = (scope, componentId) => ({ scope, ...(componentId ? { componentId } : {}) });

test('manual pages copy the deck modules, keep the user’s text, and never generate by themselves', async (t) => {
  const store = await fixture(t), deck = await store.snapshot();
  const [context, notes, explanation] = await useModules(store, ['context', 'text', 'german']);
  const initial = [{ moduleInstanceId: context.id, content: textBlocks('wrestler') }, { moduleInstanceId: notes.id, content: textBlocks('== literal ==\n: text') }];
  const payload = { deckId: deck.id, mainKey: 'john cena', initial };
  const first = await store.createPage('create', payload);
  assert.equal((await store.createPage('create', payload)).pageId, first.pageId);
  assert.equal((await store.pages()).length, 1);
  const page = await store.page(first.pageId);
  assert.equal(page.selectedText, null); assert.equal(page.status, null);
  assert.deepEqual(page.components.map(item => [item.moduleType, text(item), item.status]),
    [['main-key', 'john cena', null], ['context', 'wrestler', null], ['text', '== literal ==\n: text', null], ['german', '', null]]);
  await assert.rejects(store.createPage('blank', { deckId: deck.id, mainKey: '  ' }), { code: 'invalid' });
  await assert.rejects(store.createPage('not-input', { deckId: deck.id, mainKey: 'x', initial: [{ moduleInstanceId: explanation.id, content: textBlocks('no') }] }), { code: 'invalid' });

  // Generate fills the content components that never generated; it needs no confirmation.
  const { attemptIds } = await store.generate('generate', { pageId: page.id, target: target('missing'), session });
  assert.equal(attemptIds.length, 1);
  const generatedPage = await store.page(page.id);
  assert.deepEqual(generated(generatedPage).map(item => [item.moduleType, item.status]), [['german', 'loading']]);
  assert.equal(text(component(generatedPage, 'text')), '== literal ==\n: text');
  assert.deepEqual((await store.generate('generate-again', { pageId: page.id, target: target('missing'), session })).attemptIds, []);
});

test('edits preserve creation time and other components; an emptied Context stays; stale saves fail', async (t) => {
  const store = await fixture(t), deck = await store.snapshot();
  const { pageId } = await store.createPage('new', { deckId: deck.id, mainKey: 'first' });
  const created = (await store.page(pageId)).createdAt;
  let page = await store.page(pageId);
  const key = component(page, 'main-key'), context = component(page, 'context');
  await store.savePage('rename', { pageId, changes: [{ componentId: key.id, content: textBlocks('Bismarck') }] });
  await store.savePage('context', { pageId, changes: [{ componentId: context.id, content: textBlocks('Otto von Bismarck') }] });
  page = await store.page(pageId);
  assert.deepEqual(page.components.map(item => text(item)), ['Bismarck', 'Otto von Bismarck', '']);
  assert.equal(page.createdAt, created);
  assert.deepEqual((await store.listPages(deck.id, { order: 'az' })).pages.map(item => item.mainKey), ['Bismarck']);
  await assert.rejects(store.savePage('blank-key', { pageId, changes: [{ componentId: key.id, content: textBlocks(' ') }] }), { code: 'invalid' });
  await store.savePage('clear', { pageId, changes: [{ componentId: context.id, content: textBlocks('') }] });
  assert.equal(text(component(await store.page(pageId), 'context')), '', 'clearing is an edit; deleting is a shaping step');
  await store.deletePage('delete', pageId);
  await assert.rejects(store.savePage('late', { pageId, changes: [{ componentId: key.id, content: textBlocks('late') }] }), { code: 'deleted' });
  await store.deleteDeck('delete-deck', { deckId: deck.id });
  await assert.rejects(store.createPage('late-new', { deckId: deck.id, mainKey: 'late' }), { code: 'deleted' });
});

test('component retry confirms first, uses the current main key, and leaves other components alone', async (t) => {
  const store = await fixture(t);
  await useModules(store, ['chinese', 'german']);
  const { pageId } = await store.capture('capture', { session, mainKey: 'original', snapshot: await store.snapshot() });
  await complete(store, await store.page(pageId), session, () => 'initial');
  let page = await store.page(pageId);
  const [first, second] = generated(page);
  await store.savePage('manual', { pageId, changes: [
    { componentId: component(page, 'main-key').id, content: textBlocks('edited') },
    { componentId: first.id, content: fieldEdit(first, 'manual edit') }, { componentId: second.id, content: fieldEdit(second, 'manual edit') }] });

  const retry = { pageId, target: target('component', second.id), session };
  let confirmation;
  await assert.rejects(store.generate('retry', retry), error => { confirmation = error.details.confirmation; return error.code === 'confirmation_required'; });
  await store.savePage('remote-edit', { pageId, changes: [{ componentId: second.id, content: fieldEdit(second, 'remote edit') }] });
  await assert.rejects(store.generate('retry', { ...retry, confirmation }), error => {
    const stale = confirmation; confirmation = error.details.confirmation;
    return error.code === 'confirmation_required' && confirmation !== stale;
  });
  await assert.rejects(confirmed(store, 'retry-key', { pageId, target: target('component', component(page, 'main-key').id), session }), { code: 'invalid' });

  const interpretations = [];
  const generation = await Generation.create(store, {
    interpret: async mainKey => { interpretations.push(mainKey); return { inputType: 'word_phrase', sourceLanguage: 'English' }; },
    generate: async request => resultFor(request, 'regenerated') });
  t.after(() => generation.close());
  const result = await store.generate('retry', { ...retry, confirmation });
  await generation.start(pageId, result.attemptIds);
  page = await store.page(pageId);
  assert.equal(text(generated(page)[1]), ''); assert.equal(text(generated(page)[0]), 'manual edit');
  await assert.rejects(store.savePage('locked', { pageId, changes: [{ componentId: second.id, content: textBlocks('draft') }] }), { code: 'generating' });
  await store.savePage('other-editable', { pageId, changes: [{ componentId: first.id, content: fieldEdit(first, 'still editable') }] });
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  await store.publish('finish', { attemptId: result.attemptIds[0], session });
  assert.deepEqual(interpretations, ['edited']);
  assert.deepEqual(generated(await store.page(pageId)).map(item => [text(item), item.status]), [['still editable', 'completed'], ['regenerated', 'completed']]);
  // A resubmission replays the confirmed operation, confirmation included.
  assert.deepEqual((await store.generate('retry', { ...retry, confirmation })).attemptIds, result.attemptIds);
  await assert.rejects(store.generate('retry', retry), { code: 'operation_reused' });
});

test('shaping adds, deletes and moves page modules; generation never brings a deleted one back', async (t) => {
  const store = await fixture(t);
  await useModules(store, ['context', 'chinese', 'chinese']);
  const { pageId } = await store.capture('capture', { session, mainKey: 'word', snapshot: await store.snapshot() });
  await complete(store, await store.page(pageId), session, item => `out ${item.moduleType}`);
  const order = async () => (await store.page(pageId)).components.map(item => item.moduleType);
  let page = await store.page(pageId);

  // Add: a page-only Text and a content module that waits as "not generated yet".
  const added = await store.addModule('add-text', { pageId, type: 'text', position: 1 });
  assert.equal((await store.addModule('add-text', { pageId, type: 'text', position: 1 })).componentId, added.componentId, 'replay adds nothing');
  await store.addModule('add-examples', { pageId, type: 'german' });
  assert.deepEqual(await order(), ['main-key', 'text', 'context', 'chinese', 'chinese', 'german']);
  assert.deepEqual((await store.deck((await store.page(pageId)).deckId)).modules.map(module => module.type),
    ['main-key', 'context', 'chinese', 'chinese'], 'the deck is unchanged');
  await assert.rejects(store.addModule('second-context', { pageId, type: 'context' }), { code: 'invalid' });
  await assert.rejects(store.addModule('second-key', { pageId, type: 'main-key' }), { code: 'invalid' });
  await assert.rejects(store.addModule('above-key', { pageId, type: 'text', position: 0 }), { code: 'invalid' });

  // Delete: never the main key; a deleted content component stays gone.
  page = await store.page(pageId);
  const explanation = component(page, 'chinese');
  await assert.rejects(store.deleteComponent('delete-key', { pageId, componentId: component(page, 'main-key').id }), { code: 'invalid' });
  await store.deleteComponent('delete-explanation', { pageId, componentId: explanation.id });
  await store.deleteComponent('delete-context', { pageId, componentId: component(page, 'context').id });
  assert.deepEqual(await order(), ['main-key', 'text', 'chinese', 'german']);
  await assert.rejects(store.savePage('stale-draft', { pageId, changes: [{ componentId: explanation.id, content: textBlocks('draft') }] }), { code: 'deleted' });
  await assert.rejects(store.deleteComponent('delete-again', { pageId, componentId: explanation.id }), { code: 'deleted' });
  const missing = await store.generate('missing', { pageId, target: target('missing'), session });
  assert.deepEqual((await Promise.all(missing.attemptIds.map(id => store.attempt(id)))).map(attempt => attempt.module.type), ['german']);
  await assert.rejects(store.deleteComponent('delete-loading', { pageId, componentId: component(await store.page(pageId), 'german').id }), { code: 'invalid' });
  await complete(store, await store.page(pageId), session, () => 'examples');
  const whole = await confirmed(store, 'retry-page', { pageId, target: target('page'), session });
  assert.equal(whole.attemptIds.length, 2, 'page retry runs only the page’s own content modules');
  await complete(store, await store.page(pageId), session, () => 'again');

  // Move: anything below the main key, never the main key itself.
  page = await store.page(pageId);
  await store.moveComponent('move-examples', { pageId, componentId: component(page, 'german').id, position: 1 });
  assert.deepEqual(await order(), ['main-key', 'german', 'text', 'chinese']);
  await assert.rejects(store.moveComponent('move-key', { pageId, componentId: component(page, 'main-key').id, position: 2 }), { code: 'invalid' });
  await assert.rejects(store.moveComponent('move-too-far', { pageId, componentId: component(page, 'text').id, position: 4 }), { code: 'invalid' });

  // The limit counts every module.
  for (let count = (await order()).length; count < 12; count++) await store.addModule(`fill-${count}`, { pageId, type: 'text' });
  await assert.rejects(store.addModule('thirteenth', { pageId, type: 'text' }), { code: 'invalid' });
  assert.equal((await order()).length, 12);
});

test('four list orders use the current main key, deterministic ties, and creation time', () => {
  const make = (id, mainKey, createdAt) => ({ id, createdAt, mainKey });
  const pages = [make('b', 'apple', '2'), make('a', 'Apple', '2'), make('c', 'ａpple', '1'), make('d', 'Zebra', '3')];
  const ids = order => sortPages(pages, order).map(page => page.id);
  assert.deepEqual(ids('az'), ['a', 'b', 'c', 'd']); assert.deepEqual(ids('za'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(ids('newest'), ['d', 'a', 'b', 'c']); assert.deepEqual(ids('oldest'), ['c', 'a', 'b', 'd']);
  pages[3].mainKey = 'aardvark'; assert.deepEqual(ids('az'), ['d', 'a', 'b', 'c']);
});

test('a component with nothing in it starts without confirmation, however it got there; anything with content asks first', async (t) => {
  const store = await fixture(t);
  await useModules(store, ['chinese', 'chinese']);
  const { pageId } = await store.createPage('manual', { deckId: (await store.snapshot()).id, mainKey: 'word' });
  let page = await store.page(pageId);
  const [first, second] = generated(page);
  const started = await store.generate('first-run', { pageId, target: target('component', first.id), session });
  assert.equal(started.attemptIds.length, 1, 'nothing to replace, so no confirmation');
  await complete(store, await store.page(pageId), session, () => 'explained');
  await assert.rejects(store.generate('retry-first', { pageId, target: target('component', first.id), session }), { code: 'confirmation_required' });
  await store.savePage('typed', { pageId, changes: [{ componentId: second.id, content: textBlocks('my own example') }] });
  await assert.rejects(store.generate('replace-typed', { pageId, target: target('component', second.id), session }), { code: 'confirmation_required' },
    'text the user wrote is replaced only after confirmation');

  // Generated, but nothing came back (a module that does not apply to the main key): nothing to replace (0.6.3).
  await store.savePage('cleared', { pageId, changes: [{ componentId: second.id, content: textBlocks('') }] });
  const empty = await store.generate('empty-run', { pageId, target: target('component', second.id), session });
  assert.equal(empty.attemptIds.length, 1);
  await complete(store, await store.page(pageId), session, () => '');
  page = await store.page(pageId);
  assert.equal(text(page.components.find(item => item.id === second.id)), '');
  assert.notEqual(page.components.find(item => item.id === second.id).attemptId, null, 'it has generated before');
  const again = await store.generate('empty-again', { pageId, target: target('component', second.id), session });
  assert.equal(again.attemptIds.length, 1, 'an empty result is retried without confirmation');
  // Failed: nothing to replace either.
  await store.failAttempt(again.attemptIds[0]);
  const afterFailure = await store.generate('after-failure', { pageId, target: target('component', second.id), session });
  assert.equal(afterFailure.attemptIds.length, 1, 'a failed component is retried without confirmation');
});
