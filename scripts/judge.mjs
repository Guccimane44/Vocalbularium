// @ts-check
// Judges generated cards against their module's rubric (0.16.0): the rubric
// beside each module's prompt in the catalog, scored per criterion as pass,
// weak or fail by JUDGE_MODEL, or the generator's own model when that is not
// set (M7), after the catalog's content checks. Its verdicts count only once
// it agrees with the calibration set made with the same model.
// It spends provider usage.
// JUDGE_MODEL=claude-code/<model> judges through headless Claude Code on the
// owner's plan (claude-code.mjs); any other model through OpenCode.
// Usage: npm run judge -- <module> [golden run .json]   judge a golden run (the latest for the module by default)
//        npm run judge -- --calibrate [module] [--part dev|held-out]
//                                                        score the calibration set, or one part of it, and report agreement and missed fails
//        Either takes --runs <n> (one output file per run, for judge:report) and --parallel <n> (cards at once; 4 through Claude Code, else 1).
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { CLAUDE_CODE, ClaudeCodeProvider } from './claude-code.mjs';
import { contentModule, folderOf, isContentModule, MODULES } from '@vocabularium/domain/catalog';
import { checkCard } from '@vocabularium/domain/checks';
import { calibrations, expected, missed } from './calibration.mjs';
import { checkTools } from './check-tools.mjs';
import { judgeModel, meter } from './meter.mjs';

/** @typedef {{ id: string, text: string }} Criterion */
/** @typedef {{ selection: string, context?: string, language: string, card: { core: any, facets?: Record<string, unknown> } }} JudgeInput */
/** @typedef {{ criterion: string, verdict: string, reason: string }} Score */
/** @typedef {{ verdict: string, checks: readonly import('@vocabularium/domain/checks').CheckFailure[], scores: Score[], error?: string }} Judgement */
// The provider's untyped edge: a composed request in, the parsed JSON reply out.
/** @typedef {{ complete: (request: any, signal?: AbortSignal, sessionId?: string) => Promise<any> }} Judge */
/** @typedef {import('@vocabularium/domain/catalog').ContentModuleId} ModuleId */

const VERDICTS = ['pass', 'weak', 'fail'];
const catalog = new URL('../packages/domain/src/catalog/', import.meta.url);

/** @param {ModuleId} module @returns {Promise<Criterion[]>} */
export async function rubricOf(module) {
  const text = await readFile(new URL(`${folderOf(module)}/rubric.md`, catalog), 'utf8');
  const criteria = [...text.matchAll(/^- \*\*([a-z][a-z0-9-]*)\*\*: (.+)$/gm)].map(match => ({ id: match[1] ?? '', text: match[2] ?? '' }));
  if (!criteria.length) throw new Error(`${module}'s rubric has no criteria.`);
  return criteria;
}

