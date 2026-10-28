import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiText, CATALOGUES, direction, ENGLISH, format, LANGUAGES, isOffered, offeredLanguages, pseudoMessage, setLanguage, setPseudoLanguage, t } from '../extension/i18n.ts';

// The interface language (D14): every interface text is a catalogue entry,
// English is complete, and other catalogues match it.
const root = new URL('../extension/', import.meta.url).pathname;
const sources = readdirSync(root, { recursive: true }).map(String)
  .filter(path => /\.(tsx?|js|html)$/.test(path) && !path.startsWith('design/') && !path.startsWith('locales/'))
  .map(path => ({ path, text: readFileSync(join(root, path), 'utf8') }));
// A placeholder is a name followed by } or by the comma of its plural.
const placeholders = message => [...new Set([...message.matchAll(/\{(\w+)\s*[},]/g)].map(match => match[1]))].sort();

test('every key the extension names is in the English catalogue, and every entry is used', () => {
  const named = new Set();
  for (const { text } of sources) {
    for (const [, key] of text.matchAll(/\bt\(\s*'([^']+)'/g)) named.add(key);
    for (const [, key] of text.matchAll(/data-i18n="([^"]+)"/g)) named.add(key);
  }
  for (const key of named) assert.ok(key in ENGLISH, `${key} is missing from locales/en/messages.json`);
  const quoted = sources.map(source => source.text).join('\n');
  for (const key of Object.keys(ENGLISH).filter(key => !key.startsWith('api.'))) assert.ok(quoted.includes(`'${key}'`) || quoted.includes(`"${key}"`), `${key} is never used`);
});

test('every catalogue has only English keys, with English placeholders', () => {
  const directory = join(root, 'locales');
  for (const language of readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
    const catalogue = JSON.parse(readFileSync(join(directory, language, 'messages.json'), 'utf8'));
    for (const [key, message] of Object.entries(catalogue)) {
      if (key.startsWith('catalog.')) continue;
      assert.ok(key in ENGLISH, `${language}: ${key} is not an English key`);
      assert.deepEqual(placeholders(message), placeholders(ENGLISH[key]), `${language}: ${key} has other placeholders`);
    }
  }
});

test('no interface text is written into the extension outside the catalogue', () => {
  // The brand, symbols and the Chinese preview samples are not interface text.
  const allowed = new Set(['Vocabularium', '×', '•••', '✕', '.', '幸福', '我真的很幸福']);
  const found = [];
  for (const { path, text } of sources) {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*\*)/.test(line)) return;
      const texts = [
        // Text between tags; an arrow's `=>` or a type's `Promise<…>` is code.
        ...[...line.matchAll(/(?<![=-])>\s*(\p{L}[^<>{}=&|;]*?)\s*<\/?[A-Za-z]/gu)].map(match => match[1]),
        ...[...line.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]*\p{L}[^"]*)"/gu)].filter(() => !/data-i18n/.test(line)).map(match => match[1]),
        ...[...line.matchAll(/(?:textContent\s*=|setAttribute\('aria-label',)\s*['`]([^'`]*\p{L}{2}[^'`]*)['`]/gu)].map(match => match[1])
      ].filter(value => value && !allowed.has(value) && !(path.endsWith('.html') && /data-i18n=/.test(line)));
      for (const value of texts) found.push(`${path}:${index + 1}: ${value}`);
    });
  }
  assert.deepEqual(found, []);
});

test('messages fill placeholders and choose plural forms by language', () => {
  assert.equal(format('Delete {name}?', { name: 'German' }), 'Delete German?');
  assert.equal(format('{count, plural, one {# page} other {# pages}}', { count: 1 }, 'en'), '1 page');
  assert.equal(format('{count, plural, one {# page} other {# pages}}', { count: 1200 }, 'en'), '1,200 pages');
  assert.equal(format('{count, plural, =0 {no pages} other {# pages}}', { count: 0 }, 'en'), 'no pages');
  const russian = '{count, plural, one {# страница} few {# страницы} many {# страниц} other {# страницы}}';
  assert.deepEqual([1, 3, 5, 21].map(count => format(russian, { count }, 'ru')), ['1 страница', '3 страницы', '5 страниц', '21 страница']);
  const arabic = '{count, plural, zero {لا صفحات} one {صفحة} two {صفحتان} few {# صفحات} many {# صفحة} other {# صفحة}}';
  assert.deepEqual([0, 2, 3].map(count => format(arabic, { count }, 'ar')), ['لا صفحات', 'صفحتان', '3 صفحات']);
  assert.equal(format('Passage · {count, plural, one {# word} other {# words}} by {name}', { count: 2, name: 'Ana' }, 'en'), 'Passage · 2 words by Ana');
  assert.equal(format('{missing} stays', {}), '{missing} stays');
});

test('only offered languages apply; English is the fallback and the default', () => {
  assert.deepEqual(offeredLanguages().map(language => language.code), ['en', 'ar', 'zh-Hans', 'fr', 'ru', 'es'], 'each language is offered once its review is recorded');
  assert.equal(isOffered('en'), true);
  assert.equal(isOffered('de'), false);
  setLanguage('fr');
  assert.equal(t('common.cancel'), 'Annuler');
  assert.equal(t('deck.pageCount', { count: 2 }), '2 pages');
  assert.equal(t('deck.pageCount', { count: 1 }), '1 page');
  setLanguage('de');
  assert.equal(t('common.cancel'), 'Cancel', 'a language not offered shows English');
  assert.throws(() => t(/** @type {any} */ ('no.such.key')), /Unknown message/);
});

