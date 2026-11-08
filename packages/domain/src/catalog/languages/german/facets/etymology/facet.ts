import { defineFacet, escapeMarkdown, foreignLetters, list, object, scriptsOf, text } from '../../../../blocks.js';

// Where the grammar word comes from (0.16.4): the languages it came through,
// oldest first, then a short text. The module writes the header, its label and
// the origins joined by a middle dot, never the model, so a name of several
// words such as Althochdeutsch or Mittelniederländisch stays whole.
const LABEL = 'stammt aus:';
const MAX_TEXT = 600;
const isGerman = (value: string) => {
  const scripts = scriptsOf(value);
  const foreign = (scripts.han ?? 0) + (scripts.cyrillic ?? 0) + (scripts.arabic ?? 0);
  return Boolean(scripts.latin) && foreign < scripts.latin!;
};

export default defineFacet({
  id: 'etymology', label: 'Etymology', abbreviation: 'Et', description: 'Where the German word comes from.',
  applies: ['word_phrase'], output: 'text',
  shape: object({ origins: list(text('the origin'), { name: 'the origins', each: 'Origin' }), text: text('the etymology') }),
  format: value => `${LABEL} ${value.origins.map(origin => escapeMarkdown(origin.trim())).join(' · ')}\n\n${escapeMarkdown(value.text.trim())}`,
  checks: [{
    id: 'origins', description: 'The origins are distinct names of languages, in German and the Latin script, none holding the middle dot the card puts between them.',
    test: value => {
      const seen = new Set<string>();
      for (const origin of value.origins) {
        const name = origin.trim();
        if (name.includes('·')) return `"${name}" holds a middle dot`;
        if (!isGerman(name)) return `"${name}" is not German: ${foreignLetters(name, 'latin') || 'no letters'}`;
        if (seen.has(name.toLowerCase())) return `"${name}" is named twice`;
        seen.add(name.toLowerCase());
      }
      return null;
    }
  }, {
    id: 'german-text', description: `The text is German, in the Latin script, within ${MAX_TEXT} characters.`,
    test: value => !isGerman(value.text) ? `the text is not German: ${foreignLetters(value.text, 'latin') || 'no letters'}`
      : value.text.length > MAX_TEXT ? `the text has ${value.text.length} characters, at most ${MAX_TEXT}` : null
  }, {
    id: 'no-label', description: 'Neither the origins nor the text write the label the card shows before the origins.',
    test: value => [...value.origins, value.text].find(part => /stammt aus\s*:/i.test(part)) ? 'the model wrote the label "stammt aus:"' : null
  }]
});
