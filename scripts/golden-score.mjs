// @ts-check
// Scores a golden run's closed facets against the module folder's references:
// free, exact, no judge. Writes .data/golden-score/<run>.json and .md.
// Usage: npm run golden:score -- <module> [golden run .json]   (the module's latest run by default)
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { isContentModule } from '@vocabularium/domain/catalog';
import { moduleSet } from './golden-sets.mjs';

const [module, given] = process.argv.slice(2);
if (!module || !isContentModule(module)) throw new Error('Name a content module: npm run golden:score -- german [run.json]');
const set = moduleSet(module);
const file = given ?? `.data/golden/${(await readdir('.data/golden').catch(() => [])).filter(name => name.endsWith(`-${module}.json`)).sort().at(-1) ?? ''}`;
if (file.endsWith('/')) throw new Error(`No golden run for ${module}; run npm run smoke:generation -- ${module} first.`);
const run = JSON.parse(await readFile(file, 'utf8'));
const { scores, rows, unknown } = set.score(run);

const rate = /** @param {{ pass: number, weak: number, fail: number }} row */ row => row.pass + row.weak + row.fail ? `${Math.round(100 * row.fail / (row.pass + row.weak + row.fail))}%` : '–';
const facets = [...new Set(rows.map(row => row.facet))];
const total = /** @param {string} facet */ facet => rows.filter(row => row.facet === facet && row.point === null)
  .reduce((sum, row) => ({ pass: sum.pass + row.pass, weak: sum.weak + row.weak, fail: sum.fail + row.fail, unscored: sum.unscored + row.unscored }), { pass: 0, weak: 0, fail: 0, unscored: 0 });
const unscored = scores.filter(score => score.verdict === 'unscored').reduce((/** @type {Record<string, number>} */ sum, score) => ({ ...sum, [score.why]: (sum[score.why] ?? 0) + 1 }), {});
const fault = /** @param {any} score */ score => 'whole' in score.comparison ? (score.comparison.whole === 'invented' ? 'wrote a facet the word does not have' : 'left the facet out')
  : score.comparison.faults.map((/** @type {any} */ each) => `${each.cell} wrote ${each.got ?? 'nothing'}, accepted ${each.accepted.join(' or ') || 'no form'}`).join('; ');
const report = [`# Golden score: ${basename(file)}`, '', `Model ${run.model} · ${set.gaps.length ? `**the set has ${set.gaps.length} gaps** (npm test lists them)` : 'the set has no gaps'}`, '',
  '| Facet | Point | Band | Split | Pass | Weak | Fail | Fail rate | Unscored |', '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...rows.sort((a, b) => [a.facet, a.point ?? '', a.band ?? '', a.split].join('|').localeCompare([b.facet, b.point ?? '', b.band ?? '', b.split].join('|')))
    .map(row => `| ${row.facet} | ${row.point ?? 'all'} | ${row.band ?? '–'} | ${row.split} | ${row.pass} | ${row.weak} | ${row.fail} | ${rate(row)} | ${row.unscored} |`), '',
  '## Fails', '', ...scores.filter(score => score.verdict === 'fail').map(score => `- ${score.id} #${score.sample} ${score.facet} (${score.word}): ${fault(score)}`), '',
  '## Weak', '', ...scores.filter(score => score.verdict === 'weak').map(score => `- ${score.id} #${score.sample} ${score.facet} (${score.word}): ${fault(score)}`), '',
  ...(unknown.length ? [`Results whose item the set no longer has: ${unknown.join(', ')}`, ''] : [])].join('\n');
await mkdir('.data/golden-score', { recursive: true });
const stem = `.data/golden-score/${basename(file, '.json')}`;
await writeFile(`${stem}.json`, JSON.stringify({ run: file, model: run.model, date: new Date().toISOString(), gaps: set.gaps.length, scores, rows, unknown }, null, 2) + '\n');
await writeFile(`${stem}.md`, report);
console.log([...facets.map(facet => { const row = total(facet); return `${facet}: ${row.pass} pass, ${row.weak} weak, ${row.fail} fail (${rate(row)}), ${row.unscored} unscored`; }),
  `Unscored: ${Object.entries(unscored).map(([why, count]) => `${count} ${why}`).join(', ') || 'none'}. Review ${stem}.md.`].join('\n'));
