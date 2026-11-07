import type { CoreValue } from '../../define.js';
import { scriptsOf } from '../../scripts.js';

// What the American English module's checks share (0.16.4): whether a text is
// English, whether the key is, and the British spellings an American card
// never writes. The British module has its own (D25).

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

// The common British spellings, each with its American form: -our for -or,
// -re for -er, -ise and -yse for -ize and -yze, -ce for -se, a double l before
// a suffix, and single words, with the British forms American English never
// uses: programme, storey, tyre, kerb, cheque, draught, licence and practise.
// Forms American English shares, such as glamour, ageing, analyses and
// whilst, stay out.
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
  ['instil', 'instill'], ['distil', 'distill'], ['aeroplane', 'airplane'], ['aeroplanes', 'airplanes'],
  ['programme', 'program'], ['programmes', 'programs'], ['storey', 'story'], ['storeys', 'stories'], ['tyre', 'tire'], ['tyres', 'tires'],
  ['kerb', 'curb'], ['kerbs', 'curbs'], ['cheque', 'check'], ['cheques', 'checks'], ['draught', 'draft'], ['draughts', 'drafts'],
  ['licence', 'license'], ['licences', 'licenses'], ['practise', 'practice'], ['practised', 'practiced'], ['practising', 'practicing'],
  ['gaol', 'jail'], ['manoeuvrable', 'maneuverable']
];
// The British form, lowercase, to its American one.
const BRITISH = new Map(PAIRS.filter(([british, american]) => british !== american).map(([british, american]) => [british, american]));
const AMERICAN = new Map([...BRITISH].map(([british, american]) => [american, british]));
const wordsOf = (value: string) => value.toLowerCase().match(/\p{L}+/gu) ?? [];

// The first British spelling in these texts, as a message, or null. The key's
// own words, in either spelling and any form, are allowed: a card for colour
// may name color and colors.
export function britishSpelling(texts: readonly (string | undefined)[], core: CoreValue): string | null {
  // The key's words in both spellings, and their forms: colours beside colour.
  const stems = wordsOf(String(core.key ?? '')).flatMap(word => [word, AMERICAN.get(word), BRITISH.get(word)].filter(Boolean) as string[]);
  const allowed = (word: string) => stems.some(stem => word.startsWith(stem));
  for (const value of texts) for (const word of wordsOf(value ?? '')) {
    if (!allowed(word) && BRITISH.has(word)) return `"${word}" is the British spelling of "${BRITISH.get(word)}"`;
  }
  return null;
}
