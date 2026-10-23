import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { interpretationSchema } from '@vocabularium/domain/catalog';
import { interpretationInstructions, moduleInstructions, moduleSchema } from '@vocabularium/domain/composer';
import { applicableFacets, facetsOf, PARENTS } from '@vocabularium/domain/parents';

// Prompt snapshots (D11): the composed instructions and schema for every
// content module and input type, core only, and each facet's own Retry, plus
// the interpretation prompt. They are where to read what the model receives,
// and a prompt change shows in review as a change to these files. Run with
// UPDATE_PROMPTS=1 to rewrite them after a deliberate change.
const DIR = new URL('./prompts/', import.meta.url);
const snapshot = (instructions, schema) => `# instructions\n${instructions}\n\n# schema\n${JSON.stringify(schema, null, 2)}\n`;

function cases() {
  const all = { interpretation: snapshot(interpretationInstructions(), interpretationSchema) };
  for (const parent of Object.keys(PARENTS)) for (const inputType of ['word_phrase', 'sentence']) {
    const facets = applicableFacets(parent, facetsOf(parent), inputType);
    all[`${parent}.${inputType}`] = snapshot(moduleInstructions(parent, inputType, facets), moduleSchema(parent, inputType, facets));
    all[`${parent}.${inputType}.core-only`] = snapshot(moduleInstructions(parent, inputType, []), moduleSchema(parent, inputType, []));
    for (const facet of facets) {
      all[`${parent}.${inputType}.retry-${facet}`] = snapshot(moduleInstructions(parent, inputType, [facet], true), moduleSchema(parent, inputType, [facet], true));
    }
  }
  return all;
}

test('every composed prompt matches its snapshot, and every snapshot has a prompt', () => {
  const expected = cases();
  if (process.env.UPDATE_PROMPTS) {
    for (const [name, text] of Object.entries(expected)) writeFileSync(new URL(`${name}.txt`, DIR), text);
  }
  const files = readdirSync(DIR).filter(file => file.endsWith('.txt')).map(file => file.slice(0, -4)).sort();
  assert.deepEqual(files, Object.keys(expected).sort(), 'a snapshot without a prompt, or a prompt without a snapshot');
  for (const [name, text] of Object.entries(expected)) assert.equal(text, readFileSync(new URL(`${name}.txt`, DIR), 'utf8'), name);
});

test('the shared rules are in every composed prompt and in no prompt file of the catalog', () => {
  const rules = readFileSync(new URL('../packages/domain/src/composer/rules.md', import.meta.url), 'utf8');
  const [before, after] = rules.trim().split('{{module}}').map(part => part.trim());
  for (const [name, text] of Object.entries(cases()).filter(([name]) => name !== 'interpretation')) {
    assert.ok(text.includes(before) && text.includes(after), name);
  }
  const catalog = new URL('../packages/domain/src/catalog/', import.meta.url);
  for (const file of readdirSync(catalog, { recursive: true }).filter(file => String(file).endsWith('.prompt.md'))) {
    const text = readFileSync(new URL(String(file), catalog), 'utf8');
    assert.ok(!text.includes(before) && !text.includes(after), `${file} repeats the shared rules`);
  }
});

test('the Expertise modules write in the account’s language; the Languages modules do not follow it (D14, K36)', () => {
  for (const module of ['computer-science', 'mathematics']) for (const inputType of ['word_phrase', 'sentence']) {
    const french = moduleInstructions(module, inputType, [], false, 'fr');
    assert.match(french, /Write every part in French, whatever language the selection is in\./);
    assert.match(french, /comprehensive French for a learner/);
    assert.doesNotMatch(french, /English|\{\{language\}\}/);
    assert.equal(moduleInstructions(module, inputType, [], false, 'en'), moduleInstructions(module, inputType, []), 'English stays the default');
  }
  assert.match(moduleInstructions('computer-science', 'word_phrase', [], false, 'zh-Hans'), /in Simplified Chinese/);
  for (const module of ['german', 'chinese']) {
    assert.equal(moduleInstructions(module, 'word_phrase', facetsOf(module), false, 'ar'), moduleInstructions(module, 'word_phrase', facetsOf(module)));
  }
});
