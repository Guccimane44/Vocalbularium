// Main key tiers (D05): presentation only; generation, search and editing
// always use the full text.
export type Tier = 'word' | 'phrase' | 'sentence' | 'passage';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// Up to 24 / 60 / 200 Latin characters, or 8 / 20 / 70 when the key is CJK.
export function mainKeyTier(text: string): Tier {
  const key = text.trim();
  const length = [...key].length;
  const [word, phrase, sentence] = CJK.test(key) ? [8, 20, 70] : [24, 60, 200];
  if (length <= word) return 'word';
  if (length <= phrase) return 'phrase';
  if (length <= sentence) return 'sentence';
  return 'passage';
}

export function wordCount(text: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  let count = 0;
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) count++;
  return count;
}
