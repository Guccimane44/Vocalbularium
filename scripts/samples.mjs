// Generates the samples the family, module and facet pages show (D20, K63):
// for each content module and each interface language, the whole card for a
// word and for a sentence, written by the live provider with the current
// prompts. A German facet that never applies to a noun has its own word's card
// (K65), as do Synonyms and Antonyms, which *language* has none of, and
// Declension, an adjective beside the noun (D21). It writes
// `samples/<language>.json` in the module's or facet's folder of the catalog,
// for review before it is committed; nothing generates a sample when a page
// opens. It spends provider usage.
// Usage: npm run samples -- [module] [language], such as `german fr`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { generateComponent } from '@vocabularium/domain/modules';
import { contentModule, folderOf } from '@vocabularium/domain/catalog';
import { facetsOf, PARENTS } from '@vocabularium/domain/parents';
import { INTERFACE_LANGUAGES } from '@vocabularium/contracts';

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const [only, onlyLanguage] = process.argv.slice(2);
const catalog = new URL('../packages/domain/src/catalog/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, catalog), 'utf8'));

// The Languages modules' sample set: the main key's samples and the Context
// they were met in, in each interface language.
const keys = Object.fromEntries(await Promise.all(INTERFACE_LANGUAGES.map(async language => [language, await read(`main-key/samples/${language}.json`)])));
const contexts = Object.fromEntries(await Promise.all(INTERFACE_LANGUAGES.map(async language => [language, await read(`notes/context/samples/${language}.json`)])));
// A facet with a `sample-key.json` has its own word's card, in each interface
// language, beside the module's (K65, D21): a German facet that never applies
// to a noun, or one *language* shows nothing representative of. A module with
// a `sample-keys.json` uses its own word and sentence (D21), such as an
// Expertise module's term of its subject; the others use the main key's set.
const optional = async path => { try { return await read(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

const provider = new OpenCodeProvider();
// A transient service error (such as a rate limit) is tried once more after a pause.
async function steady(call) {
  try { return await call(); }
  catch (error) {
    if (error.code !== 'provider_response') throw error;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return call();
  }
}
// One card as the provider wrote it, keeping only the facets the card shows:
// the sample is the provider's JSON, as `sample.json` was until 0.13.0.
async function card(type, facets, key, context, language) {
  let raw = null;
  const sessionId = randomUUID();
  const content = await generateComponent({ mainKey: key, module: { id: `sample-${type}`, type, facets },
    generate: async request => (raw = await steady(() => provider.generate({ ...request, context, language, sessionId }))) });
  return { core: raw.core, facets: Object.fromEntries(Object.keys(content.facets).map(facet => [facet, raw.facets[facet]])) };
}
async function save(folder, language, samples) {
  const directory = new URL(`${folder}/samples/`, catalog);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${language}.json`, directory), JSON.stringify(samples, null, 2) + '\n');
  console.log(`${folder}/samples/${language}.json`);
}

const languages = onlyLanguage ? [onlyLanguage] : INTERFACE_LANGUAGES;
for (const language of languages) {
  for (const type of Object.keys(PARENTS)) {
    // A spoken core's samples are its own, written with its module (D24).
    if (contentModule(type).core.spoken) continue;
    const own = await optional(`${folderOf(type)}/sample-keys.json`);
    if (!only || only === type) {
      // The Languages modules write in their own language; the key's language is the one the set is in.
      const sample = (inputType, key) => card(type, facetsOf(type), key, own ? undefined : contexts[language][inputType], language);
      const set = own?.[language] ?? keys[language];
      await save(folderOf(type), language, { word_phrase: await sample('word_phrase', set.word_phrase), sentence: await sample('sentence', set.sentence) });
    }
    for (const facet of facetsOf(type)) {
      const words = await optional(`${folderOf(type)}/facets/${facet}/sample-key.json`);
      if (!words || (only && only !== type && only !== facet)) continue;
      await save(`${folderOf(type)}/facets/${facet}`, language, { word_phrase: await card(type, [facet], words[language], undefined, language) });
    }
  }
}
