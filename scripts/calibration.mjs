// @ts-check
// The judge's calibration set (v0.17.0): the cards in tests/golden/calibration
// with the verdicts a careful reader gives them, and what the judge must agree
// with. A card is graded criterion by criterion, with reasons, or as a whole
// when no source can grade it criterion by criterion.
import { readdir, readFile } from 'node:fs/promises';
import { contentModule, isContentModule } from '@vocabularium/domain/catalog';
import { GOLDEN_PLANS } from '@vocabularium/domain/golden';
import { moduleSet } from './golden-sets.mjs';
import { rubricOf } from './judge.mjs';

/** @typedef {import('@vocabularium/domain/catalog').ContentModuleId} ModuleId */
/** @typedef {'pass' | 'weak' | 'fail'} Verdict */
/** @typedef {{ why: string, source: string, facet?: string }} Reason */
/**
 * @typedef {{ id: string, key: string, context?: string, language: string, split: 'dev' | 'held-out', item?: string, generator?: string,
 *   fault?: 'real' | 'planted', decided: 'claude' | 'owner', card: { core: any, facets?: Record<string, unknown> } }} Common
 * @typedef {Common & { criteria: Record<string, Verdict>, reasons: Record<string, Reason[]> }} Graded
 * @typedef {Common & { verdict: Verdict, reason: string }} Whole
 * @typedef {Graded | Whole} Card
 * @typedef {{ note: string, module: ModuleId, cards: Card[] }} Calibration
 * @typedef {{ criterion: string | null, facets: string[] }} Miss  a fail the judge missed; criterion null for a card graded as a whole
 */

const DIRECTORY = new URL('../tests/golden/calibration/', import.meta.url);
const VERDICTS = ['pass', 'weak', 'fail'];
const SPLITS = ['dev', 'held-out'];
const COMMON = ['id', 'key', 'context', 'language', 'split', 'item', 'generator', 'fault', 'decided', 'card'];

/** The card's verdict: a graded card's worst criterion. @param {Card} card @returns {Verdict} */
export function expected(card) {
  if (!('criteria' in card)) return card.verdict;
  const verdicts = Object.values(card.criteria);
  return verdicts.includes('fail') ? 'fail' : verdicts.includes('weak') ? 'weak' : 'pass';
}

/**
 * The fails the judge missed. On a graded card, each criterion labelled fail
 * that the judge did not fail, so a card failed for another criterion still
 * misses it; on a whole card, the card when the judge did not fail it.
 * @param {Card} card @param {{ verdict: string, scores: readonly { criterion: string, verdict: string }[] }} judgement
 * @returns {Miss[]}
 */
export function missed(card, judgement) {
  if (!('criteria' in card)) return card.verdict === 'fail' && judgement.verdict !== 'fail' ? [{ criterion: null, facets: [] }] : [];
  return Object.entries(card.criteria)
    .filter(([criterion, verdict]) => verdict === 'fail' && judgement.scores.find(score => score.criterion === criterion)?.verdict !== 'fail')
    .map(([criterion]) => ({ criterion, facets: (card.reasons[criterion] ?? []).flatMap(reason => reason.facet ? [reason.facet] : []) }));
}

/** Every calibration file, read, in file order. @returns {Promise<Calibration[]>} */
export async function calibrations() {
  const files = (await readdir(DIRECTORY)).filter(name => name.endsWith('.json')).sort();
  return Promise.all(files.map(name => readCalibration(`tests/golden/calibration/${name}`)));
}

/**
 * One calibration file. A card that breaks the shape throws, naming the file,
 * the card and the fix. `raw` stands in for the file's content.
 * @param {string} file @param {unknown} [raw] @returns {Promise<Calibration>}
 */
