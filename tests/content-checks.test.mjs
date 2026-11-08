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

// The facets of 0.16.4: Etymology, Simple translation and Grammar teacher.
test('Chinese: Etymology names its origins in Chinese once each, Simple translation has a line per meaning, Grammar teacher a few simplified points', async () => {
  const word = { core: { kind: 'word', language: '中文', key: '咖啡', meanings: ['一种用咖啡豆做的饮料', '咖啡豆'] }, facets: {
    etymology: { origins: ['阿拉伯语', '土耳其语', '英语'], text: '“咖啡”是音译词，来自英语 coffee，最早可追溯到阿拉伯语。' },
    'simple-translation': ['一种黑色的、有点苦的喝的东西', '用来做咖啡的小东西'],
    'grammar-teacher': ['名词，量词常用“杯”：一杯咖啡。', '可以作定语：咖啡店、咖啡色。'] } };
  assert.deepEqual(await failures('chinese', word), []);
  const ety = value => with_(word, 'etymology', { ...word.facets.etymology, ...value });
  assert.deepEqual(await failures('chinese', ety({ origins: ['英语', '英语'] })), ['etymology.chinese-origins'], 'named twice');
  assert.deepEqual(await failures('chinese', ety({ origins: ['English'] })), ['etymology.chinese-origins'], 'not in Chinese');
  assert.deepEqual(await failures('chinese', ety({ origins: ['阿拉伯语 · 英语'] })), ['etymology.chinese-origins'], 'joined by the model');
  assert.deepEqual(await failures('chinese', ety({ origins: ['源自英语'] })), ['etymology.chinese-origins'], 'the label');
  assert.deepEqual(await failures('chinese', ety({ text: '源自：英语。' })), ['etymology.etymology-text'], 'the label in the text');
  assert.deepEqual(await failures('chinese', ety({ text: '咖'.repeat(201) })), ['etymology.etymology-text'], 'too long');
  assert.deepEqual(await failures('chinese', ety({ origins: ['古漢語'] })), ['etymology.simplified'], 'traditional characters');
  assert.deepEqual(await failures('chinese', ety({ text: '日本用汉字造出「銀行」翻译 bank，后来传入中文。' })), [], 'a source form quoted in 「」');
  assert.deepEqual(await failures('chinese', ety({ text: '日本用漢字造出銀行。' })), ['etymology.simplified'], 'unquoted');
  assert.deepEqual(await failures('chinese', with_(word, 'simple-translation', ['一种喝的东西'])), ['simple-translation.one-line-per-meaning']);
  assert.deepEqual(await failures('chinese', with_({ ...word, core: { ...word.core, contextual: '咖啡店' } }, 'simple-translation', ['卖咖啡的店', ...word.facets['simple-translation']])), []);
  assert.deepEqual(await failures('chinese', with_(word, 'simple-translation', ['coffee', '小东西'])), ['simple-translation.chinese-lines']);
  assert.deepEqual(await failures('chinese', with_(word, 'simple-translation', ['一種喝的東西', '小东西'])), ['simple-translation.chinese-lines'], 'traditional');
  assert.deepEqual(await failures('chinese', with_(word, 'grammar-teacher', Array(6).fill('名词。'))), ['grammar-teacher.grammar-points'], 'too many');
  assert.deepEqual(await failures('chinese', with_(word, 'grammar-teacher', ['名詞，量詞用“杯”。'])), ['grammar-teacher.grammar-points'], 'traditional');
  const sentence = { core: { kind: 'sentence', language: '英语', key: 'The committee postponed the decision.', meanings: ['委员会推迟了这项决定。'] }, facets: { 'simple-translation': ['开会的人说：这件事以后再决定。'] } };
  assert.deepEqual(await failures('chinese', sentence), []);
  assert.deepEqual(await failures('chinese', with_(sentence, 'simple-translation', ['开会的人', '以后再决定'])), ['simple-translation.one-line-per-meaning']);
  assert.deepEqual(await failures('chinese', with_(sentence, 'simple-translation', ['委员会推迟了这项决定'])), ['simple-translation.simpler-than-core'], 'the core again');
  // Etymology's header is the module's, the origins joined by a middle dot.
  const { formatContent } = await import('@vocabularium/domain/content');
  assert.match(formatContent('chinese', word).facets.etymology, /^源自：阿拉伯语 · 土耳其语 · 英语\n\n/);
});

test('Chinese Grammar teacher applies only when the core names the key Chinese, by each of its names (0.16.4)', async () => {
  const { appliesTo } = await import('@vocabularium/domain/parents');
  for (const language of ['中文', '汉语', '普通话', ' 中文 ']) for (const kind of ['word', 'sentence'])
    assert.ok(appliesTo('chinese', 'grammar-teacher', { kind, language, key: '把', meanings: ['x'] }), `${language} ${kind}`);
  for (const language of ['英语', '日语', '粤语', '', undefined])
    assert.ok(!appliesTo('chinese', 'grammar-teacher', { kind: 'word', language, key: 'x', meanings: ['x'] }), String(language));
  assert.ok(!appliesTo('chinese', 'etymology', { kind: 'sentence', language: '中文', key: '我把书放好了。', meanings: ['x'] }), 'Etymology is for words');
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
