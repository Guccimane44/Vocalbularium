import { defineFacet, escapeMarkdown, hasScript, list, text } from '../../../../blocks.js';
import { traditionalIn } from '../../simplified.js';

// A teacher's short comment on a Chinese key's grammar (0.16.4), in Chinese:
// a few bullet points, such as its measure word, an aspect particle, the word
// order, 把 or 被, or a complement. Only when the core names the key's
// language as Chinese, by one of these names; never for a foreign key.
export const CHINESE_NAMES: readonly string[] = ['中文', '汉语', '普通话'];
const MAX_POINTS = 5;
const MAX_POINT = 80;

export default defineFacet({
  id: 'grammar-teacher', label: 'Grammar teacher', abbreviation: 'Gr', description: "A teacher's notes on a Chinese key's grammar.",
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: core => CHINESE_NAMES.includes(String(core.language ?? '').trim()),
  shape: list(text('the point'), { name: 'the points', each: 'Point' }),
  format: points => points.map(point => `- ${escapeMarkdown(point)}`).join('\n'),
  checks: [{
    id: 'grammar-points', description: `One to ${MAX_POINTS} points, each Chinese, in simplified characters, at most ${MAX_POINT} characters.`,
    test: points => points.length > MAX_POINTS ? `${points.length} points, more than ${MAX_POINTS}`
      : points.map(point => !hasScript(point, 'han') ? `"${point}" has no Chinese characters`
        : [...point].length > MAX_POINT ? `"${point}" has more than ${MAX_POINT} characters`
        : traditionalIn(point) ? `"${point}" has traditional characters: ${traditionalIn(point)}` : null).find(Boolean) ?? null
  }]
});
