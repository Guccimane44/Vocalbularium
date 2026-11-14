import { defineCore, escapeMarkdown, foreignLetters, list, numbered, object, oneOf, optional, plainLines, scriptsOf, text } from '../../../../blocks.js';

// One shape for a word and a sentence (D17): `kind` first, then the key's
// language named in German, the key, an optional romanization, a word's
// grammatical role, and the meanings in German. A sentence's meanings hold one
// item: its German translation, or for a German sentence an explanation of its
// meaning. A word's `contextual` (D29) is its meaning in this Context, when the
// Context selects one; the meanings then hold the key's other senses, its
// original meaning always among them or in `contextual`. The grammatical role
// describes the grammar word the grammar facets describe: the key when it is
// German, otherwise the German word for its first meaning, `contextual` first.
const shape = object({
  kind: oneOf(['word', 'sentence'], 'Word or sentence'),
  language: text("The key's language"),
  key: text('The key'),
  romanization: optional(text('The romanization')),
  gramRole: optional(text('The grammatical role')),
  contextual: optional(text('The meaning in this Context')),
  meanings: list(text(), { name: 'The meanings', each: 'Meaning' })
}, { own: true });

// What the card shows before a word's meaning in this Context (D29). The module
// writes it, never the model.
const CONTEXT_LABEL = '(in diesem Zusammenhang)';
const isGerman = (meaning: string) => {
  const scripts = scriptsOf(meaning);
  const foreign = (scripts.han ?? 0) + (scripts.cyrillic ?? 0) + (scripts.arabic ?? 0);
  return Boolean(scripts.latin) && foreign < scripts.latin!;
};

export default defineCore({
  id: 'core', labels: { word_phrase: 'Meanings', sentence: 'Translation' }, shape,
  headerLabels: { word: 'Wort', sentence: 'Satz', gramRole: {
    noun: 'Nomen', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb', preposition: 'Präposition',
    pronoun: 'Pronomen', conjunction: 'Konjunktion', article: 'Artikel', numeral: 'Numerale', interjection: 'Interjektion'
  } },
  // A word's meanings as a numbered list, its meaning in this Context first
  // under the label; a sentence's translation as text.
  format: core => core.kind === 'word'
    ? numbered([...(core.contextual ? [`${CONTEXT_LABEL} ${escapeMarkdown(core.contextual)}`] : []), ...core.meanings.map(escapeMarkdown)])
    : escapeMarkdown(core.meanings.join('\n')),
  header: core => ({ kind: core.kind, language: core.language, key: core.key,
    ...(core.romanization ? { romanization: core.romanization } : {}),
    ...(core.kind === 'word' && core.gramRole ? { gramRole: core.gramRole } : {}) }),
  // The top line and the core's lines as meanings; a word's first line under
  // the label is its meaning in this Context, unless it is the only line.
  read: ({ header, text: stored }) => {
    const lines = plainLines(stored);
    const first = lines[0] ?? '';
    const contextual = header.kind === 'word' && lines.length > 1 && first.startsWith(CONTEXT_LABEL) ? first.slice(CONTEXT_LABEL.length).trim() : '';
    const rest = contextual ? lines.slice(1) : lines.map(line => line.startsWith(CONTEXT_LABEL) ? line.slice(CONTEXT_LABEL.length).trim() || line : line);
    const meanings = rest.length ? rest : ['—'];
    if (header.kind !== 'word' && header.kind !== 'sentence') return { kind: 'word', language: '', key: header.key, meanings };
    return { ...header, ...(contextual ? { contextual } : {}), meanings };
  },
  checks: [{
    id: 'german-meanings', description: 'Every meaning, the one in this Context included, is written in German, in the Latin script.',
    test: core => {
      for (const meaning of [...(core.contextual ? [core.contextual] : []), ...core.meanings]) {
        if (!isGerman(meaning)) return `"${meaning}" is not German: ${foreignLetters(meaning, 'latin') || 'no letters'}`;
      }
      return null;
    }
  }, {
    id: 'context-meaning', description: 'A meaning in this Context belongs to a word, is not repeated among the meanings, and no meaning writes the label itself.',
    test: core => {
      if (core.contextual && core.kind !== 'word') return 'a sentence has a meaning in this Context';
      if (core.contextual && core.meanings.some(meaning => meaning.trim() === core.contextual!.trim())) return `"${core.contextual}" is repeated among the meanings`;
      const labelled = [...(core.contextual ? [core.contextual] : []), ...core.meanings].find(meaning => /in diesem Zusammenhang/i.test(meaning));
      return labelled ? `"${labelled}" writes the label itself` : null;
    }
  }]
});
