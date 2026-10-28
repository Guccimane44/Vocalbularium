import test from 'node:test';
import assert from 'node:assert/strict';
import Value from 'typebox/value';
import { DeckConfigurationSchema, FacetAddRequestSchema, PageSchema } from '@vocabularium/contracts';
import {
  applicableFacets, facetAbbreviation, facetAddBlocked, facetDeleteBlocked, facetsOf, facetTargets, facetUnavailable, isParentType, ordered, PARENTS,
  validateFacets, withFacet
} from '@vocabularium/domain/parents';
import { copyModules, validateConfiguration } from '@vocabularium/domain/page-modules';
import { textBlocks } from '@vocabularium/domain/pages';

// Parent modules with a core and facets (D08).

test('the catalog is German and Chinese in Languages, with facets in a fixed order, and Computer Science and Mathematics in Expertise (D08, D11)', () => {
  assert.deepEqual(Object.keys(PARENTS), ['german', 'chinese', 'computer-science', 'mathematics']);
  assert.deepEqual(facetsOf('german'), ['article', 'examples', 'synonyms', 'antonyms']);
  assert.deepEqual(facetsOf('chinese'), ['examples', 'pinyin']);
  for (const parent of ['german', 'chinese']) assert.equal(PARENTS[parent].family, 'translation');
  for (const parent of ['computer-science', 'mathematics']) {
    assert.equal(PARENTS[parent].family, 'expertise');
    assert.deepEqual(facetsOf(parent), [], 'a provisional core only (D11)');
  }
  assert.ok(isParentType('german') && !isParentType('german-examples') && !isParentType('text'));
});

test('each facet has its own abbreviation for its tag, unique within its parent (0.7.1, D11)', () => {
  for (const parent of Object.keys(PARENTS)) {
    const abbreviations = facetsOf(parent).map(facet => facetAbbreviation(parent, facet));
    for (const abbreviation of abbreviations) assert.match(abbreviation, /^\p{Lu}\p{Ll}?$/u, parent);
    assert.equal(new Set(abbreviations).size, abbreviations.length, `${parent} repeats an abbreviation`);
  }
  assert.deepEqual(facetsOf('german').map(facet => facetAbbreviation('german', facet)), ['Ar', 'Ex', 'Sy', 'An']);
  assert.deepEqual(facetsOf('chinese').map(facet => facetAbbreviation('chinese', facet)), ['Ex', 'Py']);
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

test('contracts carry facets on instances and components, no page interpretation (D17), and facet requests', () => {
  assert.ok(Value.Check(DeckConfigurationSchema, { name: 'My Deck', view: { module: 'default' },
    modules: [{ id: 'k', type: 'main-key' }, { id: 'g', type: 'german', facets: ['article'] }] }));
  const page = { id: 'p', deckId: 'd', selectedText: 'bank', createdAt: '2026-10-14', status: null,
    components: [{ id: 'c', moduleInstanceId: 'i', moduleType: 'main-key', content: textBlocks('bank'), status: null, attemptId: null },
      { id: 'g', moduleInstanceId: 'j', moduleType: 'german', facets: ['examples'], content: textBlocks(''), status: null, attemptId: null }] };
  assert.ok(Value.Check(PageSchema, page));
  assert.ok(!Value.Check(PageSchema, { ...page, interpretation: 'word_phrase' }), 'a page carries no reading of its main key');
  assert.ok(Value.Check(FacetAddRequestSchema, { operationId: 'op-1', payload: { pageId: 'p', componentId: 'g', parent: 'german', facet: 'article' } }));
  assert.ok(!Value.Check(FacetAddRequestSchema, { operationId: 'op-1', payload: { pageId: 'p', componentId: 'g', facet: 'article' } }), 'the parent type is required');
});

const germanWord = [
  '== Englisch (bank, bæŋk) ==', '=== Bedeutungen ===', ': [1] Ufer eines Flusses', ': [2] Geldinstitut',
  '=== Article ===', ': das Ufer · die Ufer',
  '=== Examples ===', ': [1] We sat on the bank.', ':: Wir saßen am Ufer.', ': [2] The river burst its banks.', ':: Der Fluss trat über die Ufer.',
  '=== Synonyms ===', ': Böschung', ': Uferstreifen'
].join('\n');
