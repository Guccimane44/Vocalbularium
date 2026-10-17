import type { BlockDocument, Component, ModuleInstance, ViewDefinition } from '@vocabularium/contracts';
import { PARENTS } from './parents.js';
import { escapeMarkdown, highlightKey, plainText } from './markdown.js';
import type { ParentType as ModuleType } from './parents.js';

export function textBlocks(text: string): BlockDocument {
  return { version: 1, blocks: text ? [{ type: 'paragraph', text }] : [] };
}
// Context and Text hold markdown since 0.7.5 (D10, amended a fourth time):
// typed or captured plain text is stored escaped, so it reads as typed, with
// the main key highlighted when a key is given (Context at capture).
export function noteDocument(plain: string, key = ''): BlockDocument {
  return textBlocks(plain ? highlightKey(escapeMarkdown(plain), key) : '');
}
// A Context's or Text's markdown as plain text, as generation reads Context.
export function notePlain(content: BlockDocument): string {
  return plainText(blockText(content));
}
// The plain text of a component's paragraph blocks; structured parent content
// (D09) has none.
export function blockText(content: BlockDocument): string {
  return content.blocks.flatMap(block => block.type === 'paragraph' ? [block.text] : []).join('\n\n');
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
  if (missing.length) throw new Error(`The view needs these modules: ${missing.map(type => PARENTS[type].label).join(', ')}.`);
}
