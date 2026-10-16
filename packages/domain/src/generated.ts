import type { GeneratedParent, ParentCore, ParentFacets } from '@vocabularium/contracts';
import { facetsOf, isFacetOf, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';

// The provider's result for a parent module (D09): JSON with a core and one
// entry per facet, checked complete before it is kept. The app then formats it
// into markdown per facet (markdown.ts); it is never stored as JSON.

const MAX_TEXT = 2000;
const MAX_ITEMS = 20;

// Thrown when a result does not have the parent's shape.
export class GeneratedError extends Error {}
const fail = (message: string): never => { throw new GeneratedError(message); };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function only(value: Record<string, unknown>, keys: readonly string[], what: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${what} has an unexpected field "${key}".`);
}
const blank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());
// A text trimmed, at most MAX_TEXT long; undefined when blank, unless required.
function text(value: unknown, what: string, required: boolean): string | undefined {
  if (blank(value)) return required ? fail(`${what} is missing.`) : undefined;
  if (typeof value !== 'string') return fail(`${what} is not text.`);
  if (value.length > MAX_TEXT) fail(`${what} is too long.`);
  return value.trim();
}
const set = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, part]) => part !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };
function list<T>(value: unknown, what: string, item: (value: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) return fail(`${what} is not a list.`);
  if (!value.length) fail(`${what} is empty.`);
  if (value.length > MAX_ITEMS) fail(`${what} has too many items.`);
  return value.map(item);
}
function record(value: unknown, what: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return fail(`${what} is not structured.`);
  only(value, keys, what);
  return value;
}

function core(value: unknown): ParentCore {
  if (!isRecord(value)) return fail('The core is missing.');
  if (value.kind === 'word') {
    only(value, ['kind', 'language', 'key', 'romanization', 'meanings'], 'The core');
    return set({ kind: 'word' as const, language: text(value.language, "The key's language", true)!, key: text(value.key, 'The key', true)!,
      romanization: text(value.romanization, 'The romanization', false),
      meanings: list(value.meanings, 'The meanings', (meaning, index) => text(meaning, `Meaning ${index + 1}`, true)!) });
  }
  if (value.kind === 'sentence') {
    only(value, ['kind', 'translation'], 'The core');
    return { kind: 'sentence', translation: text(value.translation, 'The translation', true)! };
  }
  return fail('The core must be a word or a sentence.');
}

// Each facet's shape, every item whole with the parts a reader needs.
const FACET_SHAPES: Record<FacetType, (value: unknown, label: string) => unknown> = {
  article: (value, label) => {
    const article = record(value, label, ['singular', 'plural']);
    return set({ singular: text(article.singular, `${label}: the singular`, true), plural: text(article.plural, `${label}: the plural`, false) });
  },
  examples: (value, label) => list(value, label, (example, index) => {
    const item = record(example, `${label} ${index + 1}`, ['sentence', 'translation']);
    return set({ sentence: text(item.sentence, `${label} ${index + 1}: the sentence`, true), translation: text(item.translation, `${label} ${index + 1}: the translation`, false) });
  }),
  synonyms: (value, label) => list(value, label, (word, index) => text(word, `${label} ${index + 1}`, true)!),
  antonyms: (value, label) => list(value, label, (word, index) => text(word, `${label} ${index + 1}`, true)!),
  pinyin: (value, label) => list(value, label, (line, index) => {
    const item = record(line, `${label} ${index + 1}`, ['text', 'pinyin']);
    return { text: text(item.text, `${label} ${index + 1}: the text`, true), pinyin: text(item.pinyin, `${label} ${index + 1}: the pinyin`, true) };
  })
};

// Checks a result against the parent's shape and returns it trimmed. `facets`
// limits the entries to the facets the instance has.
export function validateGenerated(parent: ParentType, value: unknown, { facets }: { facets?: readonly string[] } = {}): GeneratedParent {
  if (!isRecord(value)) return fail('The content is not structured.');
  only(value, ['core', 'facets'], 'The content');
  const entries = value.facets === undefined ? {} : value.facets;
  if (!isRecord(entries)) return fail('The facets are not structured.');
  for (const key of Object.keys(entries)) if (!isFacetOf(parent, key)) fail(`${PARENTS[parent].label} has no facet "${key}".`);
  const checked: Record<string, unknown> = {};
  for (const facet of facetsOf(parent).filter(each => entries[each] !== undefined)) {
    if (facets && !facets.includes(facet)) fail(`${PARENTS[parent].label} has no ${PARENTS[parent].facets[facet]!.label} here.`);
    checked[facet] = FACET_SHAPES[facet](entries[facet], PARENTS[parent].facets[facet]!.label);
  }
  return { core: core(value.core), facets: checked as ParentFacets };
}

// One facet's entry checked on its own, as `validateGenerated` checks it.
export function validateGeneratedFacet(parent: ParentType, facet: FacetType, value: unknown): unknown {
  if (!isFacetOf(parent, facet)) return fail(`${PARENTS[parent].label} has no facet "${facet}".`);
  return FACET_SHAPES[facet](value, PARENTS[parent].facets[facet]!.label);
}

// Whether a provider left a facet's entry out or empty: no content, not a failure.
const emptyItem = (item: unknown) => isRecord(item) ? Object.values(item).every(blank) : blank(item);
export function emptyEntry(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.every(emptyItem)) || (isRecord(value) && Object.values(value).every(blank))
    || (typeof value === 'string' && !value.trim());
}
