// @ts-check
// Claude Code's Stop hook (.claude/settings.json). Before an agent ends its
// turn it checks two rules that nothing else enforces at the time:
//
// 1. The files this checkout changed pass `scripts/check.mjs` (syntax, JSON,
//    trailing whitespace). Only changed tracked files are checked, so the
//    owner's untracked drafts never block a session.
// 2. A branch whose open PR changes the extension has a test build of the PR's
//    head (`npm run test-build`, docs/code-standards.md).
//
// A failure blocks the stop once, with what to do; when Claude Code reports
// that it is already continuing because of this hook, it lets the stop through.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/** @type {{ stop_hook_active?: boolean }} */
const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
if (input.stop_hook_active) process.exit(0);

/** @param {string} command @param {string[]} args */
const run = (command, args) => {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 }).trim(); } catch { return null; }
};

/** @type {string[]} */
const problems = [];

const changed = (run('git', ['diff', '--name-only', '--diff-filter=d', 'HEAD']) ?? '').split('\n').filter(Boolean);
if (changed.length) {
  const check = spawnSync(process.execPath, ['scripts/check.mjs', ...changed], { encoding: 'utf8' });
  if (check.status !== 0) {
    const reason = (check.stderr.split('\n').find(line => line.startsWith('Error:')) ?? check.stderr.trim()).slice(0, 600);
    problems.push(`scripts/check.mjs fails on the changed files: ${reason}`);
  }
}

const branch = run('git', ['branch', '--show-current']);
if (branch && branch !== 'main') {
  const pr = run('gh', ['pr', 'view', '--json', 'state,headRefOid,files,number']);
  if (pr) {
    /** @type {{ state: string, headRefOid: string, number: number, files: { path: string }[] }} */
    const { state, headRefOid, number, files } = JSON.parse(pr);
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const folder = `artifacts/vocabularium-${version}-local-candidate-${headRefOid.slice(0, 7)}`;
    if (state === 'OPEN' && files.some(file => file.path.startsWith('extension/')) && !existsSync(folder))
      problems.push(`PR ${number} changes the extension but has no test build of its head ${headRefOid.slice(0, 7)}: run \`npm run test-build -- ${headRefOid}\` and give the owner the folder, commit and SHA-256 it prints.`);
  }
}

if (problems.length) {
  console.log(JSON.stringify({ decision: 'block', reason: problems.join('\n') }));
}
