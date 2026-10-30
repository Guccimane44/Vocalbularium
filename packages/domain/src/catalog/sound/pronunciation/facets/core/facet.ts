import { defineCore, object, oneOf, text } from '../../../../blocks.js';
import { isSpokenLanguage, SPOKEN_LANGUAGES } from '../../languages.js';

// One flag (D24): the language the main key is written in, an ISO 639-1 code
// the speech model speaks, or `other`; then the key as the top line shows it.
// The card has no text of its own: the page's saved main key is what is
// spoken, in that language, never the key as the model wrote it.
const shape = object({
  language: oneOf([...SPOKEN_LANGUAGES, 'other'], "The key's language"),
  key: text('The key')
}, { own: true });

export default defineCore({
  id: 'core', label: 'Core', labels: { word_phrase: 'Pronunciation', sentence: 'Pronunciation' }, output: 'text', shape,
  format: () => '',
  header: core => ({ kind: 'pronunciation', language: core.language, key: core.key }),
  read: ({ header }) => {
    const language = header.kind === 'pronunciation' ? header.language : '';
    return { language: isSpokenLanguage(language) ? language : 'other' as const, key: header.key };
  },
  // The main key, spoken in the flag's language; nothing for `other`.
  spoken: core => core.language === 'other' ? null : { language: core.language }
});
