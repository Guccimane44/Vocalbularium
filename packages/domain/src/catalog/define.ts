import type { InputType, ParentHeader } from '@vocabularium/contracts';
import type { Shape } from './shape.js';

// The module catalog (D11): every module defined once, in its family's folder,
// owning its facets. A facet's prompts are markdown files beside its
// definition (`prompt.md`; the core's `core.prompt.md` and `retry.prompt.md`); the
// composer reads them. Since D17 a module writes its card in one request: the
// core's flags come first and each facet says when it applies. See
// docs/architecture/generation.md.

export type FamilyDefinition<Id extends string = string> = Readonly<{
  id: Id;
  label: string;
  // The family's folder in the catalog.
  folder: string;
}>;

// What a facet's content is: text (markdown). From 0.14.0 a part may also be
// spoken (D24): its text stays markdown and its audio is attached beside it.
export type OutputType = 'text';
// How a spoken part's audio is made (D24): the language its lines are spoken
// in, an ISO 639-1 code.
export type Spoken = Readonly<{ language: string }>;

// A deterministic check of one generated part (0.16.0): it reads the part as
// the provider wrote it, after its shape passed, with the card's core beside
// it, and returns what is wrong, or null. The golden sets and the language gate
// run every check of a card; nothing runs them when a user generates a page.
// A check that needs a tool the domain cannot run, such as a Python parser,
// asks for it through `tools`, and is skipped when the tool is missing.
export type CheckTools = Readonly<{ pythonParses?: (code: string) => Promise<boolean> }>;
export type Check<T = any> = Readonly<{
  id: string;
  description: string;
  test: (value: T, card: Readonly<{ core: CoreValue }>, tools: CheckTools) => string | null | undefined | Promise<string | null | undefined>;
}>;

export type FacetDefinition<Id extends string = string, T = any> = Readonly<{
  id: Id;
  label: string;
  // Marks the facet's tag on a card; unique within its module.
  abbreviation: string;
  description: string;
  // The kinds of key it applies to: a word or phrase, a sentence or both.
  applies: readonly InputType[];
  // Since D17, a further condition on the core's flags, such as Article only
  // for a noun; without it, the kinds above decide.
  when?: (core: CoreValue) => boolean;
  output: OutputType;
  shape: Shape<T>;
  // The checked value as the markdown the card shows.
  format: (value: T) => string;
  // A spoken facet (D24): each of its lines is spoken, in this language.
  spoken?: Spoken;
  // What a well-written part always satisfies (0.16.0).
  checks?: readonly Check<T>[];
}>;

// The core: a module's first facet, always present, with one shape (D17). Its
// flags come first: a Languages core's `kind` names whether the key was read as
// a word or a sentence; an Expertise core has none and counts as a word's.
export type CoreValue = Readonly<{ kind?: 'word' | 'sentence' } & Record<string, unknown>>;
// The labels a core's header shows for its flags, in the module's language
// (D17, K51): word or sentence, and a German word's grammatical role.
export type HeaderLabels = Readonly<{ word: string; sentence: string; gramRole?: Readonly<Record<string, string>> }>;
export type CoreDefinition<T extends CoreValue = any> = Readonly<{
  id: 'core';
  label: string;
  // How the editor names the core's text for each input type.
  labels: Readonly<Record<InputType, string>>;
  output: OutputType;
  shape: Shape<T>;
  // The labels of the flags the header shows; none for a module that shows none.
  headerLabels?: HeaderLabels;
  format: (value: T) => string;
  // The structured top line kept beside the core's markdown.
  header: (value: T) => ParentHeader;
  // The core as the provider reads it for a facet's own Retry, from what is stored.
  read: (stored: Readonly<{ header: ParentHeader; text: string }>) => T;
  // A spoken core (D24): the page's main key, spoken in the language this
  // returns for the written core, or not at all for null.
  spoken?: (value: T) => Spoken | null;
  // What a well-written core always satisfies (0.16.0).
  checks?: readonly Check<T>[];
}>;

export type ModuleKind = 'input' | 'content';
// How many instances a deck or page holds: the main key first and exactly once.
export type Instances = 'first-once' | 'at-most-one' | 'many';
// Where the module's content comes from.
export type Source = 'captured' | 'user' | 'generated';
// What generates it: text since 0.8.0 (K29). A spoken part's audio comes from
// the speech provider afterwards (D24); the module's own request is still text.
export type ProviderKind = 'text' | 'speech';

type ModuleBase<Id extends string> = Readonly<{
  id: Id;
  label: string;
  description: string;
  instances: Instances;
  source: Source;
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
