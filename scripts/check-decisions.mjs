// @ts-check
// Checks the decision files against the rules in docs/decisions/README.md and
// docs/guides/project-workflow.md: each file's name, its heading's number, one
// number per decision, and one Status and at most one Notion line in its
// header, with a status the workflow lists. Runs offline; whether a numbered
// decision has its GitHub issue is scripts/check-decision-issues.mjs.
import { readdirSync, readFileSync } from 'node:fs';

// Windows checks the files out with CRLF line endings.
const read = (/** @type {string} */ path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const dir = 'docs/decisions';
const LAST_HAND_NUMBERED = 36;
// The two decisions that keep a longer detail file beside their own (README).
const DETAIL = new Set(['d17-one-request.md', 'd20-module-pages.md']);
const NOT_DECISIONS = new Set(['README.md', 'conflicts.md', 'clarifications.md']);

// The status values are the backticked words that open each bullet under
// "Where a decision's status lives", so the workflow stays their one home.
const workflow = read('docs/guides/project-workflow.md');
const list = workflow.slice(workflow.indexOf('**Where a decision\'s status lives.**')).split('\n\n')[1] ?? '';
const statuses = [...list.matchAll(/^- (.*?):/gm)].flatMap(([, values]) => [...values.matchAll(/`([^`]+)`/g)].map(([, value]) => value));
if (!statuses.length) throw new Error('No status values found under "Where a decision\'s status lives" in docs/guides/project-workflow.md.');
const escape = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const status = new RegExp(`^(${statuses.map(value => escape(value).replace('x\\.y\\.z', '\\d+\\.\\d+\\.\\d+')).join('|')})(?![\\w-])`);

const problems = [];
/** @type {Map<number, string>} */
const owners = new Map();
for (const name of readdirSync(dir).filter(name => name.endsWith('.md') && !NOT_DECISIONS.has(name))) {
  if (DETAIL.has(name)) continue;
  const handNumbered = name.match(/^d(\d\d)\.md$/);
  const issueNumbered = name.match(/^d(\d+)-[a-z0-9-]+\.md$/);
  /** @type {number | undefined} */
  let number;
  if (handNumbered && Number(handNumbered[1]) <= LAST_HAND_NUMBERED) number = Number(handNumbered[1]);
  else if (issueNumbered && Number(issueNumbered[1]) > LAST_HAND_NUMBERED) number = Number(issueNumbered[1]);
  else if (!/^d-draft-[a-z0-9-]+\.md$/.test(name)) {
    problems.push(`${name}: name it d<issue>-<short-name>.md, or d-draft-<slug>.md until its issue exists (D01–D36 keep dNN.md).`);
    continue;
  }
  const text = read(`${dir}/${name}`);
  const header = text.split(/^## /m)[0];
  if (number !== undefined) {
    const heading = header.match(/^# D0*(\d+):/);
    if (!heading || Number(heading[1]) !== number) problems.push(`${name}: its first line must be "# D${String(number).padStart(2, '0')}: <title>".`);
    const other = owners.get(number);
    if (other) problems.push(`${name}: D${number} is also ${other}; one number is one decision.`);
    owners.set(number, name);
  }
  const statusLines = [...header.matchAll(/^- \*\*Status:\*\* (.*)$/gm)].map(([, value]) => value);
  if (statusLines.length !== 1) problems.push(`${name}: its header needs exactly one "- **Status:**" line, not ${statusLines.length}.`);
  else if (!status.test(statusLines[0])) problems.push(`${name}: status "${statusLines[0]}" must start with one of: ${statuses.join(', ')}.`);
  const notionLines = header.match(/^- \*\*Notion:\*\*/gm) ?? [];
  if (notionLines.length > 1) problems.push(`${name}: its header has ${notionLines.length} "- **Notion:**" lines; keep one.`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`${problems.length} problems in ${dir}.`);
  process.exit(1);
}
console.log(`Checked ${owners.size} decision files.`);
