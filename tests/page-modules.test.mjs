import test from 'node:test';
import assert from 'node:assert/strict';
import Value from 'typebox/value';
import {
  ComponentMovePayloadSchema, DeckConfigurationSchema, MAX_MODULES, ModuleAddPayloadSchema, PageSchema
} from '@vocabularium/contracts';
import {
  addBlocked, CATALOG, copyModules, DECK_COLOURS, deleteBlocked, FAMILIES, FAMILY_LABELS, firstMeaning, generationTargets, isContentType, moveBlocked, moved,
  pageMeaning, validateConfiguration, WINDOW_MODULES
} from '@vocabularium/domain/page-modules';
import { textBlocks } from '@vocabularium/domain/pages';

const instances = (...types) => types.map((type, index) => ({ id: `m${index}`, type }));
const component = (id, moduleType, attemptId = null, status = null) =>
  ({ id, moduleInstanceId: `i-${id}`, moduleType, content: textBlocks(''), status, attemptId });
const page = () => [
  component('key', 'main-key'), component('ctx', 'context'), component('done', 'german', 'a1', 'completed'),
  component('new', 'chinese'), component('notes', 'text')
];

test('the catalog lists input modules first and the window offers everything but the main key', () => {
  assert.deepEqual(Object.keys(CATALOG).slice(0, 3), ['main-key', 'context', 'text']);
  assert.deepEqual(WINDOW_MODULES, ['context', 'text', 'german', 'chinese'], 'the earlier content modules are retired (D08)');
  for (const entry of Object.values(CATALOG)) assert.ok(entry.label && entry.description);
  assert.equal(isContentType('text'), false); assert.equal(isContentType('german'), true);
  assert.equal(isContentType('selected'), false);
});

test('every module but the main key belongs to one module family (D05)', () => {
  assert.deepEqual([...FAMILIES], ['translation', 'meaning', 'usage', 'roots', 'connections', 'sound', 'notes'], 'Translation joins for the parents (D08)');
  assert.deepEqual([...DECK_COLOURS], ['meaning', 'usage', 'roots', 'connections', 'sound', 'notes'], 'deck colours stay the six earlier ones');
  assert.equal(CATALOG.german.family, 'translation');
  assert.equal(CATALOG.chinese.kind, 'content');
  for (const family of FAMILIES) assert.ok(FAMILY_LABELS[family]);
  assert.equal(CATALOG['main-key'].family, null);
  assert.deepEqual(WINDOW_MODULES.map(type => [type, CATALOG[type].family]), [
    ['context', 'notes'], ['text', 'notes'], ['german', 'translation'], ['chinese', 'translation']
  ]);
});

test('a configuration starts with one main key, has at most one Context, and counts every module toward twelve', () => {
  assert.equal(MAX_MODULES, 12);
  assert.doesNotThrow(() => validateConfiguration(instances('main-key')));
  assert.doesNotThrow(() => validateConfiguration(instances('main-key', 'context', 'text', 'text', 'german')));
  assert.doesNotThrow(() => validateConfiguration(instances('main-key', ...Array(11).fill('text'))));
  assert.throws(() => validateConfiguration(instances('main-key', ...Array(12).fill('text'))), /at most 12/);
  assert.throws(() => validateConfiguration([]), /must come first/);
  assert.throws(() => validateConfiguration(instances('context', 'main-key')), /must come first/);
  assert.throws(() => validateConfiguration(instances('main-key', 'main-key')), /exactly one main key/);
  assert.throws(() => validateConfiguration(instances('main-key', 'context', 'context')), /at most one Context/);
  assert.throws(() => validateConfiguration(instances('main-key', 'selected')), /unsupported/);
  assert.throws(() => validateConfiguration([{ id: 'a', type: 'main-key' }, { id: 'a', type: 'text' }]), /unique/);
  const deck = { name: 'Deck', modules: instances('main-key', 'context'), view: { module: 'default' } };
  assert.ok(Value.Check(DeckConfigurationSchema, deck));
  assert.ok(!Value.Check(DeckConfigurationSchema, { ...deck, captureContext: true }), 'the Context module replaces the setting');
  assert.ok(!Value.Check(DeckConfigurationSchema, { ...deck, modules: instances('main-key', ...Array(12).fill('text')) }));
});

test('a new page copies the deck modules under its own instance IDs', () => {
  let next = 0;
  const copied = copyModules(instances('main-key', 'context', 'german'), () => `page-${next++}`);
  assert.deepEqual(copied, [{ id: 'page-0', type: 'main-key' }, { id: 'page-1', type: 'context' }, { id: 'page-2', type: 'german' }]);
});

