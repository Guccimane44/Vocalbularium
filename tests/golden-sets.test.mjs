import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleSet } from '../scripts/golden-sets.mjs';
import { decides, disagreements, grammarLines } from '../scripts/golden-dwds.mjs';

// A small German golden folder, inline, read through the same moduleSet the
// runners and the catalog test use.
const persons = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];
const laufen = {
  Präsens: ['laufe', 'läufst', 'läuft', 'laufen', 'lauft', 'laufen'],
  Präteritum: ['lief', 'liefst', 'lief', 'liefen', 'lieft', 'liefen'],
  Perfekt: ['bin gelaufen', 'bist gelaufen', 'ist gelaufen', 'sind gelaufen', 'seid gelaufen', 'sind gelaufen']
};
const cases = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ'];
const joghurt = {
  der: ['der Joghurt', 'des Joghurts', 'dem Joghurt', 'den Joghurt'],
  das: ['das Joghurt', 'des Joghurts', 'dem Joghurt', 'das Joghurt']
};
const plural = ['die Joghurts', 'der Joghurts', 'den Joghurts', 'die Joghurts'];
const reference = (pos, answers) => ({ pos, source: 'test', checked: 'test', ...answers });
const references = () => ({ words: {
  laufen: reference('verb', { conjugation: [Object.fromEntries(Object.entries(laufen).map(([tense, forms]) => [tense, Object.fromEntries(persons.map((person, index) => [person, [forms[index]]]))]))] }),
  Joghurt: reference('noun', {
    article: [{ singular: ['der Joghurt'], plural: ['die Joghurts'] }, { singular: ['das Joghurt'], plural: ['die Joghurts'] }],
    declension: Object.values(joghurt).map(singular => ({ Singular: Object.fromEntries(cases.map((kase, index) => [kase, [singular[index]]])), Plural: Object.fromEntries(cases.map((kase, index) => [kase, [plural[index]]])) }))
  }),
  Milch: reference('noun', {
    article: [{ singular: ['die Milch'], plural: [] }],
    declension: [{ Singular: Object.fromEntries(cases.map((kase, index) => [kase, [['die Milch', 'der Milch', 'der Milch', 'die Milch'][index]]])), Plural: Object.fromEntries(cases.map(kase => [kase, []])) }]
  }),
  tot: reference('adjective', { comparison: 'none', declension: 'none' }),
  klein: reference('adjective', { comparison: [{ positive: ['klein'], comparative: ['kleiner'], superlative: ['am kleinsten'] }], declension: [{ Maskulinum: { 'stark Genitiv': ['kleinen'], 'schwach Nominativ': ['kleine'] } }] })
} });
const item = (id, word, fills, split = 'dev') => ({ id, key: word, why: 'test', part: 'knowledge', split, word, frequency: 5, fills, expect: { kind: 'word' } });
const items = () => ({ items: [
  item('laufen', 'laufen', { conjugation: ['present-vowel', 'strong-preterite', 'preterite-ihr'] }),
  item('joghurt', 'Joghurt', { article: ['gender-loan'], declension: ['genitive-s'] }),
  item('milch', 'Milch', { article: ['plural-none'] }, 'test'),
  item('tot', 'tot', { comparison: ['not-comparable'] }),
  item('klein', 'klein', { declension: ['adjective-regular'] }),
  { id: 'run', key: 'run', why: 'test', part: 'reading', split: 'test', candidates: ['laufen', 'rennen'], fills: { core: ['source-language'], conjugation: ['preterite-ihr'] }, expect: { kind: 'word' } }
] });
const german = (raw = {}) => moduleSet('german', { items: items(), references: references(), ...raw });

const table = (columns, rows) => ({ columns, rows: Object.entries(rows).map(([label, cells]) => ({ label, cells })) });
const conjugation = change => table(Object.keys(laufen), Object.fromEntries(persons.map((person, index) => [person, Object.keys(laufen).map(tense => change?.[`${tense}|${person}`] ?? laufen[tense][index])])));
const card = (id, gramRole, facets, core = {}) => ({ id, parent: 'german', sample: 1, json: { core: { kind: 'word', gramRole, meanings: ['—'], ...core }, facets }, facets: Object.keys(facets) });
const score = (results, facet, id = results[0].id) => german().score({ results }).scores.find(each => each.id === id && each.facet === facet);
const points = scored => Object.fromEntries(scored.points.map(point => [point.point, point.verdict]));

