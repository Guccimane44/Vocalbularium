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
const FILE = { word_phrase: 'word', sentence: 'sentence' };
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
  assert.deepEqual(promptFiles(new URL('main-key/', SRC)), ['interpretation.prompt.md']);
});

test('each content module has its core first, then facets unique by ID and abbreviation', () => {
  for (const id of content) {
    const module = MODULES[id];
    assert.equal(module.source, 'generated', id);
    assert.equal(module.core.id, 'core', id);
    for (const inputType of INPUT_TYPES) assert.ok(module.core.shapes[inputType], `${id} core for ${inputType}`);
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

test('each facet has a prompt for exactly the input types it applies to, and nothing else is in the folders', () => {
  for (const id of content) {
    const module = MODULES[id];
    const folder = new URL(`${folderOf(id)}/`, SRC);
    assert.deepEqual(promptFiles(folder), ['module.prompt.md'], id);
    assert.deepEqual(promptFiles(new URL('facets/core/', folder)), ['retry.prompt.md', 'sentence.prompt.md', 'word.prompt.md'], `${id}.core`);
    for (const facet of module.facets) {
      assert.deepEqual(promptFiles(new URL(`facets/${facet.id}/`, folder)), facet.applies.map(type => `${FILE[type]}.prompt.md`).sort(), `${id}.${facet.id}`);
    }
    const folders = readdirSync(new URL('facets/', folder)).sort();
    assert.deepEqual(folders, ['core', ...module.facets.map(facet => facet.id)].sort(), `${id} has a facet folder the module does not list`);
  }
});

test('the composer builds a request for every module, input type and facet', () => {
  for (const id of content) for (const inputType of INPUT_TYPES) {
    const module = MODULES[id];
    const facets = module.facets.filter(facet => facet.applies.includes(inputType)).map(facet => facet.id);
    const interpretation = { inputType };
    const request = composeModule({ module: { id: 'i', type: id }, selectedText: 'x', interpretation, facets });
    assert.ok(request.instructions && request.schema.properties.core && request.maxTokens > 0, `${id} ${inputType}`);
    for (const facet of facets) {
      const retry = composeModule({ module: { id: 'i', type: id }, selectedText: 'x', interpretation, facets: [facet], core: { kind: 'word' } });
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
      assert.equal(checked.core.kind, inputType === 'sentence' ? 'sentence' : 'word', `${id} ${inputType}`);
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