/** What a rubric says after its criteria, such as German's section on messy captures, or nothing. @param {ModuleId} module */
export async function rubricNotes(module) {
  const text = await readFile(new URL(`${folderOf(module)}/rubric.md`, catalog), 'utf8');
  const at = text.search(/^## /m);
  return at < 0 ? '' : text.slice(at).trim();
}

/** The judge's request for one card, in the shape every provider takes. @param {ModuleId} module @param {Criterion[]} criteria @param {JudgeInput} input */
async function request(module, criteria, input) {
  const notes = await rubricNotes(module);
  const rules = (await readFile(new URL('./judge.md', import.meta.url), 'utf8'))
    .replace('{{rubric}}', criteria.map(criterion => `- ${criterion.id}: ${criterion.text}`).join('\n') + (notes ? `\n\n${notes}` : ''));
  const verdict = { type: 'object', properties: { verdict: { type: 'string', enum: VERDICTS }, reason: { type: 'string' } }, required: ['verdict', 'reason'], additionalProperties: false };
  return { name: 'card_judgement', instructions: rules, maxTokens: 16384, input: { ...input, module: MODULES[module].label,
      // What each facet is for, from the catalog, so the judge reads it as intended.
      facets: Object.fromEntries(contentModule(module).facets.map(facet => [facet.id, facet.description])) },
    schema: { type: 'object', properties: Object.fromEntries(criteria.map(criterion => [criterion.id, verdict])), required: criteria.map(criterion => criterion.id), additionalProperties: false } };
}

/**
 * One card's judgement: the content checks first, then each criterion. A card
 * fails when a check or a criterion fails; "weak" alone does not fail it.
 * @param {Judge} provider @param {ModuleId} module @param {Criterion[]} criteria @param {JudgeInput} input
 * @returns {Promise<Judgement>}
 */
export async function judgeCard(provider, module, criteria, input) {
  const checks = (await checkCard(module, input.card, checkTools)).failures;
  /** @returns {Promise<Score[]>} */
  const ask = async () => {
    const reply = await steady(async () => provider.complete(await request(module, criteria, input), undefined, randomUUID()));
    return criteria.map(criterion => {
      const score = reply[criterion.id];
      if (!VERDICTS.includes(score?.verdict) || typeof score?.reason !== 'string') throw new Error(`The judge gave no verdict for ${criterion.id}.`);
      return { criterion: criterion.id, verdict: score.verdict, reason: score.reason };
    });
  };
  // Haiku now and then writes the schema itself in place of one verdict; a
  // later request almost always reads.
  const scores = await ask().catch(ask).catch(ask);
  const verdict = checks.length || scores.some(score => score.verdict === 'fail') ? 'fail' : scores.some(score => score.verdict === 'weak') ? 'weak' : 'pass';
  return { verdict, checks, scores };
}

// Where a second judge's verdicts differ from the gate judge's on the same run,
// matched by position: both judge the golden run's cards in order. With no gate
// verdicts, every card the second judge did not pass.
/** @template {{ verdict: string }} T @param {readonly T[]} judged @param {readonly T[]} audited @returns {{ index: number, judge: T | undefined, audit: T }[]} */
export function disagreements(judged, audited) {
  return audited.map((audit, index) => ({ index, judge: judged[index], audit }))
    .filter(({ judge, audit }) => judge ? judge.verdict !== audit.verdict : audit.verdict !== 'pass');
}

// A card the judge could not score is reported, and the run goes on.
/** @param {Judge} provider @param {ModuleId} module @param {Criterion[]} criteria @param {JudgeInput} input @returns {Promise<Judgement>} */
async function judgeSafely(provider, module, criteria, input) {
  try { return await judgeCard(provider, module, criteria, input); }
  catch (error) { return { verdict: 'error', checks: [], scores: [], error: /** @type {Error} */ (error).message }; }
}

// A transient service error is tried once more after a pause.
/** @template T @param {() => Promise<T>} call @returns {Promise<T>} */
async function steady(call) {
  try { return await call(); }
  catch (error) {
    // A long reasoning can also outlast the provider's timeout.
    if (!['provider_response', 'provider_invalid', 'provider_incomplete'].includes(/** @type {any} */ (error).code) && /** @type {any} */ (error).name !== 'TimeoutError') throw error;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return call();
  }
}

/** Runs tasks, at most `limit` at a time, keeping their order. @template T @param {(() => Promise<T>)[]} tasks @param {number} limit @returns {Promise<T[]>} */
export async function inTurn(tasks, limit) {
  /** @type {T[]} */
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => { while (next < tasks.length) { const index = next++; results[index] = await tasks[index](); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** @param {string[]} args @param {string} flag */
const option = (args, flag) => { const at = args.indexOf(flag); return at >= 0 ? args.splice(at, 2)[1] : undefined; };

async function main() {
  const args = process.argv.slice(2);
  const part = option(args, '--part');
  const runs = Number(option(args, '--runs') ?? 1);
  const parallelGiven = option(args, '--parallel');
  const [first, second] = args;
  if (part !== undefined && (first !== '--calibrate' || !['dev', 'held-out'].includes(part))) throw new Error('--part is dev or held-out, with --calibrate.');
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs is a whole number from 1.');
  const name = judgeModel(process.env);
  const viaClaude = name?.startsWith(CLAUDE_CODE);
  if (!viaClaude && !process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
  const parallel = Number(parallelGiven ?? (viaClaude ? 4 : 1));
  // Judging a card with many facets reasons longer than generating it.
  const provider = viaClaude && name ? new ClaudeCodeProvider({ model: name.slice(CLAUDE_CODE.length), timeout: 300000 }) : new OpenCodeProvider({ timeout: 180000, model: name });
  // The name a calibration is matched by: claude-code/… stays apart from the same model on OpenCode.
  const model = name ?? provider.model;
  /** @type {{ title: string, tasks: (() => Promise<any>)[] }} each task judges one card, untyped JSON beside what its source says of it */
  let job;
  if (first === '--calibrate') {
    /** @type {(() => Promise<any>)[]} */
    const tasks = [];
    for (const set of await calibrations()) {
      if (second && set.module !== second) continue;
      const criteria = await rubricOf(set.module);
      for (const card of set.cards.filter(each => !part || each.split === part)) tasks.push(async () => {
        const started = Date.now();
        const judged = await judgeSafely(provider, set.module, criteria, { selection: card.key, context: card.context, language: card.language, card: card.card });
        const why = 'criteria' in card ? Object.entries(card.reasons).flatMap(([criterion, reasons]) => reasons.map(reason => `${criterion} ${card.criteria[criterion]}${reason.facet ? ` (${reason.facet})` : ''}: ${reason.why}`)).join('\n') : card.reason;
        return { module: set.module, id: card.id, key: card.key, split: card.split, expected: expected(card), why, ...judged, ms: Date.now() - started,
          agrees: judged.verdict !== 'error' && (judged.verdict === 'fail') === (expected(card) === 'fail'), missed: missed(card, judged) };
      });
    }
    job = { title: `Judge calibration${part ? ` (${part})` : ''}`, tasks };
  } else {
    if (!first || !isContentModule(first)) throw new Error('Name a content module, such as german, or --calibrate.');
    const golden = new URL('../.data/golden/', import.meta.url);
    const file = second ?? (await readdir(golden)).filter(name => name.endsWith('.json')).sort().reverse()
      .find(name => name.includes(`-${first}.json`) || name.endsWith(`-${first}.json`));
    if (!file) throw new Error(`No golden run for ${first}; run npm run smoke:generation -- ${first} first.`);
    const run = JSON.parse(await readFile(new URL(file, golden), 'utf8'));
    const criteria = await rubricOf(first);
    job = { title: `Judgement of ${file}`, tasks: run.results.filter((/** @type {any} */ each) => each.parent === first).map((/** @type {any} */ result) => async () => {
      if (!result.json?.core) return { module: first, key: result.key, verdict: 'fail', checks: [], scores: [], error: result.error ?? 'no card' };
      // Only the facets the card shows: one its flags rule out was dropped and never reaches the user (D17).
      const card = { ...result.json, facets: Object.fromEntries(Object.entries(result.json.facets ?? {}).filter(([facet]) => !result.facets || result.facets.includes(facet))) };
      const started = Date.now();
      return { module: first, key: result.key, ...await judgeSafely(provider, first, criteria, { selection: result.key, context: result.context, language: run.language, card }), ms: Date.now() - started };
    }) };
  }
  for (let index = 1; index <= runs; index++) {
    const cost = meter(provider);
    const date = new Date().toISOString();
    const results = await inTurn(job.tasks, parallel);
    const title = `${job.title}${runs > 1 ? `, run ${index} of ${runs}` : ''}`;
    // A random part keeps runs started together apart (three were lost to a clash on 2026-11-24). One part is named
    // apart too, so the gate, which reads only "-calibration.json", never takes it for the whole set.
    const stamp = `${date.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}${first === '--calibrate' ? `-calibration${part ? `-${part}` : ''}` : `-${first}`}`;
    await mkdir('.data/judge', { recursive: true });
    await writeFile(`.data/judge/${stamp}.json`, JSON.stringify({ date, model, cost: cost.spent(), title, part: part ?? null, results }, null, 2) + '\n');
    const count = (/** @type {string} */ verdict) => results.filter(result => result.verdict === verdict).length;
    const lines = [`# ${title}`, '', `${date} · model ${model} · ${results.length} cards: ${count('pass')} pass, ${count('weak')} weak, ${count('fail')} fail${count('error') ? `, ${count('error')} not scored` : ''} · ${Math.round(cost.spent() * 1e6)} µ$ list cost`, ''];
    if (first === '--calibrate') {
      const agreed = results.filter(result => result.agrees).length;
      const missedFails = results.reduce((sum, result) => sum + result.missed.length, 0);
      lines.push(`**Agreement:** ${agreed}/${results.length} (${Math.round(100 * agreed / Math.max(results.length, 1))}%) · **recorded fails missed:** ${missedFails}`, '',
        missedFails || agreed < 0.9 * results.length ? '**Not calibrated:** the judge\'s verdicts do not count until it agrees on 90% and misses no recorded fail.' : '**Calibrated.**', '');
    }
    for (const result of results) {
      lines.push(`## ${result.module}: ${result.key}${result.id ? ` (${result.id})` : ''} · ${result.verdict}${result.expected ? `, expected ${result.expected}${result.agrees ? '' : ' **(disagrees)**'}` : ''}`, '');
      if (result.why) lines.push(result.why, '');
      if (result.missed?.length) lines.push(`**Missed:** ${result.missed.map((/** @type {any} */ miss) => miss.criterion ? `${miss.criterion}${miss.facets.length ? ` (${miss.facets.join(', ')})` : ''}` : 'the card').join(', ')}`, '');
      for (const check of result.checks ?? []) lines.push(`- check ${check.part}.${check.check}: ${check.message}`);
      for (const score of result.scores ?? []) lines.push(`- ${score.criterion}: **${score.verdict}** · ${score.reason}`);
      if (result.error) lines.push(`- error: ${result.error}`);
      lines.push('');
    }
    await writeFile(`.data/judge/${stamp}.md`, lines.join('\n'));
    console.log(`${lines[2]}${first === '--calibrate' ? `\n${lines[4]}` : ''}\nReview .data/judge/${stamp}.md.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
