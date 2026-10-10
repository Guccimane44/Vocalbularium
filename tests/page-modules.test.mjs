import test from 'node:test';
import assert from 'node:assert/strict';
import Value from 'typebox/value';
import {
  ComponentMovePayloadSchema, DeckConfigurationSchema, MAX_MODULES, ModuleAddPayloadSchema, PageSchema
} from '@vocabularium/contracts';
import {
  addBlocked, CATALOG, copyModules, deleteBlocked, generationTargets, isContentType, moveBlocked, moved,
  validateConfiguration, WINDOW_MODULES
} from '@vocabularium/domain/page-modules';
import { textBlocks } from '@vocabularium/domain/pages';

const instances = (...types) => types.map((type, index) => ({ id: `m${index}`, type }));
const component = (id, moduleType, attemptId = null, status = null) =>
  ({ id, moduleInstanceId: `i-${id}`, moduleType, content: textBlocks(''), status, attemptId });
const page = () => [
  component('key', 'main-key'), component('ctx', 'context'), component('done', 'german-examples', 'a1', 'completed'),
  component('new', 'sentence-usage'), component('notes', 'text')
];

test('the catalog lists input modules first and the window offers everything but the main key', () => {
  assert.deepEqual(Object.keys(CATALOG).slice(0, 3), ['main-key', 'context', 'text']);
  assert.deepEqual(WINDOW_MODULES, ['context', 'text', 'german-explanation', 'german-examples', 'sentence-usage']);
  for (const entry of Object.values(CATALOG)) assert.ok(entry.label && entry.description);
  assert.equal(isContentType('text'), false); assert.equal(isContentType('german-examples'), true);
  assert.equal(isContentType('selected'), false);
});

test('a configuration starts with one main key, has at most one Context, and counts every module toward twelve', () => {
  assert.equal(MAX_MODULES, 12);
  assert.doesNotThrow(() => validateConfiguration(instances('main-key')));
  assert.doesNotThrow(() => validateConfiguration(instances('main-key', 'context', 'text', 'text', 'german-examples')));
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
  const copied = copyModules(instances('main-key', 'context', 'german-examples'), () => `page-${next++}`);
  assert.deepEqual(copied, [{ id: 'page-0', type: 'main-key' }, { id: 'page-1', type: 'context' }, { id: 'page-2', type: 'german-examples' }]);
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
  const components = [...page(), component('busy', 'german-explanation', 'a2', 'loading')];
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
