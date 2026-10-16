import type { BlockDocument, Component, GenerationTarget, ModuleInstance } from '@vocabularium/contracts';
import { MAX_MODULES } from '@vocabularium/contracts';
import { isParentType, PARENTS, validateFacets } from './parents.js';
import { parentContentOf } from './content.js';
import type { ParentType } from './parents.js';

// Page-owned modules (D02). Shared by the backend and the extension so both
// enforce the same rules for configurations and page shaping.

export type InputModuleType = 'main-key' | 'context' | 'text';
// Content modules are parent modules (D08); the earlier types retired in 0.7.0.
export type ModuleType = InputModuleType | ParentType;
export type ModuleKind = 'input' | 'content';
// Module families (D05) give each module its colour and icon; the main key has
// none. Translation (D08) holds the parent modules. A deck's colour is one of the
// six earlier family colours (D06).
export const DECK_COLOURS = Object.freeze(['meaning', 'usage', 'roots', 'connections', 'sound', 'notes'] as const);
export const FAMILIES = Object.freeze(['translation', ...DECK_COLOURS] as const);
export type ModuleFamily = typeof FAMILIES[number];
export const FAMILY_LABELS: Readonly<Record<ModuleFamily, string>> = Object.freeze({
  translation: 'Translation', meaning: 'Meaning', usage: 'Usage', roots: 'Roots', connections: 'Connections', sound: 'Sound', notes: 'Notes'
});
export type CatalogEntry = Readonly<{ kind: ModuleKind; label: string; description: string; family: ModuleFamily | null }>;

// In module-window order: input modules, then the content catalog.
export const CATALOG: Readonly<Record<ModuleType, CatalogEntry>> = Object.freeze({
  'main-key': { kind: 'input', label: 'Main key', description: 'The text you captured or typed. Every page has one.', family: null },
  context: { kind: 'input', label: 'Context', description: 'The text around your selection, used to find the right meaning.', family: 'notes' },
  text: { kind: 'input', label: 'Text', description: 'Your own notes. Generation never changes them.', family: 'notes' },
  ...Object.fromEntries((Object.keys(PARENTS) as ParentType[]).map(type =>
    [type, { kind: 'content', label: PARENTS[type].label, description: PARENTS[type].description, family: PARENTS[type].family }]))
} as Record<ModuleType, CatalogEntry>);

export const isModuleType = (type: string): type is ModuleType => Object.hasOwn(CATALOG, type);
export const isContentType = (type: string): type is ParentType => isModuleType(type) && CATALOG[type].kind === 'content';
// The module window offers everything but the main key, which is always present.
export const WINDOW_MODULES = (Object.keys(CATALOG) as ModuleType[]).filter(type => type !== 'main-key');

// Why a module of this type cannot be added to these modules, or null.
export function addBlocked(modules: readonly { type: string }[], type: string): string | null {
  if (!isModuleType(type) || type === 'main-key') return 'This module cannot be added.';
  if (modules.length >= MAX_MODULES) return `At most ${MAX_MODULES} modules, including the main key.`;
  if (type === 'context' && modules.some(module => module.type === 'context')) return 'There is already a Context.';
  return null;
}

// A deck configuration: the main key module first and exactly once, at most
// one Context, at most twelve modules, unique IDs.
export function validateConfiguration(modules: readonly ModuleInstance[]): void {
  if (modules[0]?.type !== 'main-key') throw new Error('The main key module must come first.');
  if (modules.length > MAX_MODULES) throw new Error(`A deck can have at most ${MAX_MODULES} modules.`);
  const ids = new Set<string>();
  for (const module of modules) {
    if (!isModuleType(module.type)) throw new Error('The deck contains an unsupported module.');
    if (ids.has(module.id)) throw new Error('Module instance IDs must be unique.');
    validateFacets(module.type, module.facets);
    ids.add(module.id);
  }
  if (modules.filter(module => module.type === 'main-key').length !== 1) throw new Error('A deck has exactly one main key module.');
  if (modules.filter(module => module.type === 'context').length > 1) throw new Error('A deck has at most one Context module.');
}

// A new page copies the deck's modules under its own instance IDs.
export function copyModules(modules: readonly ModuleInstance[], newId: () => string): ModuleInstance[] {
  return modules.map(module => ({ id: newId(), type: module.type, ...(module.facets ? { facets: [...module.facets] } : {}) }));
}

// Shaping rules over a page's components in page order. Each returns why the
// step is not allowed, or null.
export function deleteBlocked(components: readonly Component[], componentId: string): string | null {
  const component = components.find(item => item.id === componentId);
  if (!component) return 'This component no longer exists.';
  if (component.moduleType === 'main-key') return 'The main key cannot be deleted.';
  if (component.status === 'loading') return 'This component is still generating.';
  return null;
}
export function moveBlocked(components: readonly Component[], componentId: string, position: number): string | null {
  const component = components.find(item => item.id === componentId);
  if (!component) return 'This component no longer exists.';
  if (component.moduleType === 'main-key') return 'The main key stays first.';
  if (!Number.isInteger(position) || position < 1 || position >= components.length) return 'Choose a position below the main key.';
  return null;
}
export function moved<T extends { id: string }>(components: readonly T[], componentId: string, position: number): T[] {
  const rest = components.filter(item => item.id !== componentId);
  const component = components.find(item => item.id === componentId);
  return component ? [...rest.slice(0, position), component, ...rest.slice(position)] : [...components];
}

// Which content components a generation request runs on this page. A component
// that never had an attempt is "not generated yet"; input components never run.
export function generationTargets(target: GenerationTarget | { scope: 'capture' }, components: readonly Component[]): Component[] {
  const content = components.filter(component => isContentType(component.moduleType));
  switch (target.scope) {
    case 'capture':
    case 'missing':
      return content.filter(component => component.attemptId === null);
    case 'page':
      return content;
    case 'component': {
      const component = components.find(item => item.id === target.componentId);
      if (!component) throw new Error('This component no longer exists.');
      if (!isContentType(component.moduleType)) throw new Error('Only generated components can be retried.');
      return [component];
    }
    // A facet's own Retry (0.7.3) needs content that follows its parent's
    // contract, so the facet's section can be found and replaced.
    case 'facet': {
      const component = components.find(item => item.id === target.componentId);
      if (!component) throw new Error('This component no longer exists.');
      if (!isParentType(component.moduleType) || !component.facets?.includes(target.facet)) throw new Error('This facet is no longer there.');
      if (!parentContentOf(component.content)) throw new Error('Retry the whole module first: it has no content yet.');
      return [component];
    }
  }
}

// The meaning line of a page summary (D05, D08): the first meaning in the core
// of the page's first content component that has one; otherwise, for a
// sentence, the first line of the first translation (D09: read as data).
export function pageMeaning(components: readonly { type: string; content?: BlockDocument | null }[]): string | null {
  const cores = components.filter(item => isContentType(item.type) && item.content).map(item => parentContentOf(item.content!)?.core);
  for (const core of cores) if (core?.kind === 'word' && core.meanings[0]) return core.meanings[0];
  for (const core of cores) if (core?.kind === 'sentence' && core.translation) return core.translation.split('\n')[0]!.trim();
  return null;
}
