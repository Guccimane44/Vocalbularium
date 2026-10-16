import { facetsOf, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import type { ParentContent } from './content.js';

// Render contracts (D05, D09): a parent's structured content, and the plain
// text of the main key, Context and Text, in the form clients draw. Nothing is
// parsed and nothing produces HTML: clients build their own elements.

export type EntryHeading = Readonly<{ language: string; key: string | null; pronunciation: string | null }>;
export type Meaning = Readonly<{ number: string; text: string }>;
// The sentence is null only for an example the user emptied to its translation (D09).
export type Example = Readonly<{ number: string; sentence: string | null; translation: string | null }>;
export type Rendered =
  | Readonly<{ kind: 'plain'; text: string }>
  | Readonly<{ kind: 'parent'; core: ParentCore; facets: readonly RenderedFacet[] }>;
// A parent's core (D08): a word's explanation, or a sentence's translation.
export type ParentCore =
  | Readonly<{ kind: 'word'; heading: EntryHeading | null; meanings: readonly Meaning[] }>
  | Readonly<{ kind: 'sentence'; text: string }>;
export type RenderedFacet =
  | Readonly<{ facet: 'examples'; label: string; examples: readonly Example[] }>
  | Readonly<{ facet: Exclude<FacetType, 'examples'>; label: string; lines: readonly string[] }>;

// Structured parent content (D09) in its rendered form: meanings and examples
// numbered by position, Article as "das Ufer · die Ufer", Pinyin as "河岸 hé'àn".
export function renderParent(type: ParentType, content: ParentContent): Rendered {
  const core: ParentCore = content.core.kind === 'word'
    ? { kind: 'word', heading: { language: content.core.language, key: content.core.key, pronunciation: content.core.romanization ?? null },
      meanings: content.core.meanings.map((text, index) => ({ number: String(index + 1), text })) }
    : { kind: 'sentence', text: content.core.translation ?? '' };
  const { article, examples, synonyms, antonyms, pinyin } = content.facets;
  const entries: Partial<Record<FacetType, RenderedFacet>> = {};
  const label = (facet: FacetType) => PARENTS[type].facets[facet]?.label ?? facet;
  // A half-filled item (D09: the user may empty any field) shows the parts it has.
  if (article) entries.article = { facet: 'article', label: label('article'), lines: [[article.singular, article.plural].filter(Boolean).join(' · ')] };
  if (examples) entries.examples = { facet: 'examples', label: label('examples'),
    examples: examples.map((example, index) => ({ number: String(index + 1), sentence: example.sentence ?? null, translation: example.translation ?? null })) };
  if (synonyms) entries.synonyms = { facet: 'synonyms', label: label('synonyms'), lines: synonyms };
  if (antonyms) entries.antonyms = { facet: 'antonyms', label: label('antonyms'), lines: antonyms };
  if (pinyin) entries.pinyin = { facet: 'pinyin', label: label('pinyin'), lines: pinyin.map(line => [line.text, line.pinyin].filter(Boolean).join(' ')) };
  return { kind: 'parent', core, facets: facetsOf(type).filter(facet => entries[facet]).map(facet => entries[facet]!) };
}

// Plain text: the main key, Context and Text (D09: a parent is never text).
export function renderContent(_moduleType: string, text: string): Rendered {
  return { kind: 'plain', text };
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
