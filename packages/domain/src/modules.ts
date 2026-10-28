import type { CoreValue } from './catalog/define.js';
import { appliesTo, facetsFor, isFacetOf, isParentType, ordered } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import { formatContent, formatFacet, providerCore, withFacetText, withKeyHighlighted } from './content.js';
import type { ParentContent } from './content.js';
import { emptyEntry, validateGenerated, validateGeneratedFacet } from './generated.js';
import { highlightKey } from './markdown.js';

// Content modules are parent modules (D08); the earlier types retired in 0.7.0.
export type ModuleInstance = Readonly<{ id: string; type: ParentType; facets?: readonly string[] }>;
// The provider's result is structured data (D09), checked here before it is
// kept. Since D17 one request writes the whole card: no reading of the key is
// shared by the run; the core writes its own flags first.
export type GenerateModule = (request: {
  module: ModuleInstance;
  selectedText: string;
  // The instance's facets, in the parent's order; each says when it applies.
  facets: readonly FacetType[];
  // For a facet's own Retry (0.7.3): the core already there, to follow.
  core?: CoreValue;
}) => Promise<unknown>;

// A facet the provider wrote although the core's flags rule it out (D17, K53):
// dropped, and reported so diagnostics can count it, never with its text.
export type FacetMismatch = Readonly<{ module: ParentType; facet: FacetType }>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// Generates one parent module instance's component from the main key, in one
// request (D17). A parent always applies: it writes its core, with its flags
// first, and the instance's facets, each saying when it applies. The result
// must have the parent's shape, complete (D09). Entries of facets it was not
// asked for are dropped, a facet left out or empty has no content, and a facet
// the core's flags rule out is dropped and reported. The result is kept as
// markdown per facet, formatted as the card looks (D09, amended). Throws when
// generation fails. Repeated instances generate independently.
export async function generateComponent(input: {
  mainKey: string;
  module: ModuleInstance;
  generate: GenerateModule;
  onMismatch?: (mismatch: FacetMismatch) => void;
}): Promise<ParentContent> {
  const { module } = input;
  if (!isParentType(module.type)) throw new Error('The deck contains an unsupported module.');
  const facets = ordered(module.type, module.facets ?? []);
  const value = await input.generate({ module, selectedText: input.mainKey, facets });
  if (!isRecord(value)) throw new Error('A module returned no usable content.');
  const stray = Object.keys(value).find(key => key !== 'core' && key !== 'facets');
  if (stray) throw new Error(`A module returned content in an unexpected format: an unexpected field "${stray}".`);
  // The provider's known slip (Q50): facet entries written inside the core,
  // as if its closing brace came late. Entries named by the instance's facets
  // move to "facets"; anything else stays where it is and is refused.
  if (isRecord(value.core) && facets.some(facet => facet in (value.core as Record<string, unknown>))) {
    const core = { ...value.core as Record<string, unknown> };
    const moved = Object.fromEntries(facets.filter(facet => facet in core).map(facet => { const entry = core[facet]; delete core[facet]; return [facet, entry]; }));
    value.core = core;
    value.facets = { ...moved, ...(isRecord(value.facets) ? value.facets : {}) };
  }
  const given = isRecord(value.facets) ? value.facets : {};
  const kept = Object.fromEntries(facets.filter(facet => !emptyEntry(given[facet])).map(facet => [facet, given[facet]]));
  let generated;
  try { generated = validateGenerated(module.type, { core: value.core, facets: kept }, { facets }); }
  catch (error) { throw new Error(`A module returned content in an unexpected format: ${(error as Error).message}`); }
  const applying = new Set(facetsFor(module.type, facets, generated.core));
  const checked = Object.fromEntries(Object.entries(generated.facets).filter(([facet]) => {
    if (applying.has(facet as FacetType)) return true;
    input.onMismatch?.({ module: module.type, facet: facet as FacetType });
    return false;
  }));
  // The main key is a stored highlight in what was generated (D10, amended a fourth time).
  return withKeyHighlighted(formatContent(module.type, { core: generated.core, facets: checked }), input.mainKey);
}

// A facet's own Retry (0.7.3): the facet alone, written for the core already
// in `existing`, is formatted into that facet's markdown; the core and the
// other facets stay as they are (D09). A facet the core's flags rule out, or
// one that comes back empty, has no content. Throws when generation fails.
export async function generateFacet(input: {
  mainKey: string;
  module: ModuleInstance;
  facet: string;
  existing: ParentContent;
  generate: GenerateModule;
}): Promise<ParentContent> {
  const { module, facet, existing } = input;
  if (!isParentType(module.type)) throw new Error('The deck contains an unsupported module.');
  if (!isFacetOf(module.type, facet)) throw new Error('This facet is no longer there.');
  const core = providerCore(module.type, existing);
  if (!appliesTo(module.type, facet, core)) return withFacetText(existing, facet, undefined);
  const value = await input.generate({ module, selectedText: input.mainKey, facets: [facet], core });
  if (!isRecord(value)) throw new Error('A module returned no usable content.');
  const entry = isRecord(value.facets) ? value.facets[facet] : undefined;
  if (emptyEntry(entry)) return withFacetText(existing, facet, undefined);
  let checked: unknown;
  try { checked = validateGeneratedFacet(module.type, facet, entry); }
  catch (error) { throw new Error(`A module returned content in an unexpected format: ${(error as Error).message}`); }
  return withFacetText(existing, facet, highlightKey(formatFacet(module.type, facet, checked), input.mainKey));
}

export type ComponentOutcome = Readonly<
  { moduleInstanceId: string; status: 'completed'; content: ParentContent } |
  { moduleInstanceId: string; status: 'failed'; error: string }
>;

// One generation run: instances run in configured order, each in its own
// request, and each completes or fails on its own.
export async function generateComponents(input: {
  mainKey: string;
  modules: readonly ModuleInstance[];
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
