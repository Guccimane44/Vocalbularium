// @ts-check
// Judges generated cards against their module's rubric (0.16.0): the rubric
// beside each module's prompt in the catalog, scored per criterion as pass,
// weak or fail by the generator's own model, after the catalog's content
// checks. Its verdicts count only once it agrees with the calibration set.
// It spends provider usage.
// Usage: npm run judge -- <module> [golden run .json]   judge a golden run (the latest for the module by default)
//        npm run judge -- --calibrate [module]           score the calibration set and report agreement
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { contentModule, folderOf, isContentModule, MODULES } from '@vocabularium/domain/catalog';
import { checkCard } from '@vocabularium/domain/checks';
import { checkTools } from './check-tools.mjs';

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

/** The judge's request for one card, in the shape every provider takes. @param {ModuleId} module @param {Criterion[]} criteria @param {JudgeInput} input */
async function request(module, criteria, input) {
  const rules = (await readFile(new URL('./judge.md', import.meta.url), 'utf8'))
    .replace('{{rubric}}', criteria.map(criterion => `- ${criterion.id}: ${criterion.text}`).join('\n'));
  const verdict = { type: 'object', properties: { verdict: { type: 'string', enum: VERDICTS }, reason: { type: 'string' } }, required: ['verdict', 'reason'], additionalProperties: false };
  return { name: 'card_judgement', instructions: rules, maxTokens: 8192, input: { ...input, module: MODULES[module].label,
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
  const reply = await steady(async () => provider.complete(await request(module, criteria, input), undefined, randomUUID()));
  /** @type {Score[]} */
  const scores = criteria.map(criterion => {
    const score = reply[criterion.id];
    if (!VERDICTS.includes(score?.verdict) || typeof score?.reason !== 'string') throw new Error(`The judge gave no verdict for ${criterion.id}.`);
    return { criterion: criterion.id, verdict: score.verdict, reason: score.reason };
  });
  const verdict = checks.length || scores.some(score => score.verdict === 'fail') ? 'fail' : scores.some(score => score.verdict === 'weak') ? 'weak' : 'pass';
  return { verdict, checks, scores };
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

async function main() {
  if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
  const [first, second] = process.argv.slice(2);
  // Judging a card with many facets reasons longer than generating it.
  const provider = new OpenCodeProvider({ timeout: 180000 });
  const date = new Date().toISOString();
  // Judged cards beside what the calibration file or golden run, untyped JSON, says of them.
  /** @type {any[]} */
  const results = [];
  let title;
  if (first === '--calibrate') {
    title = 'Judge calibration';
    const directory = new URL('../tests/golden/calibration/', import.meta.url);
    for (const file of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
      const set = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
      if (second && set.module !== second) continue;
      const criteria = await rubricOf(set.module);
      for (const item of set.cards) {
        const judged = await judgeSafely(provider, set.module, criteria, { selection: item.key, context: item.context, language: item.language ?? 'en', card: item.card });
        results.push({ module: set.module, id: item.id, key: item.key, expected: item.expected, why: item.why, ...judged,
          agrees: judged.verdict !== 'error' && (judged.verdict === 'fail') === (item.expected === 'fail') });
      }
    }
  } else {
    if (!first || !isContentModule(first)) throw new Error('Name a content module, such as german, or --calibrate.');
    const golden = new URL('../.data/golden/', import.meta.url);
    const file = second ?? (await readdir(golden)).filter(name => name.endsWith('.json')).sort().reverse()
      .find(name => name.includes(`-${first}.json`) || name.endsWith(`-${first}.json`));
    if (!file) throw new Error(`No golden run for ${first}; run npm run smoke:generation -- ${first} first.`);
    const run = JSON.parse(await readFile(new URL(file, golden), 'utf8'));
    title = `Judgement of ${file}`;
    const criteria = await rubricOf(first);
    for (const result of run.results.filter((/** @type {any} */ each) => each.parent === first)) {
      if (!result.json?.core) { results.push({ module: first, key: result.key, verdict: 'fail', checks: [], scores: [], error: result.error ?? 'no card' }); continue; }
      results.push({ module: first, key: result.key, ...await judgeSafely(provider, first, criteria, { selection: result.key, context: result.context, language: run.language, card: result.json }) });
    }
  }
  const stamp = `${date.replace(/[:.]/g, '-')}${first === '--calibrate' ? '-calibration' : `-${first}`}`;
  await mkdir('.data/judge', { recursive: true });
  await writeFile(`.data/judge/${stamp}.json`, JSON.stringify({ date, model: provider.model, title, results }, null, 2) + '\n');
  const count = (/** @type {string} */ verdict) => results.filter(result => result.verdict === verdict).length;
  const lines = [`# ${title}`, '', `${date} · model ${provider.model} · ${results.length} cards: ${count('pass')} pass, ${count('weak')} weak, ${count('fail')} fail${count('error') ? `, ${count('error')} not scored` : ''}`, ''];
  if (first === '--calibrate') {
    const agreed = results.filter(result => result.agrees).length;
    const missed = results.filter(result => result.expected === 'fail' && result.verdict !== 'fail');
    lines.push(`**Agreement:** ${agreed}/${results.length} (${Math.round(100 * agreed / Math.max(results.length, 1))}%) · **recorded fails missed:** ${missed.length}`, '',
      missed.length || agreed < 0.9 * results.length ? '**Not calibrated:** the judge\'s verdicts do not count until it agrees on 90% and misses no recorded fail.' : '**Calibrated.**', '');
  }
  for (const result of results) {
    lines.push(`## ${result.module}: ${result.key}${result.id ? ` (${result.id})` : ''} · ${result.verdict}${result.expected ? `, expected ${result.expected}${result.agrees ? '' : ' **(disagrees)**'}` : ''}`, '');
    if (result.why) lines.push(result.why, '');
    for (const check of result.checks ?? []) lines.push(`- check ${check.part}.${check.check}: ${check.message}`);
    for (const score of result.scores ?? []) lines.push(`- ${score.criterion}: **${score.verdict}** · ${score.reason}`);
    if (result.error) lines.push(`- error: ${result.error}`);
    lines.push('');
  }
  await writeFile(`.data/judge/${stamp}.md`, lines.join('\n'));
  console.log(`${lines[2]}${first === '--calibrate' ? `\n${lines[4]}` : ''}\nReview .data/judge/${stamp}.md.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
