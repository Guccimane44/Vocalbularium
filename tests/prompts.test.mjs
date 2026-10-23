import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { interpretationSchema } from '@vocabularium/domain/catalog';
import { GUIDE_SECTIONS, interpretationInstructions, moduleInstructions, moduleSchema, writingGuide } from '@vocabularium/domain/composer';
import { INTERFACE_LANGUAGES } from '@vocabularium/contracts';
import { applicableFacets, facetsOf, PARENTS } from '@vocabularium/domain/parents';

// Prompt snapshots (D11): the composed instructions and schema for every
// content module and input type, core only, and each facet's own Retry, plus
// the interpretation prompt, and one Expertise request in each interface
// language other than English (D15). They are where to read what the model receives,
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
  for (const language of INTERFACE_LANGUAGES.filter(language => language !== 'en')) {
    all[`computer-science.word_phrase.${language}`] = snapshot(moduleInstructions('computer-science', 'word_phrase', [], false, language), moduleSchema('computer-science', 'word_phrase', []));
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
    assert.doesNotMatch(french, /\{\{/);
    assert.equal(moduleInstructions(module, inputType, [], false, 'en'), moduleInstructions(module, inputType, []), 'English stays the default');
  }
  assert.match(moduleInstructions('computer-science', 'word_phrase', [], false, 'zh-Hans'), /in Simplified Chinese/);
  for (const module of ['german', 'chinese']) {
    assert.equal(moduleInstructions(module, 'word_phrase', facetsOf(module), false, 'ar'), moduleInstructions(module, 'word_phrase', facetsOf(module)));
  }
});

test('every Expertise request carries the writing guide of its language, and no other family gets one (D15, K39)', () => {
  const body = language => GUIDE_SECTIONS.slice(0, 4).map(heading => writingGuide(language)[heading]).join(' ');
  for (const language of INTERFACE_LANGUAGES) for (const module of ['computer-science', 'mathematics']) for (const inputType of ['word_phrase', 'sentence']) {
    const text = moduleInstructions(module, inputType, [], false, language);
    assert.ok(text.endsWith(body(language)), `${module} ${inputType} ${language} ends with its guide`);
    for (const other of INTERFACE_LANGUAGES.filter(other => other !== language)) assert.ok(!text.includes(writingGuide(other).Register), `${language} carries no ${other} guide`);
  }
  for (const module of ['german', 'chinese']) for (const language of INTERFACE_LANGUAGES) {
    const text = moduleInstructions(module, 'word_phrase', facetsOf(module), false, language);
    for (const each of INTERFACE_LANGUAGES) assert.ok(!text.includes(writingGuide(each).Register), `${module} carries no guide`);
  }
});

test('an Expertise length is stated in the unit of its language, never as a word count in a prompt file (D15, K40)', () => {
  const sentence = language => moduleInstructions('computer-science', 'sentence', [], false, language);
  assert.match(sentence('en'), /in one to three paragraphs of at most 50 words each\./);
  assert.match(sentence('fr'), /in one to three paragraphs of at most 50 words each\./);
  assert.match(sentence('zh-Hans'), /in one to three paragraphs of at most about 80 Chinese characters each\./);
  for (const language of INTERFACE_LANGUAGES) assert.doesNotMatch(sentence(language), /\{\{|\{\d*\.?\d*n\}/, language);
  const catalog = new URL('../packages/domain/src/catalog/expertise/', import.meta.url);
  for (const file of readdirSync(catalog, { recursive: true }).filter(file => String(file).endsWith('.prompt.md'))) {
    assert.doesNotMatch(readFileSync(new URL(String(file), catalog), 'utf8'), /\b\d+ words\b/, `${file} names a word count`);
  }
});

test('every interface language has an Expertise writing guide with its five sections, and the reviews of the guide and its output recorded (D15, K41, K42)', () => {
  const reviews = JSON.parse(readFileSync(new URL('../extension/locales/reviews.json', import.meta.url), 'utf8'));
  const folder = new URL('../packages/domain/src/catalog/expertise/writing/', import.meta.url);
  assert.deepEqual(readdirSync(folder).filter(file => file.endsWith('.md')).map(file => file.slice(0, -3)).sort(), [...INTERFACE_LANGUAGES].sort());
  for (const language of INTERFACE_LANGUAGES) {
    const guide = writingGuide(language);
    for (const heading of GUIDE_SECTIONS) assert.ok(guide[heading], `${language}: ${heading}`);
    assert.match(guide.Length, /\{\d*\.?\d*n\}/, `${language}: the length unit names n`);
    const words = GUIDE_SECTIONS.slice(0, 4).map(heading => guide[heading]).join(' ').split(/\s+/).length;
    assert.ok(words <= 400, `${language}: the guide has ${words} words, more than K41's about 250–400`);
    const review = reviews[language]?.writingGuide;
    assert.ok(review?.reviewed && review.reviewer && review.summary, `${language}: the guide's review is recorded`);
    const output = reviews[language]?.expertise;
    assert.ok(output?.reviewed && output.reviewer && output.summary, `${language}: the review of its Expertise output is recorded (K42)`);
  }
});
