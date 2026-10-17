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
  | Readonly<{ type: 'strong' | 'em' | 'mark'; children: readonly MdInline[] }>
  // A size and a font on a stretch of text (D10, amended again): `[text]{size=large font=display}`.
  // A highlight colour beside the default yellow (D10, amended a third time): `[text]{highlight=green}`.
  | Readonly<{ type: 'span'; size?: TextSize; font?: TextFont; highlight?: HighlightColour; children: readonly MdInline[] }>;
export type TextSize = 'small' | 'large';
export type TextFont = 'display' | 'mono';
export type HighlightColour = 'green' | 'blue' | 'pink' | 'orange';
const SIZES: readonly string[] = ['small', 'large'];
const FONTS: readonly string[] = ['display', 'mono'];
export const HIGHLIGHT_COLOURS: readonly HighlightColour[] = ['green', 'blue', 'pink', 'orange'];
export type MdBlock =
  | Readonly<{ type: 'paragraph'; children: readonly MdInline[] }>
  | Readonly<{ type: 'list'; ordered: boolean; start: number; items: ReadonlyArray<readonly MdInline[]> }>;

// --- Formatting -------------------------------------------------------------

// Literal text: every character the subset reads as markup is escaped, and a
// line that would start a list does not.
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_=[]/g, '\\$&').split('\n')
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
    // A bracketed span with a known size or font; anything else stays text.
    if (char === '[') {
      const span = readSpan(source, index);
      if (span) { flush(); out.push(span.run); index = span.end; continue; }
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
// `[text]{size=… font=…}` from `[` at `from`: the closing `]`, skipping escaped
// characters, code and nested brackets, then attributes of known values only.
function readSpan(source: string, from: number): { run: MdInline; end: number } | null {
  let depth = 0;
  for (let index = from + 1; index < source.length; index++) {
    const char = source[index]!;
    if (char === '\\') { index++; continue; }
    if (char === '`') { const end = source.indexOf('`', index + 1); if (end > 0) { index = end; continue; } }
    if (char === '[') depth++;
    if (char !== ']') continue;
    if (depth--) continue;
    const attrs = /^\{([a-z= ]+)\}/.exec(source.slice(index + 1));
    if (!attrs) return null;
    let size: TextSize | undefined, font: TextFont | undefined, highlight: HighlightColour | undefined;
    for (const pair of attrs[1]!.trim().split(/\s+/)) {
      const [key, value] = pair.split('=');
      if (key === 'size' && SIZES.includes(value!) && !size) size = value as TextSize;
      else if (key === 'font' && FONTS.includes(value!) && !font) font = value as TextFont;
      else if (key === 'highlight' && (HIGHLIGHT_COLOURS as readonly string[]).includes(value!) && !highlight) highlight = value as HighlightColour;
      else return null;
    }
    if (!size && !font && !highlight) return null;
    return { run: { type: 'span', ...(size ? { size } : {}), ...(font ? { font } : {}), ...(highlight ? { highlight } : {}),
      children: parseInline(source.slice(from + 1, index)) }, end: index + 1 + attrs[0].length };
  }
  return null;
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

// --- The editor's document (D09, amended) ---------------------------------
// The live editor (TipTap) holds a document of paragraphs, hard breaks,
// bulleted and numbered lists and the bold, italic, code and highlight marks,
// named as TipTap's StarterKit and Highlight name them. These convert it to
// and from the markdown subset above, so what the editor writes is exactly
// what the card reads. Nested lists are flattened into their item.

// A size or font mark carries its value (D10, amended again).
// A highlight may carry a colour other than the default yellow (D10, amended a third time).
export type EditorMark = Readonly<{ type: 'bold' | 'italic' | 'code' } | { type: 'highlight'; attrs?: Readonly<{ colour?: string | null }> }
  | { type: 'size' | 'font'; attrs: Readonly<{ value: string }> }>;
export type EditorNode = Readonly<{
  type: string;
  attrs?: Readonly<Record<string, unknown>>;
  content?: readonly EditorNode[];
  text?: string;
  marks?: readonly EditorMark[];
}>;

const MARK_OF: Record<'strong' | 'em' | 'mark', 'bold' | 'italic' | 'highlight'> = { strong: 'bold', em: 'italic', mark: 'highlight' };
function inlineNodes(runs: readonly MdInline[], marks: readonly EditorMark[] = []): EditorNode[] {
  return runs.flatMap((run): EditorNode[] => {
    if (run.type === 'text') return run.text ? [{ type: 'text', text: run.text, ...(marks.length ? { marks } : {}) }] : [];
    if (run.type === 'break') return [{ type: 'hardBreak' }];
    if (run.type === 'code') return run.text ? [{ type: 'text', text: run.text, marks: [...marks, { type: 'code' }] }] : [];
    if (run.type === 'span') return inlineNodes(run.children, [...marks,
      ...(run.size ? [{ type: 'size' as const, attrs: { value: run.size } }] : []), ...(run.font ? [{ type: 'font' as const, attrs: { value: run.font } }] : []),
      ...(run.highlight ? [{ type: 'highlight' as const, attrs: { colour: run.highlight } }] : [])]);
    return inlineNodes(run.children, [...marks, { type: MARK_OF[run.type] }]);
  });
}
const paragraph = (runs: readonly MdInline[]): EditorNode => {
  const content = inlineNodes(runs);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};
export function toEditorDoc(source: string): EditorNode {
  const blocks = parseMarkdown(source);
  const content = blocks.map((block): EditorNode => block.type === 'paragraph' ? paragraph(block.children)
    : { type: block.ordered ? 'orderedList' : 'bulletList', ...(block.ordered ? { attrs: { start: block.start } } : {}),
      content: block.items.map(item => ({ type: 'listItem', content: [paragraph(item)] })) });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// Inline text with only the subset's markup characters escaped; line starts
// are escaped where lines are put together.
const escapeInline = (text: string) => text.replace(/[\\`*_=[]/g, '\\$&');
const escapeLineStart = (line: string) => line.replace(/^(\s*)(\d+)\.(\s)/, '$1$2\\.$3').replace(/^(\s*)([-+])(\s)/, '$1\\$2$3');
const WRAP: Record<'bold' | 'italic' | 'code' | 'highlight', string> = { bold: '**', italic: '*', code: '`', highlight: '==' };
// A highlight's colour, when it is not the default yellow.
const colourOf = (marks: readonly EditorMark[]): string | undefined => {
  const mark = marks.find(each => each.type === 'highlight');
  const colour = mark && 'attrs' in mark ? mark.attrs?.colour ?? undefined : undefined;
  return colour && (HIGHLIGHT_COLOURS as readonly string[]).includes(colour) ? colour : undefined;
};
// The span a size, font or highlight colour writes around the rest, outermost.
function spanAround(marks: readonly EditorMark[], inner: string): string {
  const value = (type: 'size' | 'font') => { const mark = marks.find(each => each.type === type); return mark && 'attrs' in mark ? (mark.attrs as { value: string }).value : undefined; };
  const size = value('size'), font = value('font'), highlight = colourOf(marks);
  const attrs = [SIZES.includes(size ?? '') ? `size=${size}` : '', FONTS.includes(font ?? '') ? `font=${font}` : '', highlight ? `highlight=${highlight}` : ''].filter(Boolean);
  return attrs.length ? `[${inner}]{${attrs.join(' ')}}` : inner;
}
function inlineText(nodes: readonly EditorNode[] | undefined): string {
  return (nodes ?? []).map(node => {
    if (node.type === 'hardBreak') return '\n';
    if (node.type !== 'text' || !node.text) return '';
    const marks = node.marks ?? [];
    if (marks.some(mark => mark.type === 'code')) return spanAround(marks, `\`${node.text.replace(/`/g, '')}\``);
    // Bold outside italic outside highlight, so nested marks always close in order.
    const order = ['bold', 'italic', 'highlight'] as const;
    // A coloured highlight is written in the span, not as ==.
    const applied = order.filter(type => marks.some(mark => mark.type === type) && !(type === 'highlight' && colourOf(marks)));
    const text = escapeInline(node.text);
    // A mark cannot open or close on a space: keep the spaces outside it.
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
    if (!body) return text;
    // Italic inside bold is written with _, so ***x*** never has to be read.
    const wrap = (type: typeof order[number]) => type === 'italic' && applied.includes('bold') ? '_' : WRAP[type];
    return lead + spanAround(marks, applied.map(wrap).join('') + body + [...applied].reverse().map(wrap).join('')) + trail;
  }).join('');
}
// A block's lines: a paragraph's text, or a list's items, continuation lines
// indented under their item.
function blockLines(node: EditorNode): string[] {
  if (node.type === 'paragraph') return inlineText(node.content).split('\n').map(escapeLineStart);
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const start = Number(node.attrs?.start ?? 1) || 1;
    return (node.content ?? []).flatMap((item, index) => {
      const marker = node.type === 'orderedList' ? `${start + index}. ` : '- ';
      const lines = (item.content ?? []).flatMap(child => child.type === 'paragraph' ? blockLines(child)
        : blockLines(child).map(line => line.replace(/^\d+\.\s|^-\s/, ''))).filter(line => line.trim());
      return (lines.length ? lines : ['']).map((line, at) => (at ? ' '.repeat(marker.length) : marker) + line);
    });
  }
  return (node.content ?? []).flatMap(blockLines);
}
export function fromEditorDoc(doc: EditorNode): string {
  const blocks = (doc.content ?? []).map(blockLines).map(lines => lines.join('\n')).filter(text => text.trim());
  return blocks.join('\n\n');
}
