// @ts-check
// One report across several calibration runs of the same judge (v0.17.0 step 3).
// Opus does not give the same verdict every time, so a fail counts as missed
// only when most runs miss it; one that some runs miss is unsteady. Counts stay
// counts: a part with few fails shows little, and the report says so.
// Usage: npm run judge:report -- <.data/judge/…-calibration….json>...
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { calibrations } from './calibration.mjs';
import { moduleSet } from './golden-sets.mjs';

/** @typedef {import('./calibration.mjs').Card} Card */
/** @typedef {{ id: string, module?: string, verdict: string, scores?: { criterion: string, verdict: string }[], missed?: import('./calibration.mjs').Miss[], ms?: number }} Result */
/** @typedef {{ part: string, split: string, fails: number, missed: number, unsteady: number }} FailRow */
/** @typedef {{ part: string, split: string, label: string, cards: number, agree: number }} LabelRow */

// Below these, a count shows little: no percentage under 10 cards, and under 5 fails a part is unproven, not covered.
export const PERCENT_FROM = 10;
export const PROVEN_FROM = 5;

/** Who wrote a card, as the report groups it. @param {Card} card */
const source = card => card.id.startsWith('messy-') ? `messy, ${short(card.generator)}` : card.generator ? short(card.generator) : 'old cards';
/** @param {string | undefined} generator */
const short = generator => String(generator ?? '').replace(/^claude-|-\d.*$/g, '');

/** The verdict most runs gave, or the first of the tied ones in pass, weak, fail order. @param {string[]} verdicts */
function most(verdicts) {
  const counts = ['pass', 'weak', 'fail'].map(verdict => verdicts.filter(each => each === verdict).length);
  return /** @type {string} */ (['pass', 'weak', 'fail'][counts.indexOf(Math.max(...counts))]);
}

/**
 * Tallies cards against several runs. Each labelled fail is one entry per
 * criterion, and per facet under the facets criterion.
 * Card IDs repeat across modules, so a card that names its module matches only that module's results.
 * @param {readonly (Card & { module?: string })[]} cards @param {readonly (readonly Result[])[]} runs
 */
export function tally(cards, runs) {
  /** @type {FailRow[]} */ const fails = [];
  /** @type {LabelRow[]} */ const labels = [];
  /** @type {{ id: string, split: string, source: string, expected: string, verdict: string, agrees: boolean, runs: number }[]} */ const verdicts = [];
  /** @type {{ id: string, split: string, part: string, missedIn: number, runs: number }[]} */ const misses = [];
  for (const card of cards) {
    const judged = runs.map(run => run.find(result => result.id === card.id && (!card.module || result.module === card.module))).filter(result => result && result.verdict !== 'error');
    const n = judged.length;
    if (!n) continue;
    const expected = 'criteria' in card ? (Object.values(card.criteria).includes('fail') ? 'fail' : Object.values(card.criteria).includes('weak') ? 'weak' : 'pass') : card.verdict;
    const verdict = most(judged.map(result => /** @type {Result} */ (result).verdict));
    verdicts.push({ id: card.id, split: card.split, source: source(card), expected, verdict, agrees: (verdict === 'fail') === (expected === 'fail'), runs: n });
    /** @param {string} part @param {(miss: import('./calibration.mjs').Miss) => boolean} matches */
    const fail = (part, matches) => {
      const missedIn = judged.filter(result => (result?.missed ?? []).some(matches)).length;
      fails.push({ part, split: card.split, fails: 1, missed: missedIn > n / 2 ? 1 : 0, unsteady: missedIn && missedIn <= n / 2 ? 1 : 0 });
      if (missedIn) misses.push({ id: card.id, split: card.split, part, missedIn, runs: n });
    };
    if (!('criteria' in card)) {
      if (card.verdict === 'fail') fail(source(card), miss => miss.criterion === null);
      continue;
    }
    for (const [criterion, label] of Object.entries(card.criteria)) {
      const facets = [...new Set((card.reasons[criterion] ?? []).flatMap(reason => reason.facet ? [reason.facet] : []))];
      const parts = criterion === 'facets' && facets.length ? facets.map(facet => `facets: ${facet}`) : [criterion];
      if (label === 'fail') {
        for (const part of parts) fail(part, miss => miss.criterion === criterion && (part === criterion || miss.facets.includes(part.slice('facets: '.length))));
        continue;
      }
      const given = most(judged.map(result => result?.scores?.find(score => score.criterion === criterion)?.verdict ?? 'pass'));
      for (const part of label === 'weak' ? parts : [criterion]) labels.push({ part, split: card.split, label, cards: 1, agree: given === label ? 1 : 0 });
    }
  }
  return { fails: sum(fails, ['part', 'split']), labels: sum(labels, ['part', 'split', 'label']), verdicts, misses };
}

