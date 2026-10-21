import { defineCore, escapeMarkdown, list, literal, object, plainLines, text } from '../../../../blocks.js';

// A word or phrase: the key and an explanation; a sentence: an explanation.
// The explanation is a list of paragraphs, written in English; one string per
// paragraph keeps line breaks out of the JSON. The top line shows the key
// without a language.
const explanation = list(text(), { name: 'The explanation', each: 'Paragraph' });
const word = object({ kind: literal('word'), key: text('The key'), explanation }, { own: true });
const sentence = object({ kind: literal('sentence'), explanation }, { own: true });
type Core = ReturnType<typeof word.check> | ReturnType<typeof sentence.check>;

export default defineCore<Core>({
  id: 'core', label: 'Core', labels: { word_phrase: 'Explanation', sentence: 'Explanation' }, output: 'text',
  shapes: { word_phrase: word, sentence },
  // Paragraphs separated by a blank line.
  format: core => core.explanation.map(escapeMarkdown).join('\n\n'),
  header: core => core.kind === 'word' ? { kind: 'word', language: '', key: core.key } : { kind: 'sentence' },
  // Each stored line as a paragraph.
  read: ({ header, text: stored }) => {
    const paragraphs = plainLines(stored);
    const explanation = paragraphs.length ? paragraphs : ['—'];
    return header.kind === 'word' ? { kind: 'word', key: header.key, explanation } : { kind: 'sentence', explanation };
  }
});
