import test from 'node:test';
import assert from 'node:assert/strict';
import { emphasise, renderContent } from '@vocabularium/domain/render';

// The recorded formats from the module specifications and provider tests.
const explanation = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück; Glückseligkeit; Wohlbefinden\n: [2] glücklich; gesegnet';
const examples = `${explanation}\n=== Beispiele ===\n: [1] 她希望孩子们拥有幸福。\n:: Sie hofft, dass die Kinder Glück haben.\n: [2] 他们过着幸福的生活。\n:: Sie führen ein glückliches Leben.`;

test('German explanation renders its heading and numbered meanings', () => {
  assert.deepEqual(renderContent('german-explanation', explanation), {
    kind: 'entry', heading: { language: 'Chinesisch', key: '幸福', pronunciation: 'xìngfú' },
    meanings: [{ number: '1', text: 'Glück; Glückseligkeit; Wohlbefinden' }, { number: '2', text: 'glücklich; gesegnet' }], examples: []
  });
  assert.deepEqual(renderContent('german-explanation', '== Englisch ==\n\n=== Bedeutungen ===\n: [1] Zufall').heading,
    { language: 'Englisch', key: null, pronunciation: null }, 'blank lines and a heading without key are accepted');
});

test('German explanation + examples pairs each sentence with its translation', () => {
  const rendered = renderContent('german-examples', examples);
  assert.equal(rendered.kind, 'entry');
  assert.equal(rendered.meanings.length, 2);
  assert.deepEqual(rendered.examples, [
    { number: '1', sentence: '她希望孩子们拥有幸福。', translation: 'Sie hofft, dass die Kinder Glück haben.' },
    { number: '2', sentence: '他们过着幸福的生活。', translation: 'Sie führen ein glückliches Leben.' }
  ]);
  const alone = renderContent('german-examples', `${explanation}\n=== Beispiele ===\n: [1] Ohne Übersetzung.`);
  assert.deepEqual(alone.examples, [{ number: '1', sentence: 'Ohne Übersetzung.', translation: null }], 'a sentence without a translation stands alone');
  assert.equal(renderContent('german-examples', explanation).kind, 'entry', 'meanings alone still render');
});

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

test('Sentence usage is one reading sentence', () => {
  assert.deepEqual(renderContent('sentence-usage', '  想到我的家人和朋友，我觉得我真的很幸福。\n'), { kind: 'sentence', text: '想到我的家人和朋友，我觉得我真的很幸福。' });
});

test('the main key is emphasised wherever it occurs, case-insensitively', () => {
  assert.deepEqual(emphasise('她希望孩子们拥有幸福。', '幸福'), [{ text: '她希望孩子们拥有', key: false }, { text: '幸福', key: true }, { text: '。', key: false }]);
  assert.deepEqual(emphasise('Serendipity, pure serendipity.', 'serendipity').filter(part => part.key).map(part => part.text), ['Serendipity', 'serendipity']);
  assert.deepEqual(emphasise('nothing here', 'Glück'), [{ text: 'nothing here', key: false }]);
  assert.deepEqual(emphasise('text', '  '), [{ text: 'text', key: false }]);
});
