import { defineCore, hasScript, escapeMarkdown, list, numbered, object, oneOf, optional, plainLines, text } from '../../../../blocks.js';

// One shape for a word and a sentence (D17): `kind` first, then the key's
// language named in Chinese, the key, an optional romanization and the
// meanings in Chinese. A sentence's meanings hold one item: its Chinese
// translation, or for a Chinese sentence an explanation of its meaning. A
// word's `contextual` (D29) is its meaning in this Context, when the Context
// selects one; the meanings then hold the key's other senses, its original
// meaning always among them or in `contextual`. No Chinese facet depends on a
// grammatical role, so the core has none.
const shape = object({
  kind: oneOf(['word', 'sentence'], 'Word or sentence'),
  language: text("The key's language"),
  key: text('The key'),
  romanization: optional(text('The romanization')),
  contextual: optional(text('The meaning in this Context')),
  meanings: list(text(), { name: 'The meanings', each: 'Meaning' })
}, { own: true });

// What the card shows before a word's meaning in this Context (D29). The module
// writes it, never the model.
const CONTEXT_LABEL = '（在此语境中）';

export default defineCore({
  id: 'core', labels: { word_phrase: 'Meanings', sentence: 'Translation' }, shape,
  headerLabels: { word: '词语', sentence: '句子' },
  // A word's meanings as a numbered list, its meaning in this Context first
  // under the label; a sentence's translation as text.
  format: core => core.kind === 'word'
    ? numbered([...(core.contextual ? [`${CONTEXT_LABEL}${escapeMarkdown(core.contextual)}`] : []), ...core.meanings.map(escapeMarkdown)])
    : escapeMarkdown(core.meanings.join('\n')),
  header: core => ({ kind: core.kind, language: core.language, key: core.key, ...(core.romanization ? { romanization: core.romanization } : {}) }),
  // The top line and the core's lines as meanings; a word's first line under
  // the label is its meaning in this Context, unless it is the only line.
  read: ({ header, text: stored }) => {
    const lines = plainLines(stored);
    const first = lines[0] ?? '';
    const contextual = header.kind === 'word' && lines.length > 1 && first.startsWith(CONTEXT_LABEL) ? first.slice(CONTEXT_LABEL.length).trim() : '';
    const rest = contextual ? lines.slice(1) : lines.map(line => line.startsWith(CONTEXT_LABEL) ? line.slice(CONTEXT_LABEL.length).trim() || line : line);
    const meanings = rest.length ? rest : ['—'];
    if (header.kind !== 'word' && header.kind !== 'sentence') return { kind: 'word', language: '', key: header.key, meanings };
    const { gramRole: _, ...flags } = header as typeof header & { gramRole?: string };
    return { ...flags, ...(contextual ? { contextual } : {}), meanings };
  },
  checks: [{
    id: 'chinese-meanings', description: 'Every meaning, the one in this Context included, is written in Chinese characters.',
    test: core => [...(core.contextual ? [core.contextual] : []), ...core.meanings]
      .map(meaning => hasScript(meaning, 'han') ? null : `"${meaning}" has no Chinese characters`).find(Boolean) ?? null
  }, {
    id: 'context-meaning', description: 'A meaning in this Context belongs to a word, is not repeated among the meanings, and no meaning writes the label itself.',
    test: core => {
      if (core.contextual && core.kind !== 'word') return 'a sentence has a meaning in this Context';
      if (core.contextual && core.meanings.some(meaning => meaning.trim() === core.contextual!.trim())) return `"${core.contextual}" is repeated among the meanings`;
      const labelled = [...(core.contextual ? [core.contextual] : []), ...core.meanings].find(meaning => /在此语境/.test(meaning));
      return labelled ? `"${labelled}" writes the label itself` : null;
    }
  }]
});
