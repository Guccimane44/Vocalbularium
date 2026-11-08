import { defineFacet, escapeMarkdown, foreignLetters, list, scriptsOf, text } from '../../../../blocks.js';

// A teacher's comment on a German key's grammar (0.16.4), in German, as a few
// points. Only when the key is German: the core names its language Deutsch.
const MAX_POINTS = 5;
const MAX_POINT = 240;
const isGerman = (value: string) => {
  const scripts = scriptsOf(value);
  const foreign = (scripts.han ?? 0) + (scripts.cyrillic ?? 0) + (scripts.arabic ?? 0);
  return Boolean(scripts.latin) && foreign < scripts.latin!;
};
// The core's names for German as the key's language.
export const GERMAN_NAMES = ['deutsch'];

export default defineFacet({
  id: 'grammar-teacher', label: 'Grammar teacher', abbreviation: 'Gr', description: 'A teacher\'s notes on a German key\'s grammar.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: core => GERMAN_NAMES.includes(String(core.language ?? '').trim().toLowerCase()),
  shape: list(text('the point'), { name: 'the points', each: 'Point' }),
  format: points => points.map(point => `- ${escapeMarkdown(point.trim())}`).join('\n'),
  checks: [{
    id: 'points', description: `One to ${MAX_POINTS} points, each within ${MAX_POINT} characters, in German.`,
    test: points => points.length > MAX_POINTS ? `${points.length} points, at most ${MAX_POINTS}`
      : points.map(point => point.length > MAX_POINT ? `a point has ${point.length} characters, at most ${MAX_POINT}`
        : !isGerman(point) ? `"${point}" is not German: ${foreignLetters(point, 'latin') || 'no letters'}` : null).find(Boolean) ?? null
  }]
});
