// @ts-check
// The language gate (0.16.0): one command, one verdict for a content module.
// It runs, in order, the catalog's offline tests, the module's golden set with
// its content checks, and the calibrated judge on that run, and writes one
// report. A second judge from another model family then audits the same cards,
// listing where the two disagree for the owner to read; it never changes the
// verdict. It spends provider usage: run it when a module's prompts or rubric
// change, or a language is added.
// Usage: npm run gate -- <module>
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { isContentModule } from '@vocabularium/domain/catalog';
import { disagreements } from './judge.mjs';
import { judgeModel } from './meter.mjs';
import { DEFAULT_MODEL } from '../src/server/opencode.mjs';

// The thresholds a module must meet (0.16.0 plan): no failed card, and at
// most this share of weak ones.
const WEAK_SHARE = 0.1;
const CALIBRATION = { agreement: 0.9 };
const OFFLINE = ['tests/catalog.test.mjs', 'tests/prompts.test.mjs', 'tests/localisation.test.mjs', 'tests/content-checks.test.mjs', 'tests/judge.test.mjs'];

const [module] = process.argv.slice(2);
if (!module || !isContentModule(module)) throw new Error('Name a content module, such as german.');
const started = new Date().toISOString();
// The generator's model and the judge's, which can differ (M7): the judge's
// calibration was made with one model and counts only for it.
const models = { generator: process.env.OPENCODE_MODEL || DEFAULT_MODEL, judge: judgeModel(process.env) || DEFAULT_MODEL, audit: process.env.AUDIT_MODEL || 'gpt-6-luna' };
// A step that only informs, such as the audit, never fails the gate.
/** @type {{ step: string, passed: boolean, informs?: boolean, summary: string, details?: string[] }[]} */
const steps = [];
/** @param {string} command @param {string[]} args */
const run = (command, args, judge = models.judge) => spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, JUDGE_MODEL: judge }, maxBuffer: 64 * 1024 * 1024 });
/** @param {string} directory @param {(name: string) => boolean} keep */
const latest = async (directory, keep) => (await readdir(directory).catch(() => [])).filter(keep).sort().pop();

