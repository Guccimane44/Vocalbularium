import type { InputInterpretation, InputType } from '@vocabularium/contracts';
import { applicableFacets, facetsOf, isParentType } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import { renderContent, withoutFacet } from './render.js';

export type ModuleType = 'german-explanation' | 'german-examples' | 'sentence-usage';
export type ModuleDefinition = Readonly<{
  label: string;
  applies: InputType;
}>;
export type ModuleInstance = Readonly<{ id: string; type: ModuleType }>;

export const MODULES = Object.freeze({
  'german-explanation': { label: 'German explanation', applies: 'word_phrase' },
  'german-examples': { label: 'German explanation + examples', applies: 'word_phrase' },
  'sentence-usage': { label: 'Sentence usage', applies: 'sentence' }
} satisfies Readonly<Record<ModuleType, ModuleDefinition>>);

// The run's reading of the main key (D08): word or phrase, or sentence. It no
// longer chooses a source language; earlier runs stored one, which is ignored.
export function validateInterpretation(value: unknown): InputInterpretation {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('inputType' in value) ||
    (value.inputType !== 'word_phrase' && value.inputType !== 'sentence')) {
    throw new Error('The input could not be interpreted.');
  }
  return { inputType: value.inputType };
}

export type GenerateModule = (request: {
  module: ModuleInstance | ParentInstance;
  selectedText: string;
  interpretation: InputInterpretation;
  // For a parent: the facets that apply to this input, in the parent's order.
  facets?: readonly FacetType[];
}) => Promise<string>;
export type ParentInstance = Readonly<{ id: string; type: ParentType; facets?: readonly string[] }>;

// Generates one content module instance's component from the main key. A
// parent (D08) always applies: it generates its core and the facets that apply,
// and its text must follow the parent's render contract; sections of facets it
// does not have are dropped. An earlier module returns '' when it does not
// apply. Throws when generation fails. Repeated instances generate independently.
export async function generateComponent(input: {
  mainKey: string;
  module: ModuleInstance | ParentInstance;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<string> {
  const { module } = input;
  if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
  const request = { module, selectedText: input.mainKey, interpretation: input.interpretation };
  if (isParentType(module.type)) {
    const facets = applicableFacets(module.type, (module as ParentInstance).facets ?? [], input.interpretation.inputType);
    const text = await input.generate({ ...request, facets });
    if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
    const extra = facetsOf(module.type).filter(facet => !facets.includes(facet));
    const kept = extra.reduce((current, facet) => withoutFacet(module.type, current, facet), text.trim());
    if (renderContent(module.type, kept).kind !== 'parent') throw new Error('A module returned content in an unexpected format.');
    return kept;
  }
  const definition = MODULES[module.type as ModuleType];
  if (!definition) throw new Error('The deck contains an unsupported module.');
  if (definition.applies !== input.interpretation.inputType) return '';
  const text = await input.generate(request);
  if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
  return text;
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
