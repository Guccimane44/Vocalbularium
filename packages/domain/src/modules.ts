import type { InputInterpretation } from '@vocabularium/contracts';
import { applicableFacets, facetsOf, isParentType } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import { facetSection, renderContent, withFacetSection, withoutEmptyFacets, withoutFacet } from './render.js';

// The run's reading of the main key (D08): word or phrase, or sentence. It no
// longer chooses a source language; earlier runs stored one, which is ignored.
export function validateInterpretation(value: unknown): InputInterpretation {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('inputType' in value) ||
    (value.inputType !== 'word_phrase' && value.inputType !== 'sentence')) {
    throw new Error('The input could not be interpreted.');
  }
  return { inputType: value.inputType };
}

// Content modules are parent modules (D08); the earlier types retired in 0.7.0.
export type ModuleInstance = Readonly<{ id: string; type: ParentType; facets?: readonly string[] }>;
export type GenerateModule = (request: {
  module: ModuleInstance;
  selectedText: string;
  interpretation: InputInterpretation;
  // The facets that apply to this input, in the parent's order.
  facets: readonly FacetType[];
  // For a facet's own Retry (0.7.3): the core already written, to follow.
  core?: string;
}) => Promise<string>;

// Generates one parent module instance's component from the main key. A
// parent always applies: it generates its core and the facets that apply, and
// its text must follow the parent's render contract. Sections of facets it does
// not have are dropped, and a facet heading with nothing under it counts as an
// omitted facet. Throws when generation fails. Repeated instances generate
// independently.
export async function generateComponent(input: {
  mainKey: string;
  module: ModuleInstance;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<string> {
  const { module } = input;
  if (!isParentType(module.type)) throw new Error('The deck contains an unsupported module.');
  if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
  const facets = applicableFacets(module.type, module.facets ?? [], input.interpretation.inputType);
  const text = await input.generate({ module, selectedText: input.mainKey, interpretation: input.interpretation, facets });
  if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
  const extra = facetsOf(module.type).filter(facet => !facets.includes(facet));
  const kept = extra.reduce((current, facet) => withoutFacet(module.type, current, facet), withoutEmptyFacets(module.type, text.trim()));
  if (renderContent(module.type, kept).kind !== 'parent') throw new Error('A module returned content in an unexpected format.');
  return kept;
}

// A facet's own Retry (0.7.3): the facet alone, written for the core already
// in `existing`, takes its section's place; the core and the other facets stay
// as they are. A facet that does not apply to this input is left out, as in a
// whole attempt. Throws when generation fails.
export async function generateFacet(input: {
  mainKey: string;
  module: ModuleInstance;
  facet: string;
  existing: string;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<string> {
  const { module, facet, existing } = input;
  if (!isParentType(module.type)) throw new Error('The deck contains an unsupported module.');
  if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
  if (renderContent(module.type, existing).kind !== 'parent') throw new Error('The content no longer follows its layout.');
  const facets = applicableFacets(module.type, [facet], input.interpretation.inputType);
  if (!facets.length) return withoutFacet(module.type, existing, facet);
  const core = facetsOf(module.type).reduce((current, each) => withoutFacet(module.type, current, each), existing).trim();
  const text = await input.generate({ module, selectedText: input.mainKey, interpretation: input.interpretation, facets, core });
  if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
  const cleaned = withoutEmptyFacets(module.type, text.trim());
  if (renderContent(module.type, cleaned).kind !== 'parent') throw new Error('A module returned content in an unexpected format.');
  return withFacetSection(module.type, existing, facet, facetSection(module.type, cleaned, facet));
}

export type ComponentOutcome = Readonly<
  { moduleInstanceId: string; status: 'completed'; text: string } |
  { moduleInstanceId: string; status: 'failed'; error: string }
>;

// One generation run: instances share the interpretation and run in configured
// order, but each completes or fails on its own.
export async function generateComponents(input: {
  mainKey: string;
  modules: readonly ModuleInstance[];
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<ComponentOutcome[]> {
  const outcomes: ComponentOutcome[] = [];
  for (const module of input.modules) {
    try {
      outcomes.push({ moduleInstanceId: module.id, status: 'completed', text: await generateComponent({ ...input, module }) });
    } catch (error) {
      outcomes.push({ moduleInstanceId: module.id, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
