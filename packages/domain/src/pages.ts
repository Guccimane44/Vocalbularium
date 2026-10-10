import type { BlockDocument, Component, ModuleInstance, ViewDefinition } from '@vocabularium/contracts';
import { MODULES } from './modules.js';
import type { ModuleType } from './modules.js';

export function textBlocks(text: string): BlockDocument {
  return { version: 1, blocks: text ? [{ type: 'paragraph', text }] : [] };
}
export function blockText(content: BlockDocument): string {
  return content.blocks.map(block => block.text).join('\n\n');
}

// Page outcome from the components that have had an attempt.
export function pageStatus(components: readonly Component[]): Component['status'] {
  const statuses = components.map(c => c.status).filter(status => status !== null);
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('loading')) return 'loading';
  return statuses.length ? 'completed' : null;
}

// The page's main key, which every page has first.
export function mainKeyOf(components: readonly Component[]): string {
  const key = components.find(component => component.moduleType === 'main-key');
  return key ? blockText(key.content) : '';
}

export type ViewModuleDefinition = Readonly<{ label: string; dependsOn: readonly ModuleType[] }>;
export const VIEW_MODULES = Object.freeze({
  default: { label: 'Default view', dependsOn: [] as readonly ModuleType[] }
} satisfies Readonly<Record<ViewDefinition['module'], ViewModuleDefinition>>);

// A view may depend on content modules; the deck must configure each one.
export function validateView(view: ViewDefinition, modules: readonly ModuleInstance[]): void {
  const definition = VIEW_MODULES[view.module];
  if (!definition) throw new Error('The deck uses an unsupported view.');
  const missing = definition.dependsOn.filter(type => !modules.some(module => module.type === type));
  if (missing.length) throw new Error(`The view needs these modules: ${missing.map(type => MODULES[type].label).join(', ')}.`);
}
