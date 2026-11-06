import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';

// The translation, spoken (D24): one line per meaning, a noun with its article,
// a sentence's translation, or a German key itself; each line is one clip.
export default defineFacet({
  id: 'pronunciation', label: 'Pronunciation', abbreviation: 'Pr', description: 'The German translation, spoken.',
  applies: ['word_phrase', 'sentence'], output: 'text', spoken: { language: 'de' },
  shape: list(text('the German to speak')),
  format: lines => lines.map(escapeMarkdown).join('\n'),
  // The core's label before a meaning in this Context (D29) is never spoken.
  checks: [{
    id: 'no-context-label', description: 'No line speaks the label the card shows before a meaning in this Context.',
    test: lines => lines.find(line => /in diesem Zusammenhang/i.test(line)) ? `"${lines.find(line => /in diesem Zusammenhang/i.test(line))}" speaks the label` : null
  }]
});
