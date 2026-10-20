import type { CoreValue } from './catalog/define.js';
import { contentModule } from './catalog/index.js';
import { blank, fail, GeneratedError, isRecord, only } from './catalog/shape.js';
import { facetsOf, isFacetOf, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';

// The provider's result for a parent module (D09): JSON with a core and one
// entry per facet, checked complete before it is kept against the shapes its
// module defines in the catalog (D11). The app then formats it into markdown
// per facet (content.ts); it is never stored as JSON.

export { GeneratedError };
export type GeneratedParent = Readonly<{ core: CoreValue; facets: Readonly<Partial<Record<FacetType, unknown>>> }>;

// The core in the shape its kind names: a word's or a sentence's.
function core(parent: ParentType, value: unknown): CoreValue {
  if (!isRecord(value)) return fail('The core is missing.');
  const shapes = contentModule(parent).core.shapes;
  const shape = value.kind === 'word' ? shapes.word_phrase : value.kind === 'sentence' ? shapes.sentence : null;
  if (!shape) return fail('The core must be a word or a sentence.');
  return shape.check(value, 'The core');
}
const facetShape = (parent: ParentType, facet: FacetType) => contentModule(parent).facets.find(each => each.id === facet)!.shape;

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
    checked[facet] = facetShape(parent, facet).check(entries[facet], PARENTS[parent].facets[facet]!.label);
  }
  return { core: core(parent, value.core), facets: checked };
}

// One facet's entry checked on its own, as `validateGenerated` checks it.
export function validateGeneratedFacet(parent: ParentType, facet: FacetType, value: unknown): unknown {
  if (!isFacetOf(parent, facet)) return fail(`${PARENTS[parent].label} has no facet "${facet}".`);
  return facetShape(parent, facet).check(value, PARENTS[parent].facets[facet]!.label);
}

// Whether a provider left a facet's entry out or empty: no content, not a failure.
const emptyItem = (item: unknown) => isRecord(item) ? Object.values(item).every(blank) : blank(item);
export function emptyEntry(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.every(emptyItem)) || (isRecord(value) && Object.values(value).every(blank))
    || (typeof value === 'string' && !value.trim());
}
