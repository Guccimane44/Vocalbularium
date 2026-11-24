// @ts-check
// Draws a module's simulated-capture slice (v0.17.0 step 1, docs/plans/v0.17.0/01-golden-set.md
// section 9) from the Leipzig Corpora Collection's REST API: for each draw, one
// word picked from a corpus at random, weighted by how often it occurs there
// (its frequency in the corpus's word list), and one of the corpus's sentences
// holding it, which becomes the item's Context. A pick that is not a word
// (numbers, punctuation) is drawn again; nothing else is filtered.
// The draw is fixed by its seed, but the API serves no snapshot, so every
// drawn sentence is stored in tests/golden/<module>/sample.json: the slice
// repeats from that file whatever the API serves later. Items not yet in
// items.json are added as part "sample", their core points to be labelled.
// Usage: npm run golden:sample -- german [--seed <n>] [--count <n>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { moduleSet } from './golden-sets.mjs';

const API = 'https://api.wortschatz-leipzig.de/ws';
const HEADERS = { 'user-agent': 'vocabularium-golden-sample/1.0 (golden set sampling script)' };
// The most frequent words of each corpus the pick is weighted over; the rest
// of a corpus's tokens are rarer than any of these.
const WORDS = 100000;
// News and Wikipedia corpora of the languages the API offers among German,
// English and Chinese: it serves no Chinese and no web corpus for these.
const CORPORA = /** @type {const} */ ({ German: ['deu_news_2012_1M', 'deu_wikipedia_2010_1M'], English: ['eng_news_2013_1M', 'eng_wikipedia_2012_1M'] });
const WORD = /^\p{L}[\p{L}\p{M}'’-]*$/u;

/** @param {string} path */
async function api(path) {
  for (let attempt = 1; ; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    // A sentence far into a frequent word's list takes the API a while.
    const response = await fetch(`${API}/${path}`, { headers: HEADERS, signal: AbortSignal.timeout(180000) }).catch(error => ({ ok: false, status: 0, error }));
    if (response.ok && 'json' in response) return response.json();
    if (response.status === 404) return null;
    if (attempt === 4 || (response.status >= 400 && response.status < 500)) throw new Error(`The Leipzig API answered ${response.status} for ${path}`);
  }
}

/** A seeded generator in [0, 1), the same sequence for the same seed (mulberry32). @param {number} seed */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { seed: { type: 'string', default: '20261124' }, count: { type: 'string', default: '30' } } });
const [module] = positionals;
if (module !== 'german') throw new Error('golden:sample knows German\'s corpora only: npm run golden:sample -- german [--seed <n>] [--count <n>]');
const folder = `tests/golden/${module}`;
const file = `${folder}/sample.json`;
const seed = Number(values.seed);
const count = Number(values.count);

/** @typedef {{ draw: number, language: string, corpus: string, word: string, frequency: number, sentence: { id: string, offset: number, of: number, text: string, url: string | null } }} Draw */
/** @type {{ note: string, seed: number, words: number, corpora: typeof CORPORA, draws: Draw[] }} */
const stored = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
if (stored && stored.seed !== seed) throw new Error(`${file} holds the draw of seed ${stored.seed}; delete it to draw with seed ${seed}.`);
/** @type {Draw[]} */
const draws = stored?.draws ?? [];

const save = () => writeFileSync(file, JSON.stringify({ note: `The simulated-capture slice as drawn by npm run golden:sample: each draw's word, weighted by its frequency among the corpus's first ${WORDS} words, and one of its sentences. The API serves no snapshot, so this file, not the seed alone, repeats the slice.`,
  seed, words: WORDS, corpora: CORPORA, draws: [...draws].sort((a, b) => a.draw - b.draw) }, null, 2) + '\n');
/** @type {Map<string, { words: { word: string, freq: number }[], total: number }>} */
const lists = new Map();
const languages = /** @type {(keyof typeof CORPORA)[]} */ (Object.keys(CORPORA));
for (let draw = 1; draw <= count; draw++) {
  if (draws.some(each => each.draw === draw)) continue;
  // Each draw has its own generator, so a draw repeats whatever came before it.
  const next = random(seed + draw * 7919);
  const language = languages[(draw - 1) % languages.length];
  const corpus = CORPORA[language][Math.floor((draw - 1) / languages.length) % CORPORA[language].length];
  if (!lists.has(corpus)) {
    const words = /** @type {{ word: string, freq: number }[]} */ (await api(`words/${corpus}/wordlist/?limit=${WORDS}`));
    lists.set(corpus, { words, total: words.reduce((sum, each) => sum + each.freq, 0) });
  }
  const list = /** @type {{ words: { word: string, freq: number }[], total: number }} */ (lists.get(corpus));
  let picked;
  do {
    let at = next() * list.total;
    picked = list.words.find(each => (at -= each.freq) < 0) ?? list.words[list.words.length - 1];
  } while (!WORD.test(picked.word));
  const { count: of } = await api(`sentences/${corpus}/sentences/${encodeURIComponent(picked.word)}?offset=0&limit=1`);
  // The count is of the word's occurrences, more than its sentences, so an
  // offset past the last sentence is drawn again.
  let found = null;
  let offset = 0;
  while (!found) {
    offset = Math.floor(next() * of);
    found = (await api(`sentences/${corpus}/sentences/${encodeURIComponent(picked.word)}?offset=${offset}&limit=1`))?.sentences?.[0] ?? null;
  }
  draws.push({ draw, language, corpus, word: picked.word, frequency: picked.freq,
    sentence: { id: found.id, offset, of, text: found.sentence, url: found.source?.url ?? null } });
  save();
  console.log(`${draw}: ${picked.word} in ${corpus} sentence ${found.id}.`);
}

const raw = JSON.parse(readFileSync(`${folder}/items.json`, 'utf8'));
const known = new Set(raw.items.map((/** @type {{ id: string }} */ item) => item.id));
let added = 0;
for (const { draw, language, corpus, word, sentence } of draws.slice(0, count)) {
  const id = `sample-${String(draw).padStart(2, '0')}`;
  if (known.has(id)) continue;
  // Two in five go to the test half.
  const split = [2, 4].includes(draw % 5) ? 'test' : 'dev';
  raw.items.push({ id, key: word, context: sentence.text, why: `Simulated capture: ${word}, drawn with seed ${seed} as draw ${draw} from Leipzig ${corpus}, sentence ${sentence.id}.`,
    part: 'sample', split, fills: { core: language === 'German' ? ['kind'] : ['kind', 'source-language'] }, expect: { kind: 'word' } });
  added++;
}
// Parsing the result proves the new items fit the plan before they are written.
moduleSet(module, { items: raw, references: JSON.parse(readFileSync(`${folder}/references.json`, 'utf8')) });
writeFileSync(`${folder}/items.json`, JSON.stringify(raw, null, 2) + '\n');
console.log(`${draws.length} draws in ${file}; ${added} items added to ${folder}/items.json.`);
