import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDraft, ContentError, filledFacets, hasFacetContent, parentContentOf, parentDocument, validateParentContent, withFacetEntry } from '@vocabularium/domain/content';
import { blockText } from '@vocabularium/domain/pages';
import { renderContent, renderParent } from '@vocabularium/domain/render';

// Structured parent content (D09, 0.7.4): shapes, field-editor saves, facet entries and rendering.
const ALL = ['article', 'examples', 'synonyms', 'antonyms'];
const bank = {
  core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer eines Flusses'] },
  facets: {
    article: { singular: 'das Ufer', plural: 'die Ufer' },
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }],
    synonyms: ['Flussufer', 'Gestade']
  }
};
const rejects = (action, message) => assert.throws(action, error => error instanceof ContentError && message.test(error.message), String(message));

test('a parent’s content is checked against its shape and stored trimmed; a generated result must be complete', () => {
  assert.deepEqual(validateParentContent('german', bank, { facets: ALL, complete: true }), bank);
  const spaced = validateParentContent('german', { core: { kind: 'word', language: ' Englisch ', key: 'bank', romanization: '  ', meanings: [' Ufer '] },
    facets: { article: { singular: 'das Ufer', plural: '' } } }, { complete: true });
  assert.deepEqual(spaced, { core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] }, facets: { article: { singular: 'das Ufer' } } },
    'an empty romanization or plural is left out');
  assert.deepEqual(validateParentContent('chinese', { core: { kind: 'sentence', translation: '我们坐在河岸上。' },
    facets: { pinyin: [{ text: '我们坐在河岸上。', pinyin: 'wǒmen zuò zài hé’àn shàng.' }] } }, { complete: true }).core, { kind: 'sentence', translation: '我们坐在河岸上。' });

  // Any shape: unknown fields, strangers and empty or oversized lists are refused.
  rejects(() => validateParentContent('german', { ...bank, extra: 1 }), /unexpected field "extra"/);
  rejects(() => validateParentContent('german', { core: { kind: 'poem' }, facets: {} }), /word or a sentence/);
  rejects(() => validateParentContent('german', { core: { kind: 'word', language: 'Englisch', meanings: [] }, facets: {} }), /The key is missing/,
    'the core’s top line is always required');
  rejects(() => validateParentContent('german', { ...bank, facets: { pinyin: [{ text: 'a', pinyin: 'b' }] } }), /German has no facet "pinyin"/);
  rejects(() => validateParentContent('german', bank, { facets: ['examples'] }), /German has no Article here/);
  rejects(() => validateParentContent('german', { ...bank, facets: { synonyms: [] } }), /Synonyms is empty/);
  rejects(() => validateParentContent('german', { ...bank, facets: { examples: [{ sentence: ' ', translation: '' }] } }), /Examples 1 is empty/);
  rejects(() => validateParentContent('german', { ...bank, facets: { synonyms: Array(21).fill('x') } }), /too many items/);
  rejects(() => validateParentContent('german', 'text'), /not structured/);

  // A generated result has every part a reader needs; saved content may have parts left empty.
  const half = { core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: [] },
    facets: { article: { plural: 'die Ufer' }, examples: [{ translation: 'Nur Übersetzung.' }], pinyin: [{ pinyin: 'hé’àn' }] } };
  rejects(() => validateParentContent('german', { core: half.core, facets: {} }, { complete: true }), /The meanings is empty/);
  rejects(() => validateParentContent('german', { core: bank.core, facets: { article: half.facets.article } }, { complete: true }), /Article: the singular is missing/);
  rejects(() => validateParentContent('german', { core: bank.core, facets: { examples: half.facets.examples } }, { complete: true }), /Examples 1: the sentence is missing/);
  rejects(() => validateParentContent('chinese', { core: bank.core, facets: { pinyin: half.facets.pinyin } }, { complete: true }), /Pinyin 1: the text is missing/);
  rejects(() => validateParentContent('german', { core: { kind: 'sentence' }, facets: {} }, { complete: true }), /The translation is missing/);
  assert.deepEqual(validateParentContent('german', { core: half.core, facets: { article: half.facets.article, examples: half.facets.examples } }).facets,
    { article: { plural: 'die Ufer' }, examples: [{ translation: 'Nur Übersetzung.' }] });
  assert.deepEqual(validateParentContent('german', { core: { kind: 'sentence' }, facets: {} }).core, { kind: 'sentence' });
});

