import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';
import { americanSpelling } from '../../english.js';

// One line, the words separated by commas.
export default defineFacet({
  id: 'synonyms', label: 'Synonyms', abbreviation: 'Sy', description: 'English words with the same meaning.',
  applies: ['word_phrase'], output: 'text',
  shape: list(text()),
  format: words => words.map(escapeMarkdown).join(', '),
  checks: [{
    id: 'british-spelling', description: 'No synonym uses a common American spelling, unless it is a word of the key.',
    test: (words, { core }) => americanSpelling(words, core)
  }]
});
