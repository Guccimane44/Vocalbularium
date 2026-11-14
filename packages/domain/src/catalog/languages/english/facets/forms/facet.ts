import { defineFacet, escapeMarkdown, foreignLetters, object, oneOf, optional, table, text } from '../../../../blocks.js';
import type { Shape } from '../../../../blocks.js';
import type { CoreValue } from '../../../../define.js';
import { isEnglish } from '../../english.js';

// How the English word changes (D35): the English word the card describes, by
// Etymology's rule (the key when it is English, otherwise the English word for
// its first meaning, `contextual` first), which the core names as `formsWord`
// with its `gramRole`. One slot per form; a noun, an adjective or adverb and a
// modal show in one line joined by a middle dot, a verb in a table of one row.
// Two accepted forms share a slot, joined by " / " (*travelled / traveled*).
const ROLES = ['noun', 'verb', 'adjective', 'adverb'];
const role = (core: CoreValue) => String(core.gramRole ?? '').trim().toLowerCase();

// What the module writes, never the model: a noun's note, and the verb table's headings.
const NOTES = { uncountable: 'uncountable', 'plural only': 'plural only' } as const;
const BASE = 'Base';
const VERB_COLUMNS = ['Third person', 'Past', 'Past participle', '-ing form'] as const;
const NOUN = ['plural', 'number'] as const;
const SLOTS: readonly Slot[] = ['plural', 'thirdPerson', 'past', 'pastParticiple', 'ing', 'comparative', 'superlative'];
const VERB = ['thirdPerson', 'past', 'pastParticiple', 'ing'] as const;
const COMPARISON = ['comparative', 'superlative'] as const;
const shape = object({
  word: text('the word'),
  plural: optional(text('the plural')),
  number: optional(oneOf(['uncountable', 'plural only'], 'uncountable or plural only')),
  thirdPerson: optional(text('the third person singular')),
  past: optional(text('the past')),
  pastParticiple: optional(text('the past participle')),
  ing: optional(text('the -ing form')),
  comparative: optional(text('the comparative')),
  superlative: optional(text('the superlative'))
});
type Forms = typeof shape extends Shape<infer T> ? T : never;
type Slot = Exclude<keyof Forms, 'word' | 'number'>;
const has = (value: Forms, slots: readonly (keyof Forms)[]) => slots.some(slot => value[slot] !== undefined);
const slot = (form: string) => form.split('/').map(part => part.trim()).join(' / ');
const MAX_FORMS = 2;

export default defineFacet({
  id: 'forms', label: 'Forms', abbreviation: 'Fo', description: 'How the English word changes: a plural, a comparison or a verb\'s forms.',
  applies: ['word_phrase'], output: 'text',
  // A card read back from storage has no `gramRole` (D35): Forms is offered,
  // and the model decides from the card whether the word inflects.
  when: core => !role(core) || ROLES.includes(role(core)),
  shape,
  format: value => {
    const word = escapeMarkdown(value.word.trim());
    if (value.thirdPerson !== undefined && value.pastParticiple !== undefined && value.ing !== undefined) {
      return table([...VERB_COLUMNS], [{ label: value.word.trim(), cells: VERB.map(each => slot(value[each] ?? '')) }], BASE);
    }
    const forms = value.number ? [NOTES[value.number]]
      : SLOTS.map(each => value[each]).filter((form): form is string => form !== undefined);
    return [word, ...forms.map(form => escapeMarkdown(slot(form)))].join(' · ');
  },
  checks: [{
    id: 'forms-word', description: 'The word is the core\'s `formsWord`, when the core names one, and English.',
    test: (value, card) => {
      const named = String(card.core.formsWord ?? '').trim();
      if (named && named.toLowerCase() !== value.word.trim().toLowerCase()) return `the forms are of "${value.word}", the core names "${named}"`;
      return isEnglish(value.word) ? null : `"${value.word}" is not English: ${foreignLetters(value.word, 'latin') || 'no letters'}`;
    }
  }, {
    id: 'one-part-of-speech', description: 'The forms are a noun\'s, a verb\'s or a comparison, never a mix, and fit the core\'s `gramRole` when it names one; a noun has a plural or a note, never both.',
    test: (value, card) => {
      const groups = [has(value, NOUN) && 'noun', has(value, VERB) && 'verb', has(value, COMPARISON) && 'comparison'].filter(Boolean);
      if (!groups.length) return 'no forms';
      if (groups.length > 1) return `forms of a ${groups.join(' and a ')}`;
      if (value.plural !== undefined && value.number) return `a plural and "${value.number}"`;
      const expected = { noun: 'noun', verb: 'verb', adjective: 'comparison', adverb: 'comparison' }[role(card.core)];
      return expected && expected !== groups[0] ? `${groups[0]} forms for a ${role(card.core)}` : null;
    }
  }, {
    id: 'forms', description: `Every form is filled and English, with at most ${MAX_FORMS} forms in a slot joined by " / ", none repeated in a slot.`,
    test: value => {
      for (const each of SLOTS) {
        const form = value[each];
        if (form === undefined) continue;
        const parts = form.split('/').map(part => part.trim().toLowerCase());
        if (parts.some(part => !part)) return `${each} has an empty form`;
        if (parts.length > MAX_FORMS) return `${each} has ${parts.length} forms, at most ${MAX_FORMS}`;
        if (new Set(parts).size < parts.length) return `${each} repeats a form`;
        if (!isEnglish(form)) return `${each} "${form}" is not English: ${foreignLetters(form, 'latin') || 'no letters'}`;
      }
      return null;
    }
  }]
});
