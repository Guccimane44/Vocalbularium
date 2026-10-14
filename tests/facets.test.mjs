import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { component, text, textBlocks } from './helpers/pages.mjs';

// Parent modules and their facets in storage (D08, 0.7.0 increment 2).
const session = { installationId: 'a', sessionId: 'browser', epoch: 1 };
async function fixture(t) {
  const store = await createTestStore(t);
  t.after(async () => (await store.close()));
  await store.openSession('open', session);
  return store;
}
const ALL = ['article', 'examples', 'synonyms', 'antonyms'];
async function germanDeck(store, facets = ALL) {
  const deck = await store.deck((await store.snapshot()).id);
  const modules = [deck.modules[0], { id: 'ctx', type: 'context' }, { id: 'german', type: 'german', facets }];
  await store.saveDeck(`german-${facets.join('-')}`, { deck: { id: deck.id, name: deck.name, modules, view: { module: 'default' } } });
  return store.deck(deck.id);
}

test('a deck stores each parent with its facets, and a captured page copies them', async t => {
  const store = await fixture(t);
  const deck = await germanDeck(store);
  assert.deepEqual(deck.modules.slice(1), [{ id: 'ctx', type: 'context' }, { id: 'german', type: 'german', facets: ALL }],
    'facets come back in order; other modules keep their shape');
  await assert.rejects(store.saveDeck('stranger', { deck: { ...deck, modules: [deck.modules[0], { id: 'g', type: 'german', facets: ['pinyin'] }] } }),
    { code: 'invalid', message: /German has no facet/ });
  await assert.rejects(store.saveDeck('order', { deck: { ...deck, modules: [deck.modules[0], { id: 'g', type: 'german', facets: ['examples', 'article'] }] } }),
    { code: 'invalid', message: /order of German/ });

  const { pageId } = await store.capture('capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const page = await store.page(pageId);
  assert.deepEqual(component(page, 'german').facets, ALL);
  assert.equal(component(page, 'context').facets, undefined);
  const attempt = await store.attempt(component(page, 'german').attemptId);
  assert.deepEqual(attempt.module, { id: component(page, 'german').moduleInstanceId, type: 'german', facets: ALL },
    'an attempt generates the facets its parent has when it starts');
});

test('a parent added to a page has its core only; facets join only a parent of their own type', async t => {
  const store = await fixture(t);
  await germanDeck(store, ['examples']);
  const { pageId } = await store.createPage('create', { deckId: (await store.snapshot()).id, mainKey: 'bank' });
  const { componentId: chinese } = await store.addModule('add-chinese', { pageId, type: 'chinese' });
  let page = await store.page(pageId);
  assert.deepEqual(page.components.find(item => item.id === chinese).facets, []);
  const german = component(page, 'german').id;

  await store.addFacet('pinyin', { pageId, componentId: chinese, parent: 'chinese', facet: 'pinyin' });
  await store.addFacet('pinyin', { pageId, componentId: chinese, parent: 'chinese', facet: 'pinyin' });
  await store.addFacet('article', { pageId, componentId: german, parent: 'german', facet: 'article' });
  page = await store.page(pageId);
  assert.deepEqual(page.components.find(item => item.id === chinese).facets, ['pinyin'], 'a replay adds nothing');
  assert.deepEqual(component(page, 'german').facets, ['article', 'examples'], 'in the parent’s order');

  await assert.rejects(store.addFacet('wrong-parent', { pageId, componentId: chinese, parent: 'german', facet: 'examples' }),
    { code: 'invalid', message: 'Examples can only be added to a German module.' });
  await assert.rejects(store.addFacet('twice', { pageId, componentId: german, parent: 'german', facet: 'examples' }),
    { code: 'invalid', message: 'This module already has Examples.' });
  await assert.rejects(store.addFacet('input', { pageId, componentId: component(page, 'context').id, parent: 'german', facet: 'synonyms' }),
    { code: 'invalid' });
  await assert.rejects(store.addFacet('gone', { pageId, componentId: 'missing', parent: 'german', facet: 'synonyms' }), { code: 'deleted' });

  // A facet cannot change while its parent generates.
  await store.generate('generate', { pageId, target: { scope: 'component', componentId: german }, session });
  await assert.rejects(store.addFacet('generating', { pageId, componentId: german, parent: 'german', facet: 'synonyms' }),
    { code: 'invalid', message: /still generating/ });
  await assert.rejects(store.deleteFacet('generating-delete', { pageId, componentId: german, parent: 'german', facet: 'article' }),
    { code: 'invalid', message: /still generating/ });
});

test('deleting a facet removes its section and keeps it gone from the next attempt', async t => {
  const store = await fixture(t);
  await germanDeck(store);
  const { pageId } = await store.createPage('create', { deckId: (await store.snapshot()).id, mainKey: 'bank' });
  const german = component(await store.page(pageId), 'german');
  const content = ['== Englisch (bank) ==', '=== Bedeutungen ===', ': [1] Ufer', '=== Article ===', ': das Ufer',
    '=== Examples ===', ': [1] We sat on the bank.', ':: Wir saßen am Ufer.', '=== Synonyms ===', ': Böschung'].join('\n');
  await store.savePage('write', { pageId, changes: [{ componentId: german.id, content: textBlocks(content) }] });

  await store.deleteFacet('delete-examples', { pageId, componentId: german.id, parent: 'german', facet: 'examples' });
  let page = await store.page(pageId);
  assert.deepEqual(component(page, 'german').facets, ['article', 'synonyms', 'antonyms']);
  assert.equal(text(component(page, 'german')),
    ['== Englisch (bank) ==', '=== Bedeutungen ===', ': [1] Ufer', '=== Article ===', ': das Ufer', '=== Synonyms ===', ': Böschung'].join('\n'));
  await assert.rejects(store.deleteFacet('again', { pageId, componentId: german.id, parent: 'german', facet: 'examples' }),
    { code: 'invalid', message: 'This facet is no longer there.' });
  await assert.rejects(store.deleteFacet('other-parent', { pageId, componentId: german.id, parent: 'chinese', facet: 'examples' }),
    { code: 'invalid', message: 'This facet is no longer there.' });

  // Text that no longer follows the contract keeps its words; only the facet goes.
  await store.savePage('edit', { pageId, changes: [{ componentId: german.id, content: textBlocks('My own notes about === Article ===') }] });
  await store.deleteFacet('delete-article', { pageId, componentId: german.id, parent: 'german', facet: 'article' });
  page = await store.page(pageId);
  assert.equal(text(component(page, 'german')), 'My own notes about === Article ===');

  const { attemptIds } = await store.generate('retry', { pageId, target: { scope: 'component', componentId: german.id }, session,
    confirmation: store.confirmationDigest([component(page, 'german')]) });
  assert.deepEqual((await store.attempt(attemptIds[0])).module.facets, ['synonyms', 'antonyms']);
});

test('a page reports the latest run’s word-or-sentence reading, and none before a run', async t => {
  const store = await fixture(t);
  await germanDeck(store);
  const { pageId } = await store.capture('capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  let page = await store.page(pageId);
  assert.equal(page.interpretation, null);
  const first = await store.attempt(component(page, 'german').attemptId);
  await store.establishInterpretation(first.run_id, { inputType: 'word_phrase', sourceLanguage: 'Englisch' });
  assert.equal((await store.page(pageId)).interpretation, 'word_phrase');

  await store.failAttempt(first.id);
  await store.savePage('sentence', { pageId, changes: [{ componentId: component(page, 'main-key').id, content: textBlocks('We sat on the bank.') }] });
  page = await store.page(pageId);
  const { attemptIds } = await store.generate('retry', { pageId, target: { scope: 'component', componentId: component(page, 'german').id }, session });
  assert.equal((await store.page(pageId)).interpretation, 'word_phrase', 'until the new run has read the key');
  await store.establishInterpretation((await store.attempt(attemptIds[0])).run_id, { inputType: 'sentence', sourceLanguage: 'Englisch' });
  assert.equal((await store.page(pageId)).interpretation, 'sentence');
});
