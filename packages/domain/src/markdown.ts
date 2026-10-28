// Markdown per facet (D09, amended): the app formats the provider's JSON into
// markdown as the card looks, and reads a small subset of markdown back for
// drawing: paragraphs with line breaks, bulleted and numbered lists, tables
// (D17), bold, italic, inline code and highlight (==text==). Anything else is
// text. The parser builds a tree for clients to draw.

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
  | Readonly<{ type: 'list'; ordered: boolean; start: number; items: ReadonlyArray<readonly MdInline[]> }>
  // A pipe table (D17): its header row, then its rows, each a list of cells.
  | Readonly<{ type: 'table'; header: ReadonlyArray<readonly MdInline[]>; rows: ReadonlyArray<ReadonlyArray<readonly MdInline[]>> }>;

// --- Formatting -------------------------------------------------------------

// Literal text: every character the subset reads as markup is escaped, and a
// line that would start a list does not.
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_=[]/g, '\\$&').split('\n')
    .map(line => line.replace(/^(\s*)(\d+)\.(\s)/, '$1$2\\.$3').replace(/^(\s*)([-+])(\s)/, '$1\\$2$3')).join('\n');
}
// A numbered list; an item's further lines indent under it.
export const numbered = (items: readonly string[]) => items.map((item, index) => {
  const marker = `${index + 1}. `;
  return marker + item.split('\n').join(`\n${' '.repeat(marker.length)}`);
}).join('\n');

// A table (D17): a header row of column names, then one row per label with
// its cells, every cell literal text. A pipe inside a cell is escaped.
export function table(columns: readonly string[], rows: ReadonlyArray<Readonly<{ label: string; cells: readonly string[] }>>, corner = ''): string {
  const cell = (text: string) => escapeMarkdown(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const line = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [line([corner, ...columns]), `|${' --- |'.repeat(columns.length + 1)}`, ...rows.map(row => line([row.label, ...row.cells]))].join('\n');
}

// Each module's facets format themselves with these (catalog, D11).

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

// A table row's cells: split on pipes that are not escaped, outer pipes dropped.
function cellsOf(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '\\' && index + 1 < line.length) { cell += char + line[index + 1]; index++; continue; }
    if (char === '|') { cells.push(cell); cell = ''; continue; }
    cell += char;
  }
  cells.push(cell);
  if (line.trim().startsWith('|')) cells.shift();
  if (line.trim().endsWith('|') && !line.trim().endsWith('\\|')) cells.pop();
  return cells.map(each => each.trim());
}
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

// Markdown into blocks: paragraphs (lines joined by breaks), lists, whose
// items continue on indented lines, and pipe tables, a header row followed by
// a rule. Blank lines separate blocks.
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[][] } | null = null;
  let rows: string[][] | null = null;
  const endParagraph = () => { if (paragraph.length) { blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) }); paragraph = []; } };
  const endList = () => { if (list) { blocks.push({ type: 'list', ordered: list.ordered, start: list.start, items: list.items.map(item => parseInline(item.join('\n'))) }); list = null; } };
  const endTable = () => { if (rows) { const [header, ...body] = rows; blocks.push({ type: 'table', header: header!.map(parseInline), rows: body.map(row => header!.map((_, at) => parseInline(row[at] ?? ''))) }); rows = null; } };
  for (let at = 0; at < lines.length; at++) {
    const raw = lines[at]!;
    const line = raw.replace(/\s+$/, '');
    if (rows) {
      if (TABLE_ROW.test(line)) { rows.push(cellsOf(line)); continue; }
      endTable();
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[at + 1] ?? '')) {
      endParagraph(); endList();
      rows = [cellsOf(line)]; at++; continue;
    }
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
  endParagraph(); endList(); endTable();
  return blocks;
}

