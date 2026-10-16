import type { BlockDocument, ParentBlock, ParentCore, ParentFacets } from '@vocabularium/contracts';
import { facetsOf, isFacetOf, ordered, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';

// A parent module's content as structured data (D09, 0.7.4): the core and one
// entry per facet with content, stored as one typed block in the component's
// block document. Nothing here parses or produces markup.

export type ParentContent = Readonly<{ core: ParentCore; facets: ParentFacets }>;

const MAX_TEXT = 2000;
const MAX_ITEMS = 20;

// The component's parent block, or null when it holds none (empty or plain text).
export function parentBlock(content: BlockDocument): ParentBlock | null {
  return (content.blocks.find(block => block.type === 'parent') as ParentBlock | undefined) ?? null;
}
export function parentContentOf(content: BlockDocument): ParentContent | null {
  const block = parentBlock(content);
  return block ? { core: block.core, facets: block.facets } : null;
}
export function parentDocument(content: ParentContent): BlockDocument {
  return { version: 1, blocks: [{ type: 'parent', core: content.core, facets: content.facets }] };
}

// Whether the content holds nothing: no meaning or translation and no facet
// (D09: the user may empty every field). Such content has nothing to replace.
export function isEmptyContent(content: ParentContent): boolean {
  const core = content.core.kind === 'word' ? content.core.meanings.length : content.core.translation ? 1 : 0;
  return !core && !Object.keys(content.facets).length;
}

// Whether a facet has content, and which of the parent's facets do, in its order.
export function hasFacetContent(content: ParentContent | null, facet: string): boolean {
  return Boolean(content && (content.facets as Record<string, unknown>)[facet] !== undefined);
}
export function filledFacets(parent: ParentType, content: ParentContent | null): FacetType[] {
  return content ? ordered(parent, Object.keys(content.facets)) : [];
}
// The content with one facet's entry replaced, or removed when `entry` is undefined.
export function withFacetEntry<F extends FacetType>(content: ParentContent, facet: F, entry: ParentFacets[F & keyof ParentFacets] | undefined): ParentContent {
  const facets: Record<string, unknown> = { ...content.facets };
  if (entry === undefined) delete facets[facet]; else facets[facet] = entry;
  return { core: content.core, facets: facets as ParentFacets };
}

// Thrown when data does not have the parent's shape.
export class ContentError extends Error {}
const fail = (message: string): never => { throw new ContentError(message); };

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
function list<T>(value: unknown, what: string, item: (value: unknown, index: number) => T, required: boolean): T[] {
  if (!Array.isArray(value)) return fail(`${what} is not a list.`);
  if (required && !value.length) fail(`${what} is empty.`);
  if (value.length > MAX_ITEMS) fail(`${what} has too many items.`);
  return value.map(item);
}
// An item of several parts: a generated one has every required part; a saved
// one needs at least one part with text (D09: the user may empty any field).
function parts<T extends Record<string, unknown>>(value: unknown, what: string, keys: readonly string[], read: (value: Record<string, unknown>) => T): T {
  if (!isRecord(value)) return fail(`${what} is not structured.`);
  only(value, keys, what);
  const item = set(read(value)) as T;
  if (!Object.keys(item).length) fail(`${what} is empty.`);
  return item;
}

function core(value: unknown, complete: boolean): ParentCore {
  if (!isRecord(value)) return fail('The core is missing.');
  if (value.kind === 'word') {
    only(value, ['kind', 'language', 'key', 'romanization', 'meanings'], 'The core');
    return set({ kind: 'word' as const, language: text(value.language, "The key's language", true)!, key: text(value.key, 'The key', true)!,
      romanization: text(value.romanization, 'The romanization', false),
      meanings: list(value.meanings ?? [], 'The meanings', (meaning, index) => text(meaning, `Meaning ${index + 1}`, true)!, complete) });
  }
  if (value.kind === 'sentence') {
    only(value, ['kind', 'translation'], 'The core');
    return set({ kind: 'sentence' as const, translation: text(value.translation, 'The translation', complete) });
  }
  return fail('The core must be a word or a sentence.');
}

// Each facet's shape. `complete` is a generated result's rule: every item
// whole, with the parts a reader needs.
const FACET_SHAPES: Record<FacetType, (value: unknown, label: string, complete: boolean) => unknown> = {
  article: (value, label, complete) => parts(value, label, ['singular', 'plural'], article =>
    ({ singular: text(article.singular, `${label}: the singular`, complete), plural: text(article.plural, `${label}: the plural`, false) })),
  examples: (value, label, complete) => list(value, label, (example, index) => parts(example, `${label} ${index + 1}`, ['sentence', 'translation'], item =>
    ({ sentence: text(item.sentence, `${label} ${index + 1}: the sentence`, complete), translation: text(item.translation, `${label} ${index + 1}: the translation`, false) })), true),
  synonyms: (value, label) => list(value, label, (word, index) => text(word, `${label} ${index + 1}`, true)!, true),
  antonyms: (value, label) => list(value, label, (word, index) => text(word, `${label} ${index + 1}`, true)!, true),
  pinyin: (value, label, complete) => list(value, label, (line, index) => parts(line, `${label} ${index + 1}`, ['text', 'pinyin'], item =>
    ({ text: text(item.text, `${label} ${index + 1}: the text`, complete), pinyin: text(item.pinyin, `${label} ${index + 1}: the pinyin`, complete) })), true)
};

// Checks data against a parent's shape and returns it trimmed, as stored.
// `facets` limits the entries to the facets the instance has. `complete`
// applies to a generated result: a word has meanings, a sentence its
// translation, and every item each part a reader needs. Saved edits need
// only the core's top line and, per item, one part with text.
export function validateParentContent(parent: ParentType, value: unknown, { facets, complete = false }: { facets?: readonly string[]; complete?: boolean } = {}): ParentContent {
  if (!isRecord(value)) return fail('The content is not structured.');
  only(value, ['core', 'facets'], 'The content');
  const entries = value.facets === undefined ? {} : value.facets;
  if (!isRecord(entries)) return fail('The facets are not structured.');
  for (const key of Object.keys(entries)) if (!isFacetOf(parent, key)) fail(`${PARENTS[parent].label} has no facet "${key}".`);
  const checked: Record<string, unknown> = {};
  for (const facet of facetsOf(parent).filter(each => entries[each] !== undefined)) {
    if (facets && !facets.includes(facet)) fail(`${PARENTS[parent].label} has no ${PARENTS[parent].facets[facet]!.label} here.`);
    checked[facet] = FACET_SHAPES[facet](entries[facet], PARENTS[parent].facets[facet]!.label, complete);
  }
  return { core: core(value.core, complete), facets: checked as ParentFacets };
}

// One facet's entry checked on its own, as `validateParentContent` checks it.
export function validateFacetEntry(parent: ParentType, facet: FacetType, value: unknown, { complete = false }: { complete?: boolean } = {}): unknown {
  if (!isFacetOf(parent, facet)) return fail(`${PARENTS[parent].label} has no facet "${facet}".`);
  return FACET_SHAPES[facet](value, PARENTS[parent].facets[facet]!.label, complete);
}

// Whether a provider left a facet's entry out or empty: no content, not a failure (D09).
export function emptyEntry(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.every(emptyItem)) || (isRecord(value) && Object.values(value).every(blank))
    || (typeof value === 'string' && !value.trim());
}

