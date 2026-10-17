import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '@vocabularium/domain/markdown';
import { emphasise, renderContent } from '@vocabularium/domain/render';

// Formats of the content modules retired in 0.7.0 (D08): they and every other
// text outside a parent's contract render as plain text.
const explanation = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück; Glückseligkeit; Wohlbefinden\n: [2] glücklich; gesegnet';
const examples = `${explanation}\n=== Beispiele ===\n: [1] 她希望孩子们拥有幸福。\n:: Sie hofft, dass die Kinder Glück haben.\n: [2] 他们过着幸福的生活。\n:: Sie führen ein glückliches Leben.`;

test('plain text renders as plain text, unchanged, markup included (D09: nothing is parsed from text); Context and Text as markdown (D10)', () => {
  for (const text of ['', 'Glück', '== Englisch ==\n=== Bedeutungen ===\n: [1] Ufer', '<b>bold</b> & more']) {
    assert.deepEqual(renderContent('main-key', text), { kind: 'plain', text });
    assert.deepEqual(renderContent('german', text), { kind: 'plain', text }, 'a parent is never read from text');
  }
  assert.deepEqual(renderContent('context', 'by the ==bank=='), { kind: 'note', blocks: parseMarkdown('by the ==bank==') });
  assert.deepEqual(renderContent('text', ''), { kind: 'note', blocks: [] });
});

test('the main key is emphasised wherever it occurs, case-insensitively', () => {
  assert.deepEqual(emphasise('她希望孩子们拥有幸福。', '幸福'), [{ text: '她希望孩子们拥有', key: false }, { text: '幸福', key: true }, { text: '。', key: false }]);
  assert.deepEqual(emphasise('Serendipity, pure serendipity.', 'serendipity').filter(part => part.key).map(part => part.text), ['Serendipity', 'serendipity']);
  assert.deepEqual(emphasise('nothing here', 'Glück'), [{ text: 'nothing here', key: false }]);
  assert.deepEqual(emphasise('text', '  '), [{ text: 'text', key: false }]);
});
