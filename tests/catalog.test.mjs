import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { CATALOG_FAMILIES, folderOf, MODULE_IDS, MODULES } from '@vocabularium/domain/catalog';
import { composeModule } from '@vocabularium/domain/composer';
import { formatContent } from '@vocabularium/domain/content';
import { validateGenerated } from '@vocabularium/domain/generated';

// Catalog conformance (D11): every module, facet and input type is complete,
// so a module or facet added to the catalog cannot miss its prompt, shape,
// formatter or sample.
const SRC = new URL('../packages/domain/src/catalog/', import.meta.url);
const INPUT_TYPES = ['word_phrase', 'sentence'];
const promptFiles = dir => existsSync(dir) ? readdirSync(dir).filter(file => file.endsWith('.prompt.md')).sort() : [];
const content = MODULE_IDS.filter(id => MODULES[id].kind === 'content');

test('families and modules each have their folder, and module IDs are unique', () => {
  assert.equal(new Set(MODULE_IDS).size, MODULE_IDS.length);
  for (const family of CATALOG_FAMILIES) {
    assert.ok(family.label && existsSync(new URL(`${family.folder}/family.ts`, SRC)), family.id);
  }
  for (const id of MODULE_IDS) {
    const module = MODULES[id];
    assert.equal(module.id, id);
    assert.ok(module.label && module.description, id);
    assert.ok(existsSync(new URL(`${folderOf(id)}/module.ts`, SRC)), `${id} has no folder`);
  }
});

test('input modules are never generated and have no facets or facet prompts', () => {
  for (const id of MODULE_IDS.filter(each => MODULES[each].kind === 'input')) {
    const module = MODULES[id];
    assert.notEqual(module.source, 'generated', id);
    assert.deepEqual([...module.facets], [], id);
    assert.ok(!existsSync(new URL(`${folderOf(id)}/facets/`, SRC)), `${id} has facet folders`);
  }
  // Since D17 no request reads the main key for the run.
  assert.deepEqual(promptFiles(new URL('main-key/', SRC)), []);
});

test('each content module has its core first, then facets unique by ID and abbreviation', () => {
  for (const id of content) {
    const module = MODULES[id];
    assert.equal(module.source, 'generated', id);
    assert.equal(module.core.id, 'core', id);
    assert.ok(module.core.shape, `${id} has one core shape (D17)`);
    const ids = module.facets.map(facet => facet.id);
    assert.ok(!ids.includes('core'), id);
    assert.equal(new Set(ids).size, ids.length, `${id} repeats a facet ID`);
    const abbreviations = module.facets.map(facet => facet.abbreviation);
    assert.equal(new Set(abbreviations).size, abbreviations.length, `${id} repeats an abbreviation`);
    for (const facet of module.facets) {
      assert.ok(facet.label && facet.abbreviation && facet.description && facet.applies.length, `${id}.${facet.id}`);
      assert.equal(facet.output, 'text');
    }
  }
});

test('each facet has one prompt, the core its own and a Retry prompt, and nothing else is in the folders (D17)', () => {
  for (const id of content) {
    const module = MODULES[id];
    const folder = new URL(`${folderOf(id)}/`, SRC);
    assert.deepEqual(promptFiles(folder), ['module.prompt.md'], id);
    assert.deepEqual(promptFiles(new URL('facets/core/', folder)), ['core.prompt.md', 'retry.prompt.md'], `${id}.core`);
    for (const facet of module.facets) {
      assert.deepEqual(promptFiles(new URL(`facets/${facet.id}/`, folder)), [], `${id}.${facet.id} has no prompt per input type`);
      assert.ok(existsSync(new URL(`facets/${facet.id}/prompt.md`, folder)), `${id}.${facet.id} has its prompt`);
    }
    const folders = readdirSync(new URL('facets/', folder)).sort();
    assert.deepEqual(folders, ['core', ...module.facets.map(facet => facet.id)].sort(), `${id} has a facet folder the module does not list`);
  }
});

test('the composer builds one request for every module with all its facets, and a Retry per facet (D17)', () => {
  for (const id of content) {
    const facets = MODULES[id].facets.map(facet => facet.id);
    const request = composeModule({ module: { id: 'i', type: id }, selectedText: 'x', facets });
    assert.ok(request.instructions && request.schema.properties.core && request.maxTokens > 0, id);
    assert.ok(!('inputType' in request.input), `${id} sends no input type`);
    // The core's flags come first (D17).
    assert.ok(['kind', 'relevance'].includes(Object.keys(request.schema.properties.core.properties)[0]), `${id} core starts with its flag`);
    for (const facet of facets) {
      const retry = composeModule({ module: { id: 'i', type: id }, selectedText: 'x', facets: [facet], core: { kind: 'word' } });
      assert.deepEqual(Object.keys(retry.schema.properties), ['facets'], `${id}.${facet} retry`);
    }
  }
});

