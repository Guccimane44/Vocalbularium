// @ts-check
// Checks syntax, JSON and trailing whitespace in every file of the checkout,
// or only in the files named on the command line (the Stop hook passes the
// ones a session changed), then the generated theme and the skill links.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, extname } from 'node:path';

/** @param {string} directory @returns {Promise<string[]>} */
async function files(directory) {
  /** @type {string[]} */
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.data', 'artifacts', '.claude'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
const named = process.argv.slice(2).map(file => resolve(file)).filter(file => existsSync(file));
let checked = 0;
for (const file of process.argv.length > 2 ? named : await files('.')) {
  if (!['.js', '.mjs', '.json', '.md', '.html', '.css', '.yml', '.yaml'].includes(extname(file))) continue;
  const content = await readFile(file, 'utf8');
  if (content.split('\n').some(line => /[\t ]+$/.test(line))) throw new Error(`Trailing whitespace: ${file}`);
  if (extname(file) === '.json') JSON.parse(content);
  if (['.js', '.mjs'].includes(extname(file))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  checked++;
}
console.log(`Checked syntax, JSON, and whitespace in ${checked} files.`);
// The generated theme must match the design tokens it is built from (D05).
const theme = spawnSync(process.execPath, ['scripts/build-theme.mjs', '--check'], { encoding: 'utf8' });
if (theme.status !== 0) throw new Error(theme.stderr || 'extension/theme.css is out of date');
console.log(theme.stdout.trim());
// Claude Code finds skills only under .claude/skills: each project skill has a
// link there. (A Windows checkout without symlinks keeps the link as a file.)
for (const entry of await readdir('.agents/skills', { withFileTypes: true })) {
  if (entry.isDirectory() && !existsSync(`.claude/skills/${entry.name}`))
    throw new Error(`Skill ${entry.name} has no link in .claude/skills: run ln -s ../../.agents/skills/${entry.name} .claude/skills/${entry.name}`);
}
