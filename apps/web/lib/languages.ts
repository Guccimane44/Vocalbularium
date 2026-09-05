export const languages = [
  ["en", "English"],
  ["de", "German"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["ja", "Japanese"],
  ["zh-Hans", "Chinese · Simplified"],
  ["zh-Hant", "Chinese · Traditional"],
  ["ar", "Arabic"],
  ["ko", "Korean"],
  ["ru", "Russian"],
  ["pl", "Polish"],
  ["uk", "Ukrainian"],
  ["tr", "Turkish"],
  ["el", "Greek"],
  ["la", "Latin"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["sv", "Swedish"],
  ["da", "Danish"],
  ["no", "Norwegian"],
  ["fi", "Finnish"],
  ["vi", "Vietnamese"],
  ["th", "Thai"],
  ["id", "Indonesian"],
  ["tl", "Tagalog"],
] as const;
export function languageName(tag: string | null) {
  if (!tag) return "Detecting language";
  return (
    languages.find((l) => l[0] === tag)?.[1] ??
    new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ??
    tag
  );
}
