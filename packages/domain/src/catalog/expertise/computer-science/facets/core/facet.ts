import { defineCore, escapeMarkdown, list, object, oneOf, optional, plainLines, text } from '../../../../blocks.js';

// One shape for a word, a phrase or a sentence (D17): `relevance` first, D16's
// case (a key of the subject, a neighbouring field's technical term, or an
// unrelated key), then the key and an explanation. The explanation is a list
// of paragraphs, one string each, which keeps line breaks out of the JSON. The
// top line shows the key only; the case is kept but not shown. For a key of
// the subject, `hasCode` says whether the concept is usually shown in code, which lets Code example apply (D17).
const explanation = list(text(), { name: 'The explanation', each: 'Paragraph' });
const shape = object({
  relevance: oneOf(['subject', 'neighbouring', 'unrelated'], 'The relevance'),
  hasCode: optional(oneOf(['yes', 'no'], 'The hasCode flag')),
  key: text('The key'),
  explanation
}, { own: true });

export default defineCore({
  id: 'core', label: 'Core', labels: { word_phrase: 'Explanation', sentence: 'Explanation' }, output: 'text', shape,
  // Paragraphs separated by a blank line.
  format: core => core.explanation.map(escapeMarkdown).join('\n\n'),
  header: core => ({ kind: 'expertise', key: core.key, relevance: core.relevance, ...(core.relevance === 'subject' && core.hasCode ? { hasCode: core.hasCode } : {}) }),
  // Each stored line as a paragraph.
  read: ({ header, text: stored }) => {
    const paragraphs = plainLines(stored);
    const flag = header.kind === 'expertise' ? header.hasCode : undefined;
    return { relevance: header.kind === 'expertise' ? header.relevance : 'subject', ...(flag ? { hasCode: flag } : {}), key: header.key, explanation: paragraphs.length ? paragraphs : ['—'] };
  }
});
