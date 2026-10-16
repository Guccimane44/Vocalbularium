import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComponents } from '@vocabularium/domain/modules';
import { formatContent } from '@vocabularium/domain/content';
import { blockText, mainKeyOf, pageStatus, textBlocks, validateView, VIEW_MODULES } from '@vocabularium/domain/pages';
import { PageSchema } from '@vocabularium/contracts';
import Value from 'typebox/value';

const word = { inputType: 'word_phrase' };
const sentence = { inputType: 'sentence' };
const instances = (...types) => types.map((type, index) => ({ id: `m${index}`, type }));
function component(id, moduleType, moduleInstanceId = `i-${id}`, status = null) {
  return { id, moduleInstanceId, moduleType, content: textBlocks(id), status, attemptId: null };
}

const wordOf = (meanings, facets = {}) => ({ core: { kind: 'word', language: 'Chinesisch', key: '幸福', meanings }, facets });
const sentenceOf = (translation, facets = {}) => ({ core: { kind: 'sentence', translation }, facets });

test('each instance produces its own component; one failure leaves the others completed', async () => {
  const outcomes = await generateComponents({
    mainKey: '幸福', interpretation: word,
    modules: instances('chinese', 'german', 'chinese'),
    generate: async ({ module }) => { if (module.type === 'german') throw new Error('controlled'); return wordOf([`out-${module.type}`]); }
  });
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'm0', status: 'completed', content: formatContent(wordOf(['out-chinese'])) },
    { moduleInstanceId: 'm1', status: 'failed', error: 'controlled' },
    { moduleInstanceId: 'm2', status: 'completed', content: formatContent(wordOf(['out-chinese'])) }
  ]);
});

test('missing interpretation fails every instance without calling the provider', async () => {
  const outcomes = await generateComponents({
    mainKey: 'word', interpretation: null, modules: instances('chinese', 'chinese'), generate: () => assert.fail()
  });
  assert.deepEqual(outcomes.map(o => o.status), ['failed', 'failed']);
});

test('a parent applies to a sentence as well as a word (D08)', async () => {
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', interpretation: sentence, modules: [{ id: 'm0', type: 'german', facets: ['article', 'examples'] }],
    generate: async ({ facets }) => { assert.deepEqual(facets, ['examples']); return sentenceOf('Ich bin wirklich glücklich.'); }
  });
  assert.deepEqual(outcomes, [{ moduleInstanceId: 'm0', status: 'completed', content: formatContent(sentenceOf('Ich bin wirklich glücklich.')) }]);
});

test('a parent always applies; it asks for the facets that apply and checks the structured result (D09)', async () => {
  const requests = [];
  const parent = { id: 'p', type: 'chinese', facets: ['examples', 'pinyin'] };
  const pinyin = [{ text: '我真的很幸福。', pinyin: 'wǒ zhēn de hěn xìngfú' }];
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', interpretation: sentence, modules: [parent, { id: 'q', type: 'chinese', facets: [] }],
    generate: async request => { requests.push(request.facets); return sentenceOf('我真的很幸福。', { pinyin }); }
  });
  assert.deepEqual(requests, [['examples', 'pinyin'], []]);
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'p', status: 'completed', content: formatContent(sentenceOf('我真的很幸福。', { pinyin })) },
    { moduleInstanceId: 'q', status: 'completed', content: formatContent(sentenceOf('我真的很幸福。')) }
  ], 'an entry for a facet the parent was not asked for is dropped');
  const german = [{ id: 'g', type: 'german', facets: ['article', 'examples'] }];
  const [emptyArticle] = await generateComponents({ mainKey: 'beautiful', interpretation: word, modules: german,
    generate: async () => wordOf(['schön'], { article: { singular: ' ', plural: '' }, examples: [{ sentence: 'So beautiful.', translation: 'So schön.' }] }) });
  assert.deepEqual(emptyArticle, { moduleInstanceId: 'g', status: 'completed', content: formatContent(wordOf(['schön'], { examples: [{ sentence: 'So beautiful.', translation: 'So schön.' }] })) },
    'an empty facet counts as an omitted facet');
  const failed = async value => (await generateComponents({ mainKey: 'x', interpretation: word, modules: german, generate: async () => value }))[0];
  for (const value of ['   ', 'plain text', null, { core: { kind: 'word', language: 'Englisch', key: 'x', meanings: [] }, facets: {} },
    sentenceOf('a sentence core for a word'), wordOf(['schön'], { examples: [{ translation: 'only a translation' }] }), { ...wordOf(['schön']), extra: true }]) {
    const outcome = await failed(value);
    assert.equal(outcome.status, 'failed', `refused: ${JSON.stringify(value)}`);
  }
  assert.match((await failed(sentenceOf('x'))).error, /core does not match the input/);
});

test('page status is derived from components that had an attempt', () => {
  assert.equal(pageStatus([component('k', 'main-key')]), null);
  assert.equal(pageStatus([component('a', 'german', 'm0', 'completed'), component('b', 'german', 'm1', 'loading')]), 'loading');
  assert.equal(pageStatus([component('a', 'german', 'm0', 'failed'), component('b', 'german', 'm1', 'loading')]), 'failed');
  assert.equal(pageStatus([component('a', 'german', 'm0', 'completed'), component('m', 'text')]), 'completed');
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
