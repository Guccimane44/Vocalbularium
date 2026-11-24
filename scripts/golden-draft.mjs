// @ts-check
// Drafts German reference answers from de.wiktionary: the word's page and its
// Flexion page at their current revision, with the inflection templates
// expanded by Wiktionary itself (action=expandtemplates), so no local engine
// produces the forms the failure points measure. Writes each word not yet in
// references.json as a draft ("checked": null), never touching a stored one,
// fills a knowledge item's missing DWDS frequency class, and prints what needs
// a decision. --diff compares stored references with Wiktionary today.
// --check compares their key cells with DWDS's grammar line, prints each
// disagreement no dispute decides, and fails if one remains; it writes nothing.
// Usage: npm run golden:draft -- german [words…] [--diff | --check] [--folder <dir>]
//   With no words: every word an item names that has no reference yet
//   (with --diff or --check, every stored reference).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { moduleSet } from './golden-sets.mjs';
import { decides, disagreements, grammarLines } from './golden-dwds.mjs';

const WIKTIONARY = 'https://de.wiktionary.org/w/api.php';
const DWDS = 'https://www.dwds.de/';
const HEADERS = { 'user-agent': 'vocabularium-golden-draft/1.0 (reference drafting script)' };
const POS = /** @type {const} */ ({ Substantiv: 'noun', Verb: 'verb', Adjektiv: 'adjective', Präposition: 'preposition' });
const CASES = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ'];
const PERSONS = /** @type {const} */ ({ '1. Person Singular': 'ich', '2. Person Singular': 'du', '3. Person Singular': 'er/sie/es', '1. Person Plural': 'wir', '2. Person Plural': 'ihr', '3. Person Plural': 'sie/Sie' });
const TENSES = ['Präsens', 'Präteritum', 'Perfekt'];
const DECLENSIONS = /** @type {const} */ ({ 'Starke Deklination': 'stark', 'Schwache Deklination': 'schwach', 'Gemischte Deklination': 'gemischt' });
const GENDERS = ['Maskulinum', 'Femininum', 'Neutrum', 'Plural'];

/** @typedef {Record<string, Record<string, string[]>> | Record<string, string[]>} Alternative */
/** @typedef {{ pos: string, source: { page: string, revision: number, calls: string[] }, checked: null, disputes: [], [facet: string]: unknown }} Draft */

const pause = (/** @type {number} */ ms) => new Promise(resolve => setTimeout(resolve, ms));

/** A request that waits and tries again while the server answers 429. @param {string} url @param {RequestInit} init @returns {Promise<Response>} */
async function request(url, init = {}, attempt = 1) {
  const response = await fetch(url, { ...init, headers: HEADERS });
  if (response.status === 429 && attempt < 5) {
    await pause(1000 * (Number(response.headers.get('retry-after')) || 5 * attempt));
    return request(url, init, attempt + 1);
  }
  return response;
}

/** @param {Record<string, string>} params */
async function wiktionary(params) {
  const response = await request(WIKTIONARY, { method: 'POST', body: new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params }) });
  if (!response.ok) throw new Error(`de.wiktionary answered ${response.status}`);
  return response.json();
}

