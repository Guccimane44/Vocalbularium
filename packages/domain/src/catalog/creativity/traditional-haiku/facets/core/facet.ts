import { defineCore, escapeMarkdown, hanCount, hasKana, hasScript, languageCode, lettersOutside, list, moraCount, object, optional, plainLines, text } from '../../../../blocks.js';
import type { Check } from '../../../../blocks.js';

// A classical haiku (D30): the language it is written in, the key's, as an
// ISO 639-1 code or `other`, first; then the key and the haiku's three lines,
// 5-7-5: syllables, morae in Japanese, characters in a Chinese 汉俳. A
// Japanese haiku also gives its reading in kana, so its morae can be counted;
// the reading is checked, not shown or stored.
const lines = list(text(), { name: 'The haiku', each: 'Line' });
const shape = object({
  language: languageCode("The haiku's language"),
  key: text('The key'),
  haiku: lines,
  reading: optional(list(text(), { name: 'The reading', each: 'Reading line' }))
}, { own: true });
type Haiku = Readonly<{ language: string; key: string; haiku: string[]; reading?: string[] }>;

const COUNT = [5, 7, 5];
const counted = (counts: readonly number[]) => counts.every((count, index) => count === COUNT[index]);
const checks: readonly Check<Haiku>[] = [
  { id: 'three-lines', description: 'Three lines.',
    test: core => core.haiku.length === 3 ? null : `the haiku has ${core.haiku.length} lines, not 3` },
  { id: 'script', description: "Written in the script of the haiku's language.",
    test: core => { const outside = lettersOutside(core.haiku.join(''), core.language); return outside ? `letters outside its language's script: ${outside}` : null; } },
  // Deterministic for Chinese: a 汉俳 counts its characters.
  { id: 'chinese-count', description: 'A Chinese haiku counts 5, 7 and 5 characters.',
    test: core => {
      if (core.language !== 'zh' || core.haiku.length !== 3) return null;
      const counts = core.haiku.map(hanCount);
      return counted(counts) ? null : `the characters count ${counts.join('-')}, not 5-7-5`;
    } },
  // Deterministic for Japanese: the reading's morae.
  { id: 'japanese-count', description: 'A Japanese haiku gives its reading in kana, of 5, 7 and 5 morae.',
    test: core => {
      if (core.language !== 'ja' || core.haiku.length !== 3) return null;
      const reading = core.reading ?? [];
      if (reading.length !== 3) return `the reading has ${reading.length} lines, not 3`;
      if (reading.some(line => hasScript(line, 'han') || !hasKana(line))) return 'the reading is not written in kana';
      const counts = reading.map(moraCount);
      return counted(counts) ? null : `the morae count ${counts.join('-')}, not 5-7-5`;
    } }
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
