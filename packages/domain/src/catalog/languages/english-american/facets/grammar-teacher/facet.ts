import { defineFacet, escapeMarkdown, foreignLetters, list, text } from '../../../../blocks.js';
import { britishSpelling, isEnglish, keyIsEnglish } from '../../english.js';

// A teacher's comment on an English key's grammar (0.16.4), in American
// English, as a few points, noting where British and American English differ.
// Only when the key is English: the core names its language English, British
// English or American English (english.ts).
const MAX_POINTS = 5;
const MAX_POINT = 240;

export default defineFacet({
  id: 'grammar-teacher', label: 'Grammar teacher', abbreviation: 'Gr', description: 'A teacher\'s notes on an English key\'s grammar, in American English.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: keyIsEnglish,
  shape: list(text('the point'), { name: 'the points', each: 'Point' }),
  format: points => points.map(point => `- ${escapeMarkdown(point.trim())}`).join('\n'),
  checks: [{
    id: 'points', description: `One to ${MAX_POINTS} points, each within ${MAX_POINT} characters, in English.`,
    test: points => points.length > MAX_POINTS ? `${points.length} points, at most ${MAX_POINTS}`
      : points.map(point => point.length > MAX_POINT ? `a point has ${point.length} characters, at most ${MAX_POINT}`
        : !isEnglish(point) ? `"${point}" is not English: ${foreignLetters(point, 'latin') || 'no letters'}` : null).find(Boolean) ?? null
  }, {
    id: 'american-spelling', description: 'No point uses a common British spelling, unless it is a word of the key.',
    test: (points, { core }) => britishSpelling(points, core)
  }]
});
