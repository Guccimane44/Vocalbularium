import { defineFacet, escapeMarkdown, list, object, text } from '../../../../blocks.js';

// A bulleted list (D17): each case the preposition governs, bold, with when it
// takes it and a short example, "**Akkusativ** · Richtung: Wir gehen in die Stadt."
// Only for a preposition.
export default defineFacet({
  id: 'case', label: 'Case', abbreviation: 'Ca', description: 'The case a German preposition governs.',
  applies: ['word_phrase'], output: 'text',
  when: core => String(core.gramRole ?? '').toLowerCase() === 'preposition',
  shape: list(object({ case: text('the case'), use: text('the use'), example: text('the example') }), { name: 'the cases', each: 'Case' }),
  format: cases => cases.map(item => `- **${escapeMarkdown(item.case)}** · ${escapeMarkdown(item.use)}: ${escapeMarkdown(item.example)}`).join('\n')
});
