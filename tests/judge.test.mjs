import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { judgeCard, rubricOf } from '../scripts/judge.mjs';
import { parentsIn } from '@vocabularium/domain/parents';
import { checkCard } from '@vocabularium/domain/checks';
import { checkTools } from '../scripts/check-tools.mjs';

// The judge (0.16.0): a rubric beside each module's prompt, scored by the
// provider; tested here offline, with a provider that answers as told.
const scored = verdicts => ({ complete: async request => {
  assert.deepEqual(request.schema.required, Object.keys(verdicts), 'one verdict per criterion, in the rubric\'s order');
  assert.ok(request.input.facets && request.input.card, 'the judge reads what each facet is for, and the card');
  return Object.fromEntries(Object.entries(verdicts).map(([id, verdict]) => [id, { verdict, reason: verdict === 'pass' ? 'fine' : `${id} is off` }]));
} });

test('every Languages, Expertise and Creativity module has a rubric of named criteria', async () => {
  for (const module of [...parentsIn('translation'), ...parentsIn('expertise'), ...parentsIn('creativity')]) {
    const criteria = await rubricOf(module);
    assert.ok(criteria.length >= 3, module);
    assert.equal(new Set(criteria.map(criterion => criterion.id)).size, criteria.length, `${module} repeats a criterion`);
  }
});

test('a card fails on any failed criterion or content check, is weak on a weak one, and passes otherwise', async () => {
  const criteria = await rubricOf('german');
  const ids = criteria.map(criterion => criterion.id);
  const all = verdict => Object.fromEntries(ids.map(id => [id, verdict]));
  const card = { core: { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Ufer'] }, facets: { article: { singular: 'das Ufer', plural: 'die Ufer' } } };
  const input = { selection: 'bank', language: 'en', card };
  assert.equal((await judgeCard(scored(all('pass')), 'german', criteria, input)).verdict, 'pass');
  assert.equal((await judgeCard(scored({ ...all('pass'), [ids[1]]: 'weak' }), 'german', criteria, input)).verdict, 'weak');
  assert.equal((await judgeCard(scored({ ...all('weak'), [ids[0]]: 'fail' }), 'german', criteria, input)).verdict, 'fail');
  const badArticle = { ...input, card: { ...card, facets: { article: { singular: 'Ufer' } } } };
  const judged = await judgeCard(scored(all('pass')), 'german', criteria, badArticle);
  assert.deepEqual([judged.verdict, judged.checks.map(check => check.check)], ['fail', ['article-form']], 'a content check fails the card whatever the judge says');
  await assert.rejects(judgeCard({ complete: async () => ({ [ids[0]]: { verdict: 'great', reason: 'x' } }) }, 'german', criteria, input), /no verdict/);
});

test('the calibration set covers every module with a rubric, with recorded passes that pass the content checks and seeded fails', async () => {
  const directory = new URL('./golden/calibration/', import.meta.url);
  const sets = readdirSync(directory).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(new URL(file, directory), 'utf8')));
  assert.deepEqual(sets.map(set => set.module).sort(), [...parentsIn('translation'), ...parentsIn('expertise'), ...parentsIn('creativity')].sort());
  for (const set of sets) {
    const pass = set.cards.filter(card => card.expected === 'pass');
    const fail = set.cards.filter(card => card.expected === 'fail');
    assert.ok(pass.length >= 5 && fail.length >= 5, set.module);
    assert.equal(new Set(set.cards.map(card => card.id)).size, set.cards.length, `${set.module} repeats an ID`);
    for (const card of pass) assert.deepEqual((await checkCard(set.module, card.card, checkTools)).failures, [], `${set.module} ${card.id}`);
    for (const card of fail) assert.ok(/^(Seeded fault|Recorded defect): /.test(card.why), `${set.module} ${card.id} says what is wrong`);
  }
});