test('a wrong conjugation cell fails only the failure points that own it', () => {
  assert.equal(score([card('laufen', 'verb', { conjugation: conjugation() })], 'conjugation').verdict, 'pass');
  const wrong = score([card('laufen', 'verb', { conjugation: conjugation({ 'Präteritum|ihr': 'liefet' }) })], 'conjugation');
  assert.equal(wrong.verdict, 'fail');
  assert.deepEqual(points(wrong), { 'present-vowel': 'pass', 'strong-preterite': 'pass', 'preterite-ihr': 'fail' });
  // "er, sie, es" names the same row as "er/sie/es".
  const relabelled = conjugation();
  relabelled.rows[2].label = 'er, sie, es';
  assert.equal(score([card('laufen', 'verb', { conjugation: relabelled })], 'conjugation').verdict, 'pass');
});

test('an alternative is a whole paradigm: der or das passes, der in one row and das in the next fails', () => {
  const declension = singular => table(['Singular', 'Plural'], Object.fromEntries(cases.map((kase, index) => [kase, [singular[index], plural[index]]])));
  for (const singular of Object.values(joghurt)) assert.equal(score([card('joghurt', 'noun', { declension: declension(singular) })], 'declension').verdict, 'pass');
  const mixed = score([card('joghurt', 'noun', { declension: declension(['das Joghurt', 'des Joghurts', 'dem Joghurt', 'den Joghurt']) })], 'declension');
  assert.equal(mixed.verdict, 'fail');
});

test('"A/B" in a cell passes only when every form it writes is accepted', () => {
  const article = singular => score([card('joghurt', 'noun', { article: { singular, plural: 'die Joghurts' } })], 'article');
  assert.equal(article('der/das Joghurt').verdict, 'pass');
  assert.equal(article('der oder das Joghurt').verdict, 'pass');
  assert.equal(article('der/die Joghurt').verdict, 'fail');
});

test('"none" fails a card that writes the facet; [] fails a card that writes a form in that cell', () => {
  const comparison = { positive: 'tot', comparative: 'toter', superlative: 'am totesten' };
  assert.equal(score([card('tot', 'adjective', {})], 'comparison').verdict, 'pass');
  const invented = score([card('tot', 'adjective', { comparison })], 'comparison');
  assert.deepEqual([invented.verdict, invented.comparison.whole, points(invented)], ['fail', 'invented', { 'not-comparable': 'fail' }]);
  const milch = plural => score([card('milch', 'noun', { article: { singular: 'die Milch', ...(plural === undefined ? {} : { plural }) } })], 'article');
  assert.equal(milch(undefined).verdict, 'pass');
  assert.equal(milch('—').verdict, 'pass');
  assert.deepEqual(points(milch('die Milchen')), { 'plural-none': 'fail' });
});

test('an adjective cell is scored on its form, whatever article the card writes before it', () => {
  const declension = (genitive, nominative) => score([card('klein', 'adjective', { declension: table(['Maskulinum'], { 'stark Genitiv': [genitive], 'schwach Nominativ': [nominative] }) })], 'declension');
  assert.equal(declension('kleinen', 'der kleine').verdict, 'pass');
  assert.equal(declension('kleines', 'kleine').verdict, 'fail');
});

test('a form with an optional letter, ritt(e)st, passes only when both spellings are accepted', () => {
  const both = references();
  both.words.laufen.conjugation[0].Präteritum.du.push('liefest');
  const preterite = (raw, form) => moduleSet('german', { items: items(), references: raw }).score({ results: [card('laufen', 'verb', { conjugation: conjugation({ 'Präteritum|du': form }) })] }).scores.find(each => each.facet === 'conjugation').verdict;
  assert.equal(preterite(both, 'lief(e)st'), 'pass');
  assert.equal(preterite(references(), 'lief(e)st'), 'fail');
});

