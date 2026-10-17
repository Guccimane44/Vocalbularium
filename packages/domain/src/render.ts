import { facetsOf, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import type { ParentContent } from './content.js';
import { hasText, parseMarkdown } from './markdown.js';
import type { MdBlock } from './markdown.js';

// Render contracts (D05, D09): a parent's content as its top line, then its
// core and each facet with content as markdown blocks, each facet in its own
// container in the parent's order; and the plain text of the main key, Context
// and Text. Nothing produces HTML: clients build their own elements.

export type EntryHeading = Readonly<{ language: string; key: string; pronunciation: string | null }>;
export type RenderedFacet = Readonly<{ facet: FacetType; label: string; body: readonly MdBlock[] }>;
export type Rendered =
  | Readonly<{ kind: 'plain'; text: string }>
  // `heading` is a word's top line; a sentence has none.
  | Readonly<{ kind: 'parent'; heading: EntryHeading | null; core: readonly MdBlock[]; facets: readonly RenderedFacet[] }>
  // Context and Text are markdown since 0.7.5 (D10, amended a fourth time).
  | Readonly<{ kind: 'note'; blocks: readonly MdBlock[] }>;

export function renderParent(type: ParentType, content: ParentContent): Rendered {
  const header = content.header;
  const texts = content.facets as Record<string, string | undefined>;
  return {
    kind: 'parent',
    heading: header.kind === 'word' ? { language: header.language, key: header.key, pronunciation: header.romanization ?? null } : null,
    core: parseMarkdown(content.core),
    facets: facetsOf(type).filter(facet => hasText(texts[facet]))
      .map(facet => ({ facet, label: PARENTS[type].facets[facet]!.label, body: parseMarkdown(texts[facet]!) }))
  };
}

// Plain text: the main key (D09: a parent is never text); Context and Text as
// markdown (D10, amended a fourth time).
export function renderContent(moduleType: string, text: string): Rendered {
  return moduleType === 'context' || moduleType === 'text' ? { kind: 'note', blocks: parseMarkdown(text) } : { kind: 'plain', text };
}

// Splits text around each occurrence of the main key, so a client can emphasise it.
export function emphasise(text: string, key: string): { text: string; key: boolean }[] {
  const needle = key.trim();
  if (!needle) return [{ text, key: false }];
  const parts: { text: string; key: boolean }[] = [];
  const lower = text.toLocaleLowerCase(), target = needle.toLocaleLowerCase();
  let from = 0;
  for (let at = lower.indexOf(target); at >= 0 && target.length === needle.length; at = lower.indexOf(target, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), key: false });
    parts.push({ text: text.slice(at, at + needle.length), key: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), key: false });
  return parts.length ? parts : [{ text, key: false }];
}