export async function readCalibration(file, raw) {
  const set = /** @type {any} */ (raw ?? JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
  if (typeof set?.note !== 'string' || !isContentModule(set.module) || !Array.isArray(set.cards)) throw new Error(`${file}: expected { "note", "module" (a content module), "cards": [...] }.`);
  /** @type {ModuleId} */
  const module = set.module;
  const rubric = (await rubricOf(module)).map(criterion => criterion.id);
  const facets = contentModule(module).facets.map(facet => facet.id);
  const items = set.cards.some((/** @type {any} */ card) => card?.item !== undefined) && GOLDEN_PLANS[module] ? new Map(moduleSet(module).items.map(item => [item.id, item])) : null;
  const ids = new Set();
  for (const [index, card] of set.cards.entries()) {
    const wrong = /** @param {string} what @returns {never} */ what => { throw new Error(`${file}: card "${card?.id ?? index}" ${what}.`); };
    if (typeof card?.id !== 'string' || !card.id) wrong('needs an "id"');
    if (ids.has(card.id)) wrong('has the same id as another card');
    ids.add(card.id);
    if (typeof card.key !== 'string' || !card.key.trim()) wrong('needs a "key"');
    if (card.context !== undefined && typeof card.context !== 'string') wrong('has a "context" that is not text');
    if (typeof card.language !== 'string' || !card.language) wrong('needs a "language", such as "en"');
    if (!SPLITS.includes(card.split)) wrong(`needs a "split", one of ${SPLITS.join(', ')}`);
    if (card.generator !== undefined && typeof card.generator !== 'string') wrong('has a "generator" that is not a model id');
    if (card.fault !== undefined && !['real', 'planted'].includes(card.fault)) wrong('has a "fault" other than "real" or "planted"; leave it out for a card with nothing wrong');
    if (!['claude', 'owner'].includes(card.decided)) wrong('needs "decided": "claude" or "owner"');
    if (typeof card.card?.core !== 'object' || card.card.core === null) wrong('needs "card" with its "core"');
    if (card.item !== undefined) {
      const item = (items ?? wrong(`names golden item "${card.item}", but ${module} has no golden folder; leave "item" out`)).get(card.item)
        ?? wrong(`names golden item "${card.item}", which tests/golden/${module}/items.json does not have`);
      const split = item.split === 'test' ? 'held-out' : item.split;
      if (card.split !== split) wrong(`is in the ${card.split} split, but its golden item "${card.item}" is ${item.split}; make it "${split}"`);
    }
    const graded = 'criteria' in card;
    if (graded === 'verdict' in card) wrong('needs either "criteria" with "reasons", or "verdict" with "reason", and not both');
    const form = graded ? ['criteria', 'reasons'] : ['verdict', 'reason'];
    for (const field of Object.keys(card)) if (!COMMON.includes(field) && !form.includes(field)) wrong(`has "${field}", which a ${graded ? 'graded' : 'whole'} card does not have`);
    if (!graded) {
      if (!VERDICTS.includes(card.verdict)) wrong(`needs a "verdict", one of ${VERDICTS.join(', ')}`);
      if (typeof card.reason !== 'string' || !card.reason.trim()) wrong('needs a "reason" for its verdict');
      continue;
    }
    if (typeof card.criteria !== 'object' || card.criteria === null) wrong('needs "criteria", a verdict for each criterion');
    for (const criterion of rubric) if (!VERDICTS.includes(card.criteria[criterion])) wrong(`grades no "${criterion}"; give it one of ${VERDICTS.join(', ')}, as for every criterion of ${module}'s rubric`);
    for (const criterion of Object.keys(card.criteria)) if (!rubric.includes(criterion)) wrong(`grades "${criterion}", which ${module}'s rubric does not have (${rubric.join(', ')})`);
    if (typeof card.reasons !== 'object' || card.reasons === null) wrong('needs "reasons", a list for each criterion graded weak or fail');
    for (const [criterion, verdict] of Object.entries(card.criteria)) {
      const reasons = card.reasons[criterion];
      if (verdict === 'pass') {
        if (reasons !== undefined) wrong(`gives reasons for "${criterion}", which it grades pass; remove them or change the verdict`);
        continue;
      }
      if (!Array.isArray(reasons) || !reasons.length) wrong(`grades "${criterion}" ${verdict} with no reasons; add a list of { "why", "source" }`);
      for (const reason of reasons) {
        if (typeof reason?.why !== 'string' || !reason.why.trim() || typeof reason.source !== 'string' || !reason.source.trim()) wrong(`has a reason for "${criterion}" without a "why" and a "source"`);
        if (criterion === 'facets' && !facets.includes(reason.facet)) wrong(`has a facets reason naming ${reason.facet === undefined ? 'no facet' : `the facet "${reason.facet}"`}; name one of ${facets.join(', ')}`);
        if (criterion !== 'facets' && reason.facet !== undefined) wrong(`names a facet under "${criterion}"; only reasons under "facets" name one`);
      }
    }
    for (const criterion of Object.keys(card.reasons)) if (!(criterion in card.criteria)) wrong(`gives reasons for "${criterion}", which it does not grade`);
  }
  return set;
}
