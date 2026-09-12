import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, extname } from 'node:path';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.data', 'artifacts'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
let checked = 0;
for (const file of await files('.')) {
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
