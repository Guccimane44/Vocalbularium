import { defineFacet, escapeMarkdown, foreignLetters, list, numbered, object, optional, scriptsOf, text } from '../../../../blocks.js';

// Numbered by position, not tied to meanings; the translation on the next line in italics.
export default defineFacet({
  id: 'examples', label: 'Examples', abbreviation: 'Ex', description: 'Example sentences with their translations.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  shape: list(object({ sentence: text('the sentence'), translation: optional(text('the translation')) })),
  format: examples => numbered(examples.map(example =>
    [escapeMarkdown(example.sentence), ...(example.translation ? [`*${escapeMarkdown(example.translation)}*`] : [])].join('\n'))),
  checks: [{
    id: 'german-translation', description: 'Every translation is written in German, in the Latin script.',
    test: examples => examples.map(example => example.translation && !scriptsOf(example.translation).latin
      ? `the translation "${example.translation}" is not German: ${foreignLetters(example.translation, 'latin')}` : null).find(Boolean) ?? null
  }]
});