// The plain text of inline runs, and of a markdown text: one line per list item
// and per paragraph line, formatting left out.
export function plainInline(runs: readonly MdInline[]): string {
  return runs.map(run => run.type === 'text' || run.type === 'code' ? run.text : run.type === 'break' ? '\n' : plainInline(run.children)).join('');
}
// A table row as one line: its cells apart by a space.
const plainRow = (cells: ReadonlyArray<readonly MdInline[]>) => cells.map(plainInline).filter(Boolean).join(' ');
export function plainLines(source: string): string[] {
  return parseMarkdown(source).flatMap(block => block.type === 'list'
    ? block.items.map(item => plainInline(item).split('\n')[0]!.trim())
    : block.type === 'table' ? [block.header, ...block.rows].map(plainRow)
      : plainInline(block.children).split('\n').map(line => line.trim()))
    .filter(Boolean);
}
// Markdown as plain text: each block's text, list items a line each, blocks
// apart by a blank line, formatting left out (D10, amended a fourth time:
// Context is markdown, and generation reads it as plain text).
export function plainText(source: string): string {
  return parseMarkdown(source).map(block => block.type === 'list' ? block.items.map(plainInline).join('\n')
    : block.type === 'table' ? [block.header, ...block.rows].map(plainRow).join('\n') : plainInline(block.children)).join('\n\n');
}
// Whether a markdown text holds a table, which the editor edits as its source (D17, K54).
export const hasTable = (source: string | undefined): boolean => Boolean(source && parseMarkdown(source).some(block => block.type === 'table'));
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
  // A table is edited as its source (D17, K54), never in this editor; read as text, it is a line per row.
  const content = blocks.map((block): EditorNode => block.type === 'paragraph' ? paragraph(block.children)
    : block.type === 'table' ? paragraph([block.header, ...block.rows].flatMap((row, at) => [...(at ? [{ type: 'break' } as const] : []), { type: 'text' as const, text: plainRow(row) }]))
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
// Marks are written as runs across neighbouring text, so a word highlighted
// inside italic text is `*a ==b== c*`, never `*a* *==b==**c*` (whose `**`
// would read as bold). Bold outside italic outside highlight; italic inside
// bold is written with _, so ***x*** never has to be read. A mark cannot open
// or close on a space: the spaces stay outside it. A size, font or colour
// span wraps each piece of text, innermost; code stands alone.
type RunMark = 'bold' | 'italic' | 'highlight';
const RUN_ORDER: readonly RunMark[] = ['bold', 'italic', 'highlight'];
function inlineText(nodes: readonly EditorNode[] | undefined): string {
  let out = '';
  const open: { type: RunMark; text: string }[] = [];
  // Close the open marks from the top down to `depth`, ahead of any trailing spaces.
  const closeTo = (depth: number) => {
    if (open.length <= depth) return;
    const [, body, trail] = /^([\s\S]*?)(\s*)$/.exec(out)!;
    out = body + open.splice(depth).reverse().map(mark => mark.text).join('') + trail;
  };
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') { closeTo(0); out += '\n'; continue; }
    if (node.type !== 'text' || !node.text) continue;
    const marks = node.marks ?? [];
    if (marks.some(mark => mark.type === 'code')) { closeTo(0); out += spanAround(marks, `\`${node.text.replace(/`/g, '')}\``); continue; }
    // A coloured highlight is written in the span, not as ==.
    const wanted = RUN_ORDER.filter(type => marks.some(mark => mark.type === type) && !(type === 'highlight' && colourOf(marks)));
    const keep = open.findIndex(mark => !wanted.includes(mark.type));
    closeTo(keep < 0 ? open.length : keep);
    const text = escapeInline(node.text);
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
    if (!body) { out += text; continue; }
    out += lead;
    for (const type of wanted.filter(type => !open.some(mark => mark.type === type))) {
      const delimiter = type === 'italic' && (wanted.includes('bold') || open.some(mark => mark.type === 'bold')) ? '_' : WRAP[type];
      out += delimiter; open.push({ type, text: delimiter });
    }
    out += spanAround(marks, body) + trail;
  }
  closeTo(0);
  return out;
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
// Whether a match stands as a whole word (D17): a key ending in a letter or
// digit of a script that spaces its words must not continue into one, so "in"
// is not marked inside "einer"; a CJK key is marked wherever it occurs.
const WORDY = /[\p{L}\p{N}]/u;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const wordy = (char: string | undefined) => char !== undefined && WORDY.test(char);
const spaced = (char: string) => WORDY.test(char) && !UNSPACED.test(char);
function wholeWord(text: string, at: number, length: number): boolean {
  const first = text[at]!, last = text[at + length - 1]!;
  return !(spaced(first) && wordy(text[at - 1])) && !(spaced(last) && wordy(text[at + length]));
}
// The key highlighted in inline text: every whole-word occurrence outside code
// and existing highlights.
function highlightInline(source: string, needle: string): string {
  const split = (node: EditorNode): EditorNode[] => {
    const marks = node.marks ?? [];
    if (!node.text || marks.some(mark => mark.type === 'code' || mark.type === 'highlight')) return [node];
    const lower = node.text.toLocaleLowerCase();
    const parts: EditorNode[] = [];
    let from = 0;
    for (let at = lower.indexOf(needle); at >= 0 && lower.length === node.text.length; at = lower.indexOf(needle, at + 1)) {
      if (at < from || !wholeWord(node.text, at, needle.length)) continue;
      if (at > from) parts.push({ ...node, text: node.text.slice(from, at) });
      parts.push({ ...node, text: node.text.slice(at, at + needle.length), marks: [...marks, { type: 'highlight' }] });
      from = at + needle.length;
    }
    if (from < node.text.length) parts.push({ ...node, text: node.text.slice(from) });
    return parts;
  };
  const walk = (node: EditorNode): EditorNode => node.content
    ? { ...node, content: node.content.flatMap(child => child.type === 'text' ? split(child) : [walk(child)]) } : node;
  return fromEditorDoc(walk(toEditorDoc(source)));
}
// A table's cells are highlighted one by one, so the table keeps its rows
// and its rule (D17); a pipe the highlighting writes back is escaped again.
function highlightTableRow(line: string, needle: string): string {
  return `| ${cellsOf(line).map(cell => cell ? highlightInline(cell, needle).replace(/(?<!\\)\|/g, '\\|') : '').join(' | ')} |`;
}
// The main key as a stored highlight (D10, amended a fourth time): every
// whole-word occurrence of `key` in plain text (D17), ignoring case, gains the
// default highlight; text in code or already highlighted is left as it is.
// Written back through the editor's document, so the markdown is what the
// editor would write; a table is highlighted cell by cell.
export function highlightKey(source: string, key: string): string {
  const needle = key.trim().toLocaleLowerCase();
  if (!needle || !source.toLocaleLowerCase().includes(needle)) return source;
  if (!hasTable(source)) return highlightInline(source, needle);
  // Text around tables is highlighted as a whole, each table row by row.
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let text: string[] = [];
  const endText = () => { if (text.some(line => line.trim())) out.push(highlightInline(text.join('\n'), needle)); text = []; };
  for (let at = 0; at < lines.length; at++) {
    if (!(TABLE_ROW.test(lines[at]!) && TABLE_RULE.test(lines[at + 1] ?? ''))) { text.push(lines[at]!); continue; }
    endText();
    out.push(highlightTableRow(lines[at]!, needle), lines[at + 1]!.trim());
    for (at += 2; at < lines.length && TABLE_ROW.test(lines[at]!); at++) out.push(highlightTableRow(lines[at]!, needle));
    at--;
  }
  endText();
  return out.join('\n');
}
export function fromEditorDoc(doc: EditorNode): string {
  const blocks = (doc.content ?? []).map(blockLines).map(lines => lines.join('\n')).filter(text => text.trim());
  return blocks.join('\n\n');
}
