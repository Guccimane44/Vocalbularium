// Checks D19 (K61) against the live provider: each ambiguous key in
// tests/golden/reading is generated once, then retried with its saved core as
// "previous" and without it, and the readings are written for the owner's
// review. It calls OpenCodeProvider directly and spends provider usage.
// Usage: npm run smoke:reading -- [retries], 5 by default.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { generateComponent } from '@vocabularium/domain/modules';
import { facetsOf, PARENTS } from '@vocabularium/domain/parents';
import { providerCore } from '@vocabularium/domain/content';

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const retries = Number(process.argv[2] ?? 5);
if (!Number.isInteger(retries) || retries < 1) throw new Error('Retries must be a whole number of at least 1.');
const { inputs } = JSON.parse(await readFile(new URL('../tests/golden/reading/ambiguous.json', import.meta.url), 'utf8'));
const provider = new OpenCodeProvider();
async function steady(call) {
  try { return await call(); }
  catch (error) {
    if (error.code !== 'provider_response') throw error;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return call();
  }
}
// A card's reading (D19): its flags that make the reading, and the sense its
// meanings or explanation describe. The romanization and hasFormula/hasCode are not part of it.
const READING = ['kind', 'language', 'gramRole', 'relevance'];
function readingOf(type, content) {
  const core = providerCore(type, content);
  const flags = Object.fromEntries(READING.filter(flag => flag in core).map(flag => [flag, core[flag]]));
  return { flags, sense: [].concat(core.meanings ?? core.explanation ?? []).join(' / ') };
}
async function card(type, key, previous) {
  const module = { id: `reading-${type}`, type, facets: facetsOf(type) };
  const content = await generateComponent({ mainKey: key, module, ...(previous ? { previous } : {}),
    generate: request => steady(() => provider.generate({ ...request, language: 'en', sessionId: randomUUID() })) });
  return content;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const results = await Promise.all(inputs.flatMap(input => input.modules.map(async type => {
  try {
    const first = await card(type, input.key);
    const previous = providerCore(type, first);
    const run = async withPrevious => {
      const readings = [];
      for (let i = 0; i < retries; i++) {
        try { readings.push(readingOf(type, await card(type, input.key, withPrevious ? previous : undefined))); }
        catch (error) { readings.push({ error: error.message }); }
      }
      return readings;
    };
    const kept = await run(true), fresh = await run(false);
    const base = readingOf(type, first);
    const flagChanges = list => list.filter(each => !each.error && !same(each.flags, base.flags)).length;
    return { ...input, module: type, first: base, kept, fresh, flagChanges: { kept: flagChanges(kept), fresh: flagChanges(fresh) } };
  } catch (error) { return { ...input, module: type, error: error.message }; }
})));
const date = new Date().toISOString();
await mkdir('.data/golden', { recursive: true });
const stamp = `reading-${date.replace(/[:.]/g, '-')}`;
await writeFile(`.data/golden/${stamp}.json`, JSON.stringify({ date, model: provider.model, retries, results }, null, 2) + '\n');
const line = reading => reading.error ? `error: ${reading.error}` : `${JSON.stringify(reading.flags)} · ${reading.sense}`;
const review = [`# Reading check ${date}`, '', `Model: ${provider.model} · ${retries} retries each way`, '',
  ...results.flatMap(result => [`## ${PARENTS[result.module].label}: ${result.key}`, '', result.why, '',
    ...(result.error ? [`**Failed:** ${result.error}`, ''] : [
      `**First:** ${line(result.first)}`, '',
      `**With previous** (flags changed ${result.flagChanges.kept}/${retries}):`, ...result.kept.map(each => `- ${line(each)}`), '',
      `**Without** (flags changed ${result.flagChanges.fresh}/${retries}):`, ...result.fresh.map(each => `- ${line(each)}`), ''])])];
await writeFile(`.data/golden/${stamp}.md`, review.join('\n'));
console.log(`.data/golden/${stamp}.md`);
for (const result of results) console.log(`${result.module} ${result.key}: ${result.error ?? `flags changed with previous ${result.flagChanges.kept}/${retries}, without ${result.flagChanges.fresh}/${retries}`}`);