test('each module sample validates against its shapes and formats into markdown', () => {
  for (const id of MODULE_IDS) {
    const sample = MODULES[id].sample;
    if (MODULES[id].kind === 'input') {
      if (sample) for (const inputType of INPUT_TYPES) assert.equal(typeof sample[inputType], 'string', `${id} ${inputType}`);
      continue;
    }
    for (const inputType of INPUT_TYPES) {
      const checked = validateGenerated(id, sample[inputType]);
      // A Languages core says which it read (D17); an Expertise core has no kind.
      if ('kind' in checked.core) assert.equal(checked.core.kind, inputType === 'sentence' ? 'sentence' : 'word', `${id} ${inputType}`);
      const stored = formatContent(id, checked);
      assert.ok(stored.core, `${id} ${inputType}`);
      for (const facet of Object.keys(checked.facets)) assert.ok(stored.facets[facet], `${id}.${facet} ${inputType}`);
    }
  }
});

test('every content module has a golden set (C8)', () => {
  const sets = readdirSync(new URL('./golden/', import.meta.url)).filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(new URL(`./golden/${file}`, import.meta.url), 'utf8')));
  const covered = sets.flatMap(set => set.modules);
  for (const set of sets) assert.ok(set.inputs.length > 0 && set.modules.every(id => MODULE_IDS.includes(id)), set.note);
  assert.deepEqual([...new Set(covered)].sort(), [...content].sort());
});

// Explanations (D13, 0.8.1): every module in the module window and every facet
// but the core explains itself, and the extension sees exactly the files.
test('every module in the window and every facet but the core has an explanation that renders as markdown', async () => {
  const { explanationBlocks, explanationOf } = await import('@vocabularium/domain/explanations');
  const { WINDOW_MODULES } = await import('@vocabularium/domain/page-modules');
  const explained = [];
  for (const id of MODULE_IDS) {
    const file = new URL(`${folderOf(id)}/explanation.md`, SRC);
    if (WINDOW_MODULES.includes(id)) {
      assert.ok(existsSync(file), `${id} has no explanation.md`);
      explained.push([id, undefined, file]);
    } else assert.equal(existsSync(file), false, `${id} is not in the window and needs no explanation`);
    if (MODULES[id].kind !== 'content') continue;
    assert.equal(existsSync(new URL(`${folderOf(id)}/facets/core/explanation.md`, SRC)), false, `${id}: the core is explained by its module`);
    for (const facet of MODULES[id].facets) {
      const facetFile = new URL(`${folderOf(id)}/facets/${facet.id}/explanation.md`, SRC);
      assert.ok(existsSync(facetFile), `${id}.${facet.id} has no explanation.md`);
      explained.push([id, facet.id, facetFile]);
    }
  }
  for (const [id, facet, file] of explained) {
    const name = facet ? `${id}.${facet}` : id;
    assert.equal(explanationOf(id, facet), readFileSync(file, 'utf8'), `${name}: the built explanation matches its file`);
    const blocks = explanationBlocks(id, facet);
    assert.ok(blocks.length > 0 && blocks.every(block => block.type === 'paragraph' || block.items.length > 0), `${name} renders as markdown`);
    assert.doesNotMatch(explanationOf(id, facet), /<[a-z]/i, `${name} holds no HTML`);
  }
});

test('a facet’s sample is its own part of its module’s sample, only for the inputs it applies to', async () => {
  const { facetSampleOf, sampleKeyOf, sampleOf } = await import('@vocabularium/domain/explanations');
  // Article applies to words only: a sample for a word, none for a sentence.
  assert.deepEqual(facetSampleOf('german', 'article', 'word_phrase'), [{ type: 'paragraph', children: [{ type: 'text', text: 'das Glück' }] }]);
  assert.equal(facetSampleOf('german', 'article', 'sentence'), null);
  // Examples applies to both, and each sample holds that facet only.
  for (const inputType of INPUT_TYPES) {
    const blocks = facetSampleOf('german', 'examples', inputType);
    assert.ok(blocks?.length, inputType);
    const whole = sampleOf('german', inputType);
    assert.deepEqual(whole.facets.find(each => each.facet === 'examples').body, blocks);
  }
  assert.ok(facetSampleOf('chinese', 'pinyin', 'sentence')?.length);
  // A module's sample shows every facet its sample holds; given facets, only those that apply.
  assert.deepEqual(sampleOf('german', 'word_phrase').facets.map(each => each.facet), ['article', 'examples', 'synonyms', 'antonyms', 'declension']);
  assert.deepEqual(sampleOf('german', 'sentence', ['article', 'examples']).facets.map(each => each.facet), ['examples']);
  assert.equal(sampleOf('context', 'word_phrase').kind, 'note');
  assert.equal(sampleOf('text', 'word_phrase'), null, 'Text starts empty');
  // What a sample was written for: the main key's sample, or an Expertise module's own word.
  assert.equal(sampleKeyOf('german', 'sentence'), MODULES['main-key'].sample.sentence);
  assert.equal(sampleKeyOf('computer-science', 'word_phrase'), 'Frontend');
  assert.equal(sampleKeyOf('computer-science', 'sentence'), undefined);
});
