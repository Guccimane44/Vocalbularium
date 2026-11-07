import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkCard } from '@vocabularium/domain/checks';
import { contentModule, isContentModule } from '@vocabularium/domain/catalog';
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

test('recorded good cards of every Languages module pass every check, and each card runs its checks', async () => {
  for (const [type, cards] of Object.entries(RECORDED).filter(([type]) => type !== 'note')) for (const { key, json } of cards) {
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

// The English modules (0.16.4): a British card and an American one, each
// flagging the other variant's common spellings in its own text.
const ENGLISH = [
  { type: 'english-british', own: 'colour', other: 'color', ownWord: 'organised', otherWord: 'organized' },
  { type: 'english-american', own: 'color', other: 'colour', ownWord: 'organized', otherWord: 'organised' }
].filter(variant => isContentModule(variant.type));
const englishCard = own => ({
  core: { kind: 'word', language: 'German', key: 'Farbe', meanings: [`the ${own} of something`, 'paint'] },
  facets: {
    examples: [{ sentence: 'Welche Farbe hat dein Auto?', translation: `What ${own} is your car?` }, { sentence: 'Die Farbe ist noch nass.', translation: 'The paint is still wet.' }],
    synonyms: ['hue', 'shade'], pronunciation: [own, 'paint'],
    etymology: { origins: ['Old English'], text: `From Latin color, through Old French colour.` },
    'simple-translation': [`what ${own} a thing is, like red or blue`, 'what you put on a wall to change its look']
  }
});

test('English: the meanings and translations are English, the other variant’s spellings are flagged except in the key, and Grammar teacher needs an English key', async () => {
  const { appliesTo } = await import('@vocabularium/domain/parents');
  for (const { type, own, other, ownWord, otherWord } of ENGLISH) {
    const card = englishCard(own);
    assert.deepEqual(await failures(type, card), [], type);
    assert.deepEqual(await failures(type, { ...card, core: { ...card.core, meanings: ['颜色', 'paint'] } }), ['core.english-meanings']);
    assert.deepEqual(await failures(type, { ...card, core: { ...card.core, meanings: [`the ${other} of something`, 'paint'] } }), [`core.${type.slice(8)}-spelling`]);
    assert.deepEqual(await failures(type, with_(card, 'synonyms', ['hue', other])), [`synonyms.${type.slice(8)}-spelling`]);
    assert.deepEqual(await failures(type, with_(card, 'simple-translation', [`it is ${otherWord}`, 'paint'])), [`simple-translation.${type.slice(8)}-spelling`]);
    assert.deepEqual(await failures(type, with_(card, 'simple-translation', [`it is ${ownWord}`, 'paint'])), []);
    // A doubled or single l before a suffix: travelled and cancelled are British, traveled and canceled American.
    const [ownL, otherL] = type === 'english-british' ? ['cancelled', 'canceled'] : ['canceled', 'cancelled'];
    assert.deepEqual(await failures(type, with_(card, 'simple-translation', [`the trip was ${ownL}`, 'paint'])), [], ownL);
    assert.deepEqual(await failures(type, with_(card, 'simple-translation', [`the trip was ${otherL}`, 'paint'])), [`simple-translation.${type.slice(8)}-spelling`], otherL);
    // The key's own words, in either spelling, are allowed.
    const keyed = { ...card, core: { ...card.core, language: 'English', key: other, meanings: [`the spelling of ${own} in the other variant`] }, facets: { 'grammar-teacher': [`${other} is spelled ${own} here.`] } };
    assert.deepEqual(await failures(type, keyed), [], `${type} names the key ${other}`);
    assert.deepEqual(await failures(type, { ...keyed, facets: { 'grammar-teacher': [`Its forms are ${other}s and ${other}ed; ${own}ed elsewhere.`] } }), [], 'and its forms');
    // A foreign example sentence is never checked for spelling; an English one is.
    const spanish = with_(card, 'examples', [{ sentence: 'Tiene buen humor.', translation: 'He is in a good mood.' }]);
    assert.deepEqual(await failures(type, spanish), []);
    const english = { ...keyed, facets: { examples: [{ sentence: `The ${other} of the sky is ${otherWord === 'organized' ? 'gray' : 'grey'}.` }] } };
    assert.deepEqual(await failures(type, english), [`examples.${type.slice(8)}-spelling`]);
    assert.deepEqual(await failures(type, { ...keyed, facets: { examples: [{ sentence: `I like this ${other}.`, translation: `I like this ${other}.` }] } }), ['examples.english-key-untranslated']);
    // The label is the module's.
    assert.deepEqual(await failures(type, { ...card, core: { ...card.core, contextual: '(in this context) paint', meanings: [`the ${own} of something`] }, facets: {} }), ['core.context-meaning']);
    assert.deepEqual(await failures(type, with_(card, 'pronunciation', ['in this context paint'])), ['pronunciation.no-context-label']);
    // Etymology: distinct English names without the dot, no label.
    for (const [etymology, check] of [[{ origins: ['Latin · Old French'], text: 'From Latin.' }, 'origins'], [{ origins: ['Latin', 'latin'], text: 'From Latin.' }, 'origins'],
      [{ origins: ['Latin'], text: 'Inherited from: Latin.' }, 'no-label'], [{ origins: ['Latin'], text: 'x'.repeat(601) }, 'english-text'], [{ origins: ['拉丁语'], text: 'From Latin.' }, 'origins']]) {
      assert.deepEqual(await failures(type, with_(card, 'etymology', etymology)), [`etymology.${check}`], JSON.stringify(etymology));
    }
    // Simple translation: one line per meaning, the one in this Context included.
    assert.deepEqual(await failures(type, with_(card, 'simple-translation', [`what ${own} a thing is`])), ['simple-translation.line-per-meaning']);
    // Grammar teacher: only for an English key, by the core's language.
    for (const language of ['English', 'British English', 'American English', ' english ']) assert.ok(appliesTo(type, 'grammar-teacher', { kind: 'word', language }), language);
    for (const language of ['German', 'Englisch', '英语', '']) assert.ok(!appliesTo(type, 'grammar-teacher', { kind: 'word', language }), language);
    assert.ok(appliesTo(type, 'grammar-teacher', { kind: 'sentence', language: 'English' }));
    assert.deepEqual(await failures(type, { ...keyed, facets: { 'grammar-teacher': ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'] } }), ['grammar-teacher.points']);
  }
  assert.ok(ENGLISH.length >= 1);
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
