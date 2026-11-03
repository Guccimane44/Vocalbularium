import { defineFacet, escapeMarkdown, hanCount, list, object, text } from '../../../../blocks.js';
import { readPinyin } from '../../pinyin.js';

// One line per meaning for a word, one for a sentence: "河岸 hé'àn".
export default defineFacet({
  id: 'pinyin', label: 'Pinyin', abbreviation: 'Py', description: 'The pinyin of the Chinese translation.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  shape: list(object({ text: text('the text'), pinyin: text('the pinyin') })),
  format: lines => lines.map(line => `${escapeMarkdown(line.text)} ${escapeMarkdown(line.pinyin)}`).join('\n'),
  checks: [{
    id: 'tone-marked-pinyin', description: 'Every line is valid pinyin with tone marks, at most one per syllable, and one syllable per character.',
    test: lines => {
      for (const line of lines) {
        const reading = readPinyin(line.pinyin);
        if ('error' in reading) return `"${line.pinyin}": ${reading.error}`;
        if (!reading.marks.some(Boolean)) return `"${line.pinyin}" has no tone marks`;
        const twice = reading.syllables.find((_, at) => reading.marks[at]! > 1);
        if (twice) return `"${twice}" in "${line.pinyin}" has more than one tone mark`;
        // Only for a line of Chinese characters alone: Latin letters or digits are read as they are.
        if (/[\p{Script=Latin}\d]/u.test(line.text)) continue;
        const characters = hanCount(line.text) - [...line.text].filter(char => char === '儿').length;
        if (reading.syllables.length !== characters && reading.syllables.length !== hanCount(line.text))
          return `"${line.pinyin}" has ${reading.syllables.length} syllables for the ${hanCount(line.text)} characters of "${line.text}"`;
      }
      return null;
    }
  }]
});
