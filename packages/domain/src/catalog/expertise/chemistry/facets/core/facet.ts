import { defineCore, escapeMarkdown, list, object, oneOf, optional, plainLines, text } from '../../../../blocks.js';

// The Expertise core (D17), as Mathematics': `relevance` first, D16's case (a
// key of the subject, a neighbouring field's technical term, or an unrelated
// key), then the key and an explanation, a list of paragraphs. The top line
// shows the key only; the case is kept but not shown. For a key of the
// subject, `hasEquation` says whether the concept is defined or best shown by
// a chemical formula or a reaction equation, which lets Equation apply (D30).
const explanation = list(text(), { name: 'The explanation', each: 'Paragraph' });
const shape = object({
  relevance: oneOf(['subject', 'neighbouring', 'unrelated'], 'The relevance'),
  hasEquation: optional(oneOf(['yes', 'no'], 'The hasEquation flag')),
  key: text('The key'),
  explanation
}, { own: true });

export default defineCore({
  id: 'core', label: 'Core', labels: { word_phrase: 'Explanation', sentence: 'Explanation' }, output: 'text', shape,
  // Paragraphs separated by a blank line.
  format: core => core.explanation.map(escapeMarkdown).join('\n\n'),
  header: core => ({ kind: 'expertise', key: core.key, relevance: core.relevance, ...(core.relevance === 'subject' && core.hasEquation ? { hasEquation: core.hasEquation } : {}) }),
  // Each stored line as a paragraph.
  read: ({ header, text: stored }) => {
    const paragraphs = plainLines(stored);
    const flag = header.kind === 'expertise' ? header.hasEquation : undefined;
    return { relevance: header.kind === 'expertise' ? header.relevance : 'subject', ...(flag ? { hasEquation: flag } : {}), key: header.key, explanation: paragraphs.length ? paragraphs : ['—'] };
  }
});
