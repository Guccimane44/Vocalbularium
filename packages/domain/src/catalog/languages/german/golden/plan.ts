import type german from '../module.js';
import { defineGoldenPlan } from '../../../../golden/define.js';

// German's failure points, as the owner approved them in
// docs/plans/v0.17.0/01-golden-set.md. Declension cells are "Singular|Genitiv"
// for a noun and "Maskulinum|stark Nominativ" for an adjective.
export default defineGoldenPlan<typeof german>({
  module: 'german',
  bands: { common: 4, middle: 2 },
  facets: {
    core: { scoring: 'judge', points: [
      { id: 'context-sense', what: 'a Context that picks one sense (Schloss, bank)' },
      { id: 'context-flat', what: 'a Context that does not narrow the sense (refrigerator)' },
      { id: 'original-meaning', what: "the original meaning kept beside the Context's" },
      { id: 'shared-spelling', what: 'a spelling two languages share, decided by the Context (gift, Gift)' },
      { id: 'inflected-key', what: 'an inflected form explained as its headword (lief, Häuser)' },
      { id: 'kind', what: 'the six kinds: word, phrase, idiom, sentence, name, abbreviation' },
      { id: 'source-language', what: 'keys in English, Chinese, French, Spanish, Japanese, Russian and Arabic' },
      { id: 'no-equivalent', what: 'a word without a close German word (serendipity, тоска)' },
      { id: 'slang', what: 'internet slang and chat abbreviations, in any language (sus, vllt, idk, 666, mdr)' },
      { id: 'typo', what: 'a misspelt key (Weter, recieve); the model decides what to make of it' },
      { id: 'fragment', what: 'a broken selection: part of a word, or one part of a separable verb (ngsamkeit, fängt)' },
      { id: 'coined', what: 'a word no dictionary holds: an ad-hoc compound or a loan blend (Homeofficemüdigkeit, downgeloadet)' },
      { id: 'colloquial', what: "dialect and colloquial forms (nix, haste, Moin, gonna, ain't)" },
      { id: 'noise', what: 'a key with odd case, punctuation, a hashtag or an emoji around it (HAUS, "Ufer,", #Fernweh)' }
    ] },
    article: { scoring: 'reference', shape: { kind: 'fields' }, points: [
      { id: 'gender-suffix', what: 'gender a suffix predicts (-ung, -heit, -chen, -ling); a floor', cells: ['singular'] },
      { id: 'gender-natural', what: 'grammatical gender against natural sex (das Mädchen, das Weib)', cells: ['singular'] },
      { id: 'gender-sense', what: 'gender that depends on the sense (der/die See, der/die Kiefer, der/das Band)', cells: ['singular'] },
      { id: 'gender-loan', what: 'loanword gender (die E-Mail, das Handy, der or das Virus)', cells: ['singular'] },
      { id: 'gender-compound', what: "a compound takes its last part's gender (die Haustür)", cells: ['singular'] },
      { id: 'plural-class', what: 'the plural class: -e with umlaut, -er, -s, -(e)n, unchanged', cells: ['plural'] },
      { id: 'plural-foreign', what: 'foreign plurals (Museen, Themen, Atlanten or Atlasse)', cells: ['plural'] },
      { id: 'plural-sense', what: 'the plural depends on the sense (Bänke, Banken; Wörter, Worte)', cells: ['plural'] },
      { id: 'plural-none', what: 'no plural (Milch, Obst); plural only (Leute, Eltern)', abstain: true, cells: ['*'] }
    ] },
    examples: { scoring: 'judge', points: [
      { id: 'natural-use', what: 'the key used naturally' },
      { id: 'translation', what: 'the translation says the same as its sentence' },
      { id: 'sentence-key', what: 'a sentence key gets one new sentence of the same structure' },
      { id: 'german-key', what: "a German key's examples have no translation", abstain: true }
    ] },
    synonyms: { scoring: 'judge', points: [
      { id: 'per-sense', what: 'near synonyms for one sense of a word with several' },
      { id: 'register', what: 'synonyms of a phrase or idiom in a matching register' }
    ] },
    antonyms: { scoring: 'judge', points: [
      { id: 'true-opposite', what: 'a true opposite, not a related word (Ufer is a real past fault)' },
      { id: 'by-sense', what: 'antonyms that depend on the sense (alt: jung, neu)' },
      { id: 'none', what: 'no antonym (Tisch, Fernweh)', abstain: true }
    ] },
    conjugation: { scoring: 'reference', shape: { kind: 'table' }, perBand: true, points: [
      { id: 'present-vowel', what: 'vowel change in du and er (nimmst, liest, läufst, fährst)', cells: ['Präsens|du', 'Präsens|er/sie/es'] },
      { id: 'present-stem', what: '-est after a stem in -s, -ß or -z (du liest, du heißt)', cells: ['Präsens|du'] },
      { id: 'et-insertion', what: '-et insertion (du arbeitest, ihr redet)', cells: ['Präsens|*', 'Präteritum|*'] },
      { id: 'strong-preterite', what: 'the strong Präteritum stem (sprang, half, lief)', cells: ['Präteritum|ich', 'Präteritum|du', 'Präteritum|er/sie/es', 'Präteritum|wir', 'Präteritum|sie/Sie'] },
      { id: 'preterite-ihr', what: "the ihr form in the Präteritum (lieft, gingt), Haiku's real fault", cells: ['Präteritum|ihr'] },
      { id: 'mixed', what: 'mixed verbs (brachte, dachte, kannte, gebracht)', cells: ['Präteritum|*', 'Perfekt|*'],
        noWordsIn: { rare: 'The mixed verbs are a closed group of about a dozen; the least frequent, aberkennen, verkennen and entbrennen, are DWDS class 2.' } },
      { id: 'modal-wissen', what: 'modals and wissen (kann, weiß, mochte)', cells: ['Präsens|*', 'Präteritum|*'],
        noWordsIn: { rare: 'The modals, wissen and vermögen are DWDS classes 3 to 6; no rare verb conjugates like them.' } },
      { id: 'separable', what: 'separable verbs (stehe auf, stand auf, aufgestanden)', cells: ['*'] },
      { id: 'inseparable', what: 'inseparable prefixes, no ge- (verstanden, bekommen)', cells: ['Perfekt|*'] },
      { id: 'prefix-sense', what: 'separable or not by sense (übersetzen, umfahren)', cells: ['*'] },
      { id: 'auxiliary', what: 'haben or sein in the Perfekt, including verbs that take both (ist gefahren, hat das Auto gefahren)', cells: ['Perfekt|*'] },
      { id: 'reflexive', what: 'reflexive verbs (freue mich, habe mich gefreut)', cells: ['*'] }
    ] },
    declension: { scoring: 'reference', shape: { kind: 'table' }, perBand: true, points: [
      { id: 'genitive-s', what: 'genitive -s against -es (des Hauses, des Lehrers)', cells: ['Singular|Genitiv'] },
      { id: 'dative-plural', what: 'dative plural -n (den Kindern)', cells: ['Plural|Dativ'] },
      { id: 'n-declension', what: 'weak masculine nouns (des Jungen, dem Herrn, den Studenten)', cells: ['Singular|*'] },
      { id: 'mixed-noun', what: 'mixed nouns (des Namens, des Herzens, dem Herzen)', cells: ['Singular|*'],
        noWordsIn: { rare: 'The mixed nouns are a closed group of about a dozen; the least frequent, Same and Haufe, are DWDS class 2.' } },
      { id: 'missing-forms', what: '"—" where a noun has no singular or plural', abstain: true, cells: ['*'] },
      { id: 'adjective-regular', what: 'strong, weak and mixed endings; a floor', cells: ['*'] },
      { id: 'adjective-e-drop', what: 'a dropped e (dunkle, teure, saure)', cells: ['*'] },
      { id: 'adjective-stem', what: 'a stem change (hohe)', cells: ['*'] },
      { id: 'adjective-indeclinable', what: 'adjectives that do not decline (lila, rosa, prima)', abstain: true, cells: ['*'],
        noWordsIn: { common: 'The adjectives DWDS calls indeclinable (lila, rosa, prima, klasse, ocker, mauve) are classes 1 to 3; super, class 4, now has declined forms in DWDS.' } }
    ] },
    comparison: { scoring: 'reference', shape: { kind: 'fields' }, points: [
      { id: 'regular', what: 'a floor (klein, kleiner, am kleinsten)', cells: ['*'] },
      { id: 'umlaut', what: 'umlaut (alt, älter, am ältesten)', cells: ['comparative', 'superlative'] },
      { id: 'suppletive', what: 'a different stem (gut, besser; viel, mehr)', cells: ['comparative', 'superlative'] },
      { id: 'stem-change', what: 'hoch, höher; nah, näher, am nächsten', cells: ['comparative', 'superlative'] },
      { id: 'est-superlative', what: '-est after -s, -t, -z (am kürzesten, am heißesten)', cells: ['superlative'] },
      { id: 'e-drop', what: 'dunkler, teurer', cells: ['comparative'] },
      { id: 'not-comparable', what: 'tot, schwanger, ganz', abstain: true, cells: ['*'] }
    ] },
    case: { scoring: 'reference', shape: { kind: 'set', of: 'case' }, points: [
      { id: 'accusative', what: 'für, durch, ohne, gegen, um', cells: ['case'] },
      { id: 'dative', what: 'mit, aus, bei, seit, von, zu, nach', cells: ['case'] },
      { id: 'two-way', what: 'in, an, auf, über, with direction and place', cells: ['case'] },
      { id: 'genitive', what: 'wegen, trotz, während, with the colloquial dative noted', cells: ['case'] },
      { id: 'genitive-rare', what: 'anhand, aufgrund, innerhalb', cells: ['case'] }
    ] },
    pronunciation: { scoring: 'judge', points: [
      { id: 'speaks-translation', what: 'speaks the German translation, with no label' },
      { id: 'loanword', what: "a loanword's German form (Restaurant, Orange)" }
    ] },
    etymology: { scoring: 'judge', perBand: true, points: [
      { id: 'inherited', what: 'a native word with a known line (Wasser); a floor' },
      { id: 'latin-early', what: 'an early Latin loan (Fenster, Mauer, Wein)' },
      { id: 'french', what: 'a French loan (Büro, Restaurant)' },
      { id: 'english', what: 'an English loan (Keks, Streik)' },
      { id: 'other-route', what: 'a loan from or through another language (Tollpatsch, Kartoffel, Kaffee)' },
      { id: 'coined', what: 'a coinage with a known author (Weltschmerz)',
        noWordsIn: { common: 'No word with a known coiner is in DWDS classes 4 to 6: Leidenschaft and Verfasser, credited to Zesen, are class 3, and DWDS credits Zesen only with Verfasser.' } },
      { id: 'meaning-shift', what: 'a word whose meaning changed (Gift, billig)' },
      { id: 'folk-etymology', what: 'a word reshaped by folk etymology (Hängematte, Maulwurf), where a plausible wrong story tempts',
        noWordsIn: { common: 'The folk etymologies found (Friedhof, Wahnsinn, Abenteuer, Hängematte, Maulwurf, Armbrust, Sintflut) are DWDS classes 2 and 3.' } },
      { id: 'disputed', what: 'an origin dictionaries dispute (Kitsch); the card must not state one account as certain' },
      { id: 'unclear', what: 'Kluge calls the origin unclear; no Etymology is right', abstain: true }
    ] },
    'simple-translation': { scoring: 'judge', points: [
      { id: 'abstract', what: 'an abstract word in A2 German (Weltschmerz)' },
      { id: 'compound', what: 'a long compound (Rechtsschutzversicherung)' },
      { id: 'sentence', what: 'a sentence with hard words, in one simple line' },
      { id: 'order', what: "one line per meaning, in the core's order" }
    ] },
    'grammar-teacher': { scoring: 'judge', points: [
      { id: 'foreign-key', what: 'absent for a key that is not German', abstain: true },
      { id: 'sentence-points', what: 'true points on a German sentence (Konjunktiv II, passive, verb-final clause)' },
      { id: 'word-points', what: 'true points on a German word (separable, irregular forms)' },
      { id: 'little-to-say', what: 'a key with little to teach (Tisch), where a padded point is weak' }
    ] }
  }
});
