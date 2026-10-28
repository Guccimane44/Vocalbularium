import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComponent, generateComponents } from '@vocabularium/domain/modules';
import { formatContent, withKeyHighlighted } from '@vocabularium/domain/content';
import { blockText, mainKeyOf, pageStatus, textBlocks, validateView, VIEW_MODULES } from '@vocabularium/domain/pages';
import { PageSchema } from '@vocabularium/contracts';
import Value from 'typebox/value';

const instances = (...types) => types.map((type, index) => ({ id: `m${index}`, type }));
function component(id, moduleType, moduleInstanceId = `i-${id}`, status = null) {
  return { id, moduleInstanceId, moduleType, content: textBlocks(id), status, attemptId: null };
}

// One core shape for a word and a sentence (D17): the core says which it read.
const wordOf = (meanings, facets = {}, extra = {}) => ({ core: { kind: 'word', language: 'Chinesisch', key: '幸福', ...extra, meanings }, facets });
const sentenceOf = (translation, facets = {}) => ({ core: { kind: 'sentence', language: 'Chinesisch', key: '我真的很幸福', meanings: [translation] }, facets });

test('each instance produces its own component; one failure leaves the others completed', async () => {
  const outcomes = await generateComponents({
    mainKey: '幸福',
    modules: instances('chinese', 'german', 'chinese'),
    generate: async ({ module }) => { if (module.type === 'german') throw new Error('controlled'); return wordOf([`out-${module.type}`]); }
  });
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'm0', status: 'completed', content: formatContent('german', wordOf(['out-chinese'])) },
    { moduleInstanceId: 'm1', status: 'failed', error: 'controlled' },
    { moduleInstanceId: 'm2', status: 'completed', content: formatContent('german', wordOf(['out-chinese'])) }
  ]);
});

test('a facet the core’s flags rule out is dropped and reported, the rest kept (D17, K53)', async () => {
  const examples = [{ sentence: 'I run.', translation: 'Ich laufe.' }];
  const [outcome] = await generateComponents({
    mainKey: 'run', modules: [{ id: 'g', type: 'german', facets: ['article', 'examples', 'synonyms'] }],
    generate: async ({ facets }) => {
      assert.deepEqual(facets, ['article', 'examples', 'synonyms'], 'one request asks for every facet; each says when it applies');
      return wordOf(['laufen'], { article: { singular: 'der Lauf' }, examples, synonyms: ['rennen'] }, { gramRole: 'verb' });
    }
  });
  assert.deepEqual(outcome.content.facets, withKeyHighlighted(formatContent('german', wordOf(['laufen'], { examples, synonyms: ['rennen'] }, { gramRole: 'verb' })), 'run').facets,
    'Article does not apply to a verb');
  assert.equal(outcome.content.header.gramRole, 'verb');
  const reported = [];
  const content = await generateComponent({ mainKey: '我真的很幸福', module: { id: 'g', type: 'german', facets: ['synonyms'] },
    onMismatch: mismatch => reported.push(mismatch), generate: async () => sentenceOf('Ich bin wirklich glücklich.', { synonyms: ['froh'] }) });
  assert.deepEqual(content.facets, {}, 'Synonyms do not apply to a sentence');
  assert.deepEqual(reported, [{ module: 'german', facet: 'synonyms' }]);
});

test('a parent applies to a sentence as well as a word (D08)', async () => {
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', modules: [{ id: 'm0', type: 'german', facets: ['article', 'examples'] }],
    generate: async ({ facets }) => { assert.deepEqual(facets, ['article', 'examples']); return sentenceOf('Ich bin wirklich glücklich.'); }
  });
  assert.deepEqual(outcomes, [{ moduleInstanceId: 'm0', status: 'completed', content: withKeyHighlighted(formatContent('german', sentenceOf('Ich bin wirklich glücklich.')), '我真的很幸福') }]);
  assert.deepEqual(outcomes[0].content.header, { kind: 'sentence', language: 'Chinesisch', key: '我真的很幸福' }, 'a sentence’s top line has its language and key');
});

test('a parent always applies; it asks for its facets and checks the structured result (D09)', async () => {
  const requests = [];
  const parent = { id: 'p', type: 'chinese', facets: ['examples', 'pinyin'] };
  const pinyin = [{ text: '我真的很幸福。', pinyin: 'wǒ zhēn de hěn xìngfú' }];
  const outcomes = await generateComponents({
    mainKey: '我真的很幸福', modules: [parent, { id: 'q', type: 'chinese', facets: [] }],
    generate: async request => { requests.push(request.facets); return sentenceOf('我真的很幸福。', { pinyin }); }
  });
  assert.deepEqual(requests, [['examples', 'pinyin'], []]);
  assert.deepEqual(outcomes, [
    { moduleInstanceId: 'p', status: 'completed', content: withKeyHighlighted(formatContent('chinese', sentenceOf('我真的很幸福。', { pinyin })), '我真的很幸福') },
    { moduleInstanceId: 'q', status: 'completed', content: withKeyHighlighted(formatContent('chinese', sentenceOf('我真的很幸福。')), '我真的很幸福') }
  ], 'an entry for a facet the parent was not asked for is dropped');
  const german = [{ id: 'g', type: 'german', facets: ['article', 'examples'] }];
  const [emptyArticle] = await generateComponents({ mainKey: 'beautiful', modules: german,
    generate: async () => wordOf(['schön'], { article: { singular: ' ', plural: '' }, examples: [{ sentence: 'So beautiful.', translation: 'So schön.' }] }) });
  assert.deepEqual(emptyArticle, { moduleInstanceId: 'g', status: 'completed', content: withKeyHighlighted(formatContent('german', wordOf(['schön'], { examples: [{ sentence: 'So beautiful.', translation: 'So schön.' }] })), 'beautiful') },
    'an empty facet counts as an omitted facet');
  const failed = async value => (await generateComponents({ mainKey: 'x', modules: german, generate: async () => value }))[0];
  for (const value of ['   ', 'plain text', null, { core: { kind: 'word', language: 'Englisch', key: 'x', meanings: [] }, facets: {} },
    { core: { kind: 'phrase', language: 'Englisch', key: 'x', meanings: ['y'] }, facets: {} },
    wordOf(['schön'], { examples: [{ translation: 'only a translation' }] }), { ...wordOf(['schön']), extra: true }]) {
    const outcome = await failed(value);
    assert.equal(outcome.status, 'failed', `refused: ${JSON.stringify(value)}`);
  }
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
