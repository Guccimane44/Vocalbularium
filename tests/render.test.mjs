import test from 'node:test';
import assert from 'node:assert/strict';
import { emphasise, renderContent } from '@vocabularium/domain/render';

// Formats of the content modules retired in 0.7.0 (D08): they and every other
// text outside a parent's contract render as plain text.
const explanation = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück; Glückseligkeit; Wohlbefinden\n: [2] glücklich; gesegnet';
const examples = `${explanation}\n=== Beispiele ===\n: [1] 她希望孩子们拥有幸福。\n:: Sie hofft, dass die Kinder Glück haben.\n: [2] 他们过着幸福的生活。\n:: Sie führen ein glückliches Leben.`;

test('anything outside the contract falls back to the plain text, unchanged', () => {
  const cases = [
    ['german-explanation', examples, 'examples are not part of German explanation'],
    ['german-explanation', `${explanation}\nA stray line`, 'one unknown line'],
    ['german-examples', `${examples}\n:: dangling translation`, 'a translation without a sentence'],
    ['german-examples', '=== Beispiele ===\n: [1] Satz', 'no meanings'],
    ['german-explanation', 'My own edited explanation.', 'edited free text'],
    ['german-explanation', '<b>Glück</b>', 'markup stays literal'],
    ['german-examples', `${explanation}\n=== Beispiele ===`, 'an empty examples section'],
    ['text', ': [1] my note', 'the user’s own text'],
    ['context', explanation, 'Context is never parsed'],
    ['unknown-module', explanation, 'an unknown module']
  ];
  for (const [type, text, why] of cases) assert.deepEqual(renderContent(type, text), { kind: 'plain', text }, why);
  assert.deepEqual(renderContent('german-examples', ''), { kind: 'plain', text: '' });
});

test('the main key is emphasised wherever it occurs, case-insensitively', () => {
  assert.deepEqual(emphasise('她希望孩子们拥有幸福。', '幸福'), [{ text: '她希望孩子们拥有', key: false }, { text: '幸福', key: true }, { text: '。', key: false }]);
  assert.deepEqual(emphasise('Serendipity, pure serendipity.', 'serendipity').filter(part => part.key).map(part => part.text), ['Serendipity', 'serendipity']);
  assert.deepEqual(emphasise('nothing here', 'Glück'), [{ text: 'nothing here', key: false }]);
  assert.deepEqual(emphasise('text', '  '), [{ text: 'text', key: false }]);
});
