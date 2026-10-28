import { defineFacet, displayMath, escapeMarkdown, inlineMath, list, object, text } from '../../../../blocks.js';

// The concept's defining formula as display math, then each symbol in it with
// what it stands for (D17). Only for a key of the subject whose standard
// definition includes a formula; never constructed for one that has none.
export default defineFacet({
  id: 'formula', label: 'Formula', abbreviation: 'Fo', description: 'The defining formula of a mathematics concept, with its symbols named.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: core => core.relevance === 'subject' && core.hasFormula === 'yes',
  shape: object({ latex: text('the formula'), symbols: list(object({ symbol: text('the symbol'), meaning: text('the meaning') }), { name: 'the symbols', each: 'Symbol' }) }),
  format: value => [displayMath(value.latex), value.symbols.map(item => `- ${inlineMath(item.symbol)} · ${escapeMarkdown(item.meaning)}`).join('\n')].join('\n\n')
});
