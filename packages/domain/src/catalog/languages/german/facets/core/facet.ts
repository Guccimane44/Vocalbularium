import { defineCore, escapeMarkdown, list, literal, numbered, object, optional, plainLines, text } from '../../../../blocks.js';

// A word or phrase: the key's language named in German, the key, an optional
// romanization and the meanings in German. A sentence: its German translation, or
// for a sentence already in German, an explanation of its meaning.
const word = object({
  kind: literal('word'),
  language: text("The key's language"),
  key: text('The key'),
  romanization: optional(text('The romanization')),
  meanings: list(text(), { name: 'The meanings', each: 'Meaning' })
}, { own: true });
const sentence = object({ kind: literal('sentence'), translation: text('The translation') }, { own: true });
type Core = ReturnType<typeof word.check> | ReturnType<typeof sentence.check>;

export default defineCore<Core>({
  id: 'core', label: 'Core', labels: { word_phrase: 'Meanings', sentence: 'Translation' }, output: 'text',
  shapes: { word_phrase: word, sentence },
  // The meanings as a numbered list; a translation as text.
  format: core => core.kind === 'word' ? numbered(core.meanings.map(escapeMarkdown)) : escapeMarkdown(core.translation),
  header: core => core.kind === 'word'
    ? { kind: 'word', language: core.language, key: core.key, ...(core.romanization ? { romanization: core.romanization } : {}) } : { kind: 'sentence' },
  // The top line and the core's lines as meanings, or its text as the translation.
  read: ({ header, text: stored }) => {
    const lines = plainLines(stored);
    return header.kind === 'word'
      ? { ...header, meanings: lines.length ? lines : ['—'] }
      : { kind: 'sentence', translation: lines.join('\n') || '—' };
  }
});
