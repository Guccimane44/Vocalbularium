import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDraft, ContentError, draftOf, filledFacets, formatContent, formatFacet, hasFacetContent, isEmptyContent, parentContentOf, parentDocument, providerCore,
  validateParentContent, withFacetText } from '@vocabularium/domain/content';
import { GeneratedError, validateGenerated } from '@vocabularium/domain/generated';
import { escapeMarkdown, parseMarkdown, plainLines } from '@vocabularium/domain/markdown';
import { blockText } from '@vocabularium/domain/pages';
import { renderParent } from '@vocabularium/domain/render';

// Parent content (D09, amended): the provider's JSON checked complete, formatted
// into markdown per facet as the card looks, read back by a small markdown
// subset, saved with its top line locked, and rendered into containers.
const ALL = ['article', 'examples', 'synonyms', 'antonyms'];
const bank = {
  core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer eines Flusses', 'Geldinstitut'] },
  facets: {
    article: { singular: 'das Ufer', plural: 'die Ufer' },
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }, { sentence: 'The bank opened.' }],
    synonyms: ['Flussufer', 'Gestade']
  }
};
const throws = (action, kind, message) => assert.throws(action, error => error instanceof kind && message.test(error.message), String(message));

test('a provider result is checked complete against the parent’s shape and trimmed', () => {
  assert.deepEqual(validateGenerated('german', bank, { facets: ALL }), bank);
  assert.deepEqual(validateGenerated('german', { core: { kind: 'word', language: ' Englisch ', key: 'bank', romanization: '  ', meanings: [' Ufer '] },
    facets: { article: { singular: 'das Ufer', plural: '' } } }),
  { core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] }, facets: { article: { singular: 'das Ufer' } } });
  for (const [value, message] of [
    [{ ...bank, extra: 1 }, /unexpected field "extra"/],
    [{ core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: [] }, facets: {} }, /The meanings is empty/],
    [{ core: { kind: 'poem', language: 'Englisch', key: 'bank', meanings: ['x'] }, facets: {} }, /Word or sentence must be one of "word", "sentence"/],
    [{ core: { kind: 'sentence', language: 'Englisch', key: 'We sat.' }, facets: {} }, /The meanings is not a list/],
    [{ ...bank, facets: { pinyin: [{ text: 'a', pinyin: 'b' }] } }, /German has no facet "pinyin"/],
    [{ ...bank, facets: { article: { plural: 'die Ufer' } } }, /Article: the singular is missing/],
    [{ ...bank, facets: { examples: [{ translation: 'only' }] } }, /Examples 1: the sentence is missing/],
    [{ ...bank, facets: { synonyms: Array(21).fill('x') } }, /too many items/],
    ['markup text', /not structured/]
  ]) throws(() => validateGenerated('german', value), GeneratedError, message);
  throws(() => validateGenerated('german', bank, { facets: ['examples'] }), GeneratedError, /German has no Article here/);
});

