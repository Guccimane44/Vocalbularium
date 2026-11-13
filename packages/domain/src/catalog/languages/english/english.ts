import type { CoreValue } from '../../define.js';
import { scriptsOf } from '../../scripts.js';

// What the English module's checks share (0.16.4): whether a text is English
// and whether the key is. No check tells British from American English (D31).

// English in the Latin script: more Latin letters than letters of the other
// scripts the checks know. Greek or runic letters in an etymology count for neither.
export const isEnglish = (value: string) => {
  const scripts = scriptsOf(value);
  const foreign = (scripts.han ?? 0) + (scripts.cyrillic ?? 0) + (scripts.arabic ?? 0);
  return Boolean(scripts.latin) && foreign < scripts.latin!;
};

// The core's names for English as the key's language; Grammar teacher applies
// only to these (0.16.4).
export const ENGLISH_NAMES = ['english', 'british english', 'american english'];
export const keyIsEnglish = (core: CoreValue) => ENGLISH_NAMES.includes(String(core.language ?? '').trim().toLowerCase());
