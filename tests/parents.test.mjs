import test from 'node:test';
import assert from 'node:assert/strict';
import Value from 'typebox/value';
import { DeckConfigurationSchema, FacetAddRequestSchema, PageSchema } from '@vocabularium/contracts';
import {
  applicableFacets, facetAddBlocked, facetDeleteBlocked, facetsOf, facetTargets, facetUnavailable, isParentType, ordered, PARENTS,
  validateFacets, withFacet
} from '@vocabularium/domain/parents';
import { copyModules, firstMeaning, validateConfiguration } from '@vocabularium/domain/page-modules';
import { renderContent } from '@vocabularium/domain/render';
import { textBlocks } from '@vocabularium/domain/pages';

// Parent modules with a core and facets (D08).

test('the first catalog is German and Chinese in the Translation family, with facets in a fixed order', () => {
  assert.deepEqual(Object.keys(PARENTS), ['german', 'chinese']);
  assert.deepEqual(facetsOf('german'), ['article', 'examples', 'synonyms', 'antonyms']);
  assert.deepEqual(facetsOf('chinese'), ['examples', 'pinyin']);
  for (const parent of Object.values(PARENTS)) assert.equal(parent.family, 'translation');
  assert.ok(isParentType('german') && !isParentType('german-examples') && !isParentType('text'));
});

test('a word gets every facet; a sentence only Examples and Pinyin', () => {
  assert.deepEqual(applicableFacets('german', facetsOf('german'), 'word_phrase'), ['article', 'examples', 'synonyms', 'antonyms']);
  assert.deepEqual(applicableFacets('german', facetsOf('german'), 'sentence'), ['examples']);
  assert.deepEqual(applicableFacets('chinese', ['pinyin', 'examples'], 'sentence'), ['examples', 'pinyin'], 'in the parent’s order');
  assert.deepEqual(applicableFacets('german', [], 'sentence'), [], 'the core alone');
});

test('facets follow their parent’s order, once each, and belong only to their parent', () => {
  assert.deepEqual(ordered('german', ['antonyms', 'article', 'pinyin', 'article']), ['article', 'antonyms']);
  assert.deepEqual(withFacet('german', ['article', 'antonyms'], 'examples'), ['article', 'examples', 'antonyms']);
  validateFacets('german', ['article', 'synonyms']);
  validateFacets('chinese', []);
  validateFacets('text', []);
  assert.throws(() => validateFacets('german', ['pinyin']), /German has no facet/);
  assert.throws(() => validateFacets('german', ['examples', 'article']), /order of German/);
  assert.throws(() => validateFacets('german', ['article', 'article']), /only once/);
  assert.throws(() => validateFacets('context', ['examples']), /Only a parent module has facets/);
});

test('a facet lands only on a parent of its own type that lacks it and is not generating', () => {
  const german = { id: 'g', type: 'german', facets: ['article'], status: 'completed' };
  assert.equal(facetAddBlocked(german, 'german', 'examples'), null);
  assert.match(facetAddBlocked(german, 'chinese', 'pinyin'), /Pinyin can only be added to a Chinese module/);
  assert.match(facetAddBlocked({ id: 't', type: 'text' }, 'german', 'examples'), /only be added to a German module/);
  assert.match(facetAddBlocked(german, 'german', 'article'), /already has Article/);
  assert.match(facetAddBlocked({ ...german, status: 'loading' }, 'german', 'examples'), /still generating/);
  assert.match(facetAddBlocked(undefined, 'german', 'examples'), /no longer exists/);
  assert.match(facetAddBlocked(german, 'german', 'pinyin'), /does not exist/);
});

test('deleting a facet needs it to be there and the parent to be idle', () => {
  const german = { id: 'g', type: 'german', facets: ['article', 'examples'], status: 'completed' };
  assert.equal(facetDeleteBlocked(german, 'examples'), null);
  assert.match(facetDeleteBlocked(german, 'synonyms'), /no longer there/);
  assert.match(facetDeleteBlocked({ ...german, status: 'loading' }, 'examples'), /still generating/);
  assert.match(facetDeleteBlocked(undefined, 'examples'), /no longer exists/);
});

