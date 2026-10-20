import { defineCore, escapeMarkdown, literal, object, plainLines, text } from '../../../../blocks.js';

// A word or phrase: the key and an explanation; a sentence: an explanation.
// Written in English, as paragraphs of plain text; the top line shows the key
// without a language.
const word = object({ kind: literal('word'), key: text('The key'), explanation: text('The explanation') }, { own: true });
const sentence = object({ kind: literal('sentence'), explanation: text('The explanation') }, { own: true });
type Core = ReturnType<typeof word.check> | ReturnType<typeof sentence.check>;

export default defineCore<Core>({
  id: 'core', label: 'Core', labels: { word_phrase: 'Explanation', sentence: 'Explanation' }, output: 'text',
  shapes: { word_phrase: word, sentence },
  // Paragraphs separated by a blank line.
  format: core => core.explanation.split(/\n\s*\n/).map(paragraph => escapeMarkdown(paragraph.trim())).filter(Boolean).join('\n\n'),
  header: core => core.kind === 'word' ? { kind: 'word', language: '', key: core.key } : { kind: 'sentence' },
  read: ({ header, text: stored }) => {
    const explanation = plainLines(stored).join('\n') || '—';
    return header.kind === 'word' ? { kind: 'word', key: header.key, explanation } : { kind: 'sentence', explanation };
  }
});
