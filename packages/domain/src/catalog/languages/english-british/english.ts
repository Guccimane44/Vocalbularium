import type { CoreValue } from '../../define.js';
import { scriptsOf } from '../../scripts.js';

// What the British English module's checks share (0.16.4): whether a text is
// English, whether the key is, and the American spellings a British card never
// writes. The American module has its own (D25).

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

// The common American spellings, each with its British form: -or for -our,
// -er for -re, -ize and -yze for -ise and -yse, -se for -ce, a single l before
// a suffix, and single words. Only forms British English never uses are
// listed, so program (software), dialog (computing), meter (a device), tire
// (to grow tired), check, curb, draft, practice, aging, analog, fetus and
// sulfur stay out.
const forms = (british: string, american: string, suffixes: readonly (readonly [string, string])[]) =>
  suffixes.map(([b, a]) => [`${british}${b}`, `${american}${a}`] as const);
const same = (...suffixes: string[]) => suffixes.map(suffix => [suffix, suffix] as const);
const OUR = same('', 's', 'ed', 'ing', 'able', 'ably', 'ite', 'ites', 'ful', 'less', 'er', 'ers', 'y', 'hood', 'hoods', 'ly');
const our = (...stems: string[]) => stems.flatMap(stem => forms(`${stem}our`, `${stem}or`, OUR));
const re = (...stems: string[]) => stems.flatMap(stem => forms(stem, stem, [['re', 'er'], ['res', 'ers'], ['red', 'ered'], ['ring', 'ering']]));
const ISE = same('e', 'es', 'ed', 'ing', 'ation', 'ations', 'er', 'ers');
const ise = (...stems: string[]) => stems.flatMap(stem => forms(`${stem}is`, `${stem}iz`, ISE));
const yse = (...stems: string[]) => stems.flatMap(stem => forms(`${stem}ys`, `${stem}yz`, same('e', 'ed', 'ing', 'er', 'ers')));
const ence = (...stems: string[]) => stems.flatMap(stem => forms(`${stem}ce`, `${stem}se`, same('', 's', 'less')));
const ll = (...stems: string[]) => stems.flatMap(stem => forms(`${stem}l`, stem, same('led', 'ling', 'ler', 'lers')));
const PAIRS: readonly (readonly [british: string, american: string])[] = [
  ...our('col', 'fav', 'hon', 'lab', 'neighb', 'behavi', 'flav', 'hum', 'harb', 'rum', 'vap', 'sav', 'endeav', 'arm', 'od', 'parl',
    'cand', 'clam', 'tum', 'val', 'ferv', 'rig', 'splend', 'ard'),
  ...re('cent', 'theat', 'lit', 'fib', 'somb', 'spect', 'calib', 'sab', 'lust', 'meag'),
  ...ise('organ', 'real', 'recogn', 'apolog', 'critic', 'emphas', 'memor', 'summar', 'categor', 'priorit', 'special', 'minim', 'maxim',
    'util', 'civil', 'character', 'author', 'standard', 'custom', 'final', 'visual', 'symbol', 'normal', 'familiar', 'modern',
    'industrial', 'global', 'legal', 'mobil', 'harmon', 'sympath', 'local', 'personal', 'optim', 'colon', 'agon', 'patron'),
  ...yse('anal', 'paral', 'catal'),
  ...ence('defen', 'offen', 'preten'),
  ...ll('travel', 'cancel', 'label', 'model', 'fuel', 'level', 'signal', 'total', 'quarrel', 'channel', 'tunnel', 'dial', 'jewel', 'counsel'),
  ['marvellous', 'marvelous'], ['jewellery', 'jewelry'], ['counsellor', 'counselor'], ['counsellors', 'counselors'],
  ['enrolment', 'enrollment'], ['fulfilment', 'fulfillment'], ['skilful', 'skillful'], ['wilful', 'willful'],
  ['grey', 'gray'], ['greys', 'grays'], ['greyish', 'grayish'], ['plough', 'plow'], ['ploughs', 'plows'], ['ploughed', 'plowed'],
  ['mould', 'mold'], ['moulds', 'molds'], ['mouldy', 'moldy'], ['smoulder', 'smolder'], ['smouldering', 'smoldering'],
  ['moustache', 'mustache'], ['pyjamas', 'pajamas'], ['aluminium', 'aluminum'], ['sceptical', 'skeptical'], ['sceptic', 'skeptic'],
  ['manoeuvres', 'maneuvers'], ['manoeuvre', 'maneuver'], ['manoeuvred', 'maneuvered'], ['manoeuvring', 'maneuvering'],
  ['catalogue', 'catalog'], ['catalogues', 'catalogs'], ['behavioural', 'behavioral'],
  ['paediatric', 'pediatric'], ['anaemia', 'anemia'], ['oesophagus', 'esophagus'], ['diarrhoea', 'diarrhea'],
  ['cosy', 'cozy'], ['woollen', 'woolen'], ['enrol', 'enroll'], ['enrols', 'enrolls'], ['fulfil', 'fulfill'], ['fulfils', 'fulfills'],
  ['instil', 'instill'], ['distil', 'distill'], ['aeroplane', 'airplane'], ['aeroplanes', 'airplanes']
];
// The American form, lowercase, to its British one.
const AMERICAN = new Map(PAIRS.filter(([british, american]) => british !== american).map(([british, american]) => [american, british]));
const BRITISH = new Map([...AMERICAN].map(([american, british]) => [british, american]));
const wordsOf = (value: string) => value.toLowerCase().match(/\p{L}+/gu) ?? [];

// The first American spelling in these texts, as a message, or null. The key's
// own words, in either spelling and any form, are allowed: a card for color
// may name colour and colours.
export function americanSpelling(texts: readonly (string | undefined)[], core: CoreValue): string | null {
  // The key's words in both spellings, and their forms: colours beside colour.
  const stems = wordsOf(String(core.key ?? '')).flatMap(word => [word, AMERICAN.get(word), BRITISH.get(word)].filter(Boolean) as string[]);
  const allowed = (word: string) => stems.some(stem => word.startsWith(stem));
  for (const value of texts) for (const word of wordsOf(value ?? '')) {
    if (!allowed(word) && AMERICAN.has(word)) return `"${word}" is the American spelling of "${AMERICAN.get(word)}"`;
  }
  return null;
}
