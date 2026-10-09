import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComponents } from '@vocabularium/domain/modules';
import {
  blockText, defaultView, generationTargets, pageStatus, textBlocks, validateConfiguration, validateView, VIEW_MODULES
} from '@vocabularium/domain/pages';
import { DeckConfigurationSchema, MAX_CONTENT_MODULES, PageSchema } from '@vocabularium/contracts';
import Value from 'typebox/value';

const word = { inputType: 'word_phrase', sourceLanguage: 'Chinese' };
const sentence = { inputType: 'sentence', sourceLanguage: 'Chinese' };
const instances = (...types) => types.map((type, index) => ({ id: `m${index}`, type }));
function component(id, kind, moduleInstanceId = null, status = null) {
  return { id, kind, moduleInstanceId, content: textBlocks(id), status, attemptId: null, configured: true };
}

test('each instance produces its own component; one failure leaves the others completed', async () => {
  const outcomes = await generateComponents({
    mainKey: '幸福', interpretation: word,
    modules: instances('selected', 'german-explanation', 'german-examples', 'sentence-usage'),
    generate: async ({ module }) => { if (module.type === 'german-examples') throw new Error('controlled'); return `out-${module.type}`; }
  });
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'm0', status: 'completed', text: '幸福' },
    { moduleInstanceId: 'm1', status: 'completed', text: 'out-german-explanation' },
    { moduleInstanceId: 'm2', status: 'failed', error: 'controlled' },
    { moduleInstanceId: 'm3', status: 'completed', text: '' }
  ]);
});

test('missing interpretation fails only the instances that need it', async () => {
  const outcomes = await generateComponents({
    mainKey: 'word', interpretation: null, modules: instances('selected', 'selected-language'), generate: () => assert.fail()
  });
  assert.deepEqual(outcomes.map(o => o.status), ['completed', 'failed']);
});

test('inapplicable instances complete empty without calling the provider', async () => {
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', interpretation: sentence, modules: instances('german-examples'), generate: () => assert.fail()
  });
  assert.deepEqual(outcomes, [{ moduleInstanceId: 'm0', status: 'completed', text: '' }]);
});

test('repeated instances retry for distinct output per component', async () => {
  const seen = new Set();
  const replies = ['same', 'same', 'other'];
  const avoided = [];
  const outcomes = await generateComponents({
    mainKey: 'word', interpretation: word, modules: instances('german-examples', 'german-examples'),
    generate: async ({ avoid }) => { avoided.push([...avoid]); return replies.shift(); },
    claimOutput: (_, text) => { if (seen.has(text)) return false; seen.add(text); return true; }
  });
  assert.deepEqual(outcomes.map(o => o.text), ['same', 'other']);
  assert.deepEqual(avoided, [[], [], ['same']]);
});

test('generation targets follow the live configuration and skip removed and manual components', () => {
  const modules = instances('selected', 'german-explanation', 'sentence-usage');
  const components = [
    component('key', 'main_key'), component('c0', 'module', 'm0', 'completed'),
    component('old', 'module', 'removed', 'completed'), component('mine', 'manual')
  ];
  const ids = target => generationTargets(target, modules, components).map(m => m.id);
  assert.deepEqual(generationTargets({ scope: 'capture' }, modules, [component('key', 'main_key')]).map(m => m.id), ['m0', 'm1', 'm2']);
  assert.deepEqual(ids({ scope: 'missing' }), ['m1', 'm2']);
  assert.deepEqual(ids({ scope: 'page' }), ['m0', 'm1', 'm2']);
  assert.deepEqual(ids({ scope: 'component', componentId: 'c0' }), ['m0']);
  assert.throws(() => ids({ scope: 'component', componentId: 'old' }), /no longer configured/);
  assert.throws(() => ids({ scope: 'component', componentId: 'mine' }), /Only generated components/);
  assert.throws(() => ids({ scope: 'component', componentId: 'key' }), /Only generated components/);
});

test('page status is derived from components that had an attempt', () => {
  assert.equal(pageStatus([component('k', 'main_key')]), null);
  assert.equal(pageStatus([component('a', 'module', 'm0', 'completed'), component('b', 'module', 'm1', 'loading')]), 'loading');
  assert.equal(pageStatus([component('a', 'module', 'm0', 'failed'), component('b', 'module', 'm1', 'loading')]), 'failed');
  assert.equal(pageStatus([component('a', 'module', 'm0', 'completed'), component('m', 'manual')]), 'completed');
});

test('the default view orders components and shows missing ones as placeholders', () => {
  const modules = instances('german-explanation', 'selected');
  const view = defaultView([
    component('mine', 'manual'), component('old', 'module', 'gone'), component('c1', 'module', 'm1'),
    component('ctx', 'context'), component('key', 'main_key')
  ], modules);
  assert.deepEqual(view.map(c => c.id ?? `missing:${c.moduleInstanceId}`), ['key', 'ctx', 'missing:m0', 'c1', 'old', 'mine']);
});

test('views validate their declared module dependencies', () => {
  assert.doesNotThrow(() => validateView({ module: 'default' }, []));
  assert.deepEqual(VIEW_MODULES.default.dependsOn, []);
  assert.throws(() => validateView({ module: 'card' }, []), /unsupported view/);
});

test('configurations allow at most 12 unique, supported instances', () => {
  assert.equal(MAX_CONTENT_MODULES, 12);
  assert.doesNotThrow(() => validateConfiguration(instances(...Array(12).fill('selected'))));
  assert.throws(() => validateConfiguration(instances(...Array(13).fill('selected'))), /at most 12/);
  assert.throws(() => validateConfiguration([{ id: 'a', type: 'selected' }, { id: 'a', type: 'selected' }]), /unique/);
  assert.throws(() => validateConfiguration([{ id: 'a', type: 'unknown' }]), /unsupported module/);
  const deck = { name: 'My Deck', modules: instances('german-examples'), view: { module: 'default' } };
  assert.ok(Value.Check(DeckConfigurationSchema, deck));
  assert.ok(!Value.Check(DeckConfigurationSchema, { ...deck, modules: instances(...Array(13).fill('selected')) }));
});

test('block content round-trips plain module text exactly', () => {
  for (const text of ['', '幸福', '  spaced\n\n== literal ==\n']) assert.equal(blockText(textBlocks(text)), text);
  const page = { id: 'p', deckId: 'd', selectedText: null, createdAt: '2026-10-10T00:00:00.000Z', status: null, components: [component('key', 'main_key')] };
  assert.ok(Value.Check(PageSchema, page));
});
