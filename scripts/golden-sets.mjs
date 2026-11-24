// @ts-check
// Every reader of tests/golden goes through this file: the runners
// (golden-set.mjs, silver-set.mjs), the judge, the scorer, the coverage report,
// the draft lever and the catalog test. Two kinds of set live there:
//  - a file, tests/golden/<name>.json, naming its modules or a family;
//  - a module's folder, tests/golden/<module>/ (items.json, references.json),
//    for each module in GOLDEN_PLANS, checked against its failure points.
// A module with a folder is run only from its folder: a file that names it,
// directly or through its family, leaves it out.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { contentModule } from '@vocabularium/domain/catalog';
import { GOLDEN_PLANS } from '@vocabularium/domain/golden';
import { parentsIn } from '@vocabularium/domain/parents';

const GOLDEN = new URL('../tests/golden/', import.meta.url);
const MIN_ITEMS = 3;
const MIN_TEST = 1;
const BANDS = /** @type {const} */ (['common', 'middle', 'rare']);
const PARTS = ['knowledge', 'reading', 'sample'];
const SPLITS = ['dev', 'test'];
// What a card writes for a form a word does not have.
const NO_FORM = new Set(['', '—', '-', '–']);

/** @typedef {import('@vocabularium/domain/catalog').ContentModuleId} ModuleId */
/** @typedef {import('@vocabularium/domain/golden').Band} Band */
/** @typedef {import('@vocabularium/domain/golden').GoldenPlan} GoldenPlan */
/** @typedef {import('@vocabularium/domain/golden').CellShape} CellShape */
/** @typedef {{ name: string, modules: readonly string[], inputs: readonly any[] }} GoldenSet */

/**
 * Every set the runners run: the files first, then the module folders. `name`
 * is what a silver pick's `set` names: the file's stem or the folder's module.
 * @returns {GoldenSet[]}
 */
export function goldenSets() {
  const folders = /** @type {ModuleId[]} */ (Object.keys(GOLDEN_PLANS));
  const files = readdirSync(GOLDEN).filter(name => name.endsWith('.json')).sort().map(file => {
    const { modules, family, inputs } = JSON.parse(readFileSync(new URL(file, GOLDEN), 'utf8'));
    return { name: file.slice(0, -'.json'.length), modules: /** @type {string[]} */ (family ? parentsIn(family) : modules).filter(id => !folders.includes(/** @type {ModuleId} */ (id))), inputs };
  });
  const owned = folders.sort().map(module => ({ name: module, modules: [module], inputs: moduleSet(module).items.filter(item => !item.retired)
    .map(({ id, key, context, why, expect }) => ({ id, key, ...(context ? { context } : {}), why, expect })) }));
  return [...files.filter(set => set.modules.length), ...owned];
}

/**
 * @typedef {{ id: string, what: string, abstain: boolean, cells: readonly string[] | null, noWordsIn: Readonly<Partial<Record<Band, string>>> }} Point
 * @typedef {{ facet: string, scoring: 'judge' | 'reference', shape: CellShape | null, perBand: boolean, points: readonly Point[] }} Facet
 * @typedef {{ id: string, key: string, context?: string, why: string, part: 'knowledge' | 'reading' | 'sample', split: 'dev' | 'test',
 *   word: string | null, candidates: readonly string[], frequency: number | null, band: Band | null,
 *   fills: Readonly<Record<string, readonly string[]>>, expect: Record<string, unknown>, retired: { on: string, why: string } | null }} Item
 * @typedef {ReadonlyMap<string, readonly string[]>} Alternative  one whole right answer: each cell's accepted forms; [] accepts no form
 * @typedef {'none' | readonly Alternative[]} Answer  'none': the word has no such facet
 * @typedef {{ pos: string, source: unknown, checked: string | null, disputes: readonly { facet: string, cell: string, decided: string | null }[],
 *   answers: ReadonlyMap<string, Answer> }} Reference
 * @typedef {{ kind: string, message: string }} Gap  what the set lacks, with its fix
 * @typedef {{ facet: string, point: Point, items: readonly Item[] }} Coverage
 */

/**
 * A module's folder, parsed against its plan and the catalog. Data that is
 * wrong throws, naming the file and the fix; data that is missing is a gap.
 * `raw` stands in for the folder's two files.
 * @param {ModuleId} module
 * @param {{ items: unknown, references: unknown }} [raw]
 */
