import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkCard } from '@vocabularium/domain/checks';
import { contentModule } from '@vocabularium/domain/catalog';
import { parentsIn } from '@vocabularium/domain/parents';

// Content checks (0.16.0): deterministic tests of a generated card, defined
// beside each facet in the catalog and run by the golden sets and the language
// gate. Each check passes on recorded good outputs and fails on a bad one.
const RECORDED = JSON.parse(readFileSync(new URL('./fixtures/checks/recorded.json', import.meta.url), 'utf8'));
const pythonParses = async code => spawnSync('python3', ['-I', '-c', 'import ast, sys; ast.parse(sys.stdin.read())'], { input: code }).status === 0;
const failures = async (type, card, tools = { pythonParses }) => (await checkCard(type, card, tools)).failures.map(failure => `${failure.part}.${failure.check}`);

const bank = RECORDED.german.find(card => card.json.facets?.article).json;
const chinese = RECORDED.chinese.find(card => card.json.facets?.pinyin).json;
const with_ = (card, facet, value) => ({ ...card, facets: { ...card.facets, [facet]: value } });

test('recorded good German and Chinese cards pass every check, and each card runs its checks', async () => {
  for (const [type, cards] of [['german', RECORDED.german], ['chinese', RECORDED.chinese]]) for (const { key, json } of cards) {
    const outcome = await checkCard(type, json, { pythonParses });
    assert.deepEqual(outcome.failures, [], `${type} ${key}`);
    assert.ok(outcome.ran > 0, `${type} ${key} ran no check`);
  }
});

test('German: the meanings are German, the article has its form, the tables are complete, the translations are German', async () => {
  assert.deepEqual(await failures('german', { ...bank, core: { ...bank.core, meanings: ['河岸'] } }), ['core.german-meanings']);
  assert.deepEqual(await failures('german', with_(bank, 'article', { singular: 'Ufer', plural: 'die Ufer' })), ['article.article-form']);
  assert.deepEqual(await failures('german', with_(bank, 'article', { singular: 'das Ufer', plural: 'den Ufern' })), ['article.article-form']);
  const verb = RECORDED.german.find(card => card.json.facets?.conjugation).json;
  const short = { ...verb.facets.conjugation, rows: verb.facets.conjugation.rows.slice(0, 5) };
  assert.deepEqual(await failures('german', with_(verb, 'conjugation', short)), ['conjugation.complete-table']);
  const gap = { ...verb.facets.conjugation, rows: [{ ...verb.facets.conjugation.rows[0], cells: verb.facets.conjugation.rows[0].cells.slice(1) }, ...verb.facets.conjugation.rows.slice(1)] };
  assert.deepEqual(await failures('german', with_(verb, 'conjugation', gap)), ['conjugation.complete-table']);
  const noun = RECORDED.german.find(card => card.json.facets?.declension?.rows.length === 4).json;
  const empty = { ...noun.facets.declension, rows: noun.facets.declension.rows.map((row, at) => at ? row : { ...row, cells: [row.cells[0], ' '] }) };
  assert.deepEqual(await failures('german', with_(noun, 'declension', empty)), ['declension.complete-table']);
  assert.deepEqual(await failures('german', with_(bank, 'examples', [{ sentence: 'We sat on the bank.', translation: '我们坐在河岸上。' }])), ['examples.german-translation']);
});

test('a meaning in this Context is in the module’s language, belongs to a word, is not repeated, and never writes the label; Pronunciation never speaks it (D29)', async () => {
  const contextual = (card, value, rest = card.core.meanings) => ({ ...card, core: { ...card.core, contextual: value, meanings: rest } });
  assert.deepEqual(await failures('german', contextual(bank, 'Geldinstitut')), []);
  assert.deepEqual(await failures('german', contextual(bank, '银行')), ['core.german-meanings']);
  assert.deepEqual(await failures('german', contextual(bank, bank.core.meanings[0])), ['core.context-meaning'], 'repeated among the meanings');
  assert.deepEqual(await failures('german', contextual(bank, '(in diesem Zusammenhang) Geldinstitut')), ['core.context-meaning'], 'the model wrote the label');
  assert.deepEqual(await failures('german', with_(bank, 'pronunciation', ['in diesem Zusammenhang die Bank'])), ['pronunciation.no-context-label']);
  assert.deepEqual(await failures('chinese', contextual(chinese, '银行')), []);
  assert.deepEqual(await failures('chinese', contextual(chinese, 'bank')), ['core.chinese-meanings']);
  assert.deepEqual(await failures('chinese', contextual(chinese, '（在此语境中）银行')), ['core.context-meaning']);
  const sentence = RECORDED.german.find(card => card.json.core.kind === 'sentence')?.json;
  if (sentence) assert.deepEqual(await failures('german', contextual(sentence, 'Hallo')), ['core.context-meaning'], 'a sentence has none');
});

