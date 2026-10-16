import type { BlockDocument, GeneratedParent, ParentBlock, ParentCore, ParentHeader } from '@vocabularium/contracts';
import { formatCore, formatFacets, hasText, plainLines } from './markdown.js';
import { facetsOf, isFacetOf, ordered, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';

// A parent module's stored content (D09, amended): the core's top line, kept
// structured and never edited, then the core and each facet with content as one
// markdown text, in one typed block of the component's block document. The
// provider's JSON becomes this when it is stored (formatContent).

export type ParentFacetTexts = Readonly<Partial<Record<FacetType, string>>>;
export type ParentContent = Readonly<{ header: ParentHeader; core: string; facets: ParentFacetTexts }>;

const MAX_MARKDOWN = 8000;

// The component's parent block, or null when it holds none (empty or plain text).
export function parentBlock(content: BlockDocument): ParentBlock | null {
  return (content.blocks.find(block => block.type === 'parent') as ParentBlock | undefined) ?? null;
}
export function parentContentOf(content: BlockDocument): ParentContent | null {
  const block = parentBlock(content);
  return block ? { header: block.header, core: block.core, facets: block.facets } : null;
}
export function parentDocument(content: ParentContent): BlockDocument {
  return { version: 1, blocks: [{ type: 'parent', header: content.header, core: content.core, facets: content.facets }] };
}

// A generated result as stored: its top line, and its core and facets formatted
// into markdown as the card looks.
export function formatContent(generated: GeneratedParent): ParentContent {
  const core = generated.core;
  const header: ParentHeader = core.kind === 'word'
    ? { kind: 'word', language: core.language, key: core.key, ...(core.romanization ? { romanization: core.romanization } : {}) } : { kind: 'sentence' };
  return { header, core: formatCore(core), facets: formatFacets(generated) };
}
// The core as the provider reads it for a facet's own Retry: the top line and
// the core's lines as meanings, or its text as the translation.
export function providerCore(content: ParentContent): ParentCore {
  const lines = plainLines(content.core);
  return content.header.kind === 'word'
    ? { ...content.header, meanings: lines.length ? lines : ['—'] }
    : { kind: 'sentence', translation: lines.join('\n') || '—' };
}

// Whether the content holds nothing: no core text and no facet (D09: the user
// may empty every part). Such content has nothing to replace.
export function isEmptyContent(content: ParentContent): boolean {
  return !hasText(content.core) && !Object.values(content.facets).some(hasText);
}
// Whether a facet has content, and which of the parent's facets do, in its order.
export function hasFacetContent(content: ParentContent | null, facet: string): boolean {
  return Boolean(content && hasText((content.facets as Record<string, string | undefined>)[facet]));
}
export function filledFacets(parent: ParentType, content: ParentContent | null): FacetType[] {
  return content ? ordered(parent, Object.keys(content.facets).filter(facet => hasFacetContent(content, facet))) : [];
}
// The content with one facet's markdown replaced, or removed when it is empty.
export function withFacetText(content: ParentContent, facet: FacetType, text: string | undefined): ParentContent {
  const facets: Record<string, string> = { ...content.facets } as Record<string, string>;
  if (text === undefined || !hasText(text)) delete facets[facet]; else facets[facet] = text;
  return { header: content.header, core: content.core, facets };
}

// Thrown when saved content does not have the parent's shape.
export class ContentError extends Error {}
const fail = (message: string): never => { throw new ContentError(message); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function markdown(value: unknown, what: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return fail(`${what} is not text.`);
  if (value.length > MAX_MARKDOWN) fail(`${what} is too long.`);
  return value.replace(/\s+$/, '');
}

// Checks stored or saved content: a top line, the core's markdown, and one
// markdown text per facet the parent (and, when given, the instance) has. Any
// text may be empty; a facet left empty loses its entry.
export function validateParentContent(parent: ParentType, value: unknown, { facets }: { facets?: readonly string[] } = {}): ParentContent {
  if (!isRecord(value)) return fail('The content is not structured.');
  for (const key of Object.keys(value)) if (!['header', 'core', 'facets'].includes(key)) fail(`The content has an unexpected field "${key}".`);
  const header = value.header;
  if (!isRecord(header) || (header.kind !== 'word' && header.kind !== 'sentence')) return fail("The module's top line is missing.");
  const entries = value.facets ?? {};
  if (!isRecord(entries)) return fail('The facets are not structured.');
  const checked: Record<string, string> = {};
  for (const [facet, text] of Object.entries(entries)) {
    if (!isFacetOf(parent, facet)) fail(`${PARENTS[parent].label} has no facet "${facet}".`);
    if (facets && !facets.includes(facet)) fail(`${PARENTS[parent].label} has no ${PARENTS[parent].facets[facet as FacetType]!.label} here.`);
    const saved = markdown(text, PARENTS[parent].facets[facet as FacetType]!.label);
    if (hasText(saved)) checked[facet] = saved;
  }
  return { header: header as ParentHeader, core: markdown(value.core, 'The core'), facets: checked };
}

// What the editor sends (D09, amended): the core's markdown and one markdown
// text per facet; the top line is never part of it.
export type ParentDraft = Readonly<{ core: string; facets: ParentFacetTexts }>;

// The editor's draft of stored content: its core and an entry for each facet
// the component has, empty for a facet without content so it can be filled.
export function draftOf(parent: ParentType, content: ParentContent, facets: readonly string[]): { core: string; facets: Record<string, string> } {
  return { core: content.core, facets: Object.fromEntries(facetsOf(parent).filter(facet => facets.includes(facet))
    .map(facet => [facet, (content.facets as Record<string, string | undefined>)[facet] ?? ''])) };
}
// A save: the stored top line, with the draft's core and the instance's facets.
// Save never refuses an empty part.
export function applyDraft(parent: ParentType, stored: ParentContent, draft: ParentDraft, { facets }: { facets: readonly string[] }): ParentContent {
  const given = Object.fromEntries(Object.entries(draft.facets).filter(([facet]) => facets.includes(facet) && isFacetOf(parent, facet)));
  return validateParentContent(parent, { header: stored.header, core: draft.core, facets: given }, { facets });
}
