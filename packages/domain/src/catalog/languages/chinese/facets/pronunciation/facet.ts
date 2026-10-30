import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';

// The translation, spoken (D24): one line per meaning, in Simplified Hanzi, a
// sentence's translation, or a Chinese key itself; each line is one clip.
export default defineFacet({
  id: 'pronunciation', label: 'Pronunciation', abbreviation: 'Pr', description: 'The Chinese translation, spoken.',
  applies: ['word_phrase', 'sentence'], output: 'text', spoken: { language: 'zh' },
  shape: list(text('the Chinese to speak')),
  format: lines => lines.map(escapeMarkdown).join('\n')
});