test('pseudo-languages accent and lengthen every message, or run English right to left, and are never offered', () => {
  assert.equal(pseudoMessage('Delete {name}?'), '⟦Délété {name}?··⟧');
  const pages = pseudoMessage('{count, plural, one {# page} other {# pages}}');
  assert.equal(format(pages, { count: 1 }, 'en'), '⟦1 págé··⟧');
  assert.equal(format(pages, { count: 3 }, 'en'), '⟦3 págéš··⟧');
  setPseudoLanguage('en-XA');
  assert.equal(t('common.cancel'), '⟦Çáñçél··⟧');
  assert.equal(t('action.deleteNamed', { name: 'German' }), '⟦Délété German··⟧', 'values stay as they are');
  assert.equal(direction(), 'ltr');
  setPseudoLanguage('ar-XB');
  assert.equal(t('common.cancel'), 'Cancel');
  assert.equal(direction(), 'rtl');
  assert.equal(offeredLanguages().length, 6, 'pseudo-languages are never offered');
  setPseudoLanguage(null);
  assert.equal(direction(), 'ltr');
  assert.equal(t('common.cancel'), 'Cancel');
});

test('every api entry is a message the API or the domain still sends, matched whatever its values', () => {
  const server = ['../src/', '../packages/domain/src/'].flatMap(folder => readdirSync(new URL(folder, import.meta.url), { recursive: true })
    .map(String).filter(path => /\.(mjs|ts)$/.test(path) && !path.includes('generated')).map(path => readFileSync(new URL(folder + path, import.meta.url), 'utf8'))).join('\n');
  for (const [key, message] of Object.entries(ENGLISH).filter(([key]) => key.startsWith('api.'))) {
    const source = message.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '\\$\\{.+?\\}');
    assert.match(server, new RegExp(source), `${key}: “${message}” is no longer in the API or the domain`);
  }
  setLanguage('en');
  assert.equal(apiText('Choose a deck.'), 'Choose a deck.');
  assert.equal(apiText('There is already a Context.'), 'There is already a Context.');
  assert.equal(apiText('Database ownership was lost; restart the API.'), 'Database ownership was lost; restart the API.', 'an operator message stays as it is');
  setPseudoLanguage('en-XA');
  assert.equal(apiText('There is already a Context.'), '⟦Théré íš álréádý á Context.·····⟧', 'the module name comes from the API');
  assert.equal(apiText('Database ownership was lost; restart the API.'), 'Database ownership was lost; restart the API.');
  setPseudoLanguage(null);
});

// The catalog's texts a language's catalogue names (D14, K36): module and
// family names, descriptions, facet names and the core's names, not facet abbreviations.
const { CATALOG, FAMILY_LABELS } = await import('@vocabularium/domain/page-modules');
const { PARENTS } = await import('@vocabularium/domain/parents');
const CATALOG_KEYS = [
  ...Object.keys(CATALOG).flatMap(type => [`catalog.${type}.label`, `catalog.${type}.description`]),
  ...Object.keys(FAMILY_LABELS).map(family => `catalog.family.${family}`),
  ...Object.entries(PARENTS).flatMap(([parent, definition]) => [...Object.keys(definition.facets).map(facet => `catalog.${parent}.${facet}.label`),
    `catalog.${parent}.core.word_phrase`, `catalog.${parent}.core.sentence`])
];

test('every language’s catalogue is complete: each English message, each catalog text, and the plural forms its language needs', () => {
  for (const { code } of LANGUAGES.filter(language => language.code !== 'en')) {
    const catalogue = CATALOGUES[code];
    for (const key of [...Object.keys(ENGLISH), ...CATALOG_KEYS]) assert.ok(catalogue[key]?.trim(), `${code}: ${key} is missing`);
    for (const key of Object.keys(catalogue)) assert.ok(key in ENGLISH || CATALOG_KEYS.includes(key), `${code}: ${key} is not a key`);
    const needed = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const [key, message] of Object.entries(catalogue).filter(([, message]) => message.includes(', plural,'))) {
      for (const form of needed) assert.match(message, new RegExp(`\\b${form} \\{`), `${code}: ${key} lacks its ${form} form`);
      for (let count = 0; count < 112; count++) assert.doesNotThrow(() => format(message, { count, finished: 1, total: 2 }, code));
    }
  }
});

test('every explanation is written in every interface language', async () => {
  const { MODULES, folderOf } = await import('@vocabularium/domain/catalog');
  const { explanationLanguages } = await import('@vocabularium/domain/explanations');
  const holders = Object.keys(MODULES).flatMap(module => [[module], ...Object.keys(PARENTS[module]?.facets ?? {}).filter(facet => facet !== 'core').map(facet => [module, facet])]);
  let explained = 0;
  for (const [module, facet] of holders) {
    const languages = explanationLanguages(module, facet);
    if (!languages.length) continue;
    explained++;
    assert.deepEqual(languages.sort(), LANGUAGES.map(language => language.code).sort(), `${folderOf(module)}${facet ? `/${facet}` : ''}`);
  }
  assert.equal(explained, 18, 'German’s four grammar facets, Formula and Code example included (D17)');
});
