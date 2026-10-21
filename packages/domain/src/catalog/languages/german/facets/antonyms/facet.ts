import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';

// One line, the words separated by commas.
export default defineFacet({
  id: 'antonyms', label: 'Antonyms', abbreviation: 'An', description: 'German words with the opposite meaning.',
  applies: ['word_phrase'], output: 'text',
  shape: list(text()),
  format: words => words.map(escapeMarkdown).join(', ')
});