test('a result is formatted into markdown as the card looks, every literal character escaped', () => {
  const content = formatContent('german', bank);
  assert.deepEqual(content.header, { kind: 'word', language: 'Englisch', key: 'bank' });
  assert.equal(content.core, '1. Ufer eines Flusses\n2. Geldinstitut');
  assert.deepEqual(content.facets, {
    article: 'das Ufer · die Ufer',
    examples: '1. We sat on the bank.\n   *Wir saßen am Ufer.*\n2. The bank opened.',
    synonyms: 'Flussufer, Gestade'
  });
  assert.equal(formatFacet('german', 'article', { singular: 'das Fernweh' }), 'das Fernweh');
  assert.equal(formatFacet('chinese', 'pinyin', [{ text: '河岸', pinyin: 'hé’àn' }, { text: '银行', pinyin: 'yínháng' }]), '河岸 hé’àn\n银行 yínháng');
  // A sentence has the same core as a word (D17): its translation is its one meaning, shown as text.
  assert.deepEqual(formatContent('german', { core: { kind: 'sentence', language: 'Englisch', key: 'We sat.', meanings: ['Wir saßen am Ufer.'] }, facets: {} }),
    { header: { kind: 'sentence', language: 'Englisch', key: 'We sat.' }, core: 'Wir saßen am Ufer.', facets: {} });
  assert.deepEqual(formatContent('german', { core: { ...bank.core, gramRole: 'noun' }, facets: {} }).header, { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun' },
    'a German word’s top line keeps its grammatical role');
  // Text the model writes is literal: nothing in it turns into formatting.
  assert.equal(escapeMarkdown('a *b* `c` ==d== \\e'), 'a \\*b\\* \\`c\\` \\=\\=d\\=\\= \\\\e');
  assert.equal(escapeMarkdown('1. not a list\n- nor this'), '1\\. not a list\n\\- nor this');
  assert.deepEqual(plainLines(formatContent('german', { core: { kind: 'word', language: 'x', key: 'x', meanings: ['*stars* and `ticks`'] }, facets: {} }).core),
    ['*stars* and `ticks`']);
});

test('the markdown subset reads paragraphs, lists, bold, italic, code and highlight, and nothing else', () => {
  assert.deepEqual(parseMarkdown('**bold** and *italic*, `code`, ==mark==\nnext line'), [{ type: 'paragraph', children: [
    { type: 'strong', children: [{ type: 'text', text: 'bold' }] }, { type: 'text', text: ' and ' }, { type: 'em', children: [{ type: 'text', text: 'italic' }] },
    { type: 'text', text: ', ' }, { type: 'code', text: 'code' }, { type: 'text', text: ', ' }, { type: 'mark', children: [{ type: 'text', text: 'mark' }] },
    { type: 'break' }, { type: 'text', text: 'next line' }] }]);
  assert.deepEqual(parseMarkdown('3. three\n   *more*\n4. four\n\n- a\n- b'), [
    { type: 'list', ordered: true, start: 3, items: [[{ type: 'text', text: 'three' }, { type: 'break' }, { type: 'em', children: [{ type: 'text', text: 'more' }] }], [{ type: 'text', text: 'four' }]] },
    { type: 'list', ordered: false, start: 1, items: [[{ type: 'text', text: 'a' }], [{ type: 'text', text: 'b' }]] }]);
  assert.deepEqual(parseMarkdown('**nested *em* inside**'), [{ type: 'paragraph', children: [{ type: 'strong', children: [
    { type: 'text', text: 'nested ' }, { type: 'em', children: [{ type: 'text', text: 'em' }] }, { type: 'text', text: ' inside' }] }] }]);
  // Unsupported or unclosed markup stays text; HTML is text, never markup.
  for (const source of ['# heading', '[link](https://example.com)', '**unclosed', '<b>bold</b> & <script>x</script>', 'a * b'])
    assert.deepEqual(plainLines(source), [source], source);
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(plainLines('1. **Ufer**\n2. Geld\n\nTail'), ['Ufer', 'Geld', 'Tail']);
});

test('saved content keeps its top line, any part may be empty, and only the instance’s facets count', () => {
  const stored = formatContent('german', bank);
  assert.deepEqual(validateParentContent('german', stored, { facets: ALL }), stored);
  const draft = { ...draftOf('german', stored, ALL), language: 'Spanisch' };
  assert.deepEqual(draft, { core: stored.core, facets: { article: stored.facets.article, examples: stored.facets.examples, synonyms: stored.facets.synonyms, antonyms: '' },
    language: 'Spanisch' }, 'an empty facet the card has is in the draft to fill');
  const saved = applyDraft('german', stored, { core: '', facets: { article: '  ', examples: stored.facets.examples, antonyms: '**Strom**', pinyin: 'x' }, language: 'Spanisch' }, { facets: ALL });
  assert.deepEqual(saved, { header: stored.header, core: '', facets: { examples: stored.facets.examples, antonyms: '**Strom**' } },
    'the top line kept, the core emptied, an emptied facet gone, an empty one filled, and a facet the parent lacks ignored');
  assert.deepEqual(applyDraft('german', stored, { core: '1. Ufer', facets: { synonyms: 'Damm' } }, { facets: ['examples'] }).facets, {});
  throws(() => validateParentContent('german', { ...stored, facets: { pinyin: 'x' } }), ContentError, /German has no facet "pinyin"/);
  throws(() => validateParentContent('german', stored, { facets: ['examples'] }), ContentError, /German has no Article here/);
  throws(() => validateParentContent('german', { ...stored, header: undefined }), ContentError, /top line is missing/);
  throws(() => validateParentContent('german', { ...stored, core: 'x'.repeat(8001) }), ContentError, /too long/);
});

test('facet texts are read, replaced and removed one at a time; empty content has nothing to replace', () => {
  const content = formatContent('german', bank);
  assert.deepEqual(filledFacets('german', content), ['article', 'examples', 'synonyms']);
  assert.equal(hasFacetContent(content, 'antonyms'), false);
  const added = withFacetText(content, 'antonyms', 'Strom');
  assert.deepEqual(filledFacets('german', added), ['article', 'examples', 'synonyms', 'antonyms']);
  assert.deepEqual(filledFacets('german', withFacetText(added, 'examples', '  ')), ['article', 'synonyms', 'antonyms'], 'an empty text removes the facet');
  assert.equal(content.facets.antonyms, undefined, 'the original is not changed');
  assert.equal(isEmptyContent(content), false);
  assert.equal(isEmptyContent({ header: content.header, core: '', facets: {} }), true);
  assert.equal(isEmptyContent({ header: content.header, core: '', facets: { synonyms: 'Damm' } }), false);
  assert.deepEqual(providerCore('german', content), { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer eines Flusses', 'Geldinstitut'] },
    'a facet’s own Retry gives the provider the core it follows');
  assert.deepEqual(providerCore('german', { header: { kind: 'sentence', language: 'Englisch', key: 'We sat.' }, core: 'Wir **saßen** am Ufer.', facets: {} }),
    { kind: 'sentence', language: 'Englisch', key: 'We sat.', meanings: ['Wir saßen am Ufer.'] });
});

test('stored content is one parent block, has no plain text, and renders its core and facets into containers', () => {
  const content = formatContent('german', bank);
  const document = parentDocument(content);
  assert.deepEqual(document, { version: 1, blocks: [{ type: 'parent', ...content }] });
  assert.deepEqual(parentContentOf(document), content);
  assert.equal(blockText(document), '');
  assert.equal(parentContentOf({ version: 1, blocks: [{ type: 'paragraph', text: 'notes' }] }), null);
  const rendered = renderParent('german', content);
  assert.deepEqual(rendered.heading, { language: 'Englisch', key: 'bank', pronunciation: null, labels: ['Wort'] });
  assert.deepEqual(renderParent('german', { ...content, header: { ...content.header, gramRole: 'verb' } }).heading.labels, ['Wort', 'Verb'],
    'the labels are the module’s own, in its language (D17, K51)');
  assert.deepEqual(renderParent('german', { ...content, header: { ...content.header, gramRole: 'particle' } }).heading.labels, ['Wort', 'particle'],
    'a grammatical role outside the list is shown as written');
  assert.equal(rendered.core[0].type, 'list');
  assert.deepEqual(rendered.facets.map(facet => [facet.facet, facet.label]), [['article', 'Article'], ['examples', 'Examples'], ['synonyms', 'Synonyms']]);
  assert.deepEqual(rendered.facets[0].body, [{ type: 'paragraph', children: [{ type: 'text', text: 'das Ufer · die Ufer' }] }]);
  const sentence = renderParent('chinese', { header: { kind: 'sentence', language: '英语', key: 'We sat on the bank.' }, core: '我们坐在河岸上。', facets: { pinyin: 'wǒmen', examples: '1. 一' } });
  assert.deepEqual(sentence.heading, { language: '英语', key: 'We sat on the bank.', pronunciation: null, labels: ['句子'] });
  assert.equal(sentence.reading, true);
  const expertise = renderParent('mathematics', { header: { kind: 'expertise', key: 'retinol', relevance: 'unrelated' }, core: 'Retinol is not a mathematics concept.', facets: {} });
  assert.deepEqual(expertise.heading, { language: '', key: 'retinol', pronunciation: null, labels: [] }, 'an Expertise top line shows the key only');
  assert.deepEqual(sentence.facets.map(facet => facet.facet), ['examples', 'pinyin'], 'in the parent’s order, not the data’s');
});

test('the live editor’s document converts to and from the markdown subset, round-tripping what generation writes (D09)', async () => {
  const { fromEditorDoc, toEditorDoc } = await import('@vocabularium/domain/markdown');
  const content = formatContent('german', { ...bank, facets: { ...bank.facets, antonyms: ['Strom', 'a*b'] } });
  for (const text of [content.core, ...Object.values(content.facets), 'Plain\nwith a break', '**bold** *italic* `code` ==mark==', '- a\n- **b**', '3. three\n4. four'])
    assert.equal(fromEditorDoc(toEditorDoc(text)), text, text);
  assert.deepEqual(toEditorDoc('1. We sat.\n   *Wir saßen.*'), { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'We sat.' }, { type: 'hardBreak' }, { type: 'text', text: 'Wir saßen.', marks: [{ type: 'italic' }] }] }] }] }] });
  assert.deepEqual(toEditorDoc(''), { type: 'doc', content: [{ type: 'paragraph' }] });
  // What a user types in the editor becomes markdown the card reads back the same way.
  const typed = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'both ', marks: [] }, { type: 'text', text: 'loud', marks: [{ type: 'italic' }, { type: 'bold' }] },
      { type: 'text', text: ' 1. not a list *star*' }] },
    { type: 'paragraph' },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one ', marks: [{ type: 'highlight' }] }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] }] }] }] }] };
  const written = fromEditorDoc(typed);
  assert.equal(written, 'both **_loud_** 1. not a list \\*star\\*\n\n- ==one== \n  nested', 'marks close in order, spaces stay outside them, nested items flatten');
  assert.deepEqual(plainLines(written), ['both loud 1. not a list *star*', 'one']);
  assert.equal(fromEditorDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1. starts like a list' }] }] }), '1\\. starts like a list');
  // Size and font (D10, amended again): a bracketed span, read and written back the same way.
  for (const text of ['[big]{size=large} and [code-ish]{font=mono}', '**[both]{size=small font=display}**', '1. [one]{size=large}\n2. two',
    '==yellow== and [green]{highlight=green}', '**[x]{size=large highlight=pink}**'])
    assert.equal(fromEditorDoc(toEditorDoc(text)), text, text);
  const { parseMarkdown: parse } = await import('@vocabularium/domain/markdown');
  assert.deepEqual(parse('[big]{size=large font=display}'), [{ type: 'paragraph', children: [{ type: 'span', size: 'large', font: 'display', children: [{ type: 'text', text: 'big' }] }] }]);
  for (const literal of ['[not]{size=huge}', '[x]{colour=red}', '[open', '[a] {size=large}'])
    assert.deepEqual(parse(literal), [{ type: 'paragraph', children: [{ type: 'text', text: literal }] }], `${literal} stays text`);
  assert.deepEqual(plainLines('[big]{size=large} word'), ['big word'], 'the span leaves no trace in plain text');
  assert.deepEqual(parse('[x]{highlight=blue}'), [{ type: 'paragraph', children: [{ type: 'span', highlight: 'blue', children: [{ type: 'text', text: 'x' }] }] }]);
  assert.deepEqual(parse('[x]{highlight=yellow}'), [{ type: 'paragraph', children: [{ type: 'text', text: '[x]{highlight=yellow}' }] }], 'yellow is written ==, never as a span');
  // Marks written as runs across neighbouring text: overlapping formats read back as they were set.
  const run = (...parts) => ({ type: 'doc', content: [{ type: 'paragraph', content: parts.map(([text, ...marks]) => ({ type: 'text', text, marks: marks.map(type => ({ type })) })) }] });
  for (const [doc, markdown] of [
    [run(['We sat by the ', 'italic'], ['bank', 'italic', 'highlight'], [', twice.', 'italic']), '*We sat by the ==bank==, twice.*'],
    [run(['a ', 'bold'], ['b', 'bold', 'italic'], [' c']), '**a _b_** c'],
    [run(['one', 'highlight'], [' two', 'bold', 'highlight']), '==one **two**==']
  ]) {
    assert.equal(fromEditorDoc(doc), markdown);
    assert.equal(fromEditorDoc(toEditorDoc(markdown)), markdown, `${markdown} round-trips`);
  }
  // The main key as a stored highlight (D10, amended a fourth time).
  const { highlightKey } = await import('@vocabularium/domain/markdown');
  assert.equal(highlightKey('1. We sat on the bank.\n   *Wir saßen am Ufer.*', 'bank'), '1. We sat on the ==bank==.\n   *Wir saßen am Ufer.*');
  assert.equal(highlightKey('Bank and banks', ' bank '), '==Bank== and ==bank==s', 'ignoring case, as the card matched');
  assert.equal(highlightKey('`bank` and ==bank==', 'bank'), '`bank` and ==bank==', 'code and existing highlights stay');
  assert.equal(highlightKey(highlightKey('the bank', 'bank'), 'bank'), 'the ==bank==', 'applied twice, the same');
  assert.equal(highlightKey('**bank**', 'bank'), '**==bank==**');
  assert.equal(highlightKey('Ufer', 'bank'), 'Ufer', 'nothing to mark leaves the text as it was');
  // No markdown in the editor (D10): whatever is typed reads back as typed.
  const { parseMarkdown } = await import('@vocabularium/domain/markdown');
  for (const literal of ['**bold?**', '*star* and _under_', '- a dash', '+ a plus', '1. a number', '`tick`', '==mark==', 'back\\slash', '[x]{size=large}']) {
    const stored = fromEditorDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: literal }] }] });
    assert.deepEqual(parseMarkdown(stored), [{ type: 'paragraph', children: [{ type: 'text', text: literal }] }], `${literal} → ${stored}`);
  }
});
