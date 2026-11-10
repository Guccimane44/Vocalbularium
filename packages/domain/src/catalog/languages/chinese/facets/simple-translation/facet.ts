import { defineFacet, escapeMarkdown, hasScript, list, numbered, text } from '../../../../blocks.js';
import { traditionalIn } from '../../simplified.js';

// The core again in simple Chinese (0.16.4), in simple words a beginner knows:
// for a word one line per meaning, `contextual` first, in the core's order;
// for a sentence one line. Several lines are numbered so the reader can match
// them to the meanings; a single line is plain text.
export default defineFacet({
  id: 'simple-translation', label: 'Simple translation', abbreviation: 'Si', description: 'The meanings again, in simple Chinese.',
  applies: ['word_phrase', 'sentence'],
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
    id: 'simpler-than-core', description: "No line repeats the core's own wording of its meaning.",
    test: (lines, { core }) => {
      const meanings = [...(typeof core.contextual === 'string' ? [core.contextual] : []), ...(Array.isArray(core.meanings) ? core.meanings.map(String) : [])];
      const plain = (text: string) => text.replace(/[\s\p{P}]/gu, '');
      const same = lines.find((line, at) => meanings[at] !== undefined && plain(line) === plain(meanings[at]!));
      return same ? `"${same}" repeats the core` : null;
    }
  }, {
    id: 'chinese-lines', description: 'Every line is written in Chinese characters, in simplified characters, without the label of a meaning in this Context.',
    test: lines => lines.map(line => !hasScript(line, 'han') ? `"${line}" has no Chinese characters`
      : traditionalIn(line) ? `"${line}" has traditional characters: ${traditionalIn(line)}`
      : /在此语境/.test(line) ? `"${line}" writes the label` : null).find(Boolean) ?? null
  }]
});
