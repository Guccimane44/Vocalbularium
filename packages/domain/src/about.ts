import type { InputType } from '@vocabularium/contracts';
import { CATALOG_FAMILIES, folderOf, isCatalogModule, MODULES } from './catalog/index.js';
import type { FamilyId } from './catalog/index.js';
import { ABOUT, SAMPLES } from './catalog/about.generated.js';
import { formatContent } from './content.js';
import type { GeneratedParent } from './generated.js';
import { parseMarkdown } from './markdown.js';
import type { MdBlock } from './markdown.js';
import { applicableFacets, isParentType, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import { renderContent, renderParent } from './render.js';
import type { Rendered } from './render.js';

// Family, module and facet pages (D20, 0.13.0): what each contributes, as
// fields an `about.json` beside its definition holds, with its translations
// beside it (K62), and samples per interface language in `samples/` (K63),
// so a user learns it without trying it. The core has none of its own: its
// module's page explains it. From 0.8.1 until 0.13.0 these were explanations
// in markdown (D13).

export const INPUT_TYPES: readonly InputType[] = ['word_phrase', 'sentence'];

export type FamilyAbout = Readonly<{ summary: string; steps: readonly Readonly<{ title: string; text: string }>[] }>;
export type ModuleAbout = Readonly<{ summary: string; facts: readonly Readonly<{ label: string; value: string; note: string }>[]; example?: string }>;
export type FacetAbout = Readonly<{ summary: string; appliesTo: string; describes: string }>;

const familyFolder = (family: FamilyId) => CATALOG_FAMILIES.find(each => each.id === family)?.folder;
const keyOf = (module: string, facet?: string) => isCatalogModule(module) ? `${folderOf(module)}${facet ? `/facets/${facet}` : ''}` : null;
// A page's text in an interface language (D14), in English when that language has none.
const textOf = <T>(key: string | null | undefined, language: string): T | undefined => {
  const texts = key ? ABOUT[key] : undefined;
  return (texts?.[language] ?? texts?.en) as T | undefined;
};

export const familyAbout = (family: FamilyId, language = 'en') => textOf<FamilyAbout>(familyFolder(family), language);
export const moduleAbout = (module: string, language = 'en') => textOf<ModuleAbout>(keyOf(module), language);
export const facetAbout = (module: string, facet: string, language = 'en') => textOf<FacetAbout>(keyOf(module, facet), language);

// The languages a page's text is written in.
export function aboutLanguages(target: { family: FamilyId } | { module: string; facet?: string }): string[] {
  const key = 'family' in target ? familyFolder(target.family) : keyOf(target.module, target.facet);
  return key ? Object.keys(ABOUT[key] ?? {}) : [];
}
// The languages a module's samples, or a facet's own samples, are written in.
export function sampleLanguages(module: string, facet?: string): string[] {
  const key = keyOf(module, facet);
  return key ? Object.keys(SAMPLES[key] ?? {}) : [];
}

// A page's text as markdown, for the explanation dialogs until the pages'
// sheet replaces them (D20, increment B): its summary, then a facet's
// Applies to and Describes, or a module's facts.
export function aboutBlocks(module: string, facet?: string, language = 'en'): MdBlock[] {
  if (facet) {
    const about = facetAbout(module, facet, language);
    return about ? parseMarkdown(`${about.summary}\n\n**${about.appliesTo}** · ${about.describes}`) : [];
  }
  const about = moduleAbout(module, language);
  return about ? parseMarkdown([about.summary, about.facts.map(fact => `- **${fact.label}:** ${fact.value}. ${fact.note}`).join('\n')].join('\n\n')) : [];
}

// A module's or a facet's own sample in an interface language, the provider's
// JSON for a parent or the text for an input module, in English when that
// language has none.
function givenSample(module: string, inputType: InputType, language: string, facet?: string): unknown {
  const key = keyOf(module, facet);
  const samples = key ? SAMPLES[key] as Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined : undefined;
  return (samples?.[language] ?? samples?.en)?.[inputType];
}

// A module's sample for an input type in an interface language, as its card
// would show it (D11): input modules their text, a parent what it would return
// with the given facets, the provider's JSON formatted into markdown as a
// stored result is (D09). Null for a module without one, such as Text. Without
// `facets`, a parent shows every facet its sample holds.
export function sampleOf(module: string, inputType: InputType, facets?: readonly string[], language = 'en'): Rendered | null {
  const given = givenSample(module, inputType, language);
  if (given === undefined) return null;
  if (!isParentType(module)) return renderContent(module, given as string);
  return renderParent(module, formatContent(module, keep(module, given as GeneratedParent, inputType, facets)));
}
function keep(module: ParentType, content: GeneratedParent, inputType: InputType, facets?: readonly string[]): GeneratedParent {
  // A facet the sample holds nothing for, such as Conjugation beside a noun, is left out.
  const kept = applicableFacets(module, facets ?? Object.keys(content.facets), inputType).filter(facet => facet in content.facets);
  return { core: content.core, facets: Object.fromEntries(kept.map(facet => [facet, content.facets[facet]])) };
}

// The card a facet's sample sits on in an interface language, with every facet
// that card holds: its own sample's when it has one (Conjugation, Comparison,
// Case: K65), otherwise its module's. Null for an input type the facet does
// not apply to, or when no sample holds it.
export function facetCardOf(parent: ParentType, facet: FacetType, inputType: InputType, language = 'en'): Rendered | null {
  if (!PARENTS[parent].facets[facet]?.applies.includes(inputType)) return null;
  const own = givenSample(parent, inputType, language, facet) as GeneratedParent | undefined;
  const rendered = own ? renderParent(parent, formatContent(parent, keep(parent, own, inputType))) : sampleOf(parent, inputType, undefined, language);
  return rendered?.kind === 'parent' && rendered.facets.some(each => each.facet === facet) ? rendered : null;
}
// A facet's sample in an interface language: its own text only, from that card.
export function facetSampleOf(parent: ParentType, facet: FacetType, inputType: InputType, language = 'en'): readonly MdBlock[] | null {
  const card = facetCardOf(parent, facet, inputType, language);
  return card?.kind === 'parent' ? card.facets.find(each => each.facet === facet)?.body ?? null : null;
}

// What a sample was written for in an interface language: the main key's
// sample, unless the module explains a key of its own (the Expertise modules)
// or the facet has its own samples. Undefined when unknown.
export function sampleKeyOf(module: string, inputType: InputType, language = 'en', facet?: string): string | undefined {
  const mainKey = givenSample('main-key', inputType, language) as string | undefined;
  const given = (facet && givenSample(module, inputType, language, facet)) || givenSample(module, inputType, language);
  const own = given && typeof given === 'object' ? (given as GeneratedParent).core.key : undefined;
  return typeof own === 'string' ? own : isCatalogModule(module) && MODULES[module].kind === 'input' ? mainKey : undefined;
}