export function moduleSet(module, raw) {
  const plan = GOLDEN_PLANS[module];
  if (!plan) throw new Error(`${module} has no golden plan: add packages/domain/src/catalog/<family>/${module}/golden/plan.ts and list it in GOLDEN_PLANS.`);
  const folder = `tests/golden/${module}`;
  const read = /** @param {string} file */ file => existsSync(new URL(`${module}/${file}`, GOLDEN)) ? JSON.parse(readFileSync(new URL(`${module}/${file}`, GOLDEN), 'utf8')) : null;
  const { items: rawItems, references: rawReferences } = raw ?? { items: read('items.json'), references: read('references.json') };
  const catalog = contentModule(module);
  const facets = facetsOf(plan);
  const byFacet = new Map(facets.map(facet => [facet.facet, facet]));
  /** @param {string} pos @param {string} facet */
  const selects = (pos, facet) => catalog.facets.find(each => each.id === facet)?.when?.({ gramRole: pos }) ?? false;
  const closed = facets.filter(facet => facet.scoring === 'reference');
  const references = parseReferences(`${folder}/references.json`, rawReferences, byFacet);
  const items = parseItems(`${folder}/items.json`, rawItems, byFacet, plan);
  const live = items.filter(item => !item.retired);

  for (const item of live) for (const [facet, points] of Object.entries(item.fills)) {
    const plain = byFacet.get(facet);
    if (plain?.scoring !== 'reference') continue;
    const words = item.word ? [item.word] : item.candidates;
    if (!words.length) throw new Error(`${folder}/items.json: item "${item.id}" fills the closed facet ${facet} but names no word or candidates.`);
    for (const word of words) {
      const reference = references.get(word);
      if (!reference) continue;
      if (!selects(reference.pos, facet)) throw new Error(`${folder}/items.json: item "${item.id}" fills ${facet}, which a ${reference.pos} such as ${word} does not have.`);
      const answer = reference.answers.get(facet);
      for (const point of plain.points.filter(each => each.abstain && points.includes(each.id))) {
        if (answer && answer !== 'none' && !answer.some(alternative => [...alternative].some(([cell, forms]) => !forms.length && matches(point.cells ?? [], cell)))) {
          throw new Error(`${folder}/references.json: ${word} is on the abstention point ${facet}.${point.id} but its ${facet} has a form in every cell; write "none" or [] where it has none.`);
        }
      }
    }
  }

  /** @type {Coverage[]} */
  const coverage = facets.flatMap(facet => facet.points.map(point => ({ facet: facet.facet, point, items: live.filter(item => item.fills[facet.facet]?.includes(point.id)) })));
  /** @type {Gap[]} */
  const gaps = [];
  const fill = `add items to ${folder}/items.json`;
  if (!rawItems) gaps.push({ kind: 'no-file', message: `${folder}/items.json is missing; create it as { "items": [] }.` });
  if (!rawReferences) gaps.push({ kind: 'no-file', message: `${folder}/references.json is missing; create it as { "words": {} }.` });
  for (const { facet, point, items: filling } of coverage) {
    const where = `${facet}.${point.id}`;
    if (filling.length < MIN_ITEMS) gaps.push({ kind: 'too-few', message: `${where} has ${filling.length} of ${MIN_ITEMS} items; ${fill} that fill it.` });
    if (filling.filter(item => item.split === 'test').length < MIN_TEST) gaps.push({ kind: 'no-test', message: `${where} has no item in the test split; ${fill} with "split": "test".` });
    if (byFacet.get(facet)?.perBand) for (const band of BANDS) {
      if (!point.noWordsIn[band] && !filling.some(item => item.band === band)) gaps.push({ kind: 'band', message: `${where} has no ${band} item; ${fill}, or say why it has none in "noWordsIn" in the plan.` });
    }
  }
  const draft = /** @param {string} word */ word => `run npm run golden:draft -- ${module} ${word.split('#')[0]}`;
  for (const item of live.filter(each => each.part === 'knowledge' && each.frequency === null)) {
    gaps.push({ kind: 'no-frequency', message: `item "${item.id}" has no frequency; ${draft(item.word ?? item.key)}.` });
  }
  const named = new Set(live.flatMap(item => Object.keys(item.fills).some(facet => byFacet.get(facet)?.scoring === 'reference') ? (item.word ? [item.word] : item.candidates) : []));
  for (const word of [...named].sort()) {
    const reference = references.get(word);
    if (!reference) { gaps.push({ kind: 'no-reference', message: `${word} has no reference; ${draft(word)}.` }); continue; }
    for (const facet of closed.filter(each => selects(reference.pos, each.facet) && !reference.answers.has(each.facet))) {
      gaps.push({ kind: 'no-reference', message: `${word} has no ${facet.facet} reference; ${draft(word)}, or enter it by hand.` });
    }
    if (reference.checked === null) gaps.push({ kind: 'unchecked', message: `${word} is a draft; check it against DWDS and set "checked" in ${folder}/references.json.` });
    for (const dispute of reference.disputes.filter(each => each.decided === null)) {
      gaps.push({ kind: 'undecided', message: `${word} ${dispute.facet} ${dispute.cell}: the owner decides the dispute in ${folder}/references.json.` });
    }
  }

  return {
    module, facets, items, references, coverage, gaps,
    /** @param {{ results: readonly any[] }} run */
    score: run => scoreRun({ module, closed, items, references, selects }, run)
  };
}