// 1. Offline: conformance, prompt snapshots, localisation, content checks and the judge's own tests.
{
  const result = run(process.execPath, ['--env-file-if-exists=.env.postgres', '--test', ...OFFLINE]);
  const counts = /ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/.exec(result.stdout);
  const failed = [...result.stdout.matchAll(/^✖ (.+?) \(\d/gm)].map(match => match[1] ?? '').filter(name => name !== 'failing tests:');
  steps.push({ step: 'Offline tests', passed: result.status === 0, summary: counts ? `${counts[1]} passed, ${counts[2]} failed` : 'did not run', details: [...new Set(failed)] });
}

// 2. The golden set, live, with the content checks.
let golden;
{
  const before = await latest('.data/golden', name => name.endsWith(`-${module}.json`));
  const result = run(process.execPath, ['--env-file-if-exists=.env', 'scripts/golden-set.mjs', module]);
  const file = await latest('.data/golden', name => name.endsWith(`-${module}.json`));
  if (result.status !== 0 || !file || file === before) {
    steps.push({ step: 'Golden set', passed: false, summary: 'did not run', details: [(result.stderr || result.stdout).trim().split('\n').slice(-3).join(' ')] });
  } else {
    golden = file;
    /** @type {any[]} untyped JSON written by the golden-set script */
    const results = JSON.parse(await readFile(`.data/golden/${file}`, 'utf8')).results;
    const errors = results.filter(result => result.error);
    const flags = results.filter(result => result.unexpected?.length);
    const checks = results.filter(result => result.checks?.length);
    const made = results.filter(result => !result.error && typeof result.ms === 'number');
    const times = made.map(result => result.ms).sort((a, b) => a - b);
    const spend = made.length ? `; mean cost ${Math.round(1e6 * made.reduce((sum, result) => sum + result.cost, 0) / made.length)} µ$, median time ${((times[Math.floor((times.length - 1) / 2)] ?? 0) / 1000).toFixed(1)} s` : '';
    steps.push({ step: 'Golden set', passed: !errors.length && !flags.length && !checks.length,
      summary: `${results.length} cards: ${errors.length} failed to generate, ${flags.length} with unexpected flags, ${checks.length} failing a content check${spend} (${file})`,
      details: [...errors.map(result => `${result.key}: ${result.error}`), ...flags.map(result => `${result.key}: ${result.unexpected.join('; ')}`),
        ...checks.map(result => `${result.key}: ${result.checks.map((/** @type {any} */ check) => `${check.part}.${check.check}: ${check.message}`).join('; ')}`)] });
  }
}

// The latest calibration that scored this module with this model, whether alone
// or with the others: its share of agreement and the recorded fails it missed,
// counted per criterion.
/** @param {string} model */
async function calibrationOf(model) {
  for (const name of (await readdir('.data/judge').catch(() => [])).filter(name => name.endsWith('-calibration.json')).sort().reverse()) {
    const calibration = JSON.parse(await readFile(`.data/judge/${name}`, 'utf8'));
    if (calibration.model !== model) continue;
    /** @type {any[]} untyped JSON written by the judge */
    const scored = calibration.results.filter((/** @type {any} */ result) => result.module === module);
    // A calibration from before v0.17.0 names no missed fails per criterion: run it again.
    if (scored.length && scored.every(result => Array.isArray(result.missed))) return { cards: scored.length, agreement: scored.filter(result => result.agrees).length / scored.length, missed: scored.reduce((sum, result) => sum + result.missed.length, 0) };
  }
  return { cards: 0, agreement: 0, missed: 0 };
}
/** @param {string} file @returns {Promise<any[]>} untyped JSON written by the judge */
const judgedIn = async file => JSON.parse(await readFile(`.data/judge/${file}`, 'utf8')).results;
/** @param {any} card */
const reasons = card => [...(card.checks ?? []).map((/** @type {any} */ check) => check.message), ...(card.scores ?? []).filter((/** @type {any} */ score) => score.verdict !== 'pass').map((/** @type {any} */ score) => `${score.criterion} ${score.verdict}: ${score.reason}`), card.error ?? ''].filter(Boolean).join('; ');

// 3. The judge, only once calibrated for this module.
/** @type {any[]} */
let judged = [];
{
  const { cards: calibratedCards, agreement, missed } = await calibrationOf(models.judge);
  if (!calibratedCards || agreement < CALIBRATION.agreement || missed) {
    steps.push({ step: 'Judge', passed: false, summary: `not calibrated for ${module} with ${models.judge}: run JUDGE_MODEL=${models.judge} npm run judge -- --calibrate ${module} (latest: ${calibratedCards ? `${Math.round(100 * agreement)}% agreement, ${missed} fails missed` : 'none'})` });
  } else if (!golden) {
    steps.push({ step: 'Judge', passed: false, summary: 'skipped: the golden set did not run' });
  } else {
    const result = run(process.execPath, ['--env-file-if-exists=.env', 'scripts/judge.mjs', module, golden]);
    const file = await latest('.data/judge', name => name.endsWith(`-${module}.json`));
    judged = result.status === 0 && file ? await judgedIn(file) : [];
    const failed = judged.filter(card => card.verdict === 'fail' || card.verdict === 'error');
    const weak = judged.filter(card => card.verdict === 'weak');
    steps.push({ step: 'Judge', passed: judged.length > 0 && !failed.length && weak.length <= WEAK_SHARE * judged.length,
      summary: judged.length ? `${judged.length} cards: ${failed.length} fail or unscored, ${weak.length} weak (at most ${Math.floor(WEAK_SHARE * judged.length)}), calibrated at ${Math.round(100 * agreement)}% (${file})` : 'did not run',
      details: [...failed, ...weak].map(card => `${card.key} · ${card.verdict}: ${reasons(card)}`) });
  }
}

// 4. The audit: a judge from another model family on the same cards. Where it
// and the gate's judge disagree, the card is worth the owner's reading.
if (golden) {
  const before = await latest('.data/judge', name => name.endsWith(`-${module}.json`));
  const result = run(process.execPath, ['--env-file-if-exists=.env', 'scripts/judge.mjs', module, golden], models.audit);
  const file = await latest('.data/judge', name => name.endsWith(`-${module}.json`));
  const { cards, agreement, missed } = await calibrationOf(models.audit);
  const calibration = cards ? `${Math.round(100 * agreement)}% agreement, ${missed} fails missed in its calibration` : 'never calibrated';
  if (result.status !== 0 || !file || file === before) {
    steps.push({ step: `Audit (${models.audit})`, passed: true, informs: true, summary: 'did not run', details: [(result.stderr || result.stdout).trim().split('\n').slice(-3).join(' ')] });
  } else {
    const differ = disagreements(judged, await judgedIn(file));
    steps.push({ step: `Audit (${models.audit})`, passed: true, informs: true,
      summary: `${differ.length} cards ${judged.length ? 'judged differently from the judge' : 'not passed, with no judge verdicts to compare'}; ${calibration} (${file})`,
      details: differ.map(({ judge, audit }) => `${audit.key} · ${[...(judge ? [`judge ${judge.verdict}${reasons(judge) ? ` (${reasons(judge)})` : ''}`] : []), `audit ${audit.verdict}${reasons(audit) ? ` (${reasons(audit)})` : ''}`].join(' · ')}`) });
  }
}

const passed = steps.every(step => step.passed || step.informs);
const report = [`# Gate: ${module} · ${passed ? 'passed' : 'failed'}`, '', `${started} · model ${models.generator} · judge ${models.judge} · audit ${models.audit}`, '',
  ...steps.flatMap(step => [`## ${step.informs ? '·' : step.passed ? '✓' : '✗'} ${step.step}`, '', step.summary, '', ...(step.details?.length ? [...step.details.map(line => `- ${line}`), ''] : [])])].join('\n');
await mkdir('.data/gates', { recursive: true });
const path = `.data/gates/${module}-${started.replace(/[:.]/g, '-')}.md`;
await writeFile(path, report);
console.log(`${steps.map(step => `${step.informs ? '·' : step.passed ? '✓' : '✗'} ${step.step}: ${step.summary}`).join('\n')}\nGate ${passed ? 'passed' : 'failed'}. Report: ${path}`);
process.exitCode = passed ? 0 : 1;