test('a facet the word has is scored as left out when the card omits it, and as routing when the card read another part of speech', () => {
  assert.equal(score([card('joghurt', 'noun', {})], 'article').comparison.whole, 'left-out');
  assert.equal(score([card('joghurt', 'verb', {})], 'article').why, 'routing');
});

test('a foreign key is scored on the German word the card chose, and left to the judge for any other', () => {
  const chosen = score([card('run', 'verb', { conjugation: conjugation({ 'Präteritum|ihr': 'liefet' }) }, { meanings: ['laufen', 'rennen'] })], 'conjugation');
  assert.deepEqual([chosen.word, chosen.verdict, points(chosen)], ['laufen', 'fail', { 'preterite-ihr': 'fail' }]);
  assert.equal(score([card('run', 'verb', {}, { meanings: ['joggen'] })], 'conjugation').why, 'other-word');
});

test('a point that loses an item becomes a gap that names the fix', () => {
  const fills = { items: [1, 2, 3].map(n => item(`tot-${n}`, 'tot', { comparison: ['not-comparable'] }, n === 1 ? 'test' : 'dev')) };
  const gapsOn = raw => german({ items: raw }).gaps.filter(gap => gap.message.startsWith('comparison.not-comparable'));
  assert.deepEqual(gapsOn(fills), []);
  const removed = gapsOn({ items: fills.items.slice(0, 2) });
  assert.deepEqual(removed.map(gap => gap.kind), ['too-few']);
  assert.match(removed[0].message, /add items to tests\/golden\/german\/items\.json/);
  assert.ok(german({ items: { items: [item('dunkel', 'dunkel', { comparison: ['e-drop'] })] } }).gaps.some(gap => gap.kind === 'no-reference' && /golden:draft -- german dunkel/.test(gap.message)));
});

test('wrong data throws, naming the file', () => {
  assert.throws(() => german({ items: { items: [item('laufen', 'laufen', { conjugation: ['preterite-du'] })] } }), /items\.json: item "laufen": fills conjugation\.preterite-du, which the plan does not have/);
  assert.throws(() => german({ items: { items: [item('laufen', 'laufen', { conjugation: ['mixed'] }), item('laufen', 'laufen', { conjugation: ['mixed'] })] } }), /same id/);
  assert.throws(() => german({ items: { items: [item('joghurt', 'Joghurt', { conjugation: ['mixed'] })] } }), /which a noun such as Joghurt does not have/);
});

// Two entries of dwds.de/wb/Kiefer as the page serves them, trimmed after the pronunciation block.
const kiefer = ['Maskulinum', 'Femininum'].map((genus, index) => `<div class="dwdswb-ft-blocks-wrapper"><div class="dwdswb-ft-blocks"><div class="dwdswb-ft-block"><span class="dwdswb-ft-blocklabel serif italic">Form / Grammatik</span><b>Kiefer</b> &middot; <span class="dwdswb-ft-blocktext"><span>Substantiv (${genus})</span> · Genitiv Singular: <b>${['Kiefers', 'Kiefer'][index]}</b> · Nominativ Plural: <b>${['Kiefer', 'Kiefern'][index]}</b></span> · <a class="btn-dwds-flexion" href="/lemma/flexion/Kiefer%23${index + 1}">Deklinationstabelle</a></div><div class="dwdswb-ft-block dwdswb-ft-empty-blocklabel"><span class="dwdswb-ft-blocktext"><span style="padding-right:5px">Aussprache: </span></span></div></div></div>`).join('<p>…</p>');
const tree = (genitive, plural) => reference('noun', {
  article: [{ singular: ['die Kiefer'], plural: plural.map(form => `die ${form}`) }],
  declension: [{ Singular: { Nominativ: ['die Kiefer'], Genitiv: genitive.map(form => `der ${form}`) }, Plural: {} }]
});

