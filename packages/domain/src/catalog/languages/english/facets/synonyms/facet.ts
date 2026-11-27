import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';

// One line, the words separated by commas.
export default defineFacet({
  id: 'synonyms', label: 'Synonyms', abbreviation: 'Sy', description: 'Words with the same meaning, in the selection\'s language.',
  applies: ['word_phrase'],
  shape: list(text()),
  format: words => words.map(escapeMarkdown).join(', ')
});
