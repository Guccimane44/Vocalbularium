// Building blocks for checks (0.16.0): which writing system a text is in.
// A script's letters are counted; digits, punctuation, spaces and symbols are
// neutral, so "COVID-19" is Latin and "3.14" is in none.

export type Script = 'latin' | 'han' | 'cyrillic' | 'arabic';
const LETTERS: Readonly<Record<Script, RegExp>> = {
  latin: /\p{Script=Latin}/u, han: /\p{Script=Han}/u, cyrillic: /\p{Script=Cyrillic}/u, arabic: /\p{Script=Arabic}/u
};

// How many letters of each script a text has.
export function scriptsOf(text: string): Partial<Record<Script, number>> {
  const counts: Partial<Record<Script, number>> = {};
  for (const char of text) for (const script of Object.keys(LETTERS) as Script[]) if (LETTERS[script].test(char)) counts[script] = (counts[script] ?? 0) + 1;
  return counts;
}
// The letters of the text not in the given script, as a short list for a message.
export function foreignLetters(text: string, script: Script): string {
  return [...new Set([...text].filter(char => /\p{L}/u.test(char) && !LETTERS[script].test(char)))].slice(0, 8).join('');
}
// Whether the text has a letter of the script at all.
export const hasScript = (text: string, script: Script) => LETTERS[script].test(text);
export const hanCount = (text: string) => [...text].filter(char => LETTERS.han.test(char)).length;

// Japanese kana (0.16.4): a haiku's reading in hiragana or katakana.
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const SMALL_KANA = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/u;
export const hasKana = (text: string) => KANA.test(text);
// The morae of a kana text: each kana and the long-vowel mark one, a small
// ya, yu, yo or vowel none, since it joins the kana before it (kya is one);
// the small tsu and ん count one each. Anything but kana counts nothing.
export function moraCount(text: string): number {
  let count = 0;
  for (const char of text.normalize('NFC')) if (KANA.test(char) && !SMALL_KANA.test(char)) count++;
  return count;
}

// The letters a language is written in, by its ISO 639-1 code, for the
// languages a check can tell by script (0.16.4); any other has none here.
const LATIN = ['af', 'ca', 'cs', 'cy', 'da', 'de', 'en', 'es', 'et', 'eu', 'fi', 'fr', 'ga', 'gl', 'hr', 'hu', 'id', 'is', 'it', 'lt', 'lv',
  'ms', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'sl', 'sq', 'sv', 'sw', 'tl', 'tr', 'vi'];
const LANGUAGE_LETTERS: Readonly<Record<string, RegExp>> = {
  ...Object.fromEntries(LATIN.map(code => [code, /\p{Script=Latin}/u])),
  ...Object.fromEntries(['ru', 'uk', 'bg', 'be', 'mk', 'kk'].map(code => [code, /\p{Script=Cyrillic}/u])),
  ...Object.fromEntries(['ar', 'fa', 'ur'].map(code => [code, /\p{Script=Arabic}/u])),
  zh: /\p{Script=Han}/u, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u, ko: /[\p{Script=Hangul}\p{Script=Han}]/u,
  el: /\p{Script=Greek}/u, he: /\p{Script=Hebrew}/u, hi: /\p{Script=Devanagari}/u, th: /\p{Script=Thai}/u
};
// The letters of the text outside its language's script, as a short list for
// a message; null for a language this cannot tell.
export function lettersOutside(text: string, language: string): string | null {
  const letters = LANGUAGE_LETTERS[language];
  if (!letters) return null;
  return [...new Set([...text].filter(char => /\p{L}/u.test(char) && !letters.test(char)))].slice(0, 8).join('');
}
