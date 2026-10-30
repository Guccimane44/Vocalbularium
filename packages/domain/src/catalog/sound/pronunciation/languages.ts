// The languages the pinned speech model, Eleven v4 Turbo, speaks (D24, K69),
// by their ISO 639-1 codes, as ElevenLabs' model documentation listed them on
// 30 October 2026; the languages it names only by ISO 639-3 codes (Asturian,
// Cantonese, Cebuano, Filipino) are left out, since the flag is a 639-1 code.
// Pronunciation's `language` flag is one of these or `other`. A change of the
// speech model changes this list with it.
export const SPOKEN_LANGUAGES = [
  'af', 'ar', 'as', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'fi', 'fr',
  'ga', 'gl', 'gu', 'ha', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'jv', 'ka', 'kk', 'kn', 'ko', 'ky', 'lb',
  'ln', 'lt', 'lv', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'no', 'oc', 'or', 'pa', 'pl', 'ps', 'pt',
  'ro', 'ru', 'sd', 'sk', 'sl', 'so', 'sr', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'yo', 'zh'
] as const;
export type SpokenLanguage = typeof SPOKEN_LANGUAGES[number];
export const isSpokenLanguage = (code: string): code is SpokenLanguage => (SPOKEN_LANGUAGES as readonly string[]).includes(code);