test('the DWDS check reads each entry\'s grammar line and compares a sense with the entry of its gender', () => {
  const lines = grammarLines(kiefer);
  assert.deepEqual(lines, [
    'Form / Grammatik Kiefer · Substantiv (Maskulinum) · Genitiv Singular: Kiefers · Nominativ Plural: Kiefer · Deklinationstabelle',
    'Form / Grammatik Kiefer · Substantiv (Femininum) · Genitiv Singular: Kiefer · Nominativ Plural: Kiefern · Deklinationstabelle'
  ]);
  assert.deepEqual(disagreements('Kiefer#Baum', tree(['Kiefer'], ['Kiefern']), lines), []);
  assert.deepEqual(disagreements('Kiefer#Baum', tree(['Kiefers'], ['Kiefer']), lines).map(each => `${each.facet} ${each.cell}`), ['article plural', 'declension Singular|Genitiv']);
});

test('the DWDS check reads optional letters, reflexive verbs and the modal\'s substitute infinitive', () => {
  const gott = 'Form / Grammatik Gott · Substantiv (Maskulinum) · Genitiv Singular: Gott(e)s · Nominativ Plural: Götter · Deklinationstabelle';
  const god = genitive => reference('noun', { article: [{ singular: ['der Gott'], plural: ['die Götter'] }], declension: [{ Singular: { Genitiv: genitive } }] });
  assert.deepEqual(disagreements('Gott', god(['des Gotts', 'des Gottes']), [gott]), []);
  assert.match(disagreements('Gott', god(['des Gottes']), [gott])[0].note, /ours \["Gottes"\], DWDS \["Gottes","Gotts"\]/);
  const verb = (present, preterite, perfect) => reference('verb', { conjugation: [{ Präsens: { 'er/sie/es': [present] }, Präteritum: { 'er/sie/es': [preterite] }, Perfekt: { 'er/sie/es': [perfect] } }] });
  assert.deepEqual(disagreements('freuen', verb('freut sich', 'freute sich', 'hat sich gefreut'), ['Form / Grammatik freuen · Verb · freut , freute , hat gefreut · Konjugationstabelle']), []);
  assert.deepEqual(disagreements('wollen#Modalverb', verb('will', 'wollte', 'hat gewollt'), ['Form / Grammatik wollen · Verb · will , wollte , hat gewollt / wollen · Konjugationstabelle']), []);
  assert.deepEqual(disagreements('laufen', verb('läuft', 'lief', 'ist gelaufen'), ['Form / Grammatik laufen · Verb · läuft , lief , ist / hat gelaufen · Konjugationstabelle']).map(each => each.cell), ['Perfekt|er/sie/es']);
});

test('a dispute decides the disagreements in its cell, or in every cell it covers with *', () => {
  const perfect = { facet: 'conjugation', cell: 'Perfekt|er/sie/es', note: '' };
  assert.ok(decides({ facet: 'conjugation', cell: 'Perfekt|*' }, perfect));
  assert.ok(decides({ facet: 'conjugation', cell: '*' }, perfect));
  assert.ok(!decides({ facet: 'conjugation', cell: 'Präteritum|*' }, perfect));
  assert.ok(!decides({ facet: 'declension', cell: '*' }, perfect));
  assert.ok(!decides({ facet: 'conjugation', cell: 'Perfekt' }, perfect));
});

test('a plural left out, every given form right, is weak; a wrong form beside it still fails (owner, 2026-11-25)', () => {
  const singular = Object.values(joghurt)[0];
  const declension = (first, plurals) => table(['Singular', 'Plural'], Object.fromEntries(cases.map((kase, index) => [kase, [index ? singular[index] : first, plurals[index]]])));
  assert.equal(score([card('joghurt', 'noun', { declension: declension(singular[0], ['—', '—', '—', '—']) })], 'declension').verdict, 'weak');
  assert.equal(score([card('joghurt', 'noun', { declension: declension('die Joghurt', ['—', '—', '—', '—']) })], 'declension').verdict, 'fail');
  assert.equal(score([card('joghurt', 'noun', { declension: declension(singular[0], ['die Joghurts', 'der Joghurts', 'den Joghurt', 'die Joghurts']) })], 'declension').verdict, 'fail', 'a wrong plural is not a left-out one');
  const article = plural => score([card('joghurt', 'noun', { article: { singular: singular[0], ...(plural === undefined ? {} : { plural }) } })], 'article');
  assert.equal(article(undefined).verdict, 'weak');
  assert.equal(article('die Joghurts').verdict, 'pass');
});
