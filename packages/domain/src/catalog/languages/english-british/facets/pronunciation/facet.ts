import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';
import { americanSpelling } from '../../english.js';

// The translation, spoken (D24): one line per meaning, a sentence's
// translation, or an English key itself; each line is one clip. ElevenLabs
// takes `en` for both English modules, so the British accent comes from the
// voice named for this part, `english-british.pronunciation`.
export default defineFacet({
  id: 'pronunciation', label: 'Pronunciation', abbreviation: 'Pr', description: 'The English translation, spoken in a British voice.',
  applies: ['word_phrase', 'sentence'], output: 'text', spoken: { language: 'en' },
  shape: list(text('the English to speak')),
  format: lines => lines.map(escapeMarkdown).join('\n'),
  checks: [{
    // The core's label before a meaning in this Context (D29) is never spoken.
    id: 'no-context-label', description: 'No line speaks the label the card shows before a meaning in this Context.',
    test: lines => lines.find(line => /in this context/i.test(line)) ? `"${lines.find(line => /in this context/i.test(line))}" speaks the label` : null
  }, {
    id: 'british-spelling', description: 'No line uses a common American spelling, unless it is a word of the key.',
    test: (lines, { core }) => americanSpelling(lines, core)
  }]
});
