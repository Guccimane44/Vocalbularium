import { contentModule } from './catalog/index.js';
import { facetsOf, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import type { ParentContent } from './content.js';
import { hasText, parseMarkdown } from './markdown.js';
import type { MdBlock } from './markdown.js';

// Render contracts (D05, D09): a parent's content as its top line, then its
// core and each facet with content as markdown blocks, each facet in its own
// container in the parent's order; and the plain text of the main key, Context
// and Text. Clients build their own elements.

// A card's top line: the key, and for a Languages card its language, its
// pronunciation and its labels, word or sentence and a German word's
// grammatical role, in the module's language (D17, K51).
export type EntryHeading = Readonly<{ language: string; key: string; pronunciation: string | null; labels: readonly string[] }>;
export type RenderedFacet = Readonly<{ facet: FacetType; label: string; body: readonly MdBlock[] }>;
export type Rendered =
  | Readonly<{ kind: 'plain'; text: string }>
  // `heading` is the card's top line.
  // `reading` marks a sentence's core, shown as reading text.
  | Readonly<{ kind: 'parent'; heading: EntryHeading | null; reading: boolean; core: readonly MdBlock[]; facets: readonly RenderedFacet[] }>
  // Context and Text are markdown since 0.7.5 (D10, amended a fourth time).
  | Readonly<{ kind: 'note'; blocks: readonly MdBlock[] }>;

export function renderParent(type: ParentType, content: ParentContent): Rendered {
  const header = content.header;
  const texts = content.facets as Record<string, string | undefined>;
  return {
    kind: 'parent',
    heading: headingOf(type, content),
    reading: header.kind === 'sentence',
    core: parseMarkdown(content.core),
    facets: facetsOf(type).filter(facet => hasText(texts[facet]))
      .map(facet => ({ facet, label: PARENTS[type].facets[facet]!.label, body: parseMarkdown(texts[facet]!) }))
  };
}

// The top line's labels come from the catalog, one per flag value: the model
// writes the value, the module names it (K51). A grammatical role outside the
// module's list is shown as written.
export function headingOf(type: ParentType, content: ParentContent): EntryHeading | null {
  const header = content.header;
  if (header.kind === 'expertise') return { language: '', key: header.key, pronunciation: null, labels: [] };
  const names = contentModule(type).core.headerLabels;
  const labels = !names || !header.language ? [] : [header.kind === 'sentence' ? names.sentence : names.word,
    ...(header.kind === 'word' && header.gramRole ? [names.gramRole?.[header.gramRole.toLowerCase()] ?? header.gramRole] : [])];
  return { language: header.language, key: header.key, pronunciation: header.romanization ?? null, labels };
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
