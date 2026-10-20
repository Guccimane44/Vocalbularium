import { defineFacet, escapeMarkdown, list, object, text } from '../../../../blocks.js';

// One line per meaning for a word, one for a sentence: "河岸 hé'àn".
export default defineFacet({
  id: 'pinyin', label: 'Pinyin', abbreviation: 'Py', description: 'The pinyin of the Chinese translation.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  shape: list(object({ text: text('the text'), pinyin: text('the pinyin') })),
  format: lines => lines.map(line => `${escapeMarkdown(line.text)} ${escapeMarkdown(line.pinyin)}`).join('\n')
});
