import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { component, text, textBlocks, staged, wordResult } from './helpers/pages.mjs';

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

test('deleting a facet removes its markdown and keeps it gone from the next attempt', async t => {
  const store = await fixture(t);
  await germanDeck(store);
  const { pageId } = await store.capture('capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = component(await store.page(pageId), 'german');
  const facets = { article: { singular: 'das Ufer' }, examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }], synonyms: ['Böschung'] };
  await store.stage(german.attemptId, staged(wordResult(['Ufer'], facets, { key: 'bank' })));
  await store.publish('publish', { attemptId: german.attemptId, session });

  await store.deleteFacet('delete-examples', { pageId, componentId: german.id, parent: 'german', facet: 'examples' });
  let page = await store.page(pageId);
  assert.deepEqual(component(page, 'german').facets, ['article', 'synonyms', 'antonyms']);
  assert.deepEqual(component(page, 'german').content.blocks[0].facets, { article: 'das Ufer', synonyms: 'Böschung' }, 'only its markdown goes');
  await assert.rejects(store.deleteFacet('again', { pageId, componentId: german.id, parent: 'german', facet: 'examples' }),
    { code: 'invalid', message: 'This facet is no longer there.' });
  await assert.rejects(store.deleteFacet('other-parent', { pageId, componentId: german.id, parent: 'chinese', facet: 'examples' }),
    { code: 'invalid', message: 'This facet is no longer there.' });

  // A facet without markdown, or a parent without content, loses only the facet.
  await store.deleteFacet('delete-antonyms', { pageId, componentId: german.id, parent: 'german', facet: 'antonyms' });
  page = await store.page(pageId);
  assert.deepEqual(component(page, 'german').content.blocks[0].facets, { article: 'das Ufer', synonyms: 'Böschung' });
  const { componentId: empty } = await store.addModule('second', { pageId, type: 'german' });
  await store.addFacet('second-facet', { pageId, componentId: empty, parent: 'german', facet: 'article' });
  await store.deleteFacet('second-delete', { pageId, componentId: empty, parent: 'german', facet: 'article' });
  assert.deepEqual((await store.page(pageId)).components.find(item => item.id === empty).content, { version: 1, blocks: [] });

  const { attemptIds } = await store.generate('retry', { pageId, target: { scope: 'component', componentId: german.id }, session,
    confirmation: store.confirmationDigest([component(page, 'german')]) });
  assert.deepEqual((await store.attempt(attemptIds[0])).module.facets, ['article', 'synonyms']);
});

test('a facet added after the last attempt, or deleted and added again, waits for the next Retry', async t => {
  const store = await fixture(t);
  await germanDeck(store, ['article', 'examples']);
  const { pageId } = await store.capture('capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = async () => component(await store.page(pageId), 'german');
  const first = await german();
  await store.stage(first.attemptId, staged(wordResult(['Ufer'], { examples: [{ sentence: 'Bank.', translation: 'Ufer.' }] })));
  await store.publish('publish', { attemptId: first.attemptId, session });
  assert.deepEqual((await german()).waitingFacets, []);
  await store.addFacet('synonyms', { pageId, componentId: first.id, parent: 'german', facet: 'synonyms' });
  assert.deepEqual((await german()).waitingFacets, ['synonyms']);
  await store.deleteFacet('drop-examples', { pageId, componentId: first.id, parent: 'german', facet: 'examples' });
  await store.addFacet('examples-again', { pageId, componentId: first.id, parent: 'german', facet: 'examples' });
  assert.deepEqual((await german()).waitingFacets, ['examples', 'synonyms']);
  const { attemptIds } = await store.generate('retry', { pageId, target: { scope: 'component', componentId: first.id }, session,
    confirmation: store.confirmationDigest([await german()]) });
  assert.deepEqual((await store.attempt(attemptIds[0])).module.facets, ['article', 'examples', 'synonyms']);
  assert.deepEqual((await german()).waitingFacets, [], 'a running attempt generates them');
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

test('a parent’s markdown is saved with its top line locked, its facets only, any part empty, and never as plain text (D09)', async t => {
  const store = await fixture(t);
  await germanDeck(store, ['article', 'examples']);
  const { pageId } = await store.capture('structured', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = component(await store.page(pageId), 'german');
  await store.stage(first.attemptId, staged(wordResult(['Ufer'], { article: { singular: 'das Ufer', plural: 'die Ufer' } }, { key: 'bank' })));
  await store.publish('structured-publish', { attemptId: first.attemptId, session });
  const header = { kind: 'word', language: 'Englisch', key: 'bank' };
  const save = (id, block) => store.savePage(id, { pageId, changes: [{ componentId: first.id, content: { version: 1, blocks: [{ type: 'parent', ...block }] } }] });
  const stored = async () => component(await store.page(pageId), 'german').content;

  // Any part may be emptied, the core included; a facet emptied loses its entry.
  await save('emptied', { header, core: '', facets: { article: '  ', examples: '1. **Nur** Übersetzung.' } });
  assert.deepEqual(await stored(), { version: 1, blocks: [{ type: 'parent', header, core: '', facets: { examples: '1. **Nur** Übersetzung.' } }] });

  await assert.rejects(save('header', { header: { ...header, key: 'Bank' }, core: '', facets: {} }), { code: 'invalid', message: "The module's top line can not be changed." });
  await assert.rejects(save('kind', { header: { kind: 'sentence' }, core: 'x', facets: {} }), { code: 'invalid', message: "The module's top line can not be changed." });
  await assert.rejects(save('stranger', { header, core: '', facets: { synonyms: 'Damm' } }), { code: 'invalid', message: 'German has no Synonyms here.' });
  await assert.rejects(store.savePage('text-over', { pageId, changes: [{ componentId: first.id, content: textBlocks('typed over') }] }),
    { code: 'invalid', message: 'Edit this module in its editor.' });
  assert.equal((await stored()).blocks[0].type, 'parent', 'nothing was replaced');

  // A provider result is staged only as content with its top line (D09).
  const { componentId: third } = await store.addModule('third', { pageId, type: 'german' });
  const { attemptIds: [attemptId] } = await store.generate('third-run', { pageId, target: { scope: 'component', componentId: third }, session });
  await assert.rejects(store.stage(attemptId, { ok: true, text: '== Englisch ==\n: [1] Ufer' }), { code: 'invalid', message: 'Invalid component result.' });

  // A parent that never generated has no top line to edit.
  const { componentId } = await store.addModule('second', { pageId, type: 'german' });
  await assert.rejects(store.savePage('no-core', { pageId, changes: [{ componentId, content: { version: 1, blocks: [{ type: 'parent', header, core: '', facets: {} }] } }] }),
    { code: 'invalid', message: 'Generate this module before editing it.' });
});