/** @param {GoldenPlan} plan @returns {Facet[]} */
function facetsOf(plan) {
  return Object.entries(plan.facets).map(([facet, value]) => ({
    facet, scoring: value.scoring, shape: value.scoring === 'reference' ? value.shape : null, perBand: Boolean(value.perBand),
    points: value.points.map(point => ({ id: point.id, what: point.what, abstain: Boolean(point.abstain), cells: 'cells' in point ? point.cells : null, noWordsIn: point.noWordsIn ?? {} }))
  }));
}

/** @param {string} file @param {unknown} raw @param {Map<string, Facet>} facets @param {GoldenPlan} plan @returns {Item[]} */
function parseItems(file, raw, facets, plan) {
  if (raw === null || raw === undefined) return [];
  const list = /** @type {any} */ (raw).items;
  if (!Array.isArray(list)) throw new Error(`${file}: expected { "items": [...] }.`);
  const ids = new Set();
  return list.map((item, index) => {
    const where = `${file}: item "${item?.id ?? index}"`;
    const wrong = /** @param {string} what @returns {never} */ what => { throw new Error(`${where}: ${what}.`); };
    if (typeof item?.id !== 'string' || !item.id) wrong('needs an "id"');
    if (ids.has(item.id)) wrong('has the same id as another item');
    ids.add(item.id);
    if (typeof item.key !== 'string' || !item.key.trim() || typeof item.why !== 'string' || !item.why.trim()) wrong('needs a "key" and a "why"');
    if (item.context !== undefined && typeof item.context !== 'string') wrong('"context" is text');
    if (!PARTS.includes(item.part)) wrong(`"part" is one of ${PARTS.join(', ')}`);
    if (!SPLITS.includes(item.split)) wrong(`"split" is one of ${SPLITS.join(', ')}`);
    if (typeof item.expect !== 'object' || item.expect === null) wrong('needs "expect", the flags its card must get');
    const knowledge = item.part === 'knowledge';
    if (knowledge && (typeof item.word !== 'string' || !item.word)) wrong('is a German key and names its "word"');
    if (!knowledge && item.word !== undefined) wrong('is a foreign key and names "candidates", not a "word"');
    const candidates = item.candidates ?? [];
    if (!Array.isArray(candidates) || candidates.some(word => typeof word !== 'string') || (knowledge && item.candidates !== undefined)) wrong('"candidates" lists a foreign key\'s German words');
    if (item.frequency !== undefined && !(knowledge && Number.isInteger(item.frequency) && item.frequency >= 0 && item.frequency <= 6)) wrong('"frequency" is a German key\'s DWDS frequency class, 0 to 6');
    if (typeof item.fills !== 'object' || item.fills === null || !Object.keys(item.fills).length) wrong('needs "fills", the failure points it fills by facet');
    for (const [facet, points] of Object.entries(item.fills)) {
      const known = facets.get(facet);
      if (!known) wrong(`fills ${facet}, which the plan does not have`);
      if (!Array.isArray(points) || !points.length) wrong(`fills no point of ${facet}`);
      for (const point of points) if (!known?.points.some(each => each.id === point)) wrong(`fills ${facet}.${point}, which the plan does not have`);
    }
    if (item.retired !== undefined && (typeof item.retired?.on !== 'string' || typeof item.retired?.why !== 'string')) wrong('"retired" is { "on": date, "why": text }');
    if (item.retired && item.split === 'test') wrong('is in the test split, which is never retired');
    const frequency = knowledge ? item.frequency ?? null : null;
    const band = frequency === null ? null : frequency >= plan.bands.common ? 'common' : frequency >= plan.bands.middle ? 'middle' : 'rare';
    return { id: item.id, key: item.key, ...(item.context ? { context: item.context } : {}), why: item.why, part: item.part, split: item.split,
      word: knowledge ? item.word : null, candidates, frequency, band, fills: item.fills, expect: item.expect, retired: item.retired ?? null };
  });
}

