import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';
import { americanSpelling } from '../../english.js';

// One line, the words separated by commas.
export default defineFacet({
  id: 'antonyms', label: 'Antonyms', abbreviation: 'An', description: 'English words with the opposite meaning.',
  applies: ['word_phrase'],
  shape: list(text()),
  format: words => words.map(escapeMarkdown).join(', '),
  checks: [{
    id: 'british-spelling', description: 'No antonym uses a common American spelling, unless it is a word of the key.',
    test: (words, { core }) => americanSpelling(words, core)
  }]
});
