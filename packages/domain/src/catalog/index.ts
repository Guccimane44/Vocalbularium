import type { ContentModuleDefinition, FamilyDefinition, ModuleDefinition } from './define.js';
import mainKey from './main-key/module.js';
import languages from './languages/family.js';
import german from './languages/german/module.js';
import chinese from './languages/chinese/module.js';
import expertise from './expertise/family.js';
import computerScience from './expertise/computer-science/module.js';
import mathematics from './expertise/mathematics/module.js';
import notes from './notes/family.js';
import context from './notes/context/module.js';
import text from './notes/text/module.js';

// Every module, in the module window's order (input modules, then content
// modules), each with the family whose folder holds it. The main key has none.
const ENTRIES = [
  { module: mainKey, family: null },
  { module: context, family: notes },
  { module: text, family: notes },
  { module: german, family: languages },
  { module: chinese, family: languages },
  { module: computerScience, family: expertise },
  { module: mathematics, family: expertise }
] as const satisfies readonly { module: ModuleDefinition; family: FamilyDefinition | null }[];

type Entry = typeof ENTRIES[number];
export type ModuleId = Entry['module']['id'];
export type ContentModuleId = Extract<Entry['module'], { kind: 'content' }>['id'];
export type InputModuleId = Extract<Entry['module'], { kind: 'input' }>['id'];
export type FamilyId = NonNullable<Entry['family']>['id'];
type ContentModule = Extract<Entry['module'], { kind: 'content' }>;
export type FacetId = ContentModule['facets'][number]['id'];

export const CATALOG_FAMILIES: readonly FamilyDefinition<FamilyId>[] = [...new Set(ENTRIES.map(entry => entry.family).filter(family => family !== null))];
export const MODULES: Readonly<Record<ModuleId, ModuleDefinition>> = Object.fromEntries(ENTRIES.map(entry => [entry.module.id, entry.module])) as Record<ModuleId, ModuleDefinition>;
export const MODULE_IDS = ENTRIES.map(entry => entry.module.id) as readonly ModuleId[];
export const familyOf = (id: ModuleId): FamilyId | null => ENTRIES.find(entry => entry.module.id === id)!.family?.id ?? null;
// The module's folder in the catalog, where the composer finds its prompts.
export const folderOf = (id: ModuleId): string => {
  const entry = ENTRIES.find(each => each.module.id === id)!;
  return entry.family ? `${entry.family.folder}/${id}` : id;
};

export const isCatalogModule = (id: string): id is ModuleId => Object.hasOwn(MODULES, id);
export const isContentModule = (id: string): id is ContentModuleId => isCatalogModule(id) && MODULES[id].kind === 'content';
export function contentModule(id: ContentModuleId): ContentModuleDefinition {
  return MODULES[id] as ContentModuleDefinition;
}
export { interpretationSchema } from './main-key/module.js';
