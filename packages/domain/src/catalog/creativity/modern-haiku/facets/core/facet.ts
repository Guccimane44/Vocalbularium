import { defineCore, escapeMarkdown, languageCode, lettersOutside, list, object, plainLines, text } from '../../../../blocks.js';
import type { Check } from '../../../../blocks.js';

// A modern haiku (D30): the language it is written in, the key's, as an ISO
// 639-1 code or `other`, first; then the key and three short free lines, no
// count, no season word, no rhyme and no title.
const shape = object({
  language: languageCode("The haiku's language"),
  key: text('The key'),
  haiku: list(text(), { name: 'The haiku', each: 'Line' })
}, { own: true });
type Haiku = Readonly<{ language: string; key: string; haiku: string[] }>;

// The whole haiku at most this long, spaces not counted: fewer characters in
// Chinese, Japanese and Korean, where one says more.
const LIMIT = 90;
const DENSE_LIMIT = 30;
const DENSE = ['zh', 'ja', 'ko'];
const checks: readonly Check<Haiku>[] = [
  { id: 'three-lines', description: 'Three lines.',
    test: core => core.haiku.length === 3 ? null : `the haiku has ${core.haiku.length} lines, not 3` },
  { id: 'short', description: 'Short: the whole within a limit.',
    test: core => {
      const length = [...core.haiku.join('').replace(/\s/g, '')].length;
      const limit = DENSE.includes(core.language) ? DENSE_LIMIT : LIMIT;
      return length > limit ? `the haiku has ${length} characters, more than ${limit}` : null;
    } },
  { id: 'script', description: "Written in the script of the haiku's language.",
    test: core => { const outside = lettersOutside(core.haiku.join(''), core.language); return outside ? `letters outside its language's script: ${outside}` : null; } }
];

export default defineCore<Haiku>({
  id: 'core', labels: { word_phrase: 'Haiku', sentence: 'Haiku' }, shape,
  // One line each, in one paragraph.
  format: core => core.haiku.map(escapeMarkdown).join('\n'),
  header: core => ({ kind: 'creativity', language: core.language, key: core.key }),
  read: ({ header, text: stored }) => {
    const language = header.kind === 'creativity' && header.language ? header.language : 'other';
    const haiku = plainLines(stored);
    return { language, key: header.key, haiku: haiku.length ? haiku : ['—'] };
  },
  checks
});
