import type { InputType } from '@vocabularium/contracts';
import { folderOf, isCatalogModule, MODULES } from './catalog/index.js';
import { EXPLANATIONS } from './catalog/explanations.generated.js';
import { formatContent } from './content.js';
import type { GeneratedParent } from './generated.js';
import { parseMarkdown } from './markdown.js';
import type { MdBlock } from './markdown.js';
import { applicableFacets, isParentType, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import { renderContent, renderParent } from './render.js';
import type { Rendered } from './render.js';

// Explanations (D13, 0.8.1): what a module or a facet contributes and when to
// use it, a markdown file beside its definition in the catalog, shown with a
// sample of its output for a word and for a sentence so a user can learn it
// without trying it. The core has none of its own: its module's explains it.

export const INPUT_TYPES: readonly InputType[] = ['word_phrase', 'sentence'];

const keyOf = (module: string, facet?: string) => isCatalogModule(module) ? `${folderOf(module)}${facet ? `/facets/${facet}` : ''}` : null;

// The explanation's markdown in an interface language (D14), in English when
// that language has none, or none at all.
export function explanationOf(module: string, facet?: string, language = 'en'): string | undefined {
  const key = keyOf(module, facet);
  const texts = key ? EXPLANATIONS[key] : undefined;
  return texts?.[language] ?? texts?.en;
}
// The languages an explanation is written in.
export function explanationLanguages(module: string, facet?: string): string[] {
  const key = keyOf(module, facet);
  return key ? Object.keys(EXPLANATIONS[key] ?? {}) : [];
}
export const explanationBlocks = (module: string, facet?: string, language = 'en'): MdBlock[] => parseMarkdown(explanationOf(module, facet, language) ?? '');

// A module's sample for an input type, as its card would show it (D11): input
// modules their text, a parent what it would return with the given facets, the
// provider's JSON formatted into markdown as a stored result is (D09). Null
// for a module without one, such as Text. Without `facets`, a parent shows
// every facet its sample holds.
export function sampleOf(module: string, inputType: InputType, facets?: readonly string[]): Rendered | null {
  const given = isCatalogModule(module) ? MODULES[module].sample?.[inputType] : undefined;
  if (given === undefined) return null;
  if (!isParentType(module)) return renderContent(module, given as string);
  const content = given as GeneratedParent;
  // A facet the sample holds nothing for, such as Conjugation beside a noun, is left out.
  const kept = applicableFacets(module, facets ?? Object.keys(content.facets), inputType).filter(facet => facet in content.facets);
  return renderParent(module, formatContent(module, { core: content.core, facets: Object.fromEntries(kept.map(facet => [facet, content.facets[facet]])) }));
}

// A facet's part of its module's sample: its own text only. Null for an input
// type the facet does not apply to, or when the sample holds none.
export function facetSampleOf(parent: ParentType, facet: FacetType, inputType: InputType): readonly MdBlock[] | null {
  if (!PARENTS[parent].facets[facet]?.applies.includes(inputType)) return null;
  const rendered = sampleOf(parent, inputType, [facet]);
  return rendered?.kind === 'parent' ? rendered.facets.find(each => each.facet === facet)?.body ?? null : null;
}

// What a sample was written for: the main key's sample, unless the module
// explains a key of its own (the Expertise modules), whose sentence is not
// recorded. Undefined when unknown.
export function sampleKeyOf(module: string, inputType: InputType): string | undefined {
  const mainKey = MODULES['main-key'].sample?.[inputType] as string | undefined;
  const given = isCatalogModule(module) ? MODULES[module].sample?.word_phrase : undefined;
  const own = given && typeof given === 'object' ? (given as GeneratedParent).core.key : undefined;
  if (typeof own !== 'string' || own === MODULES['main-key'].sample?.word_phrase) return mainKey;
  return inputType === 'word_phrase' ? own : undefined;
}
