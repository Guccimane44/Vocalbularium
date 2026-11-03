// @ts-check
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
/** @import { ParentContent } from '@vocabularium/domain/content' */
/** @import { ParentType } from '@vocabularium/domain/parents' */
/** @import { GenerateModule } from '@vocabularium/domain/modules' */
// An ambiguous key in tests/golden/reading, and the modules it is checked in.
/** @typedef {{ key: string, why: string, modules: ParentType[] }} ReadingInput */
/** @typedef {{ flags: Record<string, unknown>, sense: string, error?: undefined }} ReadingOf */
/** @typedef {ReadingOf | { error: string, flags?: undefined, sense?: undefined }} Reading */
// A key's check in one module; one that failed has only its error.
/** @typedef {ReadingInput & { module: ParentType, first: ReadingOf, kept: Reading[], fresh: Reading[], flagChanges: { kept: number, fresh: number }, error?: undefined }} Checked */
/** @typedef {Checked | (ReadingInput & { module: ParentType, error: string })} ReadingResult */

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const retries = Number(process.argv[2] ?? 5);
if (!Number.isInteger(retries) || retries < 1) throw new Error('Retries must be a whole number of at least 1.');
/** @type {{ inputs: ReadingInput[] }} */
const { inputs } = JSON.parse(await readFile(new URL('../tests/golden/reading/ambiguous.json', import.meta.url), 'utf8'));
const provider = new OpenCodeProvider();
/** @template T @param {() => Promise<T>} call */
async function steady(call) {
  try { return await call(); }
  catch (error) {
    if (/** @type {import('../src/server/provider.mjs').ProviderError} */ (error).code !== 'provider_response') throw error;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return call();
  }
}
// A card's reading (D19): its flags that make the reading, and the sense its
// meanings or explanation describe. The romanization and hasFormula/hasCode are not part of it.
const READING = ['kind', 'language', 'gramRole', 'relevance'];
/** @param {ParentType} type @param {ParentContent} content @returns {ReadingOf} */
function readingOf(type, content) {
  const core = providerCore(type, content);
  const flags = Object.fromEntries(READING.filter(flag => flag in core).map(flag => [flag, core[flag]]));
  return { flags, sense: /** @type {unknown[]} */ ([]).concat(core.meanings ?? core.explanation ?? []).join(' / ') };
}
/** @param {ParentType} type @param {string} key @param {Parameters<GenerateModule>[0]['previous']} [previous] */
async function card(type, key, previous) {
  const module = { id: `reading-${type}`, type, facets: facetsOf(type) };
  const content = await generateComponent({ mainKey: key, module, ...(previous ? { previous } : {}),
    generate: request => steady(() => provider.generate({ ...request, language: 'en', sessionId: randomUUID() })) });
  return content;
}
/** @param {unknown} a @param {unknown} b */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const results = await Promise.all(inputs.flatMap(input => input.modules.map(/** @returns {Promise<ReadingResult>} */ async type => {
  try {
    const first = await card(type, input.key);
    const previous = providerCore(type, first);
    /** @param {boolean} withPrevious */
    const run = async withPrevious => {
      /** @type {Reading[]} */
      const readings = [];
      for (let i = 0; i < retries; i++) {
        try { readings.push(readingOf(type, await card(type, input.key, withPrevious ? previous : undefined))); }
        catch (error) { readings.push({ error: /** @type {Error} */ (error).message }); }
      }
      return readings;
    };
    const kept = await run(true), fresh = await run(false);
    const base = readingOf(type, first);
    /** @param {Reading[]} list */
    const flagChanges = list => list.filter(each => !each.error && !same(each.flags, base.flags)).length;
    return { ...input, module: type, first: base, kept, fresh, flagChanges: { kept: flagChanges(kept), fresh: flagChanges(fresh) } };
  } catch (error) { return { ...input, module: type, error: /** @type {Error} */ (error).message }; }
})));
const date = new Date().toISOString();
await mkdir('.data/golden', { recursive: true });
const stamp = `reading-${date.replace(/[:.]/g, '-')}`;
await writeFile(`.data/golden/${stamp}.json`, JSON.stringify({ date, model: provider.model, retries, results }, null, 2) + '\n');
/** @param {Reading} reading */
const line = reading => reading.error ? `error: ${reading.error}` : `${JSON.stringify(reading.flags)} · ${reading.sense}`;
const review = [`# Reading check ${date}`, '', `Model: ${provider.model} · ${retries} retries each way`, '',
  ...results.flatMap(result => [`## ${PARENTS[result.module].label}: ${result.key}`, '', result.why, '',
    // Without an error, the check ran.
    ...(result.error ? [`**Failed:** ${result.error}`, ''] : [
      `**First:** ${line(/** @type {Checked} */ (result).first)}`, '',
      `**With previous** (flags changed ${/** @type {Checked} */ (result).flagChanges.kept}/${retries}):`, .../** @type {Checked} */ (result).kept.map(each => `- ${line(each)}`), '',
      `**Without** (flags changed ${/** @type {Checked} */ (result).flagChanges.fresh}/${retries}):`, .../** @type {Checked} */ (result).fresh.map(each => `- ${line(each)}`), ''])])];
await writeFile(`.data/golden/${stamp}.md`, review.join('\n'));
console.log(`.data/golden/${stamp}.md`);
for (const result of results) console.log(`${result.module} ${result.key}: ${result.error ?? `flags changed with previous ${result.flagChanges.kept}/${retries}, without ${result.flagChanges.fresh}/${retries}`}`);
