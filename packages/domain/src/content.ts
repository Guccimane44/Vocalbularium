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

// Thrown when data does not have the parent's shape, or a save would leave the core empty.
export class ContentError extends Error {}
const fail = (message: string): never => { throw new ContentError(message); };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function only(value: Record<string, unknown>, keys: readonly string[], what: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${what} has an unexpected field "${key}".`);
}
// A required text: a non-empty string after trimming, at most MAX_TEXT long.
function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim()) return fail(`${what} is missing.`);
  if (value.length > MAX_TEXT) fail(`${what} is too long.`);
  return value.trim();
}
const optionalText = (value: unknown, what: string): string | undefined =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim()) ? undefined : text(value, what);
function list<T>(value: unknown, what: string, item: (value: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || !value.length) return fail(`${what} is empty.`);
  if (value.length > MAX_ITEMS) fail(`${what} has too many items.`);
  return value.map(item);
}

function core(value: unknown): ParentCore {
  if (!isRecord(value)) return fail('The core is missing.');
  if (value.kind === 'word') {
    only(value, ['kind', 'language', 'key', 'romanization', 'meanings'], 'The core');
    const romanization = optionalText(value.romanization, 'The romanization');
    return { kind: 'word', language: text(value.language, "The key's language"), key: text(value.key, 'The key'),
      ...(romanization ? { romanization } : {}),
      meanings: list(value.meanings, 'The meanings', (meaning, index) => text(meaning, `Meaning ${index + 1}`)) };
  }
  if (value.kind === 'sentence') {
    only(value, ['kind', 'translation'], 'The core');
    return { kind: 'sentence', translation: text(value.translation, 'The translation') };
  }
  return fail('The core must be a word or a sentence.');
}

const FACET_SHAPES: Record<FacetType, (value: unknown, label: string) => unknown> = {
  article: (value, label) => {
    if (!isRecord(value)) return fail(`${label} is not an article.`);
    only(value, ['singular', 'plural'], label);
    const plural = optionalText(value.plural, `${label}: the plural`);
    return { singular: text(value.singular, `${label}: the singular`), ...(plural ? { plural } : {}) };
  },
  examples: (value, label) => list(value, label, (example, index) => {
    if (!isRecord(example)) return fail(`${label} ${index + 1} is not an example.`);
    only(example, ['sentence', 'translation'], `${label} ${index + 1}`);
    const translation = optionalText(example.translation, `${label} ${index + 1}: the translation`);
    return { sentence: text(example.sentence, `${label} ${index + 1}: the sentence`), ...(translation ? { translation } : {}) };
  }),
  synonyms: (value, label) => list(value, label, (word, index) => text(word, `${label} ${index + 1}`)),
  antonyms: (value, label) => list(value, label, (word, index) => text(word, `${label} ${index + 1}`)),
  pinyin: (value, label) => list(value, label, (line, index) => {
    if (!isRecord(line)) return fail(`${label} ${index + 1} is not a Pinyin line.`);
    only(line, ['text', 'pinyin'], `${label} ${index + 1}`);
    return { text: text(line.text, `${label} ${index + 1}: the text`), pinyin: text(line.pinyin, `${label} ${index + 1}: the pinyin`) };
  })
};

// Checks data against a parent's shape and returns it trimmed, as stored.
// `facets` limits the entries to the facets the instance has.
export function validateParentContent(parent: ParentType, value: unknown, { facets }: { facets?: readonly string[] } = {}): ParentContent {
  if (!isRecord(value)) return fail('The content is not structured.');
  only(value, ['core', 'facets'], 'The content');
  const entries = value.facets === undefined ? {} : value.facets;
  if (!isRecord(entries)) return fail('The facets are not structured.');
  const checked: Record<string, unknown> = {};
  for (const facet of facetsOf(parent).filter(each => entries[each] !== undefined)) {
    if (facets && !facets.includes(facet)) fail(`${PARENTS[parent].label} has no ${PARENTS[parent].facets[facet]!.label} here.`);
    checked[facet] = FACET_SHAPES[facet](entries[facet], PARENTS[parent].facets[facet]!.label);
  }
  for (const key of Object.keys(entries)) if (!isFacetOf(parent, key)) fail(`${PARENTS[parent].label} has no facet "${key}".`);
  return { core: core(value.core), facets: checked as ParentFacets };
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

const blank = (value: unknown) => typeof value !== 'string' || !value.trim();
const filled = <T>(items: readonly T[] | undefined, empty: (item: T) => boolean): T[] => (items ?? []).filter(item => !empty(item));

// A field-editor save (D09): the stored core's top line (language, key,
// romanization) stays as it was; the meanings or the translation, and each of
// the instance's facets, come from the draft. Empty items are dropped and a
// facet left with nothing in it loses its entry. The core must keep at least
// one meaning, or its translation. An item filled only in part, such as an
// example with a translation but no sentence, is refused, never dropped.
export function applyDraft(parent: ParentType, stored: ParentContent, draft: ParentDraft, { facets }: { facets: readonly string[] }): ParentContent {
  const coreValue = stored.core.kind === 'word'
    ? { ...stored.core, meanings: filled(draft.meanings, blank) }
    : { kind: 'sentence', translation: draft.translation ?? '' };
  if (coreValue.kind === 'word' && !(coreValue as { meanings: unknown[] }).meanings.length) fail('Keep at least one meaning.');
  if (coreValue.kind === 'sentence' && blank((coreValue as { translation: string }).translation)) fail('Keep the translation.');
  const given = draft.facets;
  const entries: Record<string, unknown> = {};
  const keep = (facet: FacetType, value: unknown) => {
    if (!facets.includes(facet) || !isFacetOf(parent, facet)) return;
    if (Array.isArray(value) ? value.length : value !== undefined) entries[facet] = value;
  };
  const article = given.article;
  keep('article', article && !(blank(article.singular) && blank(article.plural)) ? article : undefined);
  keep('examples', filled(given.examples, example => blank(example.sentence) && blank(example.translation)));
  keep('synonyms', filled(given.synonyms, blank));
  keep('antonyms', filled(given.antonyms, blank));
  keep('pinyin', filled(given.pinyin, line => blank(line.text) && blank(line.pinyin)));
  return validateParentContent(parent, { core: coreValue, facets: entries }, { facets });
}
