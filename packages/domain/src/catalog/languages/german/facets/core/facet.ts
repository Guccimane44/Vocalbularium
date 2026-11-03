import { defineCore, escapeMarkdown, foreignLetters, list, numbered, object, oneOf, optional, plainLines, scriptsOf, text } from '../../../../blocks.js';

// One shape for a word and a sentence (D17): `kind` first, then the key's
// language named in German, the key, an optional romanization, a word's
// grammatical role, and the meanings in German. A sentence's meanings hold one
// item: its German translation, or for a German sentence an explanation of its
// meaning. The grammatical role describes the grammar word the grammar facets
// describe: the key when it is German, otherwise the German word for its first
// meaning.
const shape = object({
  kind: oneOf(['word', 'sentence'], 'Word or sentence'),
  language: text("The key's language"),
  key: text('The key'),
  romanization: optional(text('The romanization')),
  gramRole: optional(text('The grammatical role')),
  meanings: list(text(), { name: 'The meanings', each: 'Meaning' })
}, { own: true });

export default defineCore({
  id: 'core', label: 'Core', labels: { word_phrase: 'Meanings', sentence: 'Translation' }, output: 'text', shape,
  headerLabels: { word: 'Wort', sentence: 'Satz', gramRole: {
    noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb', preposition: 'Präposition',
    pronoun: 'Pronomen', conjunction: 'Konjunktion', article: 'Artikel', numeral: 'Numerale', interjection: 'Interjektion'
  } },
  // A word's meanings as a numbered list; a sentence's translation as text.
  format: core => core.kind === 'word' ? numbered(core.meanings.map(escapeMarkdown)) : escapeMarkdown(core.meanings.join('\n')),
  header: core => ({ kind: core.kind, language: core.language, key: core.key,
    ...(core.romanization ? { romanization: core.romanization } : {}),
    ...(core.kind === 'word' && core.gramRole ? { gramRole: core.gramRole } : {}) }),
  // The top line and the core's lines as meanings.
  read: ({ header, text: stored }) => {
    const lines = plainLines(stored);
    const meanings = lines.length ? lines : ['—'];
    if (header.kind !== 'word' && header.kind !== 'sentence') return { kind: 'word', language: '', key: header.key, meanings };
    return { ...header, meanings };
  },
  checks: [{
    id: 'german-meanings', description: 'Every meaning is written in German, in the Latin script.',
    test: core => {
      for (const meaning of core.meanings) {
        const scripts = scriptsOf(meaning);
        const foreign = (scripts.han ?? 0) + (scripts.cyrillic ?? 0) + (scripts.arabic ?? 0);
        if (!scripts.latin || foreign >= scripts.latin) return `"${meaning}" is not German: ${foreignLetters(meaning, 'latin') || 'no letters'}`;
      }
      return null;
    }
  }]
});