/**
 * The second check on closed facets: the step 1 scorer on each calibration
 * card's closed facets, beside the card's label for that facet and whether
 * most runs failed the judge's facets criterion. Where scorer and label
 * differ, the label is checked against DWDS: the references can be wrong too.
 * @param {readonly Card[]} cards German's calibration cards @param {readonly (readonly Result[])[]} runs
 */
export function closedFacets(cards, runs) {
  const graded = cards.filter(card => 'criteria' in card && card.item);
  const { scores } = moduleSet('german').score({ results: graded.map((card, sample) => ({ id: card.item, parent: 'german', sample, json: card.card, facets: Object.keys(card.card.facets ?? {}) })) });
  return scores.flatMap(score => {
    if (score.verdict === 'unscored') return [];
    const card = /** @type {import('./calibration.mjs').Graded} */ (graded[score.sample]);
    const named = (card.reasons.facets ?? []).some(reason => reason.facet === score.facet);
    const label = named ? card.criteria.facets : 'pass';
    const judged = runs.map(run => run.find(result => result.id === card.id)).filter(result => result && result.verdict !== 'error');
    const judgeFails = judged.filter(result => result?.scores?.find(each => each.criterion === 'facets')?.verdict === 'fail').length > judged.length / 2;
    return [{ id: card.id, split: card.split, facet: score.facet, scorer: score.verdict, label, judgeFails: judged.length ? judgeFails : null }];
  });
}

/** @template {Record<string, any>} T @param {T[]} rows @param {(keyof T)[]} keys @returns {T[]} */
function sum(rows, keys) {
  /** @type {Map<string, T>} */
  const out = new Map();
  for (const row of rows) {
    const key = keys.map(each => row[each]).join('|');
    const seen = out.get(key);
    if (!seen) { out.set(key, { ...row }); continue; }
    for (const [field, value] of Object.entries(row)) if (typeof value === 'number') /** @type {any} */ (seen)[field] += value;
  }
  return [...out.values()].sort((a, b) => keys.map(each => String(a[each]).localeCompare(String(b[each]))).find(Boolean) ?? 0);
}

