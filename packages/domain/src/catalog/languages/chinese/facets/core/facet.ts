import { defineCore, hasScript, escapeMarkdown, list, numbered, object, oneOf, optional, plainLines, text } from '../../../../blocks.js';

// One shape for a word and a sentence (D17): `kind` first, then the key's
// language named in Chinese, the key, an optional romanization and the
// meanings in Chinese. A sentence's meanings hold one item: its Chinese
// translation, or for a Chinese sentence an explanation of its meaning. No
// Chinese facet depends on a grammatical role, so the core has none.
const shape = object({
  kind: oneOf(['word', 'sentence'], 'Word or sentence'),
  language: text("The key's language"),
  key: text('The key'),
  romanization: optional(text('The romanization')),
  meanings: list(text(), { name: 'The meanings', each: 'Meaning' })
}, { own: true });

export default defineCore({
  id: 'core', label: 'Core', labels: { word_phrase: 'Meanings', sentence: 'Translation' }, output: 'text', shape,
  headerLabels: { word: '词语', sentence: '句子' },
  // A word's meanings as a numbered list; a sentence's translation as text.
  format: core => core.kind === 'word' ? numbered(core.meanings.map(escapeMarkdown)) : escapeMarkdown(core.meanings.join('\n')),
  header: core => ({ kind: core.kind, language: core.language, key: core.key, ...(core.romanization ? { romanization: core.romanization } : {}) }),
  // The top line and the core's lines as meanings.
  read: ({ header, text: stored }) => {
    const lines = plainLines(stored);
    const meanings = lines.length ? lines : ['—'];
    if (header.kind !== 'word' && header.kind !== 'sentence') return { kind: 'word', language: '', key: header.key, meanings };
    const { gramRole: _, ...rest } = header as typeof header & { gramRole?: string };
    return { ...rest, meanings };
  },
  checks: [{
    id: 'chinese-meanings', description: 'Every meaning is written in Chinese characters.',
    test: core => core.meanings.map(meaning => hasScript(meaning, 'han') ? null : `"${meaning}" has no Chinese characters`).find(Boolean) ?? null
  }]
});
