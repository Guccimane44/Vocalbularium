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

test('each facet has one prompt, the core its own, a Retry prompt and a reading prompt, and nothing else is in the folders (D17, D19)', () => {
  for (const id of content) {
    const module = MODULES[id];
    const folder = new URL(`${folderOf(id)}/`, SRC);
    assert.deepEqual(promptFiles(folder), ['module.prompt.md'], id);
    assert.deepEqual(promptFiles(new URL('facets/core/', folder)), ['core.prompt.md', 'reading.prompt.md', 'retry.prompt.md'], `${id}.core`);
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

// Samples (D20, K63): every content module has a word's and a sentence's card
// in every interface language, and each German facet that never applies to a
// noun its own word's card (K65); the main key and Context their text.
const LANGUAGE_CODES = ['en', 'ar', 'es', 'fr', 'ru', 'zh-Hans'];
const samplesIn = folder => existsSync(new URL(`${folder}/samples/`, SRC)) ? readdirSync(new URL(`${folder}/samples/`, SRC)).map(file => file.replace(/\.json$/, '')).sort() : [];
const readSample = (folder, language) => JSON.parse(readFileSync(new URL(`${folder}/samples/${language}.json`, SRC), 'utf8'));
const checkCard = (id, given, inputType, name) => {
  const checked = validateGenerated(id, given);
  // A Languages core says which it read (D17); an Expertise core has no kind.
  if ('kind' in checked.core) assert.equal(checked.core.kind, inputType === 'sentence' ? 'sentence' : 'word', name);
  const stored = formatContent(id, checked);
  assert.ok(stored.core, name);
  for (const facet of Object.keys(checked.facets)) assert.ok(stored.facets[facet], `${name} ${facet}`);
};

test('every sample is written in every interface language, validates against its shapes and formats into markdown', () => {
  for (const id of MODULE_IDS) {
    const folder = folderOf(id);
    if (id === 'text') { assert.deepEqual(samplesIn(folder), [], 'Text starts empty'); continue; }
    assert.deepEqual(samplesIn(folder), [...LANGUAGE_CODES].sort(), id);
    for (const language of LANGUAGE_CODES) {
      const sample = readSample(folder, language);
      for (const inputType of INPUT_TYPES) {
        const name = `${id} ${language} ${inputType}`;
        if (MODULES[id].kind === 'input') assert.equal(typeof sample[inputType], 'string', name);
        else checkCard(id, sample[inputType], inputType, name);
      }
    }
  }
  for (const facet of ['conjugation', 'comparison', 'case']) {
    const folder = `${folderOf('german')}/facets/${facet}`;
    assert.deepEqual(samplesIn(folder), [...LANGUAGE_CODES].sort(), facet);
    for (const language of LANGUAGE_CODES) {
      const sample = readSample(folder, language);
      checkCard('german', sample.word_phrase, 'word_phrase', `german.${facet} ${language}`);
      assert.ok(sample.word_phrase.facets[facet], `german.${facet} ${language} holds the facet`);
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

// Pages (D20, K62): every family with modules, every module in the module
// window and every facet but the core has its page's text, and no explanation
// or single sample file of the earlier releases remains.
test('every family, window module and facet but the core has its page text, and the earlier files are gone', async () => {
  const { aboutBlocks, facetAbout, familyAbout, moduleAbout } = await import('@vocabularium/domain/about');
  const { WINDOW_MODULES } = await import('@vocabularium/domain/page-modules');
  const text = value => typeof value === 'string' && value.trim().length > 0;
  for (const family of CATALOG_FAMILIES) {
    const about = familyAbout(family.id);
    assert.ok(text(about?.summary) && about.steps.length === 3 && about.steps.every(step => text(step.title) && text(step.text)), family.id);
  }
  for (const id of MODULE_IDS) {
    if (!WINDOW_MODULES.includes(id)) { assert.equal(moduleAbout(id), undefined, `${id} is not in the window and has no page`); continue; }
    const about = moduleAbout(id);
    assert.ok(text(about?.summary) && about.facts.length === 3 && about.facts.every(fact => text(fact.label) && text(fact.value) && text(fact.note)), id);
    assert.ok(aboutBlocks(id).length > 0, `${id} renders as markdown`);
    if (MODULES[id].kind !== 'content') continue;
    assert.equal(facetAbout(id, 'core'), undefined, `${id}: the core is explained by its module`);
    for (const facet of MODULES[id].facets) {
      const about = facetAbout(id, facet.id);
      assert.ok(text(about?.summary) && text(about.appliesTo) && text(about.describes), `${id}.${facet.id}`);
    }
  }
  const leftovers = readdirSync(SRC, { recursive: true }).map(String).filter(path => /(?:^|[\\/])(?:explanation(?:\.[A-Za-z-]+)?\.md|sample\.json)$/.test(path));
  assert.deepEqual(leftovers, [], 'no explanation.md or sample.json remains (D20)');
});

test('a facet’s sample is its own part of a sample in the interface language, only for the inputs it applies to', async () => {
  const { facetSampleOf, sampleKeyOf, sampleOf } = await import('@vocabularium/domain/about');
  const plain = blocks => JSON.stringify(blocks);
  // Article applies to words only: German's sample word "language" is die Sprache.
  assert.match(plain(facetSampleOf('german', 'article', 'word_phrase')), /die Sprache/);
  assert.equal(facetSampleOf('german', 'article', 'sentence'), null);
  // Examples applies to both, and each sample holds that facet only.
  for (const inputType of INPUT_TYPES) {
    const blocks = facetSampleOf('german', 'examples', inputType);
    assert.ok(blocks?.length, inputType);
    assert.deepEqual(sampleOf('german', inputType).facets.find(each => each.facet === 'examples').body, blocks);
  }
  assert.ok(facetSampleOf('chinese', 'pinyin', 'sentence')?.length);
  // A facet that never applies to a noun has its own word (K65): Conjugation speak, sprechen.
  assert.match(plain(facetSampleOf('german', 'conjugation', 'word_phrase')), /spr(e|i)ch/);
  assert.equal(facetSampleOf('german', 'conjugation', 'sentence'), null);
  assert.equal(sampleKeyOf('german', 'word_phrase', 'ru', 'conjugation'), 'говорить');
  // A module's sample shows every facet its sample holds; given facets, only those that apply.
  const facets = sampleOf('german', 'word_phrase').facets.map(each => each.facet);
  assert.ok(facets.includes('article') && !facets.includes('conjugation'), facets.join());
  assert.deepEqual(sampleOf('german', 'sentence', ['article', 'examples']).facets.map(each => each.facet), ['examples']);
  assert.equal(sampleOf('context', 'word_phrase').kind, 'note');
  assert.equal(sampleOf('text', 'word_phrase'), null, 'Text starts empty');
  // What a sample was written for, in the interface language.
  assert.equal(sampleKeyOf('main-key', 'word_phrase', 'zh-Hans'), '语言');
  assert.equal(sampleKeyOf('german', 'word_phrase', 'fr'), 'langue');
  assert.equal(sampleKeyOf('german', 'sentence', 'en'), 'Languages are the bridges connecting people and the world.');
  // The Expertise samples are written in the interface language; Hello, world stays English (D21).
  assert.equal(sampleKeyOf('computer-science', 'word_phrase', 'es'), 'Hello, world');
  assert.equal(sampleKeyOf('mathematics', 'word_phrase', 'zh-Hans'), '一元二次方程');
  // A language without its own sample would fall back to English; every language has one.
  assert.notDeepEqual(sampleOf('german', 'word_phrase', undefined, 'ar'), sampleOf('german', 'word_phrase', undefined, 'en'));
});
