// Reading pinyin for the Chinese checks (0.16.0): Hanyu Pinyin with tone
// marks, its syllables run together within a word ("wǒmen"), separated by a
// space, a hyphen or an apostrophe ("hé'àn"). A syllable is an initial and a
// final the standard spelling allows; neutral-tone syllables carry no mark.

const TONED: Readonly<Record<string, string>> = Object.fromEntries([
  ['āáǎà', 'a'], ['ōóǒò', 'o'], ['ēéěè', 'e'], ['īíǐì', 'i'], ['ūúǔù', 'u'], ['ǖǘǚǜ', 'ü']
].flatMap(([marked, plain]) => [...marked!].map(char => [char, plain!])));

const ZERO = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'er',
  'yi', 'ya', 'ye', 'yao', 'you', 'yan', 'yin', 'yang', 'ying', 'yong', 'yu', 'yue', 'yuan', 'yun',
  'wu', 'wa', 'wo', 'wai', 'wei', 'wan', 'wen', 'wang', 'weng'];
const OPEN = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong'];
const I = ['i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong'];
const U = ['u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang'];
const GROUPS: readonly (readonly [readonly string[], readonly string[]])[] = [
  [['b', 'p', 'm', 'f'], ['a', 'o', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'i', 'ie', 'iao', 'iu', 'ian', 'in', 'ing', 'u']],
  [['d', 't', 'n', 'l', 'g', 'k', 'h'], [...OPEN, ...I, ...U, 'ü', 'üe']],
  [['j', 'q', 'x'], [...I, 'u', 'ue', 'uan', 'un']],
  [['zh', 'ch', 'sh', 'r', 'z', 'c', 's'], [...OPEN, 'i', ...U]]
];
const SYLLABLES: ReadonlySet<string> = new Set([...ZERO, ...GROUPS.flatMap(([initials, finals]) => initials.flatMap(initial => finals.map(final => initial + final)))]);
const LONGEST = Math.max(...[...SYLLABLES].map(syllable => syllable.length));

export type PinyinReading = Readonly<{ syllables: readonly string[]; marks: readonly number[] }> | Readonly<{ error: string }>;

// The syllables of a pinyin text and the number of tone marks on each, or what
// cannot be read. An erhua "r" ("yìdiǎnr") stays on its syllable.
export function readPinyin(pinyin: string): PinyinReading {
  if (/[1-5]/.test(pinyin)) return { error: 'tone numbers instead of tone marks' };
  const syllables: string[] = [];
  const marks: number[] = [];
  for (const word of pinyin.normalize('NFC').toLowerCase().split(/[\s\-'’‘·,.;:!?，。、；：！？“”"()（）]+/u).filter(Boolean)) {
    const plain = [...word].map(char => TONED[char] ?? char).join('').replace(/v/g, 'ü');
    const marked = [...word].map(char => (TONED[char] ? 1 : 0));
    if (/[^a-zü]/.test(plain)) return { error: `"${word}" has letters pinyin does not use` };
    // The longest syllable first, backtracking when the rest cannot be read.
    const split = (from: number): string[] | null => {
      if (from === plain.length) return [];
      for (let length = Math.min(LONGEST + 1, plain.length - from); length > 0; length--) {
        const piece = plain.slice(from, from + length);
        const syllable = SYLLABLES.has(piece) ? piece : piece.endsWith('r') && SYLLABLES.has(piece.slice(0, -1)) ? piece : null;
        if (!syllable) continue;
        const rest = split(from + length);
        if (rest) return [syllable, ...rest];
      }
      return null;
    };
    const parts = split(0);
    if (!parts) return { error: `"${word}" is not a pinyin syllable or word` };
    let at = 0;
    for (const part of parts) {
      syllables.push(part);
      marks.push(marked.slice(at, at + part.length).reduce((sum: number, mark) => sum + mark, 0));
      at += part.length;
    }
  }
  return { syllables, marks };
}
