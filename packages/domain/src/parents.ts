import type { InputType } from '@vocabularium/contracts';
import { contentModule, familyOf, isContentModule, MODULE_IDS } from './catalog/index.js';
export { DEFAULT_DECK_MODULES } from './catalog/index.js';
import type { ContentModuleId, FacetId, FamilyId } from './catalog/index.js';
import type { CoreValue } from './catalog/define.js';

// Parent modules with a core and facets (D08). A parent's core applies to every
// input type; its facets add one kind of content each, in an order the parent
// type fixes, and are judged applicable per input type. A facet type belongs to
// one parent type: German Examples and Chinese Examples are different facets.
// Each parent is defined once in the module catalog (D11); this is its summary.

export type ParentType = ContentModuleId;
export type FacetType = FacetId;
export type ParentFamily = FamilyId;

// `abbreviation` marks the facet's tag on its parent's card (0.7.1), unique
// within its parent (D11).
export type FacetDefinition = Readonly<{ label: string; abbreviation: string; description: string; applies: readonly InputType[] }>;
export type ParentDefinition = Readonly<{
  label: string;
  description: string;
  family: ParentFamily;
  // The parent's facets in the order they are shown.
  facets: Readonly<Partial<Record<FacetType, FacetDefinition>>>;
}>;

export const PARENTS: Readonly<Record<ParentType, ParentDefinition>> = Object.freeze(Object.fromEntries(MODULE_IDS.filter(isContentModule).map(id => {
  const module = contentModule(id);
  return [id, {
    label: module.label, description: module.description, family: familyOf(id)!,
    facets: Object.fromEntries(module.facets.map(facet =>
      [facet.id, { label: facet.label, abbreviation: facet.abbreviation, description: facet.description, applies: facet.applies }]))
  }];
})) as Record<ParentType, ParentDefinition>);

export const isParentType = (type: string): type is ParentType => Object.hasOwn(PARENTS, type);
// A family's parents in the catalog's order, such as every Languages module.
export const parentsIn = (family: ParentFamily): ParentType[] => (Object.keys(PARENTS) as ParentType[]).filter(parent => PARENTS[parent].family === family);
export const facetsOf = (parent: ParentType): FacetType[] => Object.keys(PARENTS[parent].facets) as FacetType[];
export const isFacetOf = (parent: string, facet: string): facet is FacetType =>
  isParentType(parent) && Object.hasOwn(PARENTS[parent].facets, facet);
export const facetLabel = (parent: ParentType, facet: FacetType): string => PARENTS[parent].facets[facet]!.label;
export const facetAbbreviation = (parent: ParentType, facet: FacetType): string => PARENTS[parent].facets[facet]!.abbreviation;

// The given facets in the parent's order, without duplicates or strangers.
export function ordered(parent: ParentType, facets: readonly string[]): FacetType[] {
  return facetsOf(parent).filter(facet => facets.includes(facet));
}

// The facets that contribute for this kind of key, in order; the core always
// does. The samples use it; generation asks the core itself (`facetsFor`).
export function applicableFacets(parent: ParentType, facets: readonly string[], inputType: InputType): FacetType[] {
  return ordered(parent, facets).filter(facet => PARENTS[parent].facets[facet]!.applies.includes(inputType));
}

// Whether a facet applies to a written core (D17): to the kind of key it read
// (an Expertise core, which has no kind, counts as a word's) and to the flags
// the facet's own condition names, such as Article only for a noun.
export function appliesTo(parent: ParentType, facet: FacetType, core: CoreValue): boolean {
  const definition = contentModule(parent).facets.find(each => each.id === facet);
  if (!definition) return false;
  const kind: InputType = core.kind === 'sentence' ? 'sentence' : 'word_phrase';
  return definition.applies.includes(kind) && (definition.when?.(core) ?? true);
}
// Why a facet does not apply to a written core, or null when it does (D17):
// a word-only facet on a sentence, a grammar facet for another kind of word,
// an Expertise facet outside the subject, or a concept that has none.
export type RuledOut = 'sentence' | 'role' | 'subject' | 'none';
export function ruledOut(parent: ParentType, facet: FacetType, core: CoreValue): RuledOut | null {
  if (appliesTo(parent, facet, core)) return null;
  const definition = contentModule(parent).facets.find(each => each.id === facet);
  if (!definition) return null;
  if (!definition.applies.includes(core.kind === 'sentence' ? 'sentence' : 'word_phrase')) return 'sentence';
  if ('relevance' in core) return core.relevance === 'subject' ? 'none' : 'subject';
  return 'role';
}
// The given facets that apply to a written core, in the parent's order.
export const facetsFor = (parent: ParentType, facets: readonly string[], core: CoreValue): FacetType[] =>
  ordered(parent, facets).filter(facet => appliesTo(parent, facet, core));

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
