import type { InputType } from '@vocabularium/contracts';

// Parent modules with a core and facets (D08). A parent's core applies to every
// input type; its facets add one kind of content each, in an order the parent
// type fixes, and are judged applicable per input type. A facet type belongs to
// one parent type: German Examples and Chinese Examples are different facets.

export type ParentType = 'german' | 'chinese';
export type FacetType = 'article' | 'examples' | 'synonyms' | 'antonyms' | 'pinyin';
export type ParentFamily = 'translation';

// `abbreviation` marks the facet's tag on its parent's card (0.7.1): never
// repeated among the facet types, and the same for one facet type on every parent.
export type FacetDefinition = Readonly<{ label: string; abbreviation: string; description: string; applies: readonly InputType[] }>;
export type ParentDefinition = Readonly<{
  label: string;
  description: string;
  family: ParentFamily;
  // The parent's facets in the order they are shown.
  facets: Readonly<Partial<Record<FacetType, FacetDefinition>>>;
}>;

const BOTH: readonly InputType[] = ['word_phrase', 'sentence'];
const WORDS: readonly InputType[] = ['word_phrase'];

export const PARENTS: Readonly<Record<ParentType, ParentDefinition>> = Object.freeze({
  german: {
    label: 'German', family: 'translation',
    description: 'Explains a word in German, or translates a sentence into German.',
    facets: {
      article: { label: 'Article', abbreviation: 'Ar', description: 'The German article, gender and plural of a noun.', applies: WORDS },
      examples: { label: 'Examples', abbreviation: 'Ex', description: 'Example sentences with their translations.', applies: BOTH },
      synonyms: { label: 'Synonyms', abbreviation: 'Sy', description: 'German words with the same meaning.', applies: WORDS },
      antonyms: { label: 'Antonyms', abbreviation: 'An', description: 'German words with the opposite meaning.', applies: WORDS }
    }
  },
  chinese: {
    label: 'Chinese', family: 'translation',
    description: 'Explains a word in Chinese, or translates a sentence into Chinese.',
    facets: {
      examples: { label: 'Examples', abbreviation: 'Ex', description: 'Example sentences with their translations.', applies: BOTH },
      pinyin: { label: 'Pinyin', abbreviation: 'Py', description: 'The pinyin of the Chinese translation.', applies: BOTH }
    }
  }
});

export const isParentType = (type: string): type is ParentType => Object.hasOwn(PARENTS, type);
export const facetsOf = (parent: ParentType): FacetType[] => Object.keys(PARENTS[parent].facets) as FacetType[];
export const isFacetOf = (parent: string, facet: string): facet is FacetType =>
  isParentType(parent) && Object.hasOwn(PARENTS[parent].facets, facet);
export const facetLabel = (parent: ParentType, facet: FacetType): string => PARENTS[parent].facets[facet]!.label;
export const facetAbbreviation = (parent: ParentType, facet: FacetType): string => PARENTS[parent].facets[facet]!.abbreviation;

// The given facets in the parent's order, without duplicates or strangers.
export function ordered(parent: ParentType, facets: readonly string[]): FacetType[] {
  return facetsOf(parent).filter(facet => facets.includes(facet));
}

// The facets that contribute for this input type, in order; the core always does.
export function applicableFacets(parent: ParentType, facets: readonly string[], inputType: InputType): FacetType[] {
  return ordered(parent, facets).filter(facet => PARENTS[parent].facets[facet]!.applies.includes(inputType));
}

// A module instance's facets: none for any other module, and for a parent only
// its own facets, each once, in its order.
export function validateFacets(type: string, facets: readonly string[] = []): void {
  if (!isParentType(type)) {
    if (facets.length) throw new Error('Only a parent module has facets.');
    return;
  }
  if (new Set(facets).size !== facets.length) throw new Error('A facet appears only once in its module.');
  for (const facet of facets) {
    if (!isFacetOf(type, facet)) throw new Error(`${PARENTS[type].label} has no facet “${facet}”.`);
  }
  if (ordered(type, facets).join() !== facets.join()) throw new Error(`Facets follow the order of ${PARENTS[type].label}.`);
}

// What adding and deleting a facet looks at: one module on a page or in a deck.
export type FacetHolder = Readonly<{ id: string; type: string; facets?: readonly string[]; status?: string | null }>;

// The facet with this one added, in the parent's order.
export function withFacet(parent: ParentType, facets: readonly string[], facet: FacetType): FacetType[] {
  return ordered(parent, [...facets, facet]);
}

// Why this facet cannot be added to this module, or null. A facet lands only on
// a parent of its own type.
export function facetAddBlocked(holder: FacetHolder | undefined, parent: string, facet: string): string | null {
  if (!isParentType(parent) || !isFacetOf(parent, facet)) return 'This facet does not exist.';
  const label = facetLabel(parent, facet);
  if (!holder) return 'This module no longer exists.';
  if (holder.type !== parent) return `${label} can only be added to a ${PARENTS[parent].label} module.`;
  if (holder.facets?.includes(facet)) return `This module already has ${label}.`;
  if (holder.status === 'loading') return 'This module is still generating.';
  return null;
}

// Why this facet cannot be deleted from this module, or null.
export function facetDeleteBlocked(holder: FacetHolder | undefined, facet: string): string | null {
  if (!holder) return 'This module no longer exists.';
  if (!holder.facets?.includes(facet)) return 'This facet is no longer there.';
  if (holder.status === 'loading') return 'This module is still generating.';
  return null;
}

// The modules a facet's + can add it to, in list order: parents of its type
// that do not have it yet and are not generating.
export function facetTargets(holders: readonly FacetHolder[], parent: string, facet: string): FacetHolder[] {
  return holders.filter(holder => facetAddBlocked(holder, parent, facet) === null);
}

// Why the module window disables this facet for these modules, or null when at
// least one module would take it.
export function facetUnavailable(holders: readonly FacetHolder[], parent: string, facet: string): string | null {
  if (!isParentType(parent) || !isFacetOf(parent, facet)) return 'This facet does not exist.';
  if (facetTargets(holders, parent, facet).length) return null;
  const parents = holders.filter(holder => holder.type === parent);
  const label = PARENTS[parent].label, facetName = facetLabel(parent, facet);
  if (!parents.length) return `Add a ${label} module first.`;
  if (parents.every(holder => holder.facets?.includes(facet))) {
    return parents.length === 1 ? `The ${label} module already has ${facetName}.` : `Every ${label} module already has ${facetName}.`;
  }
  return `The ${label} modules are still generating.`;
}
