// Generates the samples the family, module and facet pages show (D20, K63):
// for each content module and each interface language, the whole card for a
// word and for a sentence, written by the live provider with the current
// prompts, and for the German facets that never apply to a noun their own
// word's card (K65). It writes `samples/<language>.json` in the module's or
// facet's folder of the catalog, for review before it is committed; nothing
// generates a sample when a page opens. It spends provider usage.
// Usage: npm run samples -- [module] [language], such as `german fr`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { generateComponent } from '@vocabularium/domain/modules';
import { folderOf } from '@vocabularium/domain/catalog';
import { facetsOf } from '@vocabularium/domain/parents';
import { INTERFACE_LANGUAGES } from '@vocabularium/contracts';

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const [only, onlyLanguage] = process.argv.slice(2);
const catalog = new URL('../packages/domain/src/catalog/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, catalog), 'utf8'));

// The Languages modules' sample set: the main key's samples and the Context
// they were met in, in each interface language.
const keys = Object.fromEntries(await Promise.all(INTERFACE_LANGUAGES.map(async language => [language, await read(`main-key/samples/${language}.json`)])));
const contexts = Object.fromEntries(await Promise.all(INTERFACE_LANGUAGES.map(async language => [language, await read(`notes/context/samples/${language}.json`)])));
// A word beside "language" for a facet that never applies to a noun (K65).
const FACET_WORDS = {
  conjugation: { en: 'speak', ar: 'تكلّم', 'zh-Hans': '说话', fr: 'parler', ru: 'говорить', es: 'hablar' },
  comparison: { en: 'clear', ar: 'واضح', 'zh-Hans': '清楚', fr: 'clair', ru: 'ясный', es: 'claro' },
  case: { en: 'between', ar: 'بين', 'zh-Hans': '之间', fr: 'entre', ru: 'между', es: 'entre' }
};
// The Expertise modules use a term of their subject, written in the interface
// language they write in (D21): Mathematics "quadratic equation"; Computer
// Science "Hello, world", which stays English in every language.
const EXPERTISE = {
  mathematics: {
    en: { word_phrase: 'Quadratic equation', sentence: 'A quadratic equation has at most two real solutions.' },
    ar: { word_phrase: 'المعادلة التربيعية', sentence: 'للمعادلة التربيعية حلّان حقيقيان على الأكثر.' },
    'zh-Hans': { word_phrase: '一元二次方程', sentence: '一元二次方程最多有两个实数根。' },
    fr: { word_phrase: 'Équation du second degré', sentence: 'Une équation du second degré a au plus deux solutions réelles.' },
    ru: { word_phrase: 'Квадратное уравнение', sentence: 'Квадратное уравнение имеет не более двух действительных корней.' },
    es: { word_phrase: 'Ecuación de segundo grado', sentence: 'Una ecuación de segundo grado tiene como máximo dos soluciones reales.' }
  },
  'computer-science': {
    en: { word_phrase: 'Hello, world', sentence: 'Every programmer’s first program prints “Hello, world”.' },
    ar: { word_phrase: 'Hello, world', sentence: 'أول برنامج يكتبه كل مبرمج يطبع «Hello, world».' },
    'zh-Hans': { word_phrase: 'Hello, world', sentence: '每个程序员的第一个程序都会输出“Hello, world”。' },
    fr: { word_phrase: 'Hello, world', sentence: 'Le premier programme de tout programmeur affiche « Hello, world ».' },
    ru: { word_phrase: 'Hello, world', sentence: 'Первая программа любого программиста выводит «Hello, world».' },
    es: { word_phrase: 'Hello, world', sentence: 'El primer programa de todo programador imprime «Hello, world».' }
  }
};

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
  for (const type of ['german', 'chinese']) {
    if (only && only !== type) continue;
    // The Languages modules write in their own language; the key's language is the one the set is in.
    await save(folderOf(type), language, {
      word_phrase: await card(type, facetsOf(type), keys[language].word_phrase, contexts[language].word_phrase, language),
      sentence: await card(type, facetsOf(type), keys[language].sentence, contexts[language].sentence, language)
    });
  }
  for (const [facet, words] of Object.entries(FACET_WORDS)) {
    if (only && only !== 'german' && only !== facet) continue;
    await save(`${folderOf('german')}/facets/${facet}`, language, { word_phrase: await card('german', [facet], words[language], undefined, language) });
  }
  for (const [type, keys] of Object.entries(EXPERTISE)) {
    if (only && only !== type) continue;
    await save(folderOf(type), language, {
      word_phrase: await card(type, facetsOf(type), keys[language].word_phrase, undefined, language),
      sentence: await card(type, facetsOf(type), keys[language].sentence, undefined, language)
    });
  }
}