/** @param {string} title @returns {Promise<{ title: string, revision: number, text: string } | null>} */
async function page(title) {
  const { query } = await wiktionary({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', titles: title });
  const found = query.pages[0];
  return found?.revisions ? { title: found.title, revision: found.revisions[0].revid, text: found.revisions[0].slots.main.content } : null;
}

/** @param {string} call @param {string} title @returns {Promise<string>} */
async function expand(call, title) {
  return (await wiktionary({ action: 'expandtemplates', prop: 'wikitext', text: call, title })).expandtemplates.wikitext;
}

/** @param {string} word @returns {Promise<number>} */
async function frequencyClass(word) {
  const response = await request(`${DWDS}api/frequency/?q=${encodeURIComponent(word)}`);
  if (!response.ok) throw new Error(`DWDS answered ${response.status} for ${word}`);
  return (await response.json()).frequency;
}

/** The grammar lines of a lemma's DWDS entry page, none if it has no page. @param {string} lemma @returns {Promise<string[]>} */
async function dwdsGrammar(lemma) {
  const response = await request(`${DWDS}wb/${encodeURIComponent(lemma)}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`DWDS answered ${response.status} for ${lemma}`);
  return grammarLines(await response.text());
}

/** The whole template call starting at `start`, braces balanced. @param {string} text @param {number} start */
function callAt(text, start) {
  let depth = 0;
  for (let index = start; index < text.length - 1; index++) {
    if (text.startsWith('{{', index)) { depth++; index++; }
    else if (text.startsWith('}}', index)) { depth--; index++; if (!depth) return text.slice(start, index + 1); }
  }
  throw new Error(`An unclosed template at ${text.slice(start, start + 40)}`);
}
/** @param {string} text @param {string} name */
const callsOf = (text, name) => [...text.matchAll(new RegExp(`\\{\\{${name}\\s*[|\\n}]`, 'g'))].map(match => callAt(text, /** @type {number} */ (match.index)));
/** A template call's named parameters. @param {string} call */
function paramsOf(call) {
  /** @type {Record<string, string>} */
  const params = {};
  for (const line of call.slice(2, -2).split(/\n\|/).slice(1)) {
    const at = line.indexOf('=');
    if (at > 0) params[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return params;
}

/** A cell's forms, markup removed, and apart those Wiktionary sets in italics as uncommon (veraltet, selten). @param {string} raw */
function clean(raw) {
  const text = raw.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''/g, '').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)).replace('\u00a0', ' '));
  const lines = text.split('\n').map(line => ({ italic: /''[^']/.test(line), form: line.replace(/''/g, '').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim() })).filter(line => line.form);
  return { uncommon: lines.filter(line => line.italic).map(line => line.form), forms: lines.filter(line => !line.italic).map(line => line.form) };
}

/**
 * Every wikitable in expanded wikitext, as rows of cells.
 * @param {string} text @returns {{ header: boolean, raw: string }[][][]}
 */
function tables(text) {
  /** @type {{ header: boolean, raw: string }[][][]} */
  const found = [];
  /** @type {{ header: boolean, raw: string }[][] | null} */
  let table = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('{|')) { table = [[]]; continue; }
    if (!table) continue;
    if (line.startsWith('|}')) { found.push(table.filter(row => row.length)); table = null; continue; }
    if (line.startsWith('|-')) { table.push([]); continue; }
    const header = line.startsWith('!');
    if (!header && !line.startsWith('|')) continue;
    for (const part of line.slice(1).split(header ? /!!|\|\|/ : /\|\|/)) {
      // "attributes | content", where the bar is outside any link.
      const bar = part.replace(/\[\[[^\]]*\]\]/g, link => '_'.repeat(link.length)).indexOf('|');
      table[table.length - 1].push({ header, raw: bar >= 0 && /=/.test(part.slice(0, bar)) ? part.slice(bar + 1) : part });
    }
  }
  return found;
}

/**
 * The German sections of a page with a part of speech the closed facets
 * describe, each with its text.
 * @param {string} text
 */
function sections(text) {
  const german = text.split(/\n(?=== [^=])/).filter(section => /^== .*\{\{Sprache\|Deutsch\}\}/.test(section)).join('\n');
  return german.split(/\n(?==== )/).map(section => ({ kind: /^=== \{\{Wortart\|([^|}]+)\|Deutsch\}\}/.exec(section)?.[1] ?? '', text: section }))
    .filter(section => section.kind in POS).map(section => ({ ...section, pos: POS[/** @type {keyof typeof POS} */ (section.kind)] }));
}

/**
 * A word's draft from Wiktionary today, or null with the reason in `decisions`.
 * "Bank#Sitz" picks the noun section whose text names "Sitz".
 * @param {string} word @returns {Promise<{ entry: Draft | null, decisions: string[] }>}
 */
async function draft(word) {
  const [lemma, sense] = word.split('#');
  const decisions = /** @type {string[]} */ ([]);
  const main = await page(lemma);
  if (!main) return { entry: null, decisions: [`${word}: de.wiktionary has no page ${lemma}; enter it by hand.`] };
  const found = sections(main.text).filter(section => !sense || section.text.toLowerCase().includes(sense.toLowerCase()));
  const kinds = [...new Set(found.map(section => section.pos))];
  if (!found.length) return { entry: null, decisions: [`${word}: no German noun, verb, adjective or preposition section${sense ? ` names "${sense}"` : ''}; enter it by hand.`] };
  if (kinds.length > 1 || found.length > 1) {
    return { entry: null, decisions: [`${word}: ${found.length} sections (${found.map(section => section.text.split('\n')[0].replace(/^=+\s*|\s*=+$/g, '')).join('; ')}); name one by its sense, such as ${lemma}#<a word of its meaning>.`] };
  }
  const [{ pos, text }] = found;
  /** @type {Draft} */
  const entry = { pos, source: { page: main.title, revision: main.revision, calls: [] }, checked: null, disputes: [] };
  if (pos === 'noun') Object.assign(entry, await noun(word, text, entry, decisions));
  if (pos === 'verb') Object.assign(entry, await verb(word, entry, decisions));
  if (pos === 'adjective') Object.assign(entry, await adjective(word, text, entry, decisions));
  if (pos === 'preposition') decisions.push(`${word}: Wiktionary has no case table; enter its "case" by hand from DWDS.`);
  return { entry, decisions };
}

/** @param {string} word @param {string} text @param {Draft} entry @param {string[]} decisions */
async function noun(word, text, entry, decisions) {
  const [call] = callsOf(text, 'Deutsch Substantiv Übersicht');
  if (!call) { decisions.push(`${word}: no Deutsch Substantiv Übersicht; enter it by hand.`); return {}; }
  entry.source.calls.push(call);
  const [rows] = tables(await expand(call, entry.source.page));
  const columns = rows[0].filter(cell => cell.header).slice(1).map(cell => clean(cell.raw).forms[0] ?? '');
  /** @param {string} column @param {string} kase */
  const forms = (column, kase) => {
    const row = rows.find(each => clean(each[0].raw).forms[0] === kase) ?? [];
    const cell = row.slice(1)[columns.indexOf(column)];
    const { uncommon, forms: written } = clean(cell?.raw ?? '');
    if (uncommon.length) decisions.push(`${word}: ${column} ${kase} has a form Wiktionary calls uncommon (${uncommon.join(', ')}); left out.`);
    return written.filter(form => form !== '—');
  };
  const singulars = columns.filter(column => column.startsWith('Singular'));
  const plurals = columns.filter(column => column.startsWith('Plural'));
  if (singulars.length > 1) decisions.push(`${word}: ${singulars.length} genders (${paramsOf(call)['Genus 1'] ? [1, 2, 3, 4].map(n => paramsOf(call)[`Genus ${n}`]).filter(Boolean).join(', ') : singulars.join(', ')}); drafted as alternatives, keep only those DWDS gives as standard.`);
  if (plurals.length > 1) decisions.push(`${word}: ${plurals.length} plurals, drafted as variants in each plural cell; drop any DWDS marks as not standard.`);
  const plural = /** @param {string} kase */ kase => [...new Set(plurals.flatMap(column => forms(column, kase)))];
  return {
    article: singulars.map(column => ({ singular: forms(column, 'Nominativ'), plural: plural('Nominativ') })),
    declension: singulars.map(column => ({
      Singular: Object.fromEntries(CASES.map(kase => [kase, forms(column, kase)])),
      Plural: Object.fromEntries(CASES.map(kase => [kase, plural(kase)]))
    }))
  };
}

/** @param {string} word @param {Draft} entry @param {string[]} decisions */
async function verb(word, entry, decisions) {
  const flexion = await page(`Flexion:${word.split('#')[0]}`);
  if (!flexion) { decisions.push(`${word}: no Flexion page; enter its conjugation by hand.`); return {}; }
  const calls = callsOf(flexion.text, 'Deutsch Verb [^|}\\n]*');
  if (calls.length > 1) decisions.push(`${word}: ${calls.length} conjugations (${calls.map(call => /Hilfsverb=(\w+)/.exec(call)?.[1] ?? '?').join(', ')}); keep a second only where DWDS gives both auxiliaries as standard for the plain sense.`);
  const alternatives = [];
  for (const call of calls) {
    entry.source.calls.push(call);
    const expanded = await expand(call, flexion.title);
    /** @type {Record<string, Record<string, string[]>>} */
    const table = {};
    let tense = '';
    for (const row of tables(expanded).flat()) {
      const first = clean(row[0]?.raw ?? '').forms[0] ?? '';
      if (row.length === 1 && /^[A-ZÄÖÜ]/.test(first)) { tense = first; continue; }
      const person = PERSONS[/** @type {keyof typeof PERSONS} */ (first)];
      if (!person || !TENSES.includes(tense) || table[tense]?.[person]) continue;
      const { uncommon, forms } = clean(row[1].raw);
      if (uncommon.length) decisions.push(`${word}: ${tense} ${person} has a form Wiktionary calls uncommon (${uncommon.join(', ')}); left out.`);
      (table[tense] ??= {})[person] = forms.map(form => form.replace(/^(ich|du|er\/sie\/es|wir|ihr|sie)\s+/, ''));
    }
    if (TENSES.some(each => Object.keys(table[each] ?? {}).length !== 6)) decisions.push(`${word}: ${call} did not yield all six persons in ${TENSES.join(', ')}; check the draft.`);
    alternatives.push(table);
  }
  return alternatives.length ? { conjugation: alternatives } : {};
}

/** @param {string} word @param {string} text @param {Draft} entry @param {string[]} decisions */
async function adjective(word, text, entry, decisions) {
  /** @type {Record<string, unknown>} */
  const answers = {};
  const [call] = callsOf(text, 'Deutsch Adjektiv Übersicht');
  if (call) {
    entry.source.calls.push(call);
    const params = paramsOf(call);
    const starred = Object.keys(params).filter(name => name.endsWith('*'));
    if (starred.length) decisions.push(`${word}: Wiktionary also gives ${starred.map(name => `${name.slice(0, -1)} ${params[name]}`).join(', ')}; left out, add any DWDS gives as standard.`);
    if (/\{\{Anmerkung/.test(text)) decisions.push(`${word}: its page has an Anmerkung; read it before keeping the comparison.`);
    const none = [params.Komparativ, params.Superlativ].some(form => !form || form === '—');
    answers.comparison = none ? 'none' : [{ positive: [params.Positiv], comparative: [params.Komparativ], superlative: [`am ${params.Superlativ}`] }];
  } else decisions.push(`${word}: no Deutsch Adjektiv Übersicht; enter its comparison by hand.`);
  const flexion = await page(`Flexion:${word.split('#')[0]}`);
  if (!flexion) { decisions.push(`${word}: no Flexion page; if it does not decline (lila, prima) write "declension": "none".`); return answers; }
  const [declension] = callsOf(flexion.text, 'Deklinationsseite Adjektiv');
  entry.source.calls.push(declension);
  /** @type {Record<string, Record<string, string[]>>} */
  const table = Object.fromEntries(GENDERS.map(gender => [gender, {}]));
  // The first table is the Positiv's; the Komparativ's and Superlativ's follow.
  let kind = '';
  for (const row of tables(await expand(declension, flexion.title))[0]) {
    const first = clean(row[0].raw).forms[0] ?? '';
    if (first in DECLENSIONS) kind = DECLENSIONS[/** @type {keyof typeof DECLENSIONS} */ (first)];
    if (!kind || !CASES.includes(first)) continue;
    // Each gender has an article column, then its form.
    const forms = row.slice(1).filter((_, index) => index % 2 === 1).map(cell => clean(cell.raw).forms);
    GENDERS.forEach((gender, index) => { table[gender][`${kind} ${first}`] = forms[index] ?? []; });
  }
  if (Object.keys(table.Plural).length !== 12) decisions.push(`${word}: ${declension} did not yield 12 rows; check the draft.`);
  answers.declension = [table];
  return answers;
}

/** @param {unknown} a @param {unknown} b @param {string} path @returns {string[]} */
function differences(a, b, path) {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => differences(/** @type {any} */ (a)[key], /** @type {any} */ (b)[key], `${path} ${key}`));
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.some(each => typeof each === 'object')) return a.flatMap((each, index) => differences(each, b[index], `${path} #${index + 1}`));
  return [`${path.trim()}: stored ${JSON.stringify(a) ?? 'nothing'}, Wiktionary today ${JSON.stringify(b) ?? 'nothing'}`];
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { diff: { type: 'boolean', default: false }, check: { type: 'boolean', default: false }, folder: { type: 'string' } } });
const [module, ...asked] = positionals;
if (module !== 'german') throw new Error('golden:draft knows German\'s sources only: npm run golden:draft -- german [words…] [--diff | --check] [--folder <dir>]');
const folder = values.folder ?? 'tests/golden/german';
const files = { items: `${folder}/items.json`, references: `${folder}/references.json` };
const raw = { items: JSON.parse(readFileSync(files.items, 'utf8')), references: JSON.parse(readFileSync(files.references, 'utf8')) };
const set = moduleSet(module, raw);
const named = [...new Set(set.items.flatMap(item => item.word ? [item.word] : item.candidates))];
const words = asked.length ? asked : values.diff || values.check ? Object.keys(raw.references.words) : named.filter(word => !(word in raw.references.words));
const decisions = /** @type {string[]} */ ([]);

if (values.check) {
  /** @type {Map<string, string[]>} */
  const pages = new Map();
  let undecided = 0;
  let decided = 0;
  for (const word of words) {
    const stored = raw.references.words[word];
    if (!stored) { console.log(`${word}: no stored reference.`); undecided++; continue; }
    const lemma = word.split('#')[0];
    if (!pages.has(lemma)) { pages.set(lemma, await dwdsGrammar(lemma)); await pause(300); }
    for (const disagreement of disagreements(word, stored, pages.get(lemma) ?? [])) {
      if ((stored.disputes ?? []).some((/** @type {{ facet: string, cell: string }} */ dispute) => decides(dispute, disagreement))) { decided++; continue; }
      console.log(`${word} ${disagreement.facet} ${disagreement.cell}: ${disagreement.note}`);
      undecided++;
    }
  }
  console.log(`\n${words.length} references against DWDS: ${undecided} disagreements no dispute decides, ${decided} decided by disputes. Prepositions are not compared.`);
  process.exit(undecided ? 1 : 0);
}

if (values.diff) {
  for (const word of words.filter(each => each in raw.references.words)) {
    const today = await draft(word);
    decisions.push(...today.decisions);
    const stored = raw.references.words[word];
    const facets = Object.keys({ ...today.entry ?? {}, ...stored }).filter(key => !['source', 'checked', 'disputes'].includes(key));
    const changed = facets.flatMap(facet => differences(stored[facet], today.entry?.[facet], `${word} ${facet}`));
    console.log(changed.length ? changed.join('\n') : `${word}: as Wiktionary today (revision ${today.entry?.source.revision ?? '?'}).`);
  }
} else {
  for (const word of words) {
    if (word in raw.references.words) { console.log(`${word}: already in ${files.references}; left as it is (--diff compares it).`); continue; }
    const { entry, decisions: own } = await draft(word);
    decisions.push(...own);
    if (entry) { raw.references.words[word] = entry; console.log(`${word}: drafted from ${entry.source.page} revision ${entry.source.revision}.`); }
  }
  const lemmas = new Set(words.map(word => word.split('#')[0]));
  let filled = 0;
  for (const item of raw.items.items.filter((/** @type {any} */ each) => each.part === 'knowledge' && each.frequency === undefined && (!asked.length || lemmas.has(each.word.split('#')[0])))) {
    item.frequency = await frequencyClass(item.word.split('#')[0]);
    filled++;
  }
  // Parsing the result again proves the draft fits the plan before it is written.
  moduleSet(module, raw);
  writeFileSync(files.references, JSON.stringify(raw.references, null, 2) + '\n');
  if (filled) writeFileSync(files.items, JSON.stringify(raw.items, null, 2) + '\n');
  console.log(`${filled} frequency classes filled from DWDS.`);
}
console.log(decisions.length ? `\nDecisions needed:\n${decisions.map(each => `- ${each}`).join('\n')}` : '\nNo decisions needed.');
