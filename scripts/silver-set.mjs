// @ts-nocheck
// The silver set (tests/golden/silver/silver.json): a tenth of the golden set's
// cards, run at several reasoning efforts to see what each costs in quality and
// buys in speed. Every card runs at every level in a shuffled order, so a slow
// hour of the service falls on all levels alike. Quality: generation errors,
// unexpected flags and content checks as in the golden set, then the judge
// against the module's rubric, always at the model's default reasoning so the
// measure stays the same. Speed: each request's time and its tokens.
// It spends provider usage.
// Usage: npm run silver -- [--levels default,none,low,high,max] [--samples 1] [--concurrency 4] [--no-judge] [--limit n]
//   `default` sends no reasoning effort, as the product does today; `none` turns thinking off.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { parentsIn } from '@vocabularium/domain/parents';
import { runCard } from './golden-card.mjs';
import { judgeCard, rubricOf } from './judge.mjs';

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const { values } = parseArgs({ options: {
  levels: { type: 'string', default: 'default,none,low,high,max' },
  samples: { type: 'string', default: '1' },
  concurrency: { type: 'string', default: '4' },
  'no-judge': { type: 'boolean', default: false },
  limit: { type: 'string' }
} });
const levels = values.levels.split(',').map(level => level.trim()).filter(Boolean);
const samples = Number(values.samples);
const concurrency = Number(values.concurrency);
if (!levels.length || !Number.isInteger(samples) || samples < 1 || !Number.isInteger(concurrency) || concurrency < 1) throw new Error('Check --levels, --samples and --concurrency.');

// The picks, resolved against the golden files, which keep each input's expectation.
const golden = new URL('../tests/golden/', import.meta.url);
const silver = JSON.parse(await readFile(new URL('silver/silver.json', golden), 'utf8'));
async function resolvePicks(picks) {
  const files = {};
  return Promise.all(picks.map(async pick => {
    files[pick.set] ??= JSON.parse(await readFile(new URL(`${pick.set}.json`, golden), 'utf8'));
    const { modules, family, inputs } = files[pick.set];
    const input = inputs.find(each => each.key === pick.key && (each.context ?? null) === (pick.context ?? null));
    if (!input) throw new Error(`The silver pick ${pick.key} is no longer in tests/golden/${pick.set}.json.`);
    if (!(family ? parentsIn(family) : modules).includes(pick.module)) throw new Error(`tests/golden/${pick.set}.json does not run ${pick.module}.`);
    return { input, module: pick.module };
  }));
}
// --limit runs only the first picks, to try the runner cheaply.
const picks = (await resolvePicks(silver.picks)).slice(0, values.limit ? Number(values.limit) : undefined);

// The usage and time of each request, by the session that sent it.
const usage = new Map();
const providers = Object.fromEntries(levels.map(level => {
  const provider = new OpenCodeProvider({ reasoning: level === 'default' ? undefined : level });
  provider.diagnostic = event => {
    if (event.event !== 'provider.response') return;
    let tokens;
    try { tokens = JSON.parse(event.content.output).usage; } catch { /* a failed reply has none */ }
    const list = usage.get(event.pageId) ?? [];
    list.push({ outcome: event.outcome, durationMs: event.durationMs, completion: tokens?.completion_tokens, reasoning: tokens?.completion_tokens_details?.reasoning_tokens, prompt: tokens?.prompt_tokens });
    usage.set(event.pageId, list);
  };
  return [level, provider];
}));

// Every card at every level, shuffled.
const jobs = picks.flatMap(({ input, module }) => Array.from({ length: samples }, (_, index) => levels.map(level => ({ input, module, level, sample: index + 1 }))).flat());
for (let i = jobs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
/** Runs `work` on every item, `concurrency` at a time. */
async function pool(items, work) {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
      if (++done % 10 === 0 || done === items.length) console.log(`${done}/${items.length}`);
    }
  }));
}

