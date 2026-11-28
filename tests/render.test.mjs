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

// Since 2026-11-27 every facet describes the selection: a foreign key gets no
// grammar facet and no language module writes Pronunciation. Cards written
// before keep what they have (owner, 2026-11-27): they still read, render and
// play, though nothing writes those facets again.
test('a card written before keeps its Pronunciation and its grammar facets for a foreign key: it reads and renders, and generation never asks for them again', async () => {
  const { renderParent } = await import('@vocabularium/domain/render');
  const { validateParentContent } = await import('@vocabularium/domain/content');
  const { generateComponent } = await import('@vocabularium/domain/modules');
  const { composeModule } = await import('@vocabularium/domain/composer');
  const stored = validateParentContent('german', {
    header: { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun' }, core: '1. Ufer',
    facets: { article: 'das Ufer · die Ufer', pronunciation: 'das Ufer', examples: '1. We sat on the bank.' } });
  const card = renderParent('german', stored);
  assert.deepEqual(card.facets.map(each => each.facet), ['article', 'examples', 'pronunciation'], 'every stored facet renders');
  assert.equal(card.ruledOut.pronunciation, 'retired', 'a retired facet has no Retry');
  assert.equal(card.ruledOut.article, 'role', 'nor does a grammar facet on a foreign key');
  const request = composeModule({ module: { id: 'g', type: 'german' }, selectedText: 'bank', facets: ['article', 'pronunciation'] });
  assert.ok(!('pronunciation' in request.schema.properties.facets.properties) && !/"pronunciation"/.test(request.instructions), 'the request never names it');
  let asked;
  const content = await generateComponent({ mainKey: 'bank', module: { id: 'g', type: 'german', facets: ['article', 'pronunciation'] },
    generate: async input => { asked = input.facets; return { core: { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Ufer'] },
      facets: { article: { singular: 'das Ufer' } } }; } });
  assert.deepEqual(asked, ['article']);
  assert.deepEqual(content.facets, {}, 'Article for a foreign key is dropped');
});