test('a field-editor save keeps the core’s top line, keeps half-filled items, drops empty rows and never refuses an empty field', () => {
  const draft = {
    meanings: ['Ufer eines Flusses', '  ', 'Böschung'],
    language: 'Spanisch', key: 'changed',
    facets: {
      article: { singular: '', plural: '' },
      examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }, { sentence: '', translation: '' }, { sentence: '', translation: 'Nur Übersetzung.' }],
      synonyms: ['Flussufer', ''],
      antonyms: ['Strom'],
      pinyin: [{ text: 'x', pinyin: 'y' }]
    }
  };
  const saved = applyDraft('german', bank, draft, { facets: ALL });
  assert.deepEqual(saved.core, { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer eines Flusses', 'Böschung'] },
    'the language and key are not editable');
  assert.deepEqual(saved.facets, {
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }, { translation: 'Nur Übersetzung.' }],
    synonyms: ['Flussufer'], antonyms: ['Strom'] },
  'an emptied facet loses its entry, an empty one filled gains one, a half-filled example stays, and a facet the parent lacks is ignored');
  assert.deepEqual(applyDraft('german', bank, { meanings: ['Ufer'], facets: { antonyms: ['Strom'] } }, { facets: ['examples'] }).facets, {},
    'only the instance’s facets are kept');
  assert.deepEqual(applyDraft('german', bank, { meanings: ['Ufer'], facets: { article: { singular: '', plural: 'die Ufer' } } }, { facets: ALL }).facets,
    { article: { plural: 'die Ufer' } });
  assert.deepEqual(applyDraft('chinese', { core: bank.core, facets: {} }, { meanings: ['河岸'], facets: { pinyin: [{ text: '河岸', pinyin: '' }] } }, { facets: ['pinyin'] }).facets,
    { pinyin: [{ text: '河岸' }] });

  // The core may be emptied too: the card keeps its top line and its facets.
  assert.deepEqual(applyDraft('german', bank, { meanings: ['', ' '], facets: { synonyms: ['Gestade'] } }, { facets: ALL }),
    { core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: [] }, facets: { synonyms: ['Gestade'] } });
  const sentence = { core: { kind: 'sentence', translation: 'Wir saßen am Ufer.' }, facets: {} };
  assert.deepEqual(applyDraft('german', sentence, { translation: ' Wir saßen dort. ', facets: {} }, { facets: ALL }).core, { kind: 'sentence', translation: 'Wir saßen dort.' });
  assert.deepEqual(applyDraft('german', sentence, { translation: '  ', facets: {} }, { facets: ALL }).core, { kind: 'sentence' });
});

test('facet entries are read, replaced and removed one at a time, in the parent’s order', () => {
  assert.deepEqual(filledFacets('german', bank), ['article', 'examples', 'synonyms']);
  assert.equal(hasFacetContent(bank, 'antonyms'), false);
  const added = withFacetEntry(bank, 'antonyms', ['Strom']);
  assert.deepEqual(filledFacets('german', added), ['article', 'examples', 'synonyms', 'antonyms']);
  const removed = withFacetEntry(added, 'examples', undefined);
  assert.deepEqual(filledFacets('german', removed), ['article', 'synonyms', 'antonyms']);
  assert.deepEqual(removed.core, bank.core, 'the core stays');
  assert.deepEqual(bank.facets.examples.length, 1, 'the original is not changed');
  assert.equal(filledFacets('german', null).length, 0);
});

test('structured content is stored as one parent block, has no plain text, and renders as the same card as its 0.7.3 text', () => {
  const document = parentDocument(bank);
  assert.deepEqual(document, { version: 1, blocks: [{ type: 'parent', ...bank }] });
  assert.deepEqual(parentContentOf(document), bank);
  assert.equal(blockText(document), '', 'a parent block holds no paragraph text');
  assert.equal(parentContentOf({ version: 1, blocks: [{ type: 'paragraph', text: 'notes' }] }), null);

  const markup = ['== Englisch (bank) ==', '=== Bedeutungen ===', ': [1] Ufer eines Flusses', '=== Article ===', ': das Ufer · die Ufer',
    '=== Examples ===', ': [1] We sat on the bank.', ':: Wir saßen am Ufer.', '=== Synonyms ===', ': Flussufer', ': Gestade'].join('\n');
  assert.deepEqual(renderParent('german', bank), renderContent('german', markup));

  const chinese = { core: { kind: 'word', language: '英语', key: 'bank', romanization: 'bæŋk', meanings: ['河岸', '银行'] },
    facets: { pinyin: [{ text: '河岸', pinyin: 'hé’àn' }, { text: '银行', pinyin: 'yínháng' }], examples: [{ sentence: 'The bank is open.' }] } };
  const rendered = renderParent('chinese', chinese);
  assert.deepEqual(rendered.core, { kind: 'word', heading: { language: '英语', key: 'bank', pronunciation: 'bæŋk' },
    meanings: [{ number: '1', text: '河岸' }, { number: '2', text: '银行' }] });
  assert.deepEqual(rendered.facets.map(facet => facet.facet), ['examples', 'pinyin'], 'in the parent’s order, not the data’s');
  assert.deepEqual(rendered.facets[0].examples, [{ number: '1', sentence: 'The bank is open.', translation: null }]);
  assert.deepEqual(rendered.facets[1].lines, ['河岸 hé’àn', '银行 yínháng']);
  assert.deepEqual(renderParent('german', { core: { kind: 'sentence', translation: 'Wir saßen am Ufer.' }, facets: { article: { singular: 'das Ufer' } } }),
    { kind: 'parent', core: { kind: 'sentence', text: 'Wir saßen am Ufer.' }, facets: [{ facet: 'article', label: 'Article', lines: ['das Ufer'] }] });
  // Half-filled items, as the user may save them, show the parts they have.
  const half = renderParent('chinese', { core: { kind: 'word', language: '英语', key: 'bank', meanings: [] },
    facets: { examples: [{ translation: '我们坐在河岸上。' }], pinyin: [{ pinyin: 'hé’àn' }] } });
  assert.deepEqual(half.core.meanings, []);
  assert.deepEqual(half.facets[0].examples, [{ number: '1', sentence: null, translation: '我们坐在河岸上。' }]);
  assert.deepEqual(half.facets[1].lines, ['hé’àn']);
  assert.deepEqual(renderParent('german', { core: { kind: 'sentence' }, facets: { article: { plural: 'die Ufer' } } }),
    { kind: 'parent', core: { kind: 'sentence', text: '' }, facets: [{ facet: 'article', label: 'Article', lines: ['die Ufer'] }] });
});
