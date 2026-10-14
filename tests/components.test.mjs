import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComponents } from '@vocabularium/domain/modules';
import { blockText, mainKeyOf, pageStatus, textBlocks, validateView, VIEW_MODULES } from '@vocabularium/domain/pages';
import { PageSchema } from '@vocabularium/contracts';
import Value from 'typebox/value';

const word = { inputType: 'word_phrase' };
const sentence = { inputType: 'sentence' };
const instances = (...types) => types.map((type, index) => ({ id: `m${index}`, type }));
function component(id, moduleType, moduleInstanceId = `i-${id}`, status = null) {
  return { id, moduleInstanceId, moduleType, content: textBlocks(id), status, attemptId: null };
}

test('each instance produces its own component; one failure leaves the others completed', async () => {
  const outcomes = await generateComponents({
    mainKey: '幸福', interpretation: word,
    modules: instances('german-explanation', 'german-examples', 'sentence-usage'),
    generate: async ({ module }) => { if (module.type === 'german-examples') throw new Error('controlled'); return `out-${module.type}`; }
  });
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'm0', status: 'completed', text: 'out-german-explanation' },
    { moduleInstanceId: 'm1', status: 'failed', error: 'controlled' },
    { moduleInstanceId: 'm2', status: 'completed', text: '' }
  ]);
});

test('missing interpretation fails every instance without calling the provider', async () => {
  const outcomes = await generateComponents({
    mainKey: 'word', interpretation: null, modules: instances('german-explanation', 'sentence-usage'), generate: () => assert.fail()
  });
  assert.deepEqual(outcomes.map(o => o.status), ['failed', 'failed']);
});

test('inapplicable instances complete empty without calling the provider', async () => {
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', interpretation: sentence, modules: instances('german-examples'), generate: () => assert.fail()
  });
  assert.deepEqual(outcomes, [{ moduleInstanceId: 'm0', status: 'completed', text: '' }]);
});

test('a parent always applies; it asks for the facets that apply and checks the result', async () => {
  const requests = [];
  const parent = { id: 'p', type: 'chinese', facets: ['examples', 'pinyin'] };
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', interpretation: sentence, modules: [parent, { id: 'q', type: 'chinese', facets: [] }],
    generate: async request => { requests.push(request.facets); return '我真的很幸福。\n=== Pinyin ===\n: wǒ zhēn de hěn xìngfú'; }
  });
  assert.deepEqual(requests, [['examples', 'pinyin'], []]);
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'p', status: 'completed', text: '我真的很幸福。\n=== Pinyin ===\n: wǒ zhēn de hěn xìngfú' },
    { moduleInstanceId: 'q', status: 'completed', text: '我真的很幸福。' }
  ], 'a section the parent does not have is dropped');
  const [emptyArticle] = await generateComponents({ mainKey: 'beautiful', interpretation: word,
    modules: [{ id: 'g', type: 'german', facets: ['article', 'examples'] }],
    generate: async () => '== Englisch (beautiful) ==\n=== Bedeutungen ===\n: [1] schön\n=== Article ===\n=== Examples ===\n: [1] So beautiful.\n:: So schön.' });
  assert.deepEqual(emptyArticle, { moduleInstanceId: 'g', status: 'completed',
    text: '== Englisch (beautiful) ==\n=== Bedeutungen ===\n: [1] schön\n=== Examples ===\n: [1] So beautiful.\n:: So schön.' },
    'an empty facet heading counts as an omitted facet');
  const [blank] = await generateComponents({ mainKey: 'x', interpretation: word, modules: [parent], generate: async () => '   ' });
  assert.equal(blank.status, 'failed');
});

test('page status is derived from components that had an attempt', () => {
  assert.equal(pageStatus([component('k', 'main-key')]), null);
  assert.equal(pageStatus([component('a', 'german-examples', 'm0', 'completed'), component('b', 'german-examples', 'm1', 'loading')]), 'loading');
  assert.equal(pageStatus([component('a', 'german-examples', 'm0', 'failed'), component('b', 'german-examples', 'm1', 'loading')]), 'failed');
  assert.equal(pageStatus([component('a', 'german-examples', 'm0', 'completed'), component('m', 'text')]), 'completed');
});

test('views validate their declared module dependencies', () => {
  assert.doesNotThrow(() => validateView({ module: 'default' }, []));
  assert.deepEqual(VIEW_MODULES.default.dependsOn, []);
  assert.throws(() => validateView({ module: 'card' }, []), /unsupported view/);
});

test('block content round-trips plain module text exactly', () => {
  for (const text of ['', '幸福', '  spaced\n\n== literal ==\n']) assert.equal(blockText(textBlocks(text)), text);
  const page = { id: 'p', deckId: 'd', selectedText: null, createdAt: '2026-10-10T00:00:00.000Z', status: null, components: [component('key', 'main-key')] };
  assert.ok(Value.Check(PageSchema, page));
  assert.equal(mainKeyOf(page.components), 'key');
});
