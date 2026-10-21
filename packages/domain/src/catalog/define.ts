import type { InputType, ParentHeader } from '@vocabularium/contracts';
import type { Shape } from './shape.js';

// The module catalog (D11): every module defined once, in its family's folder,
// owning its facets. A facet's prompts are markdown files beside its
// definition, named by input type (`word.prompt.md`, `sentence.prompt.md`); the
// composer reads them. See docs/architecture/generation.md.

export type FamilyDefinition<Id extends string = string> = Readonly<{
  id: Id;
  label: string;
  // The family's folder in the catalog.
  folder: string;
}>;

// What a facet's content is. Only text (markdown) exists in 0.8.0 (K29).
export type OutputType = 'text';

export type FacetDefinition<Id extends string = string, T = any> = Readonly<{
  id: Id;
  label: string;
  // Marks the facet's tag on a card; unique within its module.
  abbreviation: string;
  description: string;
  applies: readonly InputType[];
  output: OutputType;
  shape: Shape<T>;
  // The checked value as the markdown the card shows.
  format: (value: T) => string;
}>;

// The core: a module's first facet, always present, with a shape per input
// type. Its value carries a `kind` naming the input type it was written for.
export type CoreValue = Readonly<{ kind: 'word' | 'sentence' } & Record<string, unknown>>;
export type CoreDefinition<T extends CoreValue = any> = Readonly<{
  id: 'core';
  label: string;
  // How the editor names the core's text for each input type.
  labels: Readonly<Record<InputType, string>>;
  output: OutputType;
  shapes: Readonly<Record<InputType, Shape<T>>>;
  format: (value: T) => string;
  // The structured top line kept beside the core's markdown.
  header: (value: T) => ParentHeader;
  // The core as the provider reads it for a facet's own Retry, from what is stored.
  read: (stored: Readonly<{ header: ParentHeader; text: string }>) => T;
}>;

export type ModuleKind = 'input' | 'content';
// How many instances a deck or page holds: the main key first and exactly once.
export type Instances = 'first-once' | 'at-most-one' | 'many';
// Where the module's content comes from.
export type Source = 'captured' | 'user' | 'generated';
// What generates it; only text generation exists in 0.8.0 (K29).
export type ProviderKind = 'text';

type ModuleBase<Id extends string> = Readonly<{
  id: Id;
  label: string;
  description: string;
  instances: Instances;
  source: Source;
  // What the deck-settings preview shows for a word and for a sentence:
  // input modules their text, content modules the provider's JSON.
  sample?: Readonly<Record<InputType, unknown>>;
}>;
export type InputModuleDefinition<Id extends string = string> = ModuleBase<Id> & Readonly<{ kind: 'input'; facets: readonly [] }>;
export type ContentModuleDefinition<Id extends string = string, F extends readonly FacetDefinition[] = readonly FacetDefinition[]> = ModuleBase<Id> & Readonly<{
  kind: 'content';
  provider: ProviderKind;
  core: CoreDefinition;
  // The module's facets after its core, in the order they are shown.
  facets: F;
}>;
export type ModuleDefinition = InputModuleDefinition | ContentModuleDefinition;

export const defineFamily = <const Id extends string>(family: FamilyDefinition<Id>) => family;
export const defineFacet = <const Id extends string, T>(facet: FacetDefinition<Id, T>) => facet;
export const defineCore = <T extends CoreValue>(core: CoreDefinition<T>) => core;
export const defineInputModule = <const Id extends string>(module: InputModuleDefinition<Id>) => module;
export const defineContentModule = <const Id extends string, const F extends readonly FacetDefinition[]>(module: ContentModuleDefinition<Id, F>) => module;
