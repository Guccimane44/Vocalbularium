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
