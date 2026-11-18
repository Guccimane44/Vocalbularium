// @ts-check
// A decision's ID is its GitHub issue number (docs/guides/project-workflow.md):
// every docs/decisions/d<number>-*.md after D36 needs an issue whose title
// starts with that number, as "320" or "D320". Needs the gh CLI and GH_TOKEN.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const LAST_HAND_NUMBERED = 36;
const repo = process.env.GITHUB_REPOSITORY;
const numbers = readdirSync('docs/decisions')
  .map(name => name.match(/^d(\d+)-[^/]+\.md$/)?.[1]).filter(n => n !== undefined)
  .map(Number).filter(n => n > LAST_HAND_NUMBERED);
const problems = [];
for (const number of numbers) {
  let title = '';
  try {
    title = execFileSync('gh', ['issue', 'view', String(number), '--json', 'title', '--jq', '.title', ...(repo ? ['--repo', repo] : [])], { encoding: 'utf8' }).trim();
  } catch {
    problems.push(`d${number}: there is no issue #${number}.`);
    continue;
  }
  if (!new RegExp(`^D?${number}\\b`, 'i').test(title)) problems.push(`d${number}: issue #${number} is titled "${title}"; its title must start with ${number}.`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Checked ${numbers.length} issue-numbered decision files.`);
