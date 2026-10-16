import type { ArticleEntry, ExampleEntry, GeneratedParent, ParentCore, PinyinEntry } from '@vocabularium/contracts';
import type { FacetType } from './parents.js';

// Markdown per facet (D09, amended): the app formats the provider's JSON into
// markdown as the card looks, and reads a small subset of markdown back for
// drawing: paragraphs with line breaks, bulleted and numbered lists, bold,
// italic, inline code and highlight (==text==). Anything else is text. The
// parser builds a tree for clients to draw; it never produces HTML.

export type MdInline =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'break' }>
  | Readonly<{ type: 'code'; text: string }>
  | Readonly<{ type: 'strong' | 'em' | 'mark'; children: readonly MdInline[] }>;
export type MdBlock =
  | Readonly<{ type: 'paragraph'; children: readonly MdInline[] }>
  | Readonly<{ type: 'list'; ordered: boolean; start: number; items: ReadonlyArray<readonly MdInline[]> }>;

// --- Formatting -------------------------------------------------------------

// Literal text: every character the subset reads as markup is escaped, and a
// line that would start a list does not.
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_=]/g, '\\$&').split('\n')
    .map(line => line.replace(/^(\s*)(\d+)\.(\s)/, '$1$2\\.$3').replace(/^(\s*)([-+])(\s)/, '$1\\$2$3')).join('\n');
}
// A numbered list; an item's further lines indent under it.
const numbered = (items: readonly string[]) => items.map((item, index) => {
  const marker = `${index + 1}. `;
  return marker + item.split('\n').join(`\n${' '.repeat(marker.length)}`);
}).join('\n');

export function formatCore(core: ParentCore): string {
  return core.kind === 'word' ? numbered(core.meanings.map(escapeMarkdown)) : escapeMarkdown(core.translation);
}
// Each facet as the card shows it: Article "das Ufer · die Ufer"; Examples a
// numbered list, the translation on the next line in italics; Synonyms and
// Antonyms one comma-separated line; Pinyin a line each.
export function formatFacet(facet: FacetType, entry: unknown): string {
  switch (facet) {
    case 'article': {
      const article = entry as ArticleEntry;
      return [article.singular, article.plural].filter(Boolean).map(part => escapeMarkdown(part!)).join(' · ');
    }
    case 'examples':
      return numbered((entry as ExampleEntry[]).map(example =>
        [escapeMarkdown(example.sentence), ...(example.translation ? [`*${escapeMarkdown(example.translation)}*`] : [])].join('\n')));
    case 'synonyms':
    case 'antonyms':
      return (entry as string[]).map(escapeMarkdown).join(', ');
    case 'pinyin':
      return (entry as PinyinEntry[]).map(line => `${escapeMarkdown(line.text)} ${escapeMarkdown(line.pinyin)}`).join('\n');
  }
}
export function formatFacets(generated: GeneratedParent): Partial<Record<FacetType, string>> {
  return Object.fromEntries(Object.entries(generated.facets).map(([facet, entry]) => [facet, formatFacet(facet as FacetType, entry)]));
}

// --- Parsing ----------------------------------------------------------------

const ITEM = /^\s{0,3}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;

// Inline text into its runs. Delimiters must close on the same block; an
// unclosed one is text. A backslash makes the next character literal.
export function parseInline(source: string): MdInline[] {
  const out: MdInline[] = [];
  let text = '';
  const flush = () => { if (text) { out.push({ type: 'text', text }); text = ''; } };
  for (let index = 0; index < source.length;) {
    const rest = source.slice(index);
    const char = source[index]!;
    if (char === '\\' && index + 1 < source.length) {
      if (source[index + 1] === '\n') { flush(); out.push({ type: 'break' }); index += 2; continue; }
      text += source[index + 1]; index += 2; continue;
    }
    if (char === '\n') {
      flush(); out.push({ type: 'break' }); index++; continue;
    }
    if (char === '`') {
      const end = source.indexOf('`', index + 1);
      if (end > index + 1) { flush(); out.push({ type: 'code', text: source.slice(index + 1, end) }); index = end + 1; continue; }
    }
    const pair = rest.startsWith('**') ? ['**', 'strong'] : rest.startsWith('==') ? ['==', 'mark'] : rest.startsWith('__') ? ['__', 'strong']
      : char === '*' || char === '_' ? [char, 'em'] : null;
    if (pair) {
      const [mark, type] = pair as [string, 'strong' | 'em' | 'mark'];
      const end = findClose(source, index + mark.length, mark);
      if (end > index + mark.length) {
        flush();
        out.push({ type, children: parseInline(source.slice(index + mark.length, end)) });
        index = end + mark.length; continue;
      }
    }
    text += char; index++;
  }
  flush();
  return out;
}
// The closing delimiter, skipping escaped characters, code and a longer run
// of the same character (so `*` does not close on `**`).
function findClose(source: string, from: number, mark: string): number {
  for (let index = from; index < source.length; index++) {
    const char = source[index]!;
    if (char === '\\') { index++; continue; }
    if (char === '`') { const end = source.indexOf('`', index + 1); if (end > 0) { index = end; continue; } }
    if (source.startsWith(mark, index)) {
      if (mark.length === 1 && source[index + 1] === mark) { index++; continue; }
      if (source[index - 1] === ' ' && mark.length === 1) continue;
      return index;
    }
  }
  return -1;
}

// Markdown into blocks: paragraphs (lines joined by breaks) and lists, whose
// items continue on indented lines. Blank lines separate blocks.
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[][] } | null = null;
  const endParagraph = () => { if (paragraph.length) { blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) }); paragraph = []; } };
  const endList = () => { if (list) { blocks.push({ type: 'list', ordered: list.ordered, start: list.start, items: list.items.map(item => parseInline(item.join('\n'))) }); list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { endParagraph(); endList(); continue; }
    const item = ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      if (list && list.ordered !== ordered) endList();
      endParagraph();
      list ??= { ordered, start: ordered ? Number(item[2]) : 1, items: [] };
      list.items.push([item[3]!]);
      continue;
    }
    if (list && /^\s+/.test(raw)) { list.items.at(-1)!.push(line.trim()); continue; }
    endList();
    paragraph.push(line.trim());
  }
  endParagraph(); endList();
  return blocks;
}

// The plain text of inline runs, and of a markdown text: one line per list item
// and per paragraph line, formatting left out.
export function plainInline(runs: readonly MdInline[]): string {
  return runs.map(run => run.type === 'text' || run.type === 'code' ? run.text : run.type === 'break' ? '\n' : plainInline(run.children)).join('');
}
export function plainLines(source: string): string[] {
  return parseMarkdown(source).flatMap(block => block.type === 'list'
    ? block.items.map(item => plainInline(item).split('\n')[0]!.trim()) : plainInline(block.children).split('\n').map(line => line.trim()))
    .filter(Boolean);
}
// Whether a markdown text holds anything to read.
export const hasText = (source: string | undefined): boolean => Boolean(source && plainLines(source).length);
