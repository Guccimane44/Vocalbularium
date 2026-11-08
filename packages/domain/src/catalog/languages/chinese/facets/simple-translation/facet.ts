import { defineFacet, escapeMarkdown, hasScript, list, numbered, text } from '../../../../blocks.js';
import { traditionalIn } from '../../simplified.js';
import { HSK_1_3_CHARACTERS } from '../../hsk.js';

// The Chinese characters of a line outside HSK 1–3 vocabulary, each once; a
// name or term quoted in “” or 「」 is left as it is.
export const aboveHsk3 = (line: string) => [...new Set([...line.replace(/“[^”]*”|「[^」]*」/g, '')]
  .filter(char => /\p{Script=Han}/u.test(char) && !HSK_1_3_CHARACTERS.has(char)))].join('');

// The core again in simple Chinese (0.16.4), in the words of HSK levels 1–3:
// for a word one line per meaning, `contextual` first, in the core's order;
// for a sentence one line. Several lines are numbered so the reader can match
// them to the meanings; a single line is plain text.
export default defineFacet({
  id: 'simple-translation', label: 'Simple translation', abbreviation: 'Si', description: 'The meanings again, in simple Chinese.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  shape: list(text('the line'), { name: 'the lines', each: 'Line' }),
  format: lines => lines.length > 1 ? numbered(lines.map(escapeMarkdown)) : escapeMarkdown(lines[0] ?? ''),
  checks: [{
    id: 'one-line-per-meaning', description: "A word has one line per meaning of the core, its meaning in this Context included; a sentence has one.",
    test: (lines, { core }) => {
      const meanings = Array.isArray(core.meanings) ? core.meanings.length : 0;
      const expected = core.kind === 'sentence' ? 1 : meanings + (core.contextual ? 1 : 0);
      return lines.length === expected ? null : `${lines.length} lines for ${expected} ${core.kind === 'sentence' ? 'sentence' : 'meanings'}`;
    }
  }, {
    id: 'hsk-1-3', description: 'Every Chinese character of a line, but for a quoted name, belongs to the words of HSK levels 1 to 3.',
    test: lines => lines.map(line => aboveHsk3(line) ? `"${line}" uses characters above HSK 3: ${aboveHsk3(line)}` : null).find(Boolean) ?? null
  }, {
    id: 'chinese-lines', description: 'Every line is written in Chinese characters, in simplified characters, without the label of a meaning in this Context.',
    test: lines => lines.map(line => !hasScript(line, 'han') ? `"${line}" has no Chinese characters`
      : traditionalIn(line) ? `"${line}" has traditional characters: ${traditionalIn(line)}`
      : /在此语境/.test(line) ? `"${line}" writes the label` : null).find(Boolean) ?? null
  }]
});