/** "3 of 12 (25%)", the percentage only from PERCENT_FROM. @param {number} count @param {number} of */
export const share = (count, of) => `${count} of ${of}${of >= PERCENT_FROM ? ` (${Math.round(100 * count / of)}%)` : ''}`;

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Name the calibration runs to report: npm run judge:report -- .data/judge/<run>.json ...');
  const loaded = await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8'))));
  const models = [...new Set(loaded.map(run => run.model))];
  if (models.length > 1) throw new Error(`These runs come from different judges: ${models.join(', ')}.`);
  const cards = (await calibrations()).flatMap(set => set.cards.map(card => ({ ...card, module: set.module })));
  const { fails, labels, verdicts, misses } = tally(cards, loaded.map(run => run.results));
  const splits = [...new Set(verdicts.map(row => row.split))];
  const times = loaded.flatMap(run => run.results.map((/** @type {Result} */ result) => result.ms ?? 0)).filter(Boolean);
  const lines = [`# Judge report: ${models[0]}`, '',
    `${files.length} run${files.length > 1 ? 's' : ''}: ${files.map(file => `\`${file.split('/').at(-1)}\``).join(', ')}. A fail counts as missed when most runs miss it, and as unsteady when fewer do. Under ${PROVEN_FROM} fails a part is unproven: catching them shows no sign of a gap, not that there is none.`, '',
    `Time per card: ${times.length ? `${Math.round(times.reduce((a, b) => a + b, 0) / times.length / 100) / 10} s on average` : 'not recorded'}. List cost per run: $${(loaded.reduce((total, run) => total + (run.cost ?? 0), 0) / loaded.length).toFixed(2)} (Claude Code reports the API price; a plan token does not bill it).`, ''];
  for (const split of splits) {
    const cardsHere = verdicts.filter(row => row.split === split);
    const failsHere = fails.filter(row => row.split === split);
    lines.push(`## ${split}`, '',
      `Cards: ${cardsHere.length}. The card's verdict agrees (fail or not) on ${share(cardsHere.filter(row => row.agrees).length, cardsHere.length)}. Fails missed: ${failsHere.reduce((total, row) => total + row.missed, 0)}, unsteady: ${failsHere.reduce((total, row) => total + row.unsteady, 0)}.`, '',
      '### Fails, per criterion and facet', '', '| Part | Fails | Missed | Unsteady | |', '| --- | --- | --- | --- | --- |',
      ...failsHere.map(row => `| ${row.part} | ${row.fails} | ${share(row.missed, row.fails)} | ${row.unsteady} | ${row.fails < PROVEN_FROM ? 'unproven' : ''} |`), '',
      '### Pass and weak, per criterion', '', '| Part | Label | Agrees |', '| --- | --- | --- |',
      ...labels.filter(row => row.split === split).map(row => `| ${row.part} | ${row.label} | ${share(row.agree, row.cards)} |`), '',
      '### By who wrote the card', '', '| Source | Cards | Agrees | Fails missed |', '| --- | --- | --- | --- |',
      ...[...new Set(cardsHere.map(row => row.source))].sort().map(name => {
        const rows = cardsHere.filter(row => row.source === name);
        const missedHere = misses.filter(miss => miss.split === split && rows.some(row => row.id === miss.id) && miss.missedIn > miss.runs / 2).length;
        return `| ${name} | ${rows.length} | ${share(rows.filter(row => row.agrees).length, rows.length)} | ${missedHere} |`;
      }), '',
      '### Each miss', '', ...misses.filter(miss => miss.split === split).map(miss => `- \`${miss.id}\` ${miss.part}: missed in ${miss.missedIn} of ${miss.runs} runs${miss.missedIn > miss.runs / 2 ? '' : ' (unsteady)'}`), '');
  }
  const judgedIds = new Set(loaded.flatMap(run => run.results.map((/** @type {Result} */ result) => `${result.module}/${result.id}`)));
  const closed = closedFacets(cards.filter(card => card.module === 'german' && judgedIds.has(`german/${card.id}`)), loaded.map(run => run.results.filter((/** @type {Result} */ result) => result.module === 'german')));
  lines.push('## Closed facets: the step 1 scorer beside the label and the judge', '',
    'The judge gives one verdict for all facets, so "judge fails" means most runs failed the facets criterion. Where the scorer and the label differ, check the label against DWDS.', '',
    '| Facet | Scored | Scorer agrees with label | Scorer fails | Judge fails those |', '| --- | --- | --- | --- | --- |',
    ...[...new Set(closed.map(row => row.facet))].sort().map(facet => {
      const rows = closed.filter(row => row.facet === facet);
      const failing = rows.filter(row => row.scorer === 'fail');
      return `| ${facet} | ${rows.length} | ${share(rows.filter(row => row.scorer === row.label).length, rows.length)} | ${failing.length} | ${share(failing.filter(row => row.judgeFails).length, failing.length)} |`;
    }), '', ...closed.filter(row => row.scorer !== row.label).map(row => `- \`${row.id}\` ${row.facet}: scorer ${row.scorer}, label ${row.label}`), '');
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-report`;
  await mkdir('.data/judge', { recursive: true });
  await writeFile(`.data/judge/${stamp}.json`, JSON.stringify({ model: models[0], files, fails, labels, verdicts, misses, closed }, null, 2) + '\n');
  await writeFile(`.data/judge/${stamp}.md`, lines.join('\n'));
  console.log(`Wrote .data/judge/${stamp}.md.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