/** @param {string} file @param {unknown} raw @param {Map<string, Facet>} facets @returns {Map<string, Reference>} */
function parseReferences(file, raw, facets) {
  if (raw === null || raw === undefined) return new Map();
  const words = /** @type {any} */ (raw).words;
  if (typeof words !== 'object' || words === null || Array.isArray(words)) throw new Error(`${file}: expected { "words": { ... } }.`);
  const OWN = new Set(['pos', 'source', 'checked', 'disputes']);
  return new Map(Object.entries(words).map(([word, entry]) => {
    const wrong = /** @param {string} what @returns {never} */ what => { throw new Error(`${file}: ${word}: ${what}.`); };
    if (typeof entry?.pos !== 'string') wrong('needs "pos", its part of speech');
    if (entry.source === undefined) wrong('needs "source"');
    if (entry.checked !== null && typeof entry.checked !== 'string') wrong('"checked" names what it was checked against, or is null while a draft');
    const disputes = entry.disputes ?? [];
    if (!Array.isArray(disputes) || disputes.some(each => typeof each?.facet !== 'string' || typeof each?.cell !== 'string' || (each.decided !== null && typeof each.decided !== 'string'))) {
      wrong('"disputes" are { "facet", "cell", ..., "decided": text or null }');
    }
    /** @type {Map<string, Answer>} */
    const answers = new Map();
    for (const [facet, answer] of Object.entries(entry).filter(([field]) => !OWN.has(field))) {
      const shape = facets.get(facet)?.shape;
      if (!shape) wrong(`${facet} is not a closed facet of the plan`);
      if (answer === 'none') { answers.set(facet, 'none'); continue; }
      if (!Array.isArray(answer) || !answer.length) wrong(`${facet} is "none" or a list of alternatives`);
      answers.set(facet, answer.map((/** @type {unknown} */ alternative) => cellsOfReference(alternative, /** @type {CellShape} */ (shape), wrong)));
    }
    return [word, { pos: entry.pos.toLowerCase(), source: entry.source, checked: entry.checked ?? null, disputes, answers }];
  }));
}

/** A reference alternative in its facet's cell structure, as flat cells. @param {any} alternative @param {CellShape} shape @param {(what: string) => never} wrong @returns {Alternative} */
function cellsOfReference(alternative, shape, wrong) {
  /** @param {unknown} forms */
  const formsOf = forms => Array.isArray(forms) && forms.every(form => typeof form === 'string') ? forms.map(form => shape.kind === 'set' ? setForm(form) : normalise(form)) : wrong('each cell is a list of accepted forms');
  if (typeof alternative !== 'object' || alternative === null || Array.isArray(alternative)) wrong('an alternative is an object of cells');
  if (shape.kind !== 'table') return new Map(Object.entries(alternative).map(([cell, forms]) => [cell, formsOf(forms)]));
  return new Map(Object.entries(alternative).flatMap(([column, rows]) => typeof rows === 'object' && rows !== null && !Array.isArray(rows)
    ? Object.entries(rows).map(([row, forms]) => [`${label(column)}|${label(row)}`, formsOf(forms)])
    : wrong('a table alternative is { column: { row: forms } }')));
}

/** @param {string} text */
const normalise = text => text.normalize('NFC').replace(/\s+/g, ' ').trim();
// "er, sie, es" and "er / sie / es" are the same row.
/** @param {string} text */
const label = text => normalise(text).replace(/\s*[,/]\s*/g, '/');
/** @param {string} text */
const setForm = text => normalise(text).split(/\s*,\s*/).filter(Boolean).sort().join(', ');

