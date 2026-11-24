import type { ContentModuleId } from '../catalog/index.js';
import type { GoldenPlan } from './define.js';
import german from '../catalog/languages/german/golden/plan.js';

// The modules whose golden set is a folder, tests/golden/<module>/, built from
// their failure points. Optional per module until every module has moved.
export const GOLDEN_PLANS: Readonly<{ [M in ContentModuleId]?: GoldenPlan }> = { german };

export type { Band, CellShape, GoldenFacet, GoldenPlan } from './define.js';
