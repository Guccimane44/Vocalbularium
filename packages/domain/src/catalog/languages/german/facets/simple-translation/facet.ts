import { defineFacet, escapeMarkdown, foreignLetters, list, numbered, scriptsOf, text } from '../../../../blocks.js';

// The core again in simple German (0.16.4), at CEFR A2: one line per meaning,
// in the core's order, the meaning in this Context first, so the reader can
// match them; a numbered list for several, plain text for one.
const isGerman = (value: string) => {
  const scripts = scriptsOf(value);
  const foreign = (scripts.han ?? 0) + (scripts.cyrillic ?? 0) + (scripts.arabic ?? 0);
  return Boolean(scripts.latin) && foreign < scripts.latin!;
};

export default defineFacet({
  id: 'simple-translation', label: 'Simple translation', abbreviation: 'Si', description: 'The meanings again, in simple German.',
  applies: ['word_phrase', 'sentence'],
  shape: list(text('the simple line'), { name: 'the lines', each: 'Line' }),
  format: lines => lines.length === 1 ? escapeMarkdown(lines[0]!.trim()) : numbered(lines.map(line => escapeMarkdown(line.trim()))),
  checks: [{
    id: 'german-lines', description: 'Every line is written in German, in the Latin script.',
    test: lines => lines.map(line => !isGerman(line) ? `"${line}" is not German: ${foreignLetters(line, 'latin') || 'no letters'}` : null).find(Boolean) ?? null
  }, {
    id: 'line-per-meaning', description: 'One line for each of the core\'s meanings, the one in this Context included.',
    test: (lines, { core }) => {
      const meanings = (Array.isArray(core.meanings) ? core.meanings.length : 0) + (core.contextual ? 1 : 0);
      return lines.length !== meanings ? `${lines.length} lines for ${meanings} meanings` : null;
    }
  }, {
    id: 'no-context-label', description: 'No line writes the label the card shows before a meaning in this Context.',
    test: lines => lines.find(line => /in diesem Zusammenhang/i.test(line)) ? `"${lines.find(line => /in diesem Zusammenhang/i.test(line))}" writes the label` : null
  }]
});
