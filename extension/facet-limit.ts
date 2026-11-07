import { MAX_FACETS } from '@vocabularium/contracts';

// A parent holds at most MAX_FACETS facets (0.16.4): once it holds that many,
// the facet window disables the facets left to add, with its reason. A module
// may offer more facets than a parent holds; the user picks.
export const facetsFull = (held: number, max: number = MAX_FACETS) => held >= max;
export { MAX_FACETS };
