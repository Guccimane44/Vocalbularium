import { defineFacet, escapeMarkdown, foreignLetters, list, numbered, object, optional, text } from '../../../../blocks.js';
import { isEnglish, keyIsEnglish } from '../../english.js';

// Numbered by position, not tied to meanings; the translation on the next line in italics.
export default defineFacet({
  id: 'examples', label: 'Examples', abbreviation: 'Ex', description: 'Example sentences with their translations.',
  applies: ['word_phrase', 'sentence'],
  shape: list(object({ sentence: text('the sentence'), translation: optional(text('the translation')) })),
  format: examples => numbered(examples.map(example =>
    [escapeMarkdown(example.sentence), ...(example.translation ? [`*${escapeMarkdown(example.translation)}*`] : [])].join('\n'))),
  checks: [{
    id: 'english-translation', description: 'Every translation is written in English, in the Latin script.',
    test: examples => examples.map(example => example.translation && !isEnglish(example.translation)
      ? `the translation "${example.translation}" is not English: ${foreignLetters(example.translation, 'latin')}` : null).find(Boolean) ?? null
  }, {
    id: 'english-key-untranslated', description: 'An English key\'s examples are English and have no translation.',
    test: (examples, { core }) => keyIsEnglish(core) && examples.some(example => example.translation) ? 'an example of an English key has a translation' : null
  }]
});