test('Chinese: the meanings and translations are in characters, and the pinyin is valid, tone-marked and one syllable per character', async () => {
  assert.deepEqual(await failures('chinese', { ...chinese, core: { ...chinese.core, meanings: ['riverbank'] } }), ['core.chinese-meanings']);
  assert.deepEqual(await failures('chinese', with_(chinese, 'examples', [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }])), ['examples.chinese-translation']);
  const pinyin = text => with_(chinese, 'pinyin', [{ text: '河岸', pinyin: text }]);
  assert.deepEqual(await failures('chinese', pinyin('hé’àn')), []);
  assert.deepEqual(await failures('chinese', pinyin("hé'àn")), []);
  assert.deepEqual(await failures('chinese', pinyin('he an')), ['pinyin.tone-marked-pinyin'], 'no tone marks');
  assert.deepEqual(await failures('chinese', pinyin('he2 an4')), ['pinyin.tone-marked-pinyin'], 'tone numbers');
  assert.deepEqual(await failures('chinese', pinyin('hé')), ['pinyin.tone-marked-pinyin'], 'one syllable for two characters');
  assert.deepEqual(await failures('chinese', pinyin('hé xàn')), ['pinyin.tone-marked-pinyin'], 'no such syllable');
  assert.deepEqual(await failures('chinese', with_(chinese, 'pinyin', [{ text: '我们', pinyin: 'wǒmen' }, { text: '一点儿', pinyin: 'yìdiǎnr' }])), [], 'run together, a neutral tone, erhua');
  assert.deepEqual(await failures('chinese', with_(chinese, 'pinyin', [{ text: '在……里面', pinyin: 'zài……lǐmiàn' }])), [], 'the ellipsis of a frame');
  assert.deepEqual(await failures('chinese', with_(chinese, 'pinyin', [{ text: '西安', pinyin: 'Xī’ān' }])), [], 'capitals and an apostrophe');
});

test('Expertise: a formula names symbols, never numbers or relations; a code example is Python that parses', async () => {
  const formula = symbols => ({ core: { relevance: 'subject', hasFormula: 'yes' }, facets: { formula: { latex: 'ax^2 + bx + c = 0', symbols } } });
  assert.deepEqual(await failures('mathematics', formula([{ symbol: 'a', meaning: 'the coefficient' }, { symbol: '\\cdot', meaning: 'the group operation' }])), []);
  for (const symbol of ['0', '=', '\\exists', '\\leq']) assert.deepEqual(await failures('mathematics', formula([{ symbol, meaning: 'x' }])), ['formula.symbols-only'], symbol);
  const code = (language, source) => ({ core: { relevance: 'subject', hasCode: 'yes' }, facets: { code: { language, code: source } } });
  assert.deepEqual(await failures('computer-science', code('Python', '# The sum\nprint(sum([1, 2]))')), []);
  assert.deepEqual(await failures('computer-science', code('java', 'class A {}')), ['code.python']);
  assert.deepEqual(await failures('computer-science', code('python', 'def f(:\n  pass')), ['code.python']);
  const outcome = await checkCard('computer-science', code('python', 'print(1)'), {});
  assert.deepEqual([outcome.failures, outcome.skipped], [[], ['code.python']], 'without a Python parser the check is skipped, not failed');
});

test('Chemistry: an Equation is mhchem, a simple reaction is balanced, and its species are substances (D30)', async () => {
  const equation = (latex, species = [{ symbol: '\\ce{H2O}', name: 'water' }]) => ({ core: { relevance: 'subject', hasEquation: 'yes' }, facets: { equation: { latex, species } } });
  assert.deepEqual(await failures('chemistry', equation('\\ce{2H2 + O2 -> 2H2O}')), []);
  assert.deepEqual(await failures('chemistry', equation('\\ce{CH4 + 2O2 -> CO2 + 2H2O}')), []);
  assert.deepEqual(await failures('chemistry', equation('\\ce{N2 + 3H2 <=> 2NH3}')), [], 'an equilibrium');
  assert.deepEqual(await failures('chemistry', equation('\\ce{NaCl}')), [], 'a formula, no reaction');
  assert.deepEqual(await failures('chemistry', equation('2H2 + O2 -> 2H2O')), ['equation.mhchem']);
  assert.deepEqual(await failures('chemistry', equation('\\ce{H2 + O2 -> H2O}')), ['equation.balanced']);
  assert.deepEqual(await failures('chemistry', equation('\\ce{CH4 + O2 -> CO2 + 2H2O}')), ['equation.balanced']);
  assert.deepEqual(await failures('chemistry', equation('\\ce{H+ + OH- -> H2O}')), [], 'charges are not counted');
  assert.deepEqual(await failures('chemistry', equation('\\ce{Ca(OH)2 + 2HCl -> CaCl2 + 2H2O}')), [], 'a group in parentheses is not counted');
  assert.deepEqual(await failures('chemistry', equation('\\ce{2H2(g) + O2(g) -> 2H2O(l)}')), [], 'states are not counted');
  for (const symbol of ['\\ce{->}', '+', '2', '\\ce{2H2O}', '\\ce{H2 + O2}']) {
    assert.deepEqual(await failures('chemistry', equation('\\ce{2H2 + O2 -> 2H2O}', [{ symbol, name: 'x' }])), ['equation.species-only'], symbol);
  }
});

test('every check has a unique ID within its part and says what it checks; every Languages module checks its core', () => {
  for (const type of Object.keys(RECORDED).filter(key => key !== 'note').concat(parentsIn('expertise'))) {
    const module = contentModule(type);
    for (const part of [module.core, ...module.facets]) {
      const ids = (part.checks ?? []).map(check => check.id);
      assert.equal(new Set(ids).size, ids.length, `${type}.${part.id}`);
      for (const check of part.checks ?? []) assert.ok(/^[a-z][a-z0-9-]*$/.test(check.id) && check.description.trim(), `${type}.${part.id}.${check.id}`);
    }
  }
  for (const type of parentsIn('translation')) assert.ok(contentModule(type).core.checks?.length, `${type} has no core check`);
});