const date = new Date().toISOString();
const results = [];
console.log(`Silver set: ${picks.length} cards × ${levels.length} levels × ${samples} sample(s), ${concurrency} at a time.`);
await pool(jobs, async ({ input, module, level, sample }) => {
  const sessionId = randomUUID();
  const started = performance.now();
  const card = await runCard({ provider: providers[level], input, type: module, language: 'en', sample, sessionId });
  const requests = usage.get(sessionId) ?? [];
  const last = requests.at(-1) ?? {};
  results.push({ level, ...card, wallMs: Math.round(performance.now() - started), requestMs: last.durationMs, attempts: requests.length,
    tokens: { prompt: last.prompt, completion: last.completion, reasoning: last.reasoning } });
});

// The judge, at the model's default reasoning, for the modules with a rubric.
const calibration = await calibrated();
if (!values['no-judge']) {
  const judge = new OpenCodeProvider({ timeout: 180000 });
  const rubrics = {};
  console.log('Judging…');
  await pool(results.filter(result => !result.error), async result => {
    const criteria = rubrics[result.parent] ??= await rubricOf(result.parent).catch(() => null);
    if (!criteria) return;
    const card = { ...result.json, facets: Object.fromEntries(Object.entries(result.json.facets ?? {}).filter(([facet]) => result.facets.includes(facet))) };
    try { result.judgement = await judgeCard(judge, result.parent, criteria, { selection: result.key, context: result.context, language: 'en', card }); }
    catch (error) { result.judgement = { verdict: 'error', checks: [], scores: [], error: error.message }; }
  });
}

// The modules whose judge agreed with the calibration set (as the gate asks: 90%, no recorded fail missed).
async function calibrated() {
  const modules = {};
  for (const name of (await readdir('.data/judge').catch(() => [])).filter(name => name.endsWith('-calibration.json')).sort().reverse()) {
    for (const result of JSON.parse(await readFile(`.data/judge/${name}`, 'utf8')).results) {
      if (modules[result.module]?.file && modules[result.module].file !== name) continue;
      const entry = modules[result.module] ??= { file: name, agreed: 0, total: 0, missed: 0 };
      entry.total++; if (result.agrees) entry.agreed++; if (result.expected === 'fail' && result.verdict !== 'fail') entry.missed++;
    }
  }
  return Object.fromEntries(Object.entries(modules).map(([module, entry]) => [module, entry.agreed >= 0.9 * entry.total && !entry.missed]));
}

// A card's outcome: generation errors and failed checks count as fail; the judge's verdict otherwise.
const outcome = result => result.error ? 'fail' : result.unexpected?.length || result.checks?.length ? 'fail' : result.judgement?.verdict ?? 'unjudged';
const median = list => { const sorted = list.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN; };
const quantile = (list, q) => { const sorted = list.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : NaN; };
const seconds = ms => Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '–';
const share = (count, total) => total ? `${count} (${Math.round(100 * count / total)}%)` : '–';
const RANK = { pass: 2, weak: 1, fail: 0 };

const summary = levels.map(level => {
  const own = results.filter(result => result.level === level);
  const count = verdict => own.filter(result => outcome(result) === verdict).length;
  const judged = own.filter(result => result.judgement && result.judgement.verdict !== 'error' && calibration[result.parent]);
  return { level, cards: own.length, errors: own.filter(result => result.error).length, flags: own.filter(result => result.unexpected?.length).length,
    checks: own.filter(result => result.checks?.length).length, pass: count('pass'), weak: count('weak'), fail: count('fail'), unjudged: count('unjudged') + count('error'),
    calibratedPass: judged.filter(result => outcome(result) === 'pass').length, calibrated: judged.length,
    medianMs: median(own.map(result => result.requestMs)), p90Ms: quantile(own.map(result => result.requestMs), 0.9),
    medianWallMs: median(own.map(result => result.wallMs)), medianCompletion: median(own.map(result => result.tokens.completion)), medianReasoning: median(own.map(result => result.tokens.reasoning)) };
});
// Paired against the first level (the baseline): per card, faster by how much, and better or worse.
const [baseline] = levels;
const pairs = levels.slice(1).map(level => {
  const ratios = [], changes = { better: 0, same: 0, worse: 0 };
  for (const result of results.filter(each => each.level === level)) {
    const base = results.find(each => each.level === baseline && each.key === result.key && each.context === result.context && each.parent === result.parent && each.sample === result.sample);
    if (!base) continue;
    if (Number.isFinite(base.requestMs) && Number.isFinite(result.requestMs)) ratios.push(result.requestMs / base.requestMs);
    const [a, b] = [RANK[outcome(base)], RANK[outcome(result)]];
    if (a === undefined || b === undefined) continue;
    changes[b > a ? 'better' : b < a ? 'worse' : 'same']++;
  }
  return { level, medianRatio: median(ratios), ...changes };
});

