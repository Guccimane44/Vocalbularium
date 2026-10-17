import type { InputInterpretation, ParentCore } from '@vocabularium/contracts';
import { applicableFacets, isFacetOf, isParentType } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import { formatContent, isBlankHeader, providerCore, withFacetText, withKeyHighlighted } from './content.js';
import type { ParentContent } from './content.js';
import { emptyEntry, validateGenerated, validateGeneratedFacet } from './generated.js';
import { formatFacet, highlightKey } from './markdown.js';

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
// The provider's result is structured data (D09), checked here before it is kept.
export type GenerateModule = (request: {
  module: ModuleInstance;
  selectedText: string;
  interpretation: InputInterpretation;
  // The facets that apply to this input, in the parent's order.
  facets: readonly FacetType[];
  // For a facet's own Retry (0.7.3): the core already there, to follow.
  core?: ParentCore;
}) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// Generates one parent module instance's component from the main key. A
// parent always applies: it generates its core and the facets that apply.
// The result must have the parent's shape, complete, with the core for the
// input type (D09). Entries of facets it was not asked for are dropped, and a
// facet left out or empty has no content. The result is kept as markdown per
// facet, formatted as the card looks (D09, amended). Throws when generation
// fails. Repeated instances generate independently.
export async function generateComponent(input: {
  mainKey: string;
  module: ModuleInstance;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<ParentContent> {
  const { module } = input;
  if (!isParentType(module.type)) throw new Error('The deck contains an unsupported module.');
  if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
  const facets = applicableFacets(module.type, module.facets ?? [], input.interpretation.inputType);
  const value = await input.generate({ module, selectedText: input.mainKey, interpretation: input.interpretation, facets });
  if (!isRecord(value)) throw new Error('A module returned no usable content.');
  const stray = Object.keys(value).find(key => key !== 'core' && key !== 'facets');
  if (stray) throw new Error(`A module returned content in an unexpected format: an unexpected field "${stray}".`);
  const given = isRecord(value.facets) ? value.facets : {};
  const kept = Object.fromEntries(facets.filter(facet => !emptyEntry(given[facet])).map(facet => [facet, given[facet]]));
  let generated;
  try { generated = validateGenerated(module.type, { core: value.core, facets: kept }, { facets }); }
  catch (error) { throw new Error(`A module returned content in an unexpected format: ${(error as Error).message}`); }
  if (generated.core.kind !== (input.interpretation.inputType === 'sentence' ? 'sentence' : 'word')) {
    throw new Error('A module returned content in an unexpected format: the core does not match the input.');
  }
  // The main key is a stored highlight in what was generated (D10, amended a fourth time).
  return withKeyHighlighted(formatContent(generated), input.mainKey);
}

// A facet's own Retry (0.7.3): the facet alone, written for the core already
// in `existing`, is formatted into that facet's markdown; the core and the
// other facets stay as they are (D09). A facet that does not apply to this
// input, or that comes back empty, has no content. Throws when generation fails.
export async function generateFacet(input: {
  mainKey: string;
  module: ModuleInstance;
  facet: string;
  existing: ParentContent;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<ParentContent> {
  const { module, facet, existing } = input;
  if (!isParentType(module.type)) throw new Error('The deck contains an unsupported module.');
  if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
  if (!isFacetOf(module.type, facet)) throw new Error('This facet is no longer there.');
  const facets = applicableFacets(module.type, [facet], input.interpretation.inputType);
  if (!facets.length) return withFacetText(existing, facet, undefined);
  const value = await input.generate({ module, selectedText: input.mainKey, interpretation: input.interpretation, facets, core: providerCore(existing) });
  if (!isRecord(value)) throw new Error('A module returned no usable content.');
  const entry = isRecord(value.facets) ? value.facets[facet] : undefined;
  if (emptyEntry(entry)) return withFacetText(existing, facet, undefined);
  let checked: unknown;
  try { checked = validateGeneratedFacet(module.type, facet, entry); }
  catch (error) { throw new Error(`A module returned content in an unexpected format: ${(error as Error).message}`); }
  return withFacetText(existing, facet, highlightKey(formatFacet(facet, checked), input.mainKey));
}

// The core's own Retry (D10, amended; 0.7.5): the core alone, generated with
// no facet, replaces the meanings or translation in `existing`; the top line
// and every facet stay as they are. Throws when generation fails.
export async function generateCore(input: {
  mainKey: string;
  module: ModuleInstance;
  existing: ParentContent;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
}): Promise<ParentContent> {
  const fresh = await generateComponent({ ...input, module: { ...input.module, facets: [] } });
  // A top line left blank by a hand-written card takes the generated one (D10, amended a fourth time).
  return { header: isBlankHeader(input.existing.header) ? fresh.header : input.existing.header, core: fresh.core, facets: input.existing.facets };
}

export type ComponentOutcome = Readonly<
  { moduleInstanceId: string; status: 'completed'; content: ParentContent } |
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
      outcomes.push({ moduleInstanceId: module.id, status: 'completed', content: await generateComponent({ ...input, module }) });
    } catch (error) {
      outcomes.push({ moduleInstanceId: module.id, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
