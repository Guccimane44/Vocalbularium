import type { ContentModuleDefinition } from '../catalog/define.js';

// A module's golden plan (v0.17.0 step 1): for the core and each facet, how it
// is scored and the ways it can fail. Its `facets` record is mapped over the
// module's own facet IDs, so a facet added to module.ts without its failure
// points fails the typecheck in `npm run check`.

export type Band = 'common' | 'middle' | 'rare';

type Point = Readonly<{
  // Short and stable; items name it in `fills`.
  id: string;
  what: string;
  // The right answer is to leave the facet, or a part of it, out.
  abstain?: true;
  // A band with no honest words for this point, and why; coverage does not ask for it.
  noWordsIn?: Readonly<Partial<Record<Band, string>>>;
}>;
type NonEmpty<T> = readonly [T, ...T[]];

// The cells a closed facet's value and its references are compared in: a
// table's `column|row`, an object's fields, or the sorted values of one field
// across a list (Case's governed cases).
export type CellShape = Readonly<{ kind: 'table' } | { kind: 'fields' } | { kind: 'set'; of: string }>;

export type GoldenFacet = Readonly<{
  // Every point needs an item in each band it has words in.
  perBand?: true;
}> & (
  | Readonly<{ scoring: 'judge'; points: NonEmpty<Point> }>
  // Globs over cell names ("Präteritum|ihr", "Perfekt|*"): a wrong cell fails
  // only the points whose globs match it.
  | Readonly<{ scoring: 'reference'; shape: CellShape; points: NonEmpty<Point & Readonly<{ cells: NonEmpty<string> }>> }>
);

// `Retired` names the module's retired facets (`retired: true` in their
// facet.ts), which no card writes any more, so they have no failure points.
export type GoldenPlan<M extends ContentModuleDefinition = ContentModuleDefinition, Retired extends string = string> = Readonly<{
  module: M['id'];
  // The core's name for the module's own language, such as Deutsch: the
  // language of every reference word.
  language: string;
  retired?: readonly Retired[];
  // The lowest DWDS frequency class (0 to 6) of a common and of a middle word;
  // anything below is rare.
  bands: Readonly<{ common: number; middle: number }>;
  facets: Readonly<{ core: GoldenFacet } & { [F in M['facets'][number] as F['id'] extends Retired ? never : F['id']]: GoldenFacet }>;
}>;

export const defineGoldenPlan = <M extends ContentModuleDefinition, const Retired extends M['facets'][number]['id'] = never>(plan: GoldenPlan<M, Retired>) => plan;
