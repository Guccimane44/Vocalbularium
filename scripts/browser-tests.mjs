// @ts-check
// Runs the browser journeys one file at a time and runs each failed file once
// more. A file that then passes still fails the run: it is named as failing at
// random, so a second green attempt never hides it. A file that fails twice is
// named as failing every time. With file arguments, runs only those files.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const files = process.argv.slice(2).length ? process.argv.slice(2) : [
  ...readdirSync('tests/browser').filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/browser/${name}`),
  'tests/logging.browser.test.mjs'
];
const scratch = mkdtempSync(join(tmpdir(), 'vocabularium-browser-'));

/** Runs one file and returns the names of its failed top-level tests, or null when it passed. @param {string} file @param {number} attempt */
function run(file, attempt) {
  const tap = join(scratch, `${attempt}-${file.replace(/[\\/]/g, '_')}.tap`);
  const result = spawnSync(process.execPath, [
    '--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=tap', `--test-reporter-destination=${tap}`, file
  ], { stdio: 'inherit' });
  if (result.status === 0) return null;
  /** @type {string[]} */
  let failed = [];
  try { failed = [...readFileSync(tap, 'utf8').matchAll(/^not ok \d+ - (.*)$/gm)].map(match => match[1]); } catch { /* no report: the file did not start */ }
  return failed.length ? failed : ['(the file failed before any test reported)'];
}

/** @type {{ file: string, tests: string[] }[]} */
const first = [];
for (const file of files) {
  const failed = run(file, 1);
  if (failed) first.push({ file, tests: failed });
}
/** @type {{ file: string, tests: string[] }[]} */
const random = [];
/** @type {{ file: string, tests: string[] }[]} */
const always = [];
for (const failure of first) {
  console.log(`\nRunning ${failure.file} once more after its failure.`);
  const again = run(failure.file, 2);
  if (again) always.push({ file: failure.file, tests: again }); else random.push(failure);
}
rmSync(scratch, { recursive: true, force: true });

/** @type {string[]} */
const lines = [];
for (const { file, tests } of random) for (const test of tests) lines.push(`Fails at random: ${file}: ${test} (failed, then passed when run again)`);
for (const { file, tests } of always) for (const test of tests) lines.push(`Fails every time: ${file}: ${test} (failed twice)`);
if (!lines.length) {
  console.log(`\nAll ${files.length} browser test files passed.`);
  process.exit(0);
}
console.error(`\n${lines.join('\n')}`);
if (process.env.GITHUB_ACTIONS) {
  for (const { file, tests } of random) console.log(`::error file=${file},title=Fails at random::${tests.join('; ')} failed, then passed when run again. Find and fix the race; do not rerun until green.`);
  for (const { file, tests } of always) console.log(`::error file=${file},title=Fails every time::${tests.join('; ')} failed twice.`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Browser tests\n\n${lines.map(line => `- ${line}`).join('\n')}\n`);
}
process.exit(1);
