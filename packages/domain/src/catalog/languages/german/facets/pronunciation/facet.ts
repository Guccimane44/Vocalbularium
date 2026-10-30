import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';

// The translation, spoken (D24): one line per meaning, a noun with its article,
// a sentence's translation, or a German key itself; each line is one clip.
export default defineFacet({
  id: 'pronunciation', label: 'Pronunciation', abbreviation: 'Pr', description: 'The German translation, spoken.',
  applies: ['word_phrase', 'sentence'], output: 'text', spoken: { language: 'de' },
  shape: list(text('the German to speak')),
  format: lines => lines.map(escapeMarkdown).join('\n')
});