test('a facet’s + offers the parents that would take it, or says why there are none', () => {
  const modules = [
    { id: 'k', type: 'main-key' }, { id: 'g1', type: 'german', facets: ['examples'] },
    { id: 'c', type: 'chinese', facets: [] }, { id: 'g2', type: 'german', facets: [] }
  ];
  assert.deepEqual(facetTargets(modules, 'german', 'article').map(holder => holder.id), ['g1', 'g2']);
  assert.deepEqual(facetTargets(modules, 'german', 'examples').map(holder => holder.id), ['g2']);
  assert.deepEqual(facetTargets(modules, 'chinese', 'examples').map(holder => holder.id), ['c']);
  assert.equal(facetUnavailable(modules, 'german', 'article'), null);
  assert.equal(facetUnavailable([{ id: 'k', type: 'main-key' }], 'chinese', 'pinyin'), 'Add a Chinese module first.');
  assert.equal(facetUnavailable([{ id: 'c', type: 'chinese', facets: ['pinyin'] }], 'chinese', 'pinyin'), 'The Chinese module already has Pinyin.');
  assert.equal(facetUnavailable([{ id: 'a', type: 'german', facets: ['article'] }, { id: 'b', type: 'german', facets: ['article'] }], 'german', 'article'),
    'Every German module already has Article.');
  assert.equal(facetUnavailable([{ id: 'a', type: 'german', facets: [], status: 'loading' }], 'german', 'article'), 'The German modules are still generating.');
});

test('a configuration refuses facets outside a parent, and a new page copies them', () => {
  const modules = [{ id: 'k', type: 'main-key' }, { id: 'c', type: 'context' }, { id: 'g', type: 'german', facets: ['article', 'examples', 'synonyms', 'antonyms'] }];
  // Parents join the module catalog with storage (increment 2); until then a configuration only refuses stray facets.
  assert.throws(() => validateConfiguration([{ id: 'k', type: 'main-key' }, { id: 'c', type: 'context', facets: ['examples'] }]), /Only a parent module has facets/);
  let next = 0;
  const copied = copyModules(modules, () => `p${next++}`);
  assert.deepEqual(copied[2], { id: 'p2', type: 'german', facets: ['article', 'examples', 'synonyms', 'antonyms'] });
  assert.notEqual(copied[2].facets, modules[2].facets, 'the page gets its own list');
  assert.deepEqual(copied[0], { id: 'p0', type: 'main-key' }, 'modules without facets stay as they were');
});

test('contracts carry facets on instances and components, a page’s interpretation, and facet requests', () => {
  assert.ok(Value.Check(DeckConfigurationSchema, { name: 'My Deck', view: { module: 'default' },
    modules: [{ id: 'k', type: 'main-key' }, { id: 'g', type: 'german', facets: ['article'] }] }));
  const page = { id: 'p', deckId: 'd', selectedText: 'bank', createdAt: '2026-10-14', status: null, interpretation: 'word_phrase',
    components: [{ id: 'c', moduleInstanceId: 'i', moduleType: 'main-key', content: textBlocks('bank'), status: null, attemptId: null },
      { id: 'g', moduleInstanceId: 'j', moduleType: 'german', facets: ['examples'], content: textBlocks(''), status: null, attemptId: null }] };
  assert.ok(Value.Check(PageSchema, page));
  assert.ok(Value.Check(PageSchema, { ...page, interpretation: null }));
  assert.ok(!Value.Check(PageSchema, { ...page, interpretation: 'passage' }));
  assert.ok(Value.Check(FacetAddRequestSchema, { operationId: 'op-1', payload: { pageId: 'p', componentId: 'g', facet: 'article' } }));
});

const germanWord = [
  '== Englisch (bank, bæŋk) ==', '=== Bedeutungen ===', ': [1] Ufer eines Flusses', ': [2] Geldinstitut',
  '=== Article ===', ': das Ufer · die Ufer',
  '=== Examples ===', ': [1] We sat on the bank.', ':: Wir saßen am Ufer.', ': [2] The river burst its banks.', ':: Der Fluss trat über die Ufer.',
  '=== Synonyms ===', ': Böschung', ': Uferstreifen'
].join('\n');

