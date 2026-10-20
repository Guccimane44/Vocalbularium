import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';

// One line, the words separated by commas.
export default defineFacet({
  id: 'synonyms', label: 'Synonyms', abbreviation: 'Sy', description: 'German words with the same meaning.',
  applies: ['word_phrase'], output: 'text',
  shape: list(text()),
  format: words => words.map(escapeMarkdown).join(', ')
});
