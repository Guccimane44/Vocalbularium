import { defineFacet, escapeMarkdown, object, optional, text } from '../../../../blocks.js';

// One line, "das Ufer · die Ufer"; the singular alone without a plural.
export default defineFacet({
  id: 'article', label: 'Article', abbreviation: 'Ar', description: 'The German article, gender and plural of a noun.',
  applies: ['word_phrase'], output: 'text',
  // Only for a noun (D17): the core's grammatical role decides.
  when: core => String(core.gramRole ?? '').toLowerCase() === 'noun',
  shape: object({ singular: text('the singular'), plural: optional(text('the plural')) }),
  format: article => [article.singular, article.plural].filter(Boolean).map(part => escapeMarkdown(part!)).join(' · ')
});