test('a German word renders its explanation, then its facets in the parent’s order', () => {
  const rendered = renderContent('german', germanWord);
  assert.equal(rendered.kind, 'parent');
  assert.deepEqual(rendered.core, { kind: 'word', heading: { language: 'Englisch', key: 'bank', pronunciation: 'bæŋk' },
    meanings: [{ number: '1', text: 'Ufer eines Flusses' }, { number: '2', text: 'Geldinstitut' }] });
  assert.deepEqual(rendered.facets.map(facet => facet.facet), ['article', 'examples', 'synonyms']);
  assert.deepEqual(rendered.facets[0], { facet: 'article', label: 'Article', lines: ['das Ufer · die Ufer'] });
  assert.deepEqual(rendered.facets[1].examples[1], { number: '2', sentence: 'The river burst its banks.', translation: 'Der Fluss trat über die Ufer.' });
  assert.deepEqual(rendered.facets[2].lines, ['Böschung', 'Uferstreifen']);
  const shuffled = germanWord.replace(/=== Article ===\n: das Ufer · die Ufer\n/, '') + '\n=== Article ===\n: das Ufer';
  assert.deepEqual(renderContent('german', shuffled).facets.map(facet => facet.facet), ['article', 'examples', 'synonyms'], 'returned in order');
  assert.equal(firstMeaning(germanWord), 'Ufer eines Flusses', 'the meaning line skips facets');
});

test('a sentence renders its translation, and a same-language example stands alone', () => {
  const rendered = renderContent('german', 'Ich bin wirklich glücklich.\n=== Examples ===\n: [1] 想到家人，我觉得很幸福。\n:: Wenn ich an meine Familie denke, bin ich glücklich.');
  assert.deepEqual(rendered.core, { kind: 'sentence', text: 'Ich bin wirklich glücklich.' });
  assert.equal(rendered.facets[0].examples.length, 1);
  assert.deepEqual(renderContent('german', 'Das Ufer ist steil.\n=== Examples ===\n: [1] Am Ufer stehen Bäume.').facets[0].examples[0].translation, null);
  assert.deepEqual(renderContent('german', 'Nur eine Übersetzung.'), { kind: 'parent', core: { kind: 'sentence', text: 'Nur eine Übersetzung.' }, facets: [] });
});

test('a Chinese word uses its own meanings heading, and Pinyin follows the translation', () => {
  const text = '== 英语 (bank) ==\n=== 释义 ===\n: [1] 河岸\n: [2] 银行\n=== Pinyin ===\n: hé àn';
  const rendered = renderContent('chinese', text);
  assert.equal(rendered.core.kind, 'word');
  assert.deepEqual(rendered.core.meanings.map(meaning => meaning.text), ['河岸', '银行']);
  assert.deepEqual(rendered.facets, [{ facet: 'pinyin', label: 'Pinyin', lines: ['hé àn'] }]);
  assert.equal(firstMeaning(text), '河岸');
  assert.equal(renderContent('german', text).kind, 'plain', 'German does not read 释义 or Pinyin');
});

test('anything outside a parent’s contract falls back to the plain text, unchanged', () => {
  const cases = [
    [`${germanWord}\n=== Pinyin ===\n: bank`, 'a facet of another parent'],
    [`${germanWord}\n=== Article ===\n: das Ufer`, 'a facet twice'],
    [`${germanWord}\nA stray line`, 'an unknown line'],
    ['== Englisch (bank) ==\n=== Bedeutungen ===', 'a word without meanings'],
    ['Ein Satz.\n=== Examples ===', 'an empty facet'],
    ['=== Examples ===\n: [1] Satz', 'no core'],
    ['Ein Satz.\n=== Synonyms ===\n: [1] numbered', 'numbered lines in a list facet']
  ];
  for (const [text, why] of cases) assert.deepEqual(renderContent('german', text), { kind: 'plain', text }, why);
});
