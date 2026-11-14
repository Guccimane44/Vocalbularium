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

// English (D34): one module that takes British, American or mixed English as
// the model writes it. Its checks are about the key and the language, never
// the variety.
const englishCard = {
  core: { kind: 'word', language: 'German', key: 'Farbe', meanings: ['the colour of something', 'paint'] },
  facets: {
    examples: [{ sentence: 'Welche Farbe hat dein Auto?', translation: 'What color is your car?' }, { sentence: 'Die Farbe ist noch nass.', translation: 'The paint is still wet.' }],
    synonyms: ['hue', 'shade'], pronunciation: ['colour', 'paint'],
    etymology: { origins: ['Old English'], text: 'From Latin color, through Old French colour.' },
    'simple-translation': ['what color a thing is, like red or grey', 'what you put on a wall to change its look']
  }
};

test('English: the meanings and translations are English in any variety, an English key is spoken and kept as selected, and Grammar teacher needs an English key', async () => {
  const { appliesTo } = await import('@vocabularium/domain/parents');
  const type = 'english', card = englishCard;
  assert.deepEqual(await failures(type, card), [], 'British and American spellings mixed on one card pass');
  assert.deepEqual(await failures(type, { ...card, core: { ...card.core, meanings: ['颜色', 'paint'] } }), ['core.english-meanings']);
  for (const word of ['organised', 'organized', 'cancelled', 'canceled', 'gray', 'grey']) {
    assert.deepEqual(await failures(type, with_(card, 'simple-translation', [`it is ${word}`, 'paint'])), [], word);
  }
  // An English key: its examples untranslated, and spoken itself, never its meanings.
  const keyed = { ...card, core: { ...card.core, language: 'English', key: 'colour', meanings: ['the colour of something'] }, facets: { 'grammar-teacher': ['Colour is a noun and a verb.'] } };
  assert.deepEqual(await failures(type, keyed), []);
  assert.deepEqual(await failures(type, { ...keyed, facets: { examples: [{ sentence: 'I like this colour.', translation: 'I like this color.' }] } }), ['examples.english-key-untranslated']);
  assert.deepEqual(await failures(type, { ...keyed, facets: { pronunciation: ['colour'] } }), []);
  assert.deepEqual(await failures(type, { ...keyed, facets: { pronunciation: ['color'] } }), ['pronunciation.english-key-spoken'], 'the key as selected, not another spelling of it');
  assert.deepEqual(await failures(type, { ...keyed, facets: { pronunciation: ['hue', 'shade'] } }), ['pronunciation.english-key-spoken']);
  // The label is the module's.
  assert.deepEqual(await failures(type, { ...card, core: { ...card.core, contextual: '(in this context) paint', meanings: ['the colour of something'] }, facets: {} }), ['core.context-meaning']);
  assert.deepEqual(await failures(type, with_(card, 'pronunciation', ['in this context paint'])), ['pronunciation.no-context-label']);
  // Etymology: distinct English names without the dot, no label.
  for (const [etymology, check] of [[{ origins: ['Latin · Old French'], text: 'From Latin.' }, 'origins'], [{ origins: ['Latin', 'latin'], text: 'From Latin.' }, 'origins'],
    [{ origins: ['Latin'], text: 'Inherited from: Latin.' }, 'no-label'], [{ origins: ['Latin'], text: 'x'.repeat(601) }, 'english-text'], [{ origins: ['拉丁语'], text: 'From Latin.' }, 'origins']]) {
    assert.deepEqual(await failures(type, with_(card, 'etymology', etymology)), [`etymology.${check}`], JSON.stringify(etymology));
  }
  // Simple translation: one line per meaning, the one in this Context included.
  assert.deepEqual(await failures(type, with_(card, 'simple-translation', ['what colour a thing is'])), ['simple-translation.line-per-meaning']);
  // Grammar teacher: only for an English key, by the core's language.
  for (const language of ['English', 'British English', 'American English', ' english ']) assert.ok(appliesTo(type, 'grammar-teacher', { kind: 'word', language }), language);
  for (const language of ['German', 'Englisch', '英语', '']) assert.ok(!appliesTo(type, 'grammar-teacher', { kind: 'word', language }), language);
  assert.ok(appliesTo(type, 'grammar-teacher', { kind: 'sentence', language: 'English' }));
  assert.deepEqual(await failures(type, { ...keyed, facets: { 'grammar-teacher': ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'] } }), ['grammar-teacher.points']);
});

// English Forms (D35): the English word's plural, comparison or verb forms, a
// line or a verb's table of one row, for the word the core names.
test('English Forms: the forms of the core\'s word and part of speech only, a line or a verb table, offered when the stored card no longer names its part of speech', async () => {
  const { appliesTo } = await import('@vocabularium/domain/parents');
  const { formatFacet } = await import('@vocabularium/domain/content');
  const type = 'english';
  const word = (key, gramRole, formsWord, forms) => ({ core: { kind: 'word', language: 'English', key, gramRole, formsWord, meanings: ['a sense'] }, facets: { forms } });
  const mice = { word: 'mouse', plural: 'mice' };
  const go = { word: 'go', thirdPerson: 'goes', past: 'went', pastParticiple: 'gone', ing: 'going' };
  assert.deepEqual(await failures(type, word('mice', 'noun', 'mouse', mice)), []);
  assert.deepEqual(await failures(type, word('went', 'verb', 'go', go)), []);
  assert.deepEqual(await failures(type, word('Haus', 'noun', 'house', { word: 'house', plural: 'houses' })), []);
  assert.deepEqual(await failures(type, word('travel', 'verb', 'travel', { ...go, word: 'travel', thirdPerson: 'travels', past: 'travelled / traveled', pastParticiple: 'travelled / traveled', ing: 'travelling / traveling' })), [], 'two spellings share a slot');
  assert.deepEqual(await failures(type, word('information', 'noun', 'information', { word: 'information', number: 'uncountable' })), []);
  assert.deepEqual(await failures(type, word('can', 'verb', 'can', { word: 'can', past: 'could' })), [], 'a modal shows only what it has');
  // What fails.
  assert.deepEqual(await failures(type, word('went', 'verb', 'go', { ...go, word: 'went' })), ['forms.forms-word']);
  assert.deepEqual(await failures(type, word('mice', 'noun', 'mouse', { ...mice, comparative: 'micer' })), ['forms.one-part-of-speech']);
  assert.deepEqual(await failures(type, word('mice', 'verb', 'mouse', mice)), ['forms.one-part-of-speech'], 'noun forms for a verb');
  assert.deepEqual(await failures(type, word('mice', 'noun', 'mouse', { ...mice, number: 'uncountable' })), ['forms.one-part-of-speech']);
  assert.deepEqual(await failures(type, word('mice', 'noun', 'mouse', { word: 'mouse' })), ['forms.one-part-of-speech'], 'no forms');
  assert.deepEqual(await failures(type, word('far', 'adjective', 'far', { word: 'far', comparative: 'farther / further / farer', superlative: 'farthest' })), ['forms.forms']);
  assert.deepEqual(await failures(type, word('far', 'adjective', 'far', { word: 'far', comparative: 'further / further', superlative: 'farthest' })), ['forms.forms']);
  assert.deepEqual(await failures(type, word('far', 'adjective', 'far', { word: 'far', comparative: 'farther / ', superlative: 'farthest' })), ['forms.forms']);
  assert.deepEqual(await failures(type, { core: { kind: 'sentence', language: 'English', key: 'It rains.', gramRole: 'verb', meanings: ['x'] }, facets: {} }), ['core.forms-word']);
  // The layouts: one line, or a table of one row for a verb.
  assert.equal(formatFacet(type, 'forms', mice), 'mouse · mice');
  assert.equal(formatFacet(type, 'forms', { word: 'good', comparative: 'better', superlative: 'best' }), 'good · better · best');
  assert.equal(formatFacet(type, 'forms', { word: 'scissors', number: 'plural only' }), 'scissors · plural only');
  assert.equal(formatFacet(type, 'forms', { word: 'can', past: 'could' }), 'can · could');
  assert.equal(formatFacet(type, 'forms', go), '| Base | Third person | Past | Past participle | -ing form |\n| --- | --- | --- | --- | --- |\n| go | goes | went | gone | going |');
  // When it applies: a noun, verb, adjective or adverb; any word whose part of speech the stored card no longer has.
  for (const gramRole of ['noun', 'verb', 'adjective', 'adverb', undefined]) assert.ok(appliesTo(type, 'forms', { kind: 'word', language: 'English', gramRole }), String(gramRole));
  assert.ok(!appliesTo(type, 'forms', { kind: 'word', language: 'English', gramRole: 'other' }));
  assert.ok(!appliesTo(type, 'forms', { kind: 'sentence', language: 'English' }));
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

// Creativity (D30): written in the key's language and script; a haiku in three
// lines, 5-7-5 characters in Chinese and morae in Japanese, counted on its
// kana reading; a modern haiku and a joke short.
test('Creativity: three lines, the Chinese and Japanese counts, the script of the key’s language, and short', async () => {
  const haiku = (language, lines, reading) => ({ core: { language, key: 'x', haiku: lines, ...(reading ? { reading } : {}) }, facets: {} });
  const autumn = ['autumn river mist —', 'two strangers on the old bridge', 'trading their hellos'];
  assert.deepEqual(await failures('traditional-haiku', haiku('en', autumn)), []);
  assert.deepEqual(await failures('traditional-haiku', haiku('en', autumn.slice(0, 2))), ['core.three-lines']);
  assert.deepEqual(await failures('traditional-haiku', haiku('de', ['Herbstwind —', 'zwei Fremde auf der Brücke', '你好'])), ['core.script']);
  assert.deepEqual(await failures('traditional-haiku', haiku('zh', ['春雨落屋檐，', '祖母乡音轻轻唤', '我已难开言。'])), [], 'punctuation is not counted');
  assert.deepEqual(await failures('traditional-haiku', haiku('zh', ['春雨落屋檐下', '祖母乡音轻轻唤', '我已难开言'])), ['core.chinese-count']);
  const sakura = ['さまざまの', '事思ひ出す', '桜かな'];
  assert.deepEqual(await failures('traditional-haiku', haiku('ja', sakura, ['さまざまの', 'ことおもいだす', 'さくらかな'])), []);
  // Small kana join the kana before them; the small tsu, ん and ー count one.
  assert.deepEqual(await failures('traditional-haiku', haiku('ja', ['古池や', '蛙飛び込む', '水の音'], ['ふるいけや', 'かわずとびこむ', 'みずのおと'])), []);
  // きょう is two morae, しゅっぱつのベル seven: っ, ん and ー count one each.
  const bell = (second) => haiku('ja', ['きょうの空', second, 'さんぽみち'], ['きょうのそら', second, 'さんぽみち']);
  assert.deepEqual(await failures('traditional-haiku', bell('しゅっぱつのベル')), []);
  assert.deepEqual(await failures('traditional-haiku', bell('しゅっぱつのベルー')), ['core.japanese-count']);
  assert.deepEqual(await failures('traditional-haiku', haiku('ja', sakura)), ['core.japanese-count'], 'a Japanese haiku gives its reading');
  assert.deepEqual(await failures('traditional-haiku', haiku('ja', sakura, sakura)), ['core.japanese-count'], 'the reading is kana');
  assert.deepEqual(await failures('traditional-haiku', haiku('ja', sakura, ['さまざまの', 'ことおもいだすよ', 'さくらかな'])), ['core.japanese-count']);
  assert.deepEqual(await failures('traditional-haiku', haiku('other', ['a', 'b', 'c'])), [], 'a language without a known script is not checked');

  const modern = (language, lines) => ({ core: { language, key: 'x', haiku: lines }, facets: {} });
  assert.deepEqual(await failures('modern-haiku', modern('en', ['night bus', 'two strangers share one map', 'in different languages'])), []);
  assert.deepEqual(await failures('modern-haiku', modern('en', ['night bus', 'two strangers'])), ['core.three-lines']);
  assert.deepEqual(await failures('modern-haiku', modern('en', ['night bus', 'two strangers share one map in the rain while the driver hums an old song', 'and the city slides by in every language they never learned'])), ['core.short']);
  assert.deepEqual(await failures('modern-haiku', modern('zh', ['夜班公交', '两个陌生人，一张地图', '两种语言'])), []);
  assert.deepEqual(await failures('modern-haiku', modern('zh', ['深夜的最后一班公交车上', '两个素不相识的陌生人共看一张地图', '说着两种完全不同的语言'])), ['core.short']);
  assert.deepEqual(await failures('modern-haiku', modern('ru', ['ночной автобус', 'two strangers', 'на двух языках'])), ['core.script']);

  const joke = (language, lines) => ({ core: { language, key: 'x', joke: lines }, facets: {} });
  assert.deepEqual(await failures('joke', joke('fr', ['— Combien de langues parles-tu ?', '— Une seule, mais je la tire très bien.'])), []);
  assert.deepEqual(await failures('joke', joke('fr', Array(7).fill('Et puis…'))), ['core.short']);
  assert.deepEqual(await failures('joke', joke('en', ['Why?', 'x'.repeat(401)])), ['core.short']);
  assert.deepEqual(await failures('joke', joke('zh', ['老师：你会几种语言？', 'Student: three.'])), ['core.script']);
});

test('Creativity: every module’s samples pass its checks', async () => {
  const { readdirSync } = await import('node:fs');
  for (const module of parentsIn('creativity')) {
    const folder = new URL(`../packages/domain/src/catalog/creativity/${module}/samples/`, import.meta.url);
    for (const file of readdirSync(folder)) {
      const samples = JSON.parse(readFileSync(new URL(file, folder), 'utf8'));
      for (const [inputType, card] of Object.entries(samples)) assert.deepEqual(await failures(module, card), [], `${module} ${file} ${inputType}`);
    }
  }
});