test('adding respects the limit, a single Context, and never adds a main key', () => {
  assert.equal(addBlocked(instances('main-key'), 'text'), null);
  assert.equal(addBlocked(instances('main-key'), 'context'), null);
  assert.match(addBlocked(instances('main-key', 'context'), 'context'), /already a Context/);
  assert.match(addBlocked(instances('main-key'), 'main-key'), /cannot be added/);
  assert.match(addBlocked(instances('main-key'), 'selected'), /cannot be added/);
  assert.match(addBlocked(instances('main-key', ...Array(11).fill('text')), 'text'), /At most 12/);
  assert.ok(Value.Check(ModuleAddPayloadSchema, { pageId: 'p', type: 'text' }));
  assert.ok(!Value.Check(ModuleAddPayloadSchema, { pageId: 'p', type: 'text', position: 0 }), 'nothing goes above the main key');
});

test('deleting keeps the main key and waits for generation to finish', () => {
  const components = [...page(), component('busy', 'chinese', 'a2', 'loading')];
  for (const id of ['ctx', 'done', 'new', 'notes']) assert.equal(deleteBlocked(components, id), null, id);
  assert.match(deleteBlocked(components, 'key'), /main key cannot be deleted/);
  assert.match(deleteBlocked(components, 'busy'), /still generating/);
  assert.match(deleteBlocked(components, 'gone'), /no longer exists/);
});

test('moving keeps the main key first', () => {
  const components = page();
  assert.equal(moveBlocked(components, 'notes', 1), null);
  assert.deepEqual(moved(components, 'notes', 1).map(item => item.id), ['key', 'notes', 'ctx', 'done', 'new']);
  assert.deepEqual(moved(components, 'ctx', 4).map(item => item.id), ['key', 'done', 'new', 'notes', 'ctx']);
  assert.match(moveBlocked(components, 'key', 2), /stays first/);
  assert.match(moveBlocked(components, 'notes', 0), /below the main key/);
  assert.match(moveBlocked(components, 'notes', 5), /below the main key/);
  assert.match(moveBlocked(components, 'gone', 1), /no longer exists/);
  assert.ok(!Value.Check(ComponentMovePayloadSchema, { pageId: 'p', componentId: 'c', position: 0 }));
});

test('generation targets the page’s own content components; input components never run', () => {
  const components = page();
  const ids = target => generationTargets(target, components).map(item => item.id);
  assert.deepEqual(ids({ scope: 'capture' }), ['new']);
  assert.deepEqual(ids({ scope: 'missing' }), ['new']);
  assert.deepEqual(ids({ scope: 'page' }), ['done', 'new']);
  assert.deepEqual(ids({ scope: 'component', componentId: 'done' }), ['done']);
  for (const id of ['key', 'ctx', 'notes']) assert.throws(() => ids({ scope: 'component', componentId: id }), /Only generated components/);
  assert.throws(() => ids({ scope: 'component', componentId: 'gone' }), /no longer exists/);
});

test('a page is its components in order, between one and twelve', () => {
  const valid = { id: 'p', deckId: 'd', selectedText: null, createdAt: '2026-10-10T00:00:00.000Z', components: page(), status: 'completed' };
  assert.ok(Value.Check(PageSchema, valid));
  assert.ok(!Value.Check(PageSchema, { ...valid, components: [] }));
  assert.ok(!Value.Check(PageSchema, { ...valid, components: [{ ...page()[0], kind: 'main_key' }] }), 'kind is retired');
});

test('the meaning line is the first numbered meaning of the first content module, or a sentence’s translation', () => {
  const examples = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück\n: [2] Wohlstand\n=== Examples ===\n: [1] 幸福就在身边。\n:: Das Glück ist ganz nah.';
  const explanation = '== 汉语 ==\n=== 释义 ===\n: [1] 生活称心如意';
  assert.equal(firstMeaning(examples), 'Glück');
  assert.equal(firstMeaning(': [1] ohne Überschrift'), 'ohne Überschrift');
  assert.equal(firstMeaning('=== Examples ===\n: [1] 她很幸福。'), null, 'examples are not meanings');
  assert.equal(firstMeaning('Sie sagte leise: „我真的很幸福“.'), null);
  assert.equal(pageMeaning([{ type: 'chinese', text: explanation }, { type: 'german', text: examples }]), '生活称心如意');
  assert.equal(pageMeaning([{ type: 'german', text: 'Ich bin wirklich glücklich.\nZweite Zeile\n=== Examples ===\n: [1] Satz.' }]), 'Ich bin wirklich glücklich.', 'a sentence gives its translation');
  assert.equal(pageMeaning([{ type: 'german', text: examples }, { type: 'chinese', text: null }]), 'Glück');
  assert.equal(pageMeaning([{ type: 'text', text: ': [1] my note' }, { type: 'chinese', text: 'edited\n=== Nonsense ===' }]), null, 'input modules and text outside the contract never supply it');
});
