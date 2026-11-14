import { defineCore, escapeMarkdown, foreignLetters, list, numbered, object, oneOf, optional, plainLines, text } from '../../../../blocks.js';
import { isEnglish } from '../../english.js';

// One shape for a word and a sentence (D17), as Chinese's: `kind` first, then
// the key's language named in English, the key, an optional romanization and
// the meanings in English, British or American (D34). A sentence's meanings
// hold one item: its translation, or for an English sentence an explanation of
// its meaning. A
// word's `contextual` (D29) is its meaning in this Context, when the Context
// selects one; the meanings then hold the key's other senses, its original
// meaning always among them or in `contextual`. A word's `gramRole` and
// `formsWord` (D35) are the part of speech and dictionary form of the English
// word Forms describes; the card doesn't show them, so a core read back from
// storage has neither.
const shape = object({
  kind: oneOf(['word', 'sentence'], 'Word or sentence'),
  language: text("The key's language"),
  key: text('The key'),
  romanization: optional(text('The romanization')),
  gramRole: optional(oneOf(['noun', 'verb', 'adjective', 'adverb', 'other'], 'The part of speech')),
  formsWord: optional(text('The English word in its dictionary form')),
  contextual: optional(text('The meaning in this Context')),
  meanings: list(text(), { name: 'The meanings', each: 'Meaning' })
}, { own: true });

// What the card shows before a word's meaning in this Context (D29). The module
// writes it, never the model.
const CONTEXT_LABEL = '(in this context)';
// The label, written by the model: at the start of a line or in brackets.
const LABELLED = /(^|\()\s*in this context\b/i;

export default defineCore({
  id: 'core', labels: { word_phrase: 'Meanings', sentence: 'Translation' }, shape,
  headerLabels: { word: 'Word', sentence: 'Sentence' },
  // A word's meanings as a numbered list, its meaning in this Context first
  // under the label; a sentence's translation as text.
  format: core => core.kind === 'word'
    ? numbered([...(core.contextual ? [`${CONTEXT_LABEL} ${escapeMarkdown(core.contextual)}`] : []), ...core.meanings.map(escapeMarkdown)])
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
    id: 'english-meanings', description: 'Every meaning, the one in this Context included, is written in English, in the Latin script.',
    test: core => {
      for (const meaning of [...(core.contextual ? [core.contextual] : []), ...core.meanings]) {
        if (!isEnglish(meaning)) return `"${meaning}" is not English: ${foreignLetters(meaning, 'latin') || 'no letters'}`;
      }
      return null;
    }
  }, {
    id: 'forms-word', description: 'A sentence names no part of speech or forms word; a word\'s forms word is English.',
    test: core => core.kind === 'sentence' ? (core.gramRole || core.formsWord ? 'a sentence has a part of speech or a forms word' : null)
      : core.formsWord !== undefined && !isEnglish(core.formsWord) ? `"${core.formsWord}" is not English: ${foreignLetters(core.formsWord, 'latin') || 'no letters'}` : null
  }, {
    id: 'context-meaning', description: 'A meaning in this Context belongs to a word, is not repeated among the meanings, and no meaning writes the label itself.',
    test: core => {
      if (core.contextual && core.kind !== 'word') return 'a sentence has a meaning in this Context';
      if (core.contextual && core.meanings.some(meaning => meaning.trim() === core.contextual!.trim())) return `"${core.contextual}" is repeated among the meanings`;
      const labelled = [...(core.contextual ? [core.contextual] : []), ...core.meanings].find(meaning => LABELLED.test(meaning));
      return labelled ? `"${labelled}" writes the label itself` : null;
    }
  }]
});