// What the field editor sends: every text may be empty and every list may hold
// empty items; nothing else may differ from the stored shape.
export type ParentDraft = Readonly<{
  meanings?: readonly string[];
  translation?: string;
  facets: Readonly<{
    article?: Readonly<{ singular?: string; plural?: string }>;
    examples?: ReadonlyArray<Readonly<{ sentence?: string; translation?: string }>>;
    synonyms?: readonly string[];
    antonyms?: readonly string[];
    pinyin?: ReadonlyArray<Readonly<{ text?: string; pinyin?: string }>>;
  }>;
}>;

// The field editor's draft of stored content (D09): the meanings or the
// translation, and an entry for each facet the component has, in the parent's
// order, empty for a facet without content so it can be filled.
export function draftOf(parent: ParentType, content: ParentContent, facets: readonly string[]) {
  const f = content.facets;
  const has = (facet: FacetType) => facets.includes(facet) && isFacetOf(parent, facet);
  return {
    ...(content.core.kind === 'word' ? { meanings: [...content.core.meanings] } : { translation: content.core.translation ?? '' }),
    facets: {
      ...(has('article') ? { article: { singular: f.article?.singular ?? '', plural: f.article?.plural ?? '' } } : {}),
      ...(has('examples') ? { examples: (f.examples ?? []).map(example => ({ sentence: example.sentence ?? '', translation: example.translation ?? '' })) } : {}),
      ...(has('synonyms') ? { synonyms: [...(f.synonyms ?? [])] } : {}),
      ...(has('antonyms') ? { antonyms: [...(f.antonyms ?? [])] } : {}),
      ...(has('pinyin') ? { pinyin: (f.pinyin ?? []).map(line => ({ text: line.text ?? '', pinyin: line.pinyin ?? '' })) } : {})
    }
  };
}

const emptyItem = (item: unknown) => isRecord(item) ? Object.values(item).every(blank) : blank(item);
const filled = <T>(items: readonly T[] | undefined): T[] => (items ?? []).filter(item => !emptyItem(item));

// A field-editor save (D09): the stored core's top line (language, key,
// romanization) stays as it was; the meanings or the translation, and each of
// the instance's facets, come from the draft. Any field may be left empty, the
// core's included, and Save never refuses for it: a row with nothing in it is
// dropped, an item keeps the parts that have text, and a facet left with
// nothing in it loses its entry.
export function applyDraft(parent: ParentType, stored: ParentContent, draft: ParentDraft, { facets }: { facets: readonly string[] }): ParentContent {
  const coreValue = stored.core.kind === 'word'
    ? { ...stored.core, meanings: filled(draft.meanings) }
    : { kind: 'sentence', translation: draft.translation };
  const given = draft.facets;
  const entries: Record<string, unknown> = {};
  const keep = (facet: FacetType, value: unknown) => {
    if (!facets.includes(facet) || !isFacetOf(parent, facet)) return;
    if (Array.isArray(value) ? value.length : value !== undefined && !emptyItem(value)) entries[facet] = value;
  };
  keep('article', given.article);
  keep('examples', filled(given.examples));
  keep('synonyms', filled(given.synonyms));
  keep('antonyms', filled(given.antonyms));
  keep('pinyin', filled(given.pinyin));
  return validateParentContent(parent, { core: coreValue, facets: entries }, { facets });
}
