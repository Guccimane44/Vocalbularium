import { defineFacet, escapeMarkdown, object, text } from '../../../../blocks.js';

// One line, "gut · besser · am besten" (D17). Only for an adjective that can
// be compared; one without comparison leaves it out.
export default defineFacet({
  id: 'comparison', label: 'Comparison', abbreviation: 'Cm', description: 'The comparative and superlative of a German adjective.',
  applies: ['word_phrase'], output: 'text',
  when: core => String(core.gramRole ?? '').toLowerCase() === 'adjective',
  shape: object({ positive: text('the positive'), comparative: text('the comparative'), superlative: text('the superlative') }),
  format: value => [value.positive, value.comparative, value.superlative].map(escapeMarkdown).join(' · ')
});
