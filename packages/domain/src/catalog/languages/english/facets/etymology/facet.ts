import { defineFacet, escapeMarkdown, foreignLetters, list, object, text } from '../../../../blocks.js';
import { isEnglish } from '../../english.js';

// Where the English word comes from (0.16.4): the key when it is English,
// otherwise the English word for its first meaning, `contextual` first. The
// languages it came from or through, oldest first, then a short text. The
// module writes the header, its label and the origins joined by a middle dot,
// never the model, so a name of several words such as Old French stays whole.
const LABEL = 'inherited from:';
const MAX_TEXT = 600;

export default defineFacet({
  id: 'etymology', label: 'Etymology', abbreviation: 'Et', description: 'Where the English word comes from.',
  applies: ['word_phrase'],
  shape: object({ origins: list(text('the origin'), { name: 'the origins', each: 'Origin' }), text: text('the etymology') }),
  format: value => `${LABEL} ${value.origins.map(origin => escapeMarkdown(origin.trim())).join(' · ')}\n\n${escapeMarkdown(value.text.trim())}`,
  checks: [{
    id: 'origins', description: 'The origins are distinct names of languages, in English and the Latin script, none holding the middle dot the card puts between them.',
    test: value => {
      const seen = new Set<string>();
      for (const origin of value.origins) {
        const name = origin.trim();
        if (name.includes('·')) return `"${name}" holds a middle dot`;
        if (!isEnglish(name)) return `"${name}" is not English: ${foreignLetters(name, 'latin') || 'no letters'}`;
        if (seen.has(name.toLowerCase())) return `"${name}" is named twice`;
        seen.add(name.toLowerCase());
      }
      return null;
    }
  }, {
    id: 'english-text', description: `The text is English, in the Latin script, within ${MAX_TEXT} characters.`,
    test: value => !isEnglish(value.text) ? `the text is not English: ${foreignLetters(value.text, 'latin') || 'no letters'}`
      : value.text.length > MAX_TEXT ? `the text has ${value.text.length} characters, at most ${MAX_TEXT}` : null
  }, {
    id: 'no-label', description: 'Neither the origins nor the text write the label the card shows before the origins.',
    test: value => [...value.origins, value.text].find(part => /inherited from\s*:/i.test(part)) ? 'the model wrote the label "inherited from:"' : null
  }]
});
