import { defineFacet, escapeMarkdown, object, optional, text } from '../../../../blocks.js';

// One line, "das Ufer · die Ufer"; the singular alone without a plural.
export default defineFacet({
  id: 'article', label: 'Article', abbreviation: 'Ar', description: 'The German article, gender and plural of a noun.',
  applies: ['word_phrase'], output: 'text',
  // Only for a noun (D17): the core's grammatical role decides.
  when: core => String(core.gramRole ?? '').toLowerCase() === 'noun',
  shape: object({ singular: text('the singular'), plural: optional(text('the plural')) }),
  format: article => [article.singular, article.plural].filter(Boolean).map(part => escapeMarkdown(part!)).join(' · '),
  checks: [{
    id: 'article-form', description: 'The singular starts with der, die or das; a plural starts with die.',
    test: article => !/^(der|die|das)\s+\S/.test(article.singular) ? `the singular "${article.singular}" does not start with der, die or das`
      : article.plural && !/^die\s+\S/.test(article.plural) ? `the plural "${article.plural}" does not start with die` : null
  }]
});
