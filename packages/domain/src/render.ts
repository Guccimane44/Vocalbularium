import { facetsOf, isFacetOf, isParentType, PARENTS } from './parents.js';
import type { FacetType, ParentType } from './parents.js';
import type { ParentContent } from './content.js';

// Render contracts (D05, C17): content stays stored as each module's text; this
// turns that text into structure for reading. A renderer recognises the whole
// component or none of it, and never produces HTML: clients build their own
// elements from the result.

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

const HEADING = /^==\s*([^=].*?)\s*==$/;
const SECTION = /^===\s*([^=].*?)\s*===$/;
const NUMBERED = /^:\s*\[(\d+[a-z]?)\]\s*(\S.*)$/;
const TRANSLATION = /^::\s*(\S.*)$/;

// "Chinesisch (幸福, xìngfú)" → language, key and pronunciation.
function heading(text: string): EntryHeading {
  const match = /^(.*?)\s*\((.*)\)$/.exec(text);
  if (!match || !match[1]) return { language: text, key: null, pronunciation: null };
  const [key, ...rest] = match[2].split(',').map(part => part.trim());
  return { language: match[1], key: key || null, pronunciation: rest.join(', ') || null };
}

const LINE = /^:\s*(\S.*)$/;

// A parent's text (D08): its core, then one section per facet, each starting
// with "=== Facet ===" as the catalog names it. A word's core is
// "== Language (key, pronunciation) ==", the meanings heading in the parent's
// language and numbered meanings; a sentence's core is its translation. Facets
// may come in any order, each once, and are returned in the parent's order.
function parent(type: ParentType, text: string): Rendered | null {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const labels = new Map(facetsOf(type).map(facet => [PARENTS[type].facets[facet]!.label, facet]));
  const facetAt = (index: number): FacetType | null => {
    const label = SECTION.exec(lines[index] ?? '')?.[1];
    return label !== undefined ? labels.get(label) ?? null : null;
  };
  let index = 0;
  let core: ParentCore;
  const top = HEADING.exec(lines[0] ?? '');
  const meaningsAt = top ? 1 : 0;
  if (SECTION.exec(lines[meaningsAt] ?? '')?.[1] === PARENTS[type].meaningsHeading) {
    index = meaningsAt + 1;
    const meanings: Meaning[] = [];
    for (let match; index < lines.length && (match = NUMBERED.exec(lines[index])); index++) meanings.push({ number: match[1], text: match[2].trim() });
    if (!meanings.length) return null;
    core = { kind: 'word', heading: top ? heading(top[1]) : null, meanings };
  } else {
    const translation: string[] = [];
    for (; index < lines.length && !lines[index].startsWith('='); index++) translation.push(lines[index]);
    if (!translation.length) return null;
    core = { kind: 'sentence', text: translation.join('\n') };
  }
  const found = new Map<FacetType, RenderedFacet>();
  while (index < lines.length) {
    const facet = facetAt(index);
    if (!facet || found.has(facet)) return null;
    const label = PARENTS[type].facets[facet]!.label;
    index++;
    if (facet === 'examples') {
      const examples: Example[] = [];
      for (let sentence; index < lines.length && (sentence = NUMBERED.exec(lines[index]));) {
        const translation = TRANSLATION.exec(lines[index + 1] ?? '');
        examples.push({ number: sentence[1], sentence: sentence[2].trim(), translation: translation ? translation[1].trim() : null });
        index += translation ? 2 : 1;
      }
      if (!examples.length) return null;
      found.set(facet, { facet, label, examples });
    } else {
      const items: string[] = [];
      for (let match; index < lines.length && !NUMBERED.test(lines[index]) && (match = LINE.exec(lines[index])); index++) items.push(match[1].trim());
      if (!items.length) return null;
      found.set(facet, { facet, label, lines: items });
    }
  }
  return { kind: 'parent', core, facets: facetsOf(type).filter(facet => found.has(facet)).map(facet => found.get(facet)!) };
}

// Structured parent content (D09) in the same rendered form, so a card draws
// it exactly as it drew parsed text: meanings and examples numbered by
// position, Article as "das Ufer · die Ufer", Pinyin as "河岸 hé'àn".
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

export function renderContent(moduleType: string, text: string): Rendered {
  const plain: Rendered = { kind: 'plain', text };
  if (!text.trim()) return plain;
  if (isParentType(moduleType)) return parent(moduleType, text) ?? plain;
  return plain;
}

// The text without one facet's section (D08), when it follows the parent's
// contract; text that does not, such as an edited component, stays unchanged.
export function withoutFacet(moduleType: string, text: string, facet: string): string {
  if (!isParentType(moduleType) || !isFacetOf(moduleType, facet) || renderContent(moduleType, text).kind !== 'parent') return text;
  const label = PARENTS[moduleType].facets[facet]!.label;
  let skipping = false;
  return text.split('\n').filter(line => {
    const section = SECTION.exec(line.trim());
    if (section) skipping = section[1] === label;
    return !skipping;
  }).join('\n');
}

// One facet's section of a parent's text, its heading left out, or '' when
// the text has none or does not follow the parent's contract.
export function facetSection(moduleType: string, text: string, facet: string): string {
  if (!isParentType(moduleType) || !isFacetOf(moduleType, facet) || renderContent(moduleType, text).kind !== 'parent') return '';
  const label = PARENTS[moduleType].facets[facet]!.label;
  let inside = false;
  return text.split('\n').filter(line => {
    const section = SECTION.exec(line.trim());
    if (section) { inside = section[1] === label; return false; }
    return inside;
  }).join('\n').trim();
}

// The text with one facet's section replaced by `section` (0.7.3), in the
// parent's order; an empty `section` leaves the facet out. Text that does not
// follow the parent's contract stays unchanged.
export function withFacetSection(moduleType: string, text: string, facet: string, section: string): string {
  if (!isParentType(moduleType) || !isFacetOf(moduleType, facet) || renderContent(moduleType, text).kind !== 'parent') return text;
  const rest = withoutFacet(moduleType, text, facet).trimEnd();
  if (!section.trim()) return rest;
  const block = [`=== ${PARENTS[moduleType].facets[facet]!.label} ===`, section.trim()];
  const later = new Set(facetsOf(moduleType).slice(facetsOf(moduleType).indexOf(facet) + 1).map(each => PARENTS[moduleType].facets[each]!.label));
  const lines = rest.split('\n');
  const at = lines.findIndex(line => later.has(SECTION.exec(line.trim())?.[1] ?? ''));
  return (at < 0 ? [...lines, ...block] : [...lines.slice(0, at), ...block, ...lines.slice(at)]).join('\n');
}

// The text without facet headings that have nothing under them (D08): the
// provider sometimes writes a heading for a facet that does not apply, such as
// Article for an adjective. An empty facet counts as omitted. Other headings
// and lines stay as they are.
export function withoutEmptyFacets(moduleType: string, text: string): string {
  if (!isParentType(moduleType)) return text;
  const labels = new Set(facetsOf(moduleType).map(facet => PARENTS[moduleType].facets[facet]!.label));
  const lines = text.split('\n');
  return lines.filter((line, index) => {
    const label = SECTION.exec(line.trim())?.[1];
    if (label === undefined || !labels.has(label)) return true;
    const next = lines.slice(index + 1).find(candidate => candidate.trim());
    return next !== undefined && !next.trim().startsWith('==');
  }).join('\n');
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
