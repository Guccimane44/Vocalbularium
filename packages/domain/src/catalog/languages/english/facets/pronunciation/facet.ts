import { defineFacet, escapeMarkdown, list, text } from '../../../../blocks.js';
import { keyIsEnglish } from '../../english.js';

// The translation, spoken (D24): one line per meaning, a sentence's
// translation, or an English key itself; each line is one clip, spoken with
// the `en` voice, or one named for `english.pronunciation`.
export default defineFacet({
  id: 'pronunciation', label: 'Pronunciation', abbreviation: 'Pr', description: 'The English translation, spoken.',
  applies: ['word_phrase', 'sentence'], output: 'text', spoken: { language: 'en' },
  shape: list(text('the English to speak')),
  format: lines => lines.map(escapeMarkdown).join('\n'),
  checks: [{
    // The core's label before a meaning in this Context (D29) is never spoken.
    id: 'no-context-label', description: 'No line speaks the label the card shows before a meaning in this Context.',
    test: lines => lines.find(line => /in this context/i.test(line)) ? `"${lines.find(line => /in this context/i.test(line))}" speaks the label` : null
  }, {
    // An English key is spoken itself, once: never its meanings (0.16.4 gate, gut).
    id: 'english-key-spoken', description: 'For an English key, a line speaks the key itself.',
    test: (lines, { core }) => {
      if (!keyIsEnglish(core)) return null;
      const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}']+/gu)?.join(' ') ?? '';
      return lines.some(line => words(line) === words(String(core.key ?? ''))) ? null : `an English key speaks itself, not ${JSON.stringify(lines)}`;
    }
  }]
});
