import { defineFacet, escapeMarkdown, foreignLetters, list, numbered, text } from '../../../../blocks.js';
import { americanSpelling, isEnglish } from '../../english.js';

// The core again in simple British English (0.16.4), at CEFR A2: one line per
// meaning, in the core's order, the meaning in this Context first, so the
// reader can match them; a numbered list for several, plain text for one.
export default defineFacet({
  id: 'simple-translation', label: 'Simple translation', abbreviation: 'Si', description: 'The meanings again, in simple English.',
  applies: ['word_phrase', 'sentence'],
  shape: list(text('the simple line'), { name: 'the lines', each: 'Line' }),
  format: lines => lines.length === 1 ? escapeMarkdown(lines[0]!.trim()) : numbered(lines.map(line => escapeMarkdown(line.trim()))),
  checks: [{
    id: 'english-lines', description: 'Every line is written in English, in the Latin script.',
    test: lines => lines.map(line => !isEnglish(line) ? `"${line}" is not English: ${foreignLetters(line, 'latin') || 'no letters'}` : null).find(Boolean) ?? null
  }, {
    id: 'line-per-meaning', description: 'One line for each of the core\'s meanings, the one in this Context included.',
    test: (lines, { core }) => {
      const meanings = (Array.isArray(core.meanings) ? core.meanings.length : 0) + (core.contextual ? 1 : 0);
      return lines.length !== meanings ? `${lines.length} lines for ${meanings} meanings` : null;
    }
  }, {
    id: 'no-context-label', description: 'No line writes the label the card shows before a meaning in this Context.',
    test: lines => lines.find(line => /in this context/i.test(line)) ? `"${lines.find(line => /in this context/i.test(line))}" writes the label` : null
  }, {
    id: 'british-spelling', description: 'No line uses a common American spelling, unless it is a word of the key.',
    test: (lines, { core }) => americanSpelling(lines, core)
  }]
});
