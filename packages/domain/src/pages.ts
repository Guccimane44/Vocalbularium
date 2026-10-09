import type {
  BlockDocument, Component, ContentModuleInstance, GenerationTarget, ViewDefinition
} from '@vocabularium/contracts';
import { MAX_CONTENT_MODULES } from '@vocabularium/contracts';
import { MODULES } from './modules.js';
import type { ModuleType } from './modules.js';

export function textBlocks(text: string): BlockDocument {
  return { version: 1, blocks: text ? [{ type: 'paragraph', text }] : [] };
}
export function blockText(content: BlockDocument): string {
  return content.blocks.map(block => block.text).join('\n\n');
}

export function validateConfiguration(modules: readonly ContentModuleInstance[]): void {
  if (modules.length > MAX_CONTENT_MODULES) throw new Error(`A deck can have at most ${MAX_CONTENT_MODULES} content modules.`);
  const ids = new Set<string>();
  for (const module of modules) {
    if (!Object.hasOwn(MODULES, module.type)) throw new Error('The deck contains an unsupported module.');
    if (ids.has(module.id)) throw new Error('Content module instance IDs must be unique.');
    ids.add(module.id);
  }
}

// Which configured instances a generation request runs. Components of removed
// instances and manual components are never targets.
export function generationTargets(
  target: GenerationTarget | { scope: 'capture' },
  modules: readonly ContentModuleInstance[],
  components: readonly Component[]
): ContentModuleInstance[] {
  const owned = new Map(components.filter(c => c.kind === 'module' && c.moduleInstanceId)
    .map(c => [c.moduleInstanceId as string, c]));
  switch (target.scope) {
    case 'capture':
    case 'missing':
      return modules.filter(module => !owned.has(module.id));
    case 'page':
      return [...modules];
    case 'component': {
      const component = components.find(c => c.id === target.componentId);
      if (!component || component.kind !== 'module') throw new Error('Only generated components can be retried.');
      const module = modules.find(m => m.id === component.moduleInstanceId);
      if (!module) throw new Error('This component’s module is no longer configured.');
      return [module];
    }
  }
}

// Page outcome from the components that have had an attempt.
export function pageStatus(components: readonly Component[]): Component['status'] {
  const statuses = components.map(c => c.status).filter(status => status !== null);
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('loading')) return 'loading';
  return statuses.length ? 'completed' : null;
}

export type ViewModuleDefinition = Readonly<{ label: string; dependsOn: readonly ModuleType[] }>;
export const VIEW_MODULES = Object.freeze({
  default: { label: 'Default view', dependsOn: [] as readonly ModuleType[] }
} satisfies Readonly<Record<ViewDefinition['module'], ViewModuleDefinition>>);

// A view may depend on content modules; the deck must configure each one.
export function validateView(view: ViewDefinition, modules: readonly ContentModuleInstance[]): void {
  const definition = VIEW_MODULES[view.module];
  if (!definition) throw new Error('The deck uses an unsupported view.');
  const missing = definition.dependsOn.filter(type => !modules.some(module => module.type === type));
  if (missing.length) throw new Error(`The view needs these modules: ${missing.map(type => MODULES[type].label).join(', ')}.`);
}

export type MissingComponent = Readonly<{ kind: 'missing'; moduleInstanceId: string }>;

// The default view: main key, Context, configured content components in
// configured order (missing ones as placeholders), components of removed
// instances, then manual components.
export function defaultView(
  components: readonly Component[],
  modules: readonly ContentModuleInstance[]
): (Component | MissingComponent)[] {
  const byKind = (kind: Component['kind']) => components.filter(c => c.kind === kind);
  const owned = new Map(byKind('module').map(c => [c.moduleInstanceId, c]));
  const configured = new Set(modules.map(m => m.id));
  return [
    ...byKind('main_key'),
    ...byKind('context'),
    ...modules.map(m => owned.get(m.id) ?? { kind: 'missing' as const, moduleInstanceId: m.id }),
    ...byKind('module').filter(c => !configured.has(c.moduleInstanceId as string)),
    ...byKind('manual')
  ];
}
