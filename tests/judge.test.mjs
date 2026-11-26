import test from 'node:test';
import assert from 'node:assert/strict';
import { disagreements, inTurn, judgeCard, rubricNotes, rubricOf } from '../scripts/judge.mjs';
import { calibrations, expected, missed, readCalibration } from '../scripts/calibration.mjs';
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

test('every calibration file reads, and each module\'s set has passing cards that pass the content checks and cards that fail', async () => {
  const sets = await calibrations();
  assert.deepEqual(sets.map(set => set.module).sort(), [...parentsIn('translation'), ...parentsIn('expertise'), ...parentsIn('creativity')].sort());
  for (const set of sets) {
    const pass = set.cards.filter(card => expected(card) === 'pass');
    assert.ok(pass.length >= 5 && set.cards.filter(card => expected(card) === 'fail').length >= 5, `${set.module} has at least 5 pass and 5 fail cards`);
    for (const card of pass) assert.deepEqual((await checkCard(set.module, card.card, checkTools)).failures, [], `${set.module} ${card.id}`);
  }
});

// v0.17.0 step 2: enough fails on each criterion and open facet that each part
// alone, the held-out part above all, can show a judge is blind to one.
const MINIMUM_FAILS = {
  etymology: { dev: 6, 'held-out': 4 },
  ...Object.fromEntries(['sense', 'german', 'examples', 'simple-translation', 'grammar-teacher', 'facets/synonyms', 'facets/antonyms', 'facets/pronunciation']
    .map(key => [key, { dev: 3, 'held-out': 2 }]))
};

