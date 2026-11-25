import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { disagreements, judgeCard, rubricOf } from '../scripts/judge.mjs';
import { expected, missed, readCalibration } from '../scripts/calibration.mjs';
import { parentsIn } from '@vocabularium/domain/parents';
import { checkCard } from '@vocabularium/domain/checks';
import { checkTools } from '../scripts/check-tools.mjs';
import { costOf, judgeModel, meter } from '../scripts/meter.mjs';
import { OpenCodeProvider } from '../src/server/opencode.mjs';

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
  let asked = 0;
  const schemaOnce = { complete: async request => ({ ...(await scored(all('pass')).complete(request)), ...(asked++ ? {} : { [ids[1]]: { type: 'object' } }) }) };
  assert.equal((await judgeCard(schemaOnce, 'german', criteria, input)).verdict, 'pass', 'an unreadable verdict is asked for once more');
  assert.equal(asked, 2);
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

// v0.17.0: a calibration card graded per criterion shows where the judge
// fails a card for the wrong reason.
const graded = async (criteria, reasons) => {
  const ids = (await rubricOf('german')).map(criterion => criterion.id);
  return { id: 'ufer', key: 'bank', language: 'en', split: 'dev', decided: 'claude', card: { core: {} },
    criteria: { ...Object.fromEntries(ids.map(id => [id, 'pass'])), ...criteria }, reasons };
};
const judged = (verdict, scores) => ({ verdict, scores: Object.entries(scores).map(([criterion, each]) => ({ criterion, verdict: each, reason: '' })) });
const why = { why: 'Says Ufer comes from Latin ora.', source: 'DWDS, Pfeifer: Ufer' };

test('a graded card fails on its worst criterion, and a fail the judge gives elsewhere still misses it', async () => {
  const card = await graded({ etymology: 'fail', examples: 'weak' }, { etymology: [why], examples: [why] });
  assert.equal(expected(card), 'fail');
  assert.equal(expected(await graded({ examples: 'weak' }, { examples: [why] })), 'weak');
  assert.equal(expected(await graded({}, {})), 'pass');
  assert.deepEqual(missed(card, judged('fail', { facets: 'fail', etymology: 'pass' })), [{ criterion: 'etymology', facets: [] }], 'failed for its synonyms, not its etymology');
  assert.deepEqual(missed(card, judged('fail', { etymology: 'fail' })), []);
  assert.deepEqual(missed(card, { verdict: 'error', scores: [] }), [{ criterion: 'etymology', facets: [] }], 'a card the judge could not score is no agreement');
});

test('a missed facets fail names its facets', async () => {
  const card = await graded({ facets: 'fail' }, { facets: [{ ...why, facet: 'antonyms' }, { ...why, facet: 'pronunciation' }] });
  assert.deepEqual(missed(card, judged('weak', { facets: 'weak' })), [{ criterion: 'facets', facets: ['antonyms', 'pronunciation'] }]);
  assert.deepEqual(missed(card, judged('fail', { facets: 'fail' })), []);
});

test('a card graded as a whole is missed when the judge does not fail it', () => {
  const card = { id: 'messy', key: 'bank', language: 'en', split: 'dev', decided: 'owner', card: { core: {} }, verdict: 'fail', reason: 'Two senses run together.' };
  assert.equal(expected(card), 'fail');
  assert.deepEqual(missed(card, judged('weak', {})), [{ criterion: null, facets: [] }]);
  assert.deepEqual(missed(card, judged('fail', {})), []);
  assert.deepEqual(missed({ ...card, verdict: 'weak' }, judged('pass', {})), [], 'only a fail can be missed');
});

test('the calibration reader rejects a graded card that leaves out a criterion or names a facet the module lacks', async () => {
  const read = cards => readCalibration('inline.json', { note: '', module: 'german', cards });
  await read([await graded({ facets: 'fail' }, { facets: [{ ...why, facet: 'antonyms' }] })]);
  const { etymology, ...partial } = (await graded({}, {})).criteria;
  await assert.rejects(read([{ ...await graded({}, {}), criteria: partial }]), /inline\.json: card "ufer" grades no "etymology"/);
  await assert.rejects(read([await graded({ facets: 'fail' }, { facets: [{ ...why, facet: 'mood' }] })]), /facet "mood"; name one of article, /);
  await assert.rejects(read([await graded({ facets: 'fail' }, { facets: [why] })]), /naming no facet/);
  await assert.rejects(read([await graded({ etymology: 'weak' }, {})]), /grades "etymology" weak with no reasons/);
  await assert.rejects(read([{ ...await graded({}, {}), item: 'sample-02' }]), /golden item "sample-02" is test; make it "held-out"/);
});

// M7: the judge keeps the model its calibration was made with while the generator changes.
test('the judge uses JUDGE_MODEL, else the generator\'s model, else the default', () => {
  assert.equal(judgeModel({ JUDGE_MODEL: 'deepseek-v4.1-flash', OPENCODE_MODEL: 'gpt-6-luna' }), 'deepseek-v4.1-flash');
  assert.equal(judgeModel({ OPENCODE_MODEL: 'gpt-6-luna' }), 'gpt-6-luna');
  assert.equal(judgeModel({ JUDGE_MODEL: '', OPENCODE_MODEL: 'gpt-6-luna' }), 'gpt-6-luna', 'an empty setting is no setting');
  assert.equal(judgeModel({}), undefined);
  const saved = process.env.OPENCODE_MODEL;
  try {
    process.env.OPENCODE_MODEL = 'gpt-6-luna';
    assert.equal(new OpenCodeProvider({ model: judgeModel({ JUDGE_MODEL: 'deepseek-v4.1-flash', OPENCODE_MODEL: 'gpt-6-luna' }) }).model, 'deepseek-v4.1-flash');
    assert.equal(new OpenCodeProvider({ model: judgeModel({}) }).model, 'gpt-6-luna', 'unset, the provider falls back to OPENCODE_MODEL');
  } finally { if (saved === undefined) delete process.env.OPENCODE_MODEL; else process.env.OPENCODE_MODEL = saved; }
});

test('the meter adds up the service\'s list cost of every reply, failed ones included', async () => {
  const replies = [{ usage: { opencode: { list_cost: 0.0004 } }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }] }, { error: 'busy' }];
  const fetchImpl = async () => { const body = replies.shift(); return new Response(JSON.stringify(body), { status: body.error ? 503 : 200 }); };
  const provider = new OpenCodeProvider({ apiKey: 'test', model: 'gpt-6-luna', fetchImpl });
  const cost = meter(provider);
  await provider.send({ maxTokens: 10 }, [], AbortSignal.timeout(1000), 'session', {});
  await assert.rejects(provider.send({ maxTokens: 10 }, [], AbortSignal.timeout(1000), 'session', {}));
  assert.equal(cost.spent(), 0.0004);
  assert.equal(costOf('not json'), 0);
  assert.equal(costOf(undefined), 0);
});

test('the audit lists the cards a second judge scores differently, matched in order, or with no judge every card it does not pass', () => {
  const judged = [{ key: 'a', verdict: 'pass' }, { key: 'b', verdict: 'weak' }, { key: 'c', verdict: 'fail' }];
  const audited = [{ key: 'a', verdict: 'pass' }, { key: 'b', verdict: 'fail' }, { key: 'c', verdict: 'fail' }];
  assert.deepEqual(disagreements(judged, audited).map(({ judge, audit }) => [audit.key, judge?.verdict, audit.verdict]), [['b', 'weak', 'fail']]);
  assert.deepEqual(disagreements([], audited).map(({ audit }) => audit.key), ['b', 'c']);
});
