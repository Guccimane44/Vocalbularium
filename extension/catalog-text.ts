// The catalog's names and descriptions as the interface shows them (D14): in
// the interface language when its catalogue names them, else in the catalog's English.
import { CATALOG, FAMILY_LABELS } from '@vocabularium/domain/page-modules';
import type { ModuleFamily, ModuleType } from '@vocabularium/domain/page-modules';
import { facetAbbreviation, facetLabel } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { contentModule } from '@vocabularium/domain/catalog';
import { catalogText } from './i18n.ts';

export const moduleLabel = (type: string) => catalogText(`${type}.label`, CATALOG[type as ModuleType]?.label ?? type);
export const moduleDescription = (type: ModuleType) => catalogText(`${type}.description`, CATALOG[type].description);
export const familyLabel = (family: ModuleFamily) => catalogText(`family.${family}`, FAMILY_LABELS[family]);
export const facetName = (parent: ParentType, facet: FacetType) => catalogText(`${parent}.${facet}.label`, facetLabel(parent, facet));
export const facetMark = (parent: ParentType, facet: FacetType) => catalogText(`${parent}.${facet}.abbreviation`, facetAbbreviation(parent, facet));
export const coreLabel = (parent: ParentType, kind: 'word_phrase' | 'sentence') => catalogText(`${parent}.core.${kind}`, contentModule(parent).core.labels[kind]);