/** @param {readonly string[]} globs @param {string} cell */
function matches(globs, cell) {
  return globs.some(glob => new RegExp(`^${glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(cell));
}

/**
 * The forms one card cell writes: "der/das Joghurt" and "hat oder ist
 * geschwommen" are two each, the shared word written once, and "ritt(e)st"
 * is rittst and rittest.
 * @param {string} text
 */
function partsOf(text) {
  return spelledOut(normalise(text)).flatMap(written => {
    const optional = /^(.*?\p{L})\((\p{L}+)\)(.*)$/u.exec(written);
    return optional ? [`${optional[1]}${optional[3]}`, `${optional[1]}${optional[2]}${optional[3]}`] : [written];
  });
}

/** @param {string} text */
function spelledOut(text) {
  const parts = text.split(/\s*\/\s*|\s+oder\s+/).filter(Boolean);
  if (parts.length < 2) return parts;
  const single = /** @param {string} part */ part => !part.includes(' ');
  if (parts.slice(0, -1).every(single)) {
    const tail = parts.at(-1)?.split(' ').slice(1).join(' ');
    return tail ? [...parts.slice(0, -1).map(part => `${part} ${tail}`), /** @type {string} */ (parts.at(-1))] : parts;
  }
  if (parts.slice(1).every(single)) {
    const head = parts[0].split(' ').slice(0, -1).join(' ');
    return head ? [parts[0], ...parts.slice(1).map(part => `${head} ${part}`)] : parts;
  }
  return parts;
}

/**
 * A card's value for a closed facet as cells, keyed as its references are.
 * `bare` drops what an adjective's cell writes before its form ("der kleine",
 * "ein kleiner"): the prompt does not say whether to write one, and the cells measure endings.
 * @param {any} value @param {CellShape} shape @param {boolean} [bare] @returns {Map<string, string>}
 */
function cellsOfCard(value, shape, bare = false) {
  if (shape.kind === 'set') return new Map([[shape.of, setForm([...new Set((Array.isArray(value) ? value : []).map(each => String(each?.[shape.of] ?? '')))].join(', '))]]);
  if (shape.kind === 'fields') return new Map(Object.entries(value ?? {}).filter(([, form]) => typeof form === 'string').map(([field, form]) => [field, normalise(form)]));
  const columns = Array.isArray(value?.columns) ? value.columns.map(String) : [];
  return new Map((Array.isArray(value?.rows) ? value.rows : []).flatMap((/** @type {any} */ row) =>
    columns.map((/** @type {string} */ column, /** @type {number} */ index) => {
      const cell = normalise(String(row?.cells?.[index] ?? ''));
      return [`${label(column)}|${label(String(row?.label ?? ''))}`, bare ? cell.split(/\s*\/\s*/).map(part => part.split(' ').at(-1)).join('/') : cell];
    })));
}

/**
 * @typedef {{ cell: string, got: string | null, accepted: readonly string[] }} Fault
 *   a wrong cell, against the closest alternative; `got` null when the card has no such cell
 * @typedef {{ verdict: 'pass' } | { verdict: 'fail', faults: readonly Fault[] } | { verdict: 'fail', whole: 'left-out' | 'invented' }} Comparison
 */

/**
 * The one comparison every closed facet uses. A card passes when one
 * alternative accepts a form in each of its cells and every form the card
 * writes is accepted by some alternative in that cell, so der in one row and
 * das in the next fails even though each alternative alone passes.
 * @param {Map<string, string>} cells @param {readonly Alternative[]} alternatives @returns {Comparison}
 */
function compareCells(cells, alternatives) {
  const faultsAgainst = /** @param {Alternative} alternative */ alternative => [...alternative].flatMap(([cell, accepted]) => {
    const got = cells.get(cell);
    if (!accepted.length) return got === undefined || NO_FORM.has(got) ? [] : [{ cell, got, accepted }];
    if (got === undefined || NO_FORM.has(got)) return [{ cell, got: got ?? null, accepted }];
    const parts = partsOf(got);
    const anywhere = alternatives.flatMap(other => other.get(cell) ?? []);
    return parts.some(part => accepted.includes(part)) && parts.every(part => anywhere.includes(part)) ? [] : [{ cell, got, accepted }];
  });
  const closest = alternatives.map(faultsAgainst).sort((a, b) => a.length - b.length)[0];
  return closest.length ? { verdict: 'fail', faults: closest } : { verdict: 'pass' };
}

/**
 * Which of a foreign key's German words the card chose: the word its grammar
 * facets describe, the meaning in this Context or else the first, read after
 * an optional article.
 * @param {any} core @param {readonly string[]} candidates
 */
function chosenWord(core, candidates) {
  const meaning = normalise(String(core?.contextual || core?.meanings?.[0] || '')).replace(/^(der|die|das|sich)\s+/i, '');
  return candidates.find(word => new RegExp(`^${word.split('#')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(meaning)) ?? null;
}

/**
 * @typedef {{ id: string, sample: number, facet: string, word: string | null, band: Band | null, split: 'dev' | 'test' }
 *   & ({ verdict: 'pass' | 'fail', comparison: Comparison, points: readonly { point: string, verdict: 'pass' | 'fail' }[] }
 *   | { verdict: 'unscored', why: 'error' | 'routing' | 'other-word' | 'no-reference' })} Score
 * @typedef {{ facet: string, point: string | null, band: Band | null, split: 'dev' | 'test', pass: number, fail: number, unscored: number }} Row
 */

/**
 * A run's closed facets against the references as they are now, so a fixed
 * reference rescores old runs. Every closed facet the card's word has is
 * scored; the item's `fills` decide which points each verdict counts for.
 * @param {{ module: string, closed: readonly Facet[], items: readonly Item[], references: ReadonlyMap<string, Reference>, selects: (pos: string, facet: string) => boolean }} set
 * @param {{ results: readonly any[] }} run
 */
function scoreRun({ module, closed, items, references, selects }, run) {
  const byId = new Map(items.map(item => [item.id, item]));
  const ours = run.results.filter(result => result.parent === module && result.id);
  const unknown = ours.filter(result => !byId.has(result.id)).map(result => result.id);
  /** @type {Score[]} */
  const scores = ours.filter(result => byId.has(result.id)).flatMap(result => {
    const item = /** @type {Item} */ (byId.get(result.id));
    if (!item.word && !item.candidates.length) return [];
    const base = { id: item.id, sample: result.sample, band: item.band, split: item.split };
    const word = item.word ?? (item.candidates.length && !result.error ? chosenWord(result.json?.core, item.candidates) : null);
    const reference = word ? references.get(word) : null;
    const scored = reference ? closed.filter(facet => selects(reference.pos, facet.facet)) : closed.filter(facet => item.fills[facet.facet]);
    return scored.map(facet => {
      const row = { ...base, facet: facet.facet, word };
      /** @param {'error' | 'routing' | 'other-word' | 'no-reference'} why @returns {Score} */
      const unscored = why => ({ ...row, verdict: 'unscored', why });
      if (result.error) return unscored('error');
      if (!word) return unscored('other-word');
      const answer = reference?.answers.get(facet.facet);
      if (!answer) return unscored('no-reference');
      const value = result.json?.facets?.[facet.facet];
      const shown = (result.facets ?? []).includes(facet.facet) && value != null;
      /** @type {Comparison} */
      let comparison;
      if (answer === 'none') comparison = shown ? { verdict: 'fail', whole: 'invented' } : { verdict: 'pass' };
      else if (!shown) {
        if (String(result.json?.core?.gramRole ?? '').toLowerCase() !== reference?.pos) return unscored('routing');
        comparison = { verdict: 'fail', whole: 'left-out' };
      } else comparison = compareCells(cellsOfCard(value, /** @type {CellShape} */ (facet.shape), reference?.pos === 'adjective'), answer);
      const points = (item.fills[facet.facet] ?? []).map(id => {
        const point = /** @type {Point} */ (facet.points.find(each => each.id === id));
        const failed = comparison.verdict === 'fail' && ('whole' in comparison || comparison.faults.some(fault => matches(point.cells ?? [], fault.cell)));
        return { point: id, verdict: /** @type {'pass' | 'fail'} */ (failed ? 'fail' : 'pass') };
      });
      return { ...row, verdict: comparison.verdict, comparison, points };
    });
  });
  /** @type {Map<string, Row>} */
  const rows = new Map();
  /** @param {Score} score @param {string | null} point @param {'pass' | 'fail' | 'unscored'} verdict */
  const count = (score, point, verdict) => {
    const key = [score.facet, point, score.band, score.split].join('|');
    const row = rows.get(key) ?? { facet: score.facet, point, band: score.band, split: score.split, pass: 0, fail: 0, unscored: 0 };
    row[verdict]++;
    rows.set(key, row);
  };
  for (const score of scores) {
    count(score, null, score.verdict);
    if (score.verdict === 'unscored') for (const point of byId.get(score.id)?.fills[score.facet] ?? []) count(score, point, 'unscored');
    else for (const point of score.points) count(score, point.point, point.verdict);
  }
  return { scores, rows: [...rows.values()], unknown };
}