const stamp = date.replace(/[:.]/g, '-');
await mkdir('.data/silver', { recursive: true });
await writeFile(`.data/silver/${stamp}.json`, JSON.stringify({ date, model: providers[levels[0]].model, levels, samples, concurrency, calibration, summary, pairs, results }, null, 2) + '\n');
const keys = [...new Map(results.map(result => [`${result.parent}|${result.key}|${result.context ?? ''}|${result.sample}`, result])).values()];
const cell = result => result ? `${outcome(result)} · ${seconds(result.requestMs)}` : '–';
const report = [`# Silver set: reasoning effort`, '', `${date} · model ${providers[levels[0]].model} · ${picks.length} cards × ${samples} sample(s) per level · ${concurrency} at a time · judge at the default reasoning`, '',
  '## Quality and speed per level', '',
  '| Level | Cards | Pass | Weak | Fail | Unjudged | Errors | Flags | Checks | Pass, calibrated modules | Median time | p90 time | Median output tokens | Median reasoning tokens |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...summary.map(row => `| ${row.level} | ${row.cards} | ${share(row.pass, row.cards)} | ${row.weak} | ${row.fail} | ${row.unjudged} | ${row.errors} | ${row.flags} | ${row.checks} | ${share(row.calibratedPass, row.calibrated)} | ${seconds(row.medianMs)} | ${seconds(row.p90Ms)} | ${row.medianCompletion ?? '–'} | ${row.medianReasoning ?? '–'} |`), '',
  `Time is the last request's, without the retry's pause; unjudged cards are Pronunciation's (no rubric) and those the judge could not score. Calibrated modules: ${Object.entries(calibration).filter(([, ok]) => ok).map(([module]) => module).join(', ') || 'none'}.`, '',
  `## Paired against ${baseline}`, '', '| Level | Median time vs baseline | Better | Same | Worse |', '| --- | ---: | ---: | ---: | ---: |',
  ...pairs.map(pair => `| ${pair.level} | ${Number.isFinite(pair.medianRatio) ? `${Math.round(100 * pair.medianRatio)}%` : '–'} | ${pair.better} | ${pair.same} | ${pair.worse} |`), '',
  '## Per card', '', `| Module | Key | ${levels.join(' | ')} |`, `| --- | --- | ${levels.map(() => '---').join(' | ')} |`,
  ...keys.map(key => `| ${key.parent} | ${key.key.replace(/\|/g, '\\|')}${key.context ? ' (Context)' : ''}${samples > 1 ? ` #${key.sample}` : ''} | ${levels.map(level => cell(results.find(result => result.level === level && result.parent === key.parent && result.key === key.key && result.context === key.context && result.sample === key.sample))).join(' | ')} |`), '',
  '## What went wrong', '',
  ...results.filter(result => outcome(result) !== 'pass').map(result => `- **${result.level}** · ${result.parent} · ${result.key}: ${[result.error, ...(result.unexpected ?? []), ...(result.checks ?? []).map(check => `${check.part}.${check.check}: ${check.message}`),
    ...(result.judgement?.scores ?? []).filter(score => score.verdict !== 'pass').map(score => `${score.criterion} ${score.verdict}: ${score.reason}`), result.judgement?.error].filter(Boolean).join('; ') || outcome(result)}`), ''].join('\n');
await writeFile(`.data/silver/${stamp}.md`, report);
console.log(`${summary.map(row => `${row.level}: ${row.pass}/${row.cards} pass, ${row.fail} fail, median ${seconds(row.medianMs)}`).join('\n')}\nReview .data/silver/${stamp}.md.`);