test('German\'s calibration set has the minimum fails per criterion and open facet in each part', async () => {
  const set = (await calibrations()).find(each => each.module === 'german');
  assert.ok(set);
  const fails = new Map();
  for (const card of set.cards) {
    if (!('criteria' in card)) continue;
    for (const [criterion, verdict] of Object.entries(card.criteria)) {
      if (verdict !== 'fail') continue;
      const keys = criterion === 'facets' ? new Set(card.reasons.facets.map(reason => `facets/${reason.facet}`)) : [criterion];
      for (const key of keys) fails.set(`${key} ${card.split}`, (fails.get(`${key} ${card.split}`) ?? 0) + 1);
    }
  }
  const short = Object.entries(MINIMUM_FAILS).flatMap(([key, parts]) => Object.entries(parts)
    .filter(([part, minimum]) => (fails.get(`${key} ${part}`) ?? 0) < minimum)
    .map(([part, minimum]) => `${key} has ${fails.get(`${key} ${part}`) ?? 0} fails in the ${part} part, not ${minimum}; add real faults, or planted ones where none exist`));
  assert.deepEqual(short, []);
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

// The Claude Code adapter (v0.17.0 step 3), against a fake `claude` that
// records what it was given and answers as told.
async function fakeClaude(answer) {
  const { mkdtemp, writeFile, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = await mkdtemp(join(tmpdir(), 'claude-code-'));
  const command = join(folder, 'claude');
  await writeFile(command, `#!${process.execPath}
const fs = require('node:fs');
const stdin = fs.readFileSync(0, 'utf8');
fs.writeFileSync(${JSON.stringify(join(folder, 'seen.json'))}, JSON.stringify({ args: process.argv.slice(2), env: Object.keys(process.env), cwd: process.cwd(), stdin }));
process.stdout.write(${JSON.stringify(JSON.stringify(answer))});
`);
  await chmod(command, 0o755);
  const seen = async () => JSON.parse(await (await import('node:fs/promises')).readFile(join(folder, 'seen.json'), 'utf8'));
  return { command, folder: join(folder, 'empty'), seen };
}

test('the Claude Code judge runs claude with no settings, skills or tools, from an empty folder, with only the token', async () => {
  const { ClaudeCodeProvider } = await import('../scripts/claude-code.mjs');
  const criteria = await rubricOf('german');
  const verdicts = Object.fromEntries(criteria.map(criterion => [criterion.id, { verdict: 'pass', reason: 'fine' }]));
  const fake = await fakeClaude({ is_error: false, result: '```json\n' + JSON.stringify(verdicts) + '\n```', total_cost_usd: 0.02 });
  const provider = new ClaudeCodeProvider({ model: 'claude-opus-5-5', token: 'test-only', command: fake.command, folder: fake.folder });
  const cost = meter(provider);
  const judged = await judgeCard(provider, 'german', criteria, { selection: 'Ufer', language: 'en', card: { core: { kind: 'word', key: 'Ufer', meanings: ['Rand eines Gewässers'] }, facets: {} } });
  assert.equal(judged.verdict, 'pass', 'a reply in a code fence still reads');
  const seen = await fake.seen();
  for (const flag of ['--setting-sources', '--disable-slash-commands', '--tools', '--no-session-persistence', '--system-prompt']) assert.ok(seen.args.includes(flag), flag);
  assert.equal(seen.args[seen.args.indexOf('--model') + 1], 'claude-opus-5-5');
  assert.equal(seen.args[seen.args.indexOf('--setting-sources') + 1], '', 'no user, project or local settings, so the owner\'s CLAUDE.md stays out');
  assert.match(seen.args[seen.args.indexOf('--system-prompt') + 1], /JSON schema/);
  assert.equal(JSON.parse(seen.stdin).selection, 'Ufer', 'the card goes in on standard input');
  assert.deepEqual(seen.env.filter(name => !['HOME', 'PATH', 'CLAUDE_CODE_OAUTH_TOKEN'].includes(name) && !name.startsWith('__CF')), []);
  assert.equal(seen.cwd, await (await import('node:fs/promises')).realpath(fake.folder), 'claude runs from the empty folder');
  assert.equal(cost.spent(), 0.02, 'the list cost Claude Code reports is metered');
});

test('the Claude Code judge names Claude Code\'s own error, and asks for the token when there is none', async () => {
  const { ClaudeCodeProvider } = await import('../scripts/claude-code.mjs');
  const fake = await fakeClaude({ is_error: true, result: 'API Error: 400 Claude Code 2.1.236 does not support this model; version 2.1.280 or newer is required.' });
  const input = { selection: 'Ufer', language: 'en', card: { core: { kind: 'word', key: 'Ufer', meanings: ['Rand'] } } };
  await assert.rejects(new ClaudeCodeProvider({ model: 'claude-opus-5-5', token: 'test-only', command: fake.command, folder: fake.folder }).complete({ name: 'x', instructions: 'x', schema: { properties: {}, required: [] }, input }),
    /2\.1\.280 or newer/);
  await assert.rejects(new ClaudeCodeProvider({ model: 'claude-opus-5-5', token: '', command: fake.command, folder: fake.folder }).complete({ name: 'x', instructions: 'x', schema: { properties: {}, required: [] }, input }),
    /CLAUDE_CODE_OAUTH_TOKEN/);
});

test('German\'s judge reads the rubric\'s section on messy captures, and its criteria stay the rubric\'s lines', async () => {
  const criteria = await rubricOf('german');
  assert.ok(!criteria.some(criterion => /messy/i.test(criterion.id)), 'the section adds no criterion, so graded cards keep their seven');
  assert.match(await rubricNotes('german'), /^## Messy captures/);
  let instructions = '';
  const provider = { complete: async request => { instructions = request.instructions; return Object.fromEntries(criteria.map(criterion => [criterion.id, { verdict: 'pass', reason: 'fine' }])); } };
  await judgeCard(provider, 'german', criteria, { selection: 'vllt', language: 'en', card: { core: { kind: 'word', key: 'vllt', meanings: ['vielleicht'] } } });
  assert.match(instructions, /A typo is named/);
  assert.equal(await rubricNotes('english'), '', 'a rubric with no section adds nothing');
});

test('cards are judged a few at a time, and their results keep the cards\' order', async () => {
  let running = 0, most = 0;
  const task = (value, ms) => async () => { running++; most = Math.max(most, running); await new Promise(resolve => setTimeout(resolve, ms)); running--; return value; };
  assert.deepEqual(await inTurn([task('a', 30), task('b', 5), task('c', 10), task('d', 1), task('e', 1)], 2), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(most, 2);
});

test('the report counts a fail as missed when most runs miss it, and as unsteady when fewer do', async () => {
  const { tally, share } = await import('../scripts/judge-report.mjs');
  const graded = { id: 'g', key: 'Ufer', language: 'en', split: 'held-out', generator: 'claude-haiku-5-5', decided: 'claude', card: { core: {} },
    criteria: { sense: 'pass', facets: 'fail', etymology: 'fail', 'simple-translation': 'weak' },
    reasons: { facets: [{ facet: 'antonyms', why: 'x', source: 'y' }], etymology: [{ why: 'x', source: 'y' }], 'simple-translation': [{ why: 'x', source: 'y' }] } };
  const messy = { id: 'messy-m-x-haiku', key: 'x', language: 'en', split: 'held-out', generator: 'claude-haiku-5-5', decided: 'claude', card: { core: {} }, verdict: 'fail', reason: 'x' };
  const scores = weak => [{ criterion: 'sense', verdict: 'pass' }, { criterion: 'simple-translation', verdict: weak }];
  const runs = [
    [{ id: 'g', verdict: 'fail', scores: scores('weak'), missed: [{ criterion: 'etymology', facets: [] }] }, { id: 'messy-m-x-haiku', verdict: 'weak', missed: [{ criterion: null, facets: [] }] }],
    [{ id: 'g', verdict: 'fail', scores: scores('weak'), missed: [{ criterion: 'etymology', facets: [] }] }, { id: 'messy-m-x-haiku', verdict: 'fail', missed: [] }],
    [{ id: 'g', verdict: 'fail', scores: scores('pass'), missed: [{ criterion: 'facets', facets: ['antonyms'] }] }, { id: 'messy-m-x-haiku', verdict: 'fail', missed: [] }]];
  const { fails, labels, verdicts } = tally([graded, messy], runs);
  const row = part => fails.find(each => each.part === part);
  assert.deepEqual([row('etymology').missed, row('etymology').unsteady], [1, 0], 'missed in 2 of 3 runs');
  assert.deepEqual([row('facets: antonyms').missed, row('facets: antonyms').unsteady], [0, 1], 'missed in 1 of 3 runs');
  assert.deepEqual([row('messy, haiku').missed, row('messy, haiku').unsteady], [0, 1]);
  assert.equal(labels.find(each => each.part === 'simple-translation').agree, 1, 'weak in 2 of 3 runs agrees with weak');
  assert.ok(verdicts.every(each => each.agrees));
  assert.equal(share(2, 3), '2 of 3', 'no percentage on a small count');
  assert.equal(share(3, 12), '3 of 12 (25%)');
});

test('the closed-facet check scores German\'s calibration cards with the step 1 scorer, beside their labels', async () => {
  const { closedFacets } = await import('../scripts/judge-report.mjs');
  const cards = (await readCalibration('tests/golden/calibration/german.json')).cards;
  const rows = closedFacets(cards, []);
  assert.ok(rows.length > 20, 'many calibration cards have a closed facet the scorer can score');
  assert.ok(rows.every(row => ['article', 'declension', 'conjugation', 'comparison', 'case'].includes(row.facet)));
  assert.ok(rows.every(row => ['pass', 'weak', 'fail'].includes(row.scorer) && row.judgeFails === null));
  const agree = rows.filter(row => row.scorer === row.label).length;
  assert.ok(agree / rows.length > 0.7, `the scorer agrees with the labels on ${agree} of ${rows.length}`);
});

test('the report matches a card to its own module\'s results, since card IDs repeat across modules', async () => {
  const { tally } = await import('../scripts/judge-report.mjs');
  const card = module => ({ id: 'recorded-1', module, key: 'x', language: 'en', split: 'dev', decided: 'owner', card: { core: {} }, verdict: 'fail', reason: 'x' });
  const { verdicts } = tally([card('german'), card('english')], [[{ id: 'recorded-1', module: 'german', verdict: 'fail', missed: [] }]]);
  assert.deepEqual(verdicts.map(each => each.id), ['recorded-1'], 'the English card with the same ID was not judged');
});

test('a card judged with a reference gets the reference and a note on it; one without gets neither', async () => {
  const { grammarWord } = await import('../scripts/judge.mjs');
  assert.equal(grammarWord({ key: 'Ufer', card: { core: { kind: 'word', language: 'Deutsch' } } }), 'Ufer');
  assert.equal(grammarWord({ key: 'bank', card: { core: { kind: 'word', language: 'Englisch', contextual: 'das Ufer eines Flusses', meanings: ['Geldinstitut'] } } }), 'Ufer');
  assert.equal(grammarWord({ key: 'We sat.', card: { core: { kind: 'sentence', language: 'Englisch', meanings: ['Wir saßen.'] } } }), null);
  assert.equal(grammarWord({ key: '经济', card: { core: { kind: 'word', language: 'Chinesisch', meanings: ['Gesamtheit der Produktion'] }, facets: { article: { singular: 'die Wirtschaft' } } } }), 'Wirtschaft', 'the word the grammar facets describe, not the definition\'s first word');
  assert.equal(grammarWord({ key: '把', card: { core: { kind: 'word', language: 'Chinesisch', meanings: ['anfassen, mit der Hand halten'] }, facets: { conjugation: { rows: [{ label: 'ich', cells: ['halte', 'hielt'] }] } } } }), 'halten');
  const criteria = await rubricOf('german');
  const seen = [];
  const provider = { complete: async request => { seen.push(request); return Object.fromEntries(criteria.map(criterion => [criterion.id, { verdict: 'pass', reason: 'fine' }])); } };
  const card = { core: { kind: 'word', language: 'Deutsch', key: 'Ufer', meanings: ['Rand'] } };
  await judgeCard(provider, 'german', criteria, { selection: 'Ufer', language: 'en', card });
  await judgeCard(provider, 'german', criteria, { selection: 'Ufer', language: 'en', card, reference: { word: 'Ufer', etymology: 'mhd. uover', source: 'de.wiktionary.org' } });
  assert.doesNotMatch(seen[0].instructions, /"reference"/);
  assert.match(seen[1].instructions, /"reference" is a dictionary's etymology/);
  assert.equal(seen[1].input.reference.etymology, 'mhd. uover');
});

test('Wiktionary\'s Herkunft is read from the German entries only, as plain text', async () => {
  const { herkunft } = await import('../scripts/wiktionary.mjs');
  const page = `== Haus ({{Sprache|Deutsch}}) ==\n{{Herkunft}}\n:althochdeutsche Form ''{{Ü|goh|hūs}}''<ref name="Kluge"/>, [[Erbwort|ein Erbwort]]<ref>{{Lit-Kluge}}</ref>.\n\n{{Synonyme}}\n:[1] [[Gebäude]]\n== house ({{Sprache|Englisch}}) ==\n{{Herkunft}}\n:Old English hūs\n`;
  assert.equal(herkunft(page), 'althochdeutsche Form hūs, ein Erbwort.');
  assert.equal(herkunft('== wegen ({{Sprache|Deutsch}}) ==\n{{Bedeutungen}}\n:[1] x'), null);
});
