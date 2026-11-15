import { defineCore, escapeMarkdown, languageCode, lettersOutside, list, object, plainLines, text } from '../../../../blocks.js';
import type { Check } from '../../../../blocks.js';

// A joke (D30): the language it is told in, the key's, as an ISO 639-1 code
// or `other`, first; then the key and the joke as lines, so a set-up and its
// punchline, or the turns of a dialogue, sit on lines of their own.
const shape = object({
  language: languageCode("The joke's language"),
  key: text('The key'),
  joke: list(text(), { name: 'The joke', each: 'Line' })
}, { own: true });
type Joke = Readonly<{ language: string; key: string; joke: string[] }>;

// Short: at most this many lines and characters, spaces not counted; fewer
// characters in Chinese, Japanese and Korean.
const MAX_LINES = 6;
const LIMIT = 400;
const DENSE_LIMIT = 160;
const DENSE = ['zh', 'ja', 'ko'];
const checks: readonly Check<Joke>[] = [
  { id: 'short', description: 'Short: a few lines, the whole within a limit.',
    test: core => {
      if (core.joke.length > MAX_LINES) return `the joke has ${core.joke.length} lines, more than ${MAX_LINES}`;
      const length = [...core.joke.join('').replace(/\s/g, '')].length;
      const limit = DENSE.includes(core.language) ? DENSE_LIMIT : LIMIT;
      return length > limit ? `the joke has ${length} characters, more than ${limit}` : null;
    } },
  { id: 'script', description: "Told in the script of the joke's language.",
    test: core => { const outside = lettersOutside(core.joke.join(''), core.language); return outside ? `letters outside its language's script: ${outside}` : null; } }
];

export default defineCore<Joke>({
  id: 'core', labels: { word_phrase: 'Joke', sentence: 'Joke' }, shape,
  // One line each, in one paragraph.
  format: core => core.joke.map(escapeMarkdown).join('\n'),
  header: core => ({ kind: 'creativity', language: core.language, key: core.key }),
  read: ({ header, text: stored }) => {
    const language = header.kind === 'creativity' && header.language ? header.language : 'other';
    const joke = plainLines(stored);
    return { language, key: header.key, joke: joke.length ? joke : ['—'] };
  },
  checks
});
