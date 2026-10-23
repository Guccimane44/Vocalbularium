import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGLISH, format, isOffered, offeredLanguages, setLanguage, t } from '../extension/i18n.ts';

// The interface language (D14): every interface text is a catalogue entry,
// English is complete, and other catalogues match it.
const root = new URL('../extension/', import.meta.url).pathname;
const sources = readdirSync(root, { recursive: true }).map(String)
  .filter(path => /\.(tsx?|js|html)$/.test(path) && !path.startsWith('design/') && !path.startsWith('locales/'))
  .map(path => ({ path, text: readFileSync(join(root, path), 'utf8') }));
const placeholders = message => [...message.matchAll(/\{(\w+)/g)].map(match => match[1]).sort();

test('every key the extension names is in the English catalogue, and every entry is used', () => {
  const named = new Set();
  for (const { text } of sources) {
    for (const [, key] of text.matchAll(/\bt\(\s*'([^']+)'/g)) named.add(key);
    for (const [, key] of text.matchAll(/data-i18n="([^"]+)"/g)) named.add(key);
  }
  for (const key of named) assert.ok(key in ENGLISH, `${key} is missing from locales/en/messages.json`);
  const quoted = sources.map(source => source.text).join('\n');
  for (const key of Object.keys(ENGLISH)) assert.ok(quoted.includes(`'${key}'`) || quoted.includes(`"${key}"`), `${key} is never used`);
});

test('every catalogue has only English keys, with English placeholders', () => {
  const directory = join(root, 'locales');
  for (const language of readdirSync(directory)) {
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
  assert.deepEqual(offeredLanguages().map(language => language.code), ['en']);
  assert.equal(isOffered('en'), true);
  assert.equal(isOffered('fr'), false, 'a language is offered only once its catalogue is complete and reviewed');
  setLanguage('fr');
  assert.equal(t('common.cancel'), 'Cancel');
  assert.equal(t('deck.pageCount', { count: 2 }), '2 pages');
  assert.throws(() => t(/** @type {any} */ ('no.such.key')), /Unknown message/);
});
