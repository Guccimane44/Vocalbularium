import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, ReactNode } from 'react';
import { EditorContent, mergeAttributes, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Highlight from '@tiptap/extension-highlight';
import { BulletList, OrderedList } from '@tiptap/extension-list';
import type { ParentContent } from '@vocabularium/domain/content';
import { fromEditorDoc, hasText, toEditorDoc } from '@vocabularium/domain/markdown';
import type { EditorNode } from '@vocabularium/domain/markdown';
import { facetLabel, facetsOf } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import type { FieldDraft } from '../types/editor-drafts.js';
import { FacetTab } from './facet-tags.tsx';

// The parent editor (D09, amended; D10, 0.7.5): a parent card's core and each
// of its facets as one editor each, in place. It shows no markdown: what the
// user types stays as typed, markdown characters included, and is stored
// escaped (markdown.ts). Formatting comes from a toolbar beside the focused
// part, on its facet's rule or the core's top line, and from Cmd/Ctrl+B and
// +I. Only the supported subset exists in the editor; anything pasted outside
// it becomes plain text. The module's name, the facet names and the core's
// top line are shown, never edited. A facet without content keeps its place
// with an empty editor and a dimmed name. Opening the editor moves the focus
// nowhere.

// Without the shortcuts beyond bold and italic (D10): the toolbar is the way.
const quiet = { addKeyboardShortcuts: () => ({}) };
// TipTap with only the subset: no headings, quotes, code blocks, rules,
// strikethrough, underline or links, and no blank line added after a list.
// Markdown typed or pasted never formats (enableInputRules and
// enablePasteRules below).
const EXTENSIONS = [
  StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false, strike: false, underline: false,
    link: false, trailingNode: false, code: false, bulletList: false, orderedList: false }),
  Code.extend(quiet), Highlight.extend(quiet), BulletList.extend(quiet),
  // The card's number column counts from the list's start (page-view.css).
  OrderedList.extend({ ...quiet, renderHTML({ node, HTMLAttributes }) {
    return ['ol', mergeAttributes(HTMLAttributes, { style: `--start: ${Number(node.attrs.start ?? 1) - 1}` }), 0];
  } })
];

// The toolbar's buttons, each with its icon on the 24px grid of the card's icons.
const TOOLS = [
  { name: 'bold', label: 'Bold', run: (editor: Editor) => editor.chain().focus().toggleBold().run(),
    icon: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" /> },
  { name: 'italic', label: 'Italic', run: (editor: Editor) => editor.chain().focus().toggleItalic().run(),
    icon: <path d="M14 5h-4M14 19h-4M14 5l-4 14" /> },
  { name: 'highlight', label: 'Highlight', run: (editor: Editor) => editor.chain().focus().toggleHighlight().run(),
    icon: <><path d="M9 15l-3 3h6l1-1" /><path d="M13 5l6 6-6 6-6-6z" /></> },
  { name: 'code', label: 'Inline code', run: (editor: Editor) => editor.chain().focus().toggleCode().run(),
    icon: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /> },
  { name: 'bulletList', label: 'Bulleted list', run: (editor: Editor) => editor.chain().focus().toggleBulletList().run(),
    icon: <><path d="M10 7h10M10 12h10M10 17h10" /><circle cx="5" cy="7" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="17" r="1" /></> },
  { name: 'orderedList', label: 'Numbered list', run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
    icon: <><path d="M10 7h10M10 12h10M10 17h10" /><path d="M4 6l1-1v4M4 14h2l-2 3h2" /></> }
] as const;

// Each button says whether its formatting applies at the cursor, and keeps
// the focus in the text when clicked.
function Toolbar({ editor, label }: { editor: Editor; label: string }) {
  const active = useEditorState({ editor, selector: ({ editor: current }) => TOOLS.map(tool => current.isActive(tool.name)) });
  return <span className="md-toolbar" role="toolbar" aria-label={`Formatting, ${label}`}>
    {TOOLS.map((tool, index) => <button key={tool.name} type="button" className="md-tool" data-tool={tool.name} aria-label={tool.label}
      aria-pressed={active[index]} title={tool.label} onMouseDown={event => event.preventDefault()} onClick={() => tool.run(editor)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{tool.icon}</svg>
    </button>)}
  </span>;
}

// One part: its head (a facet's tab or the core's top line), then its text.
// The toolbar shows in the head while the focus is anywhere in the part.
function PartEditor({ value, label, editable, head, onChange, after, autofocus = false, reading = false, ...rest }: {
  value: string; label: string; editable: boolean; head: (toolbar: ReactNode) => ReactNode; onChange: (markdown: string) => void;
  after?: ReactNode; autofocus?: boolean; reading?: boolean; className?: string; 'data-facet'?: string; 'data-unfilled'?: true;
}) {
  const changed = useRef(onChange);
  changed.current = onChange;
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: toEditorDoc(value) as never,
    editable,
    enableInputRules: false,
    enablePasteRules: false,
    autofocus: autofocus ? 'end' : false,
    immediatelyRender: true,
    editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true', class: `md md-editor${reading ? ' reading' : ''}` } },
    onUpdate: ({ editor: current }) => changed.current(fromEditorDoc(current.getJSON() as EditorNode))
  });
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  const [focused, setFocused] = useState(false);
  const leave = (event: FocusEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); };
  return <section {...rest} data-focused={focused || undefined} onFocus={() => setFocused(true)} onBlur={leave}>
    {head(focused && editable && editor ? <Toolbar editor={editor} label={label} /> : null)}
    <EditorContent editor={editor} className="md-editor-frame" />
    {after}
  </section>;
}

// The card redraws only when a facet flips between empty and having text,
// so its tags and dimmed names follow what is typed.
function useTyped(fields: FieldDraft, persist: () => void, redraw: () => void) {
  const shape = () => JSON.stringify(Object.entries(fields.facets).map(([facet, text]) => [facet, hasText(text)]));
  const typed = useRef(shape());
  return () => { persist(); const now = shape(); if (now !== typed.current) { typed.current = now; redraw(); } };
}

// One facet edited on its own (D10, 0.7.5), in its place on the card: its tab
// and toolbar, its text, then its Save and Cancel (`children`). The focus goes
// into its text, since the Edit that opened it is gone.
export function FacetEditor({ parent, facet, title, fields, locked, persist, redraw, children }: {
  parent: ParentType; facet: FacetType; title: string; fields: FieldDraft; locked: boolean; persist: () => void; redraw: () => void; children: ReactNode;
}) {
  const changed = useTyped(fields, persist, redraw);
  return <PartEditor className="facet facet-editing" data-facet={facet} data-unfilled={!hasText(fields.facets[facet]) || undefined}
    value={fields.facets[facet] ?? ''} editable={!locked} autofocus label={`${facetLabel(parent, facet)}, ${title}`}
    onChange={markdown => { fields.facets[facet] = markdown; changed(); }}
    head={toolbar => <h3 className="facet-title"><FacetTab parent={parent} facet={facet} />{toolbar}</h3>} after={children} />;
}

// The core's top line, never editable, with the toolbar at its end while the
// core is focused. A sentence has no top line: its toolbar takes a row of its own while it shows.
function topLine(header: ParentContent['header'] | undefined, toolbar: ReactNode) {
  return header?.kind === 'word'
    ? <p className="entry-heading">
      <span className="entry-heading-text" aria-label={`${header.language}, ${header.key}${header.romanization ? `, ${header.romanization}` : ''} (not editable)`}>
        <span className="entry-language">{header.language}</span><span className="entry-key">{header.key}</span>
        {header.romanization && <span className="entry-pronunciation">{header.romanization}</span>}
      </span>
      {toolbar}
    </p>
    : toolbar && <p className="entry-heading entry-heading-tools">{toolbar}</p>;
}

// The core edited on its own (D10, amended), in its place: its top line with
// the toolbar, its text, then its Save and Cancel (`children`).
export function CoreEditor({ title, fields, header, locked, persist, redraw, children }: {
  title: string; fields: FieldDraft; header: ParentContent['header']; locked: boolean; persist: () => void; redraw: () => void; children: ReactNode;
}) {
  const changed = useTyped(fields, persist, redraw);
  return <PartEditor className="live-core core-editing" value={fields.core} editable={!locked} autofocus reading={header.kind === 'sentence'}
    label={`${header.kind === 'sentence' ? 'Translation' : 'Meanings'}, ${title}`}
    onChange={markdown => { fields.core = markdown; changed(); }} head={toolbar => topLine(header, toolbar)} after={children} />;
}

export function LiveEditor({ parent, title, fields, opened, locked, persist, redraw }: {
  parent: ParentType; title: string; fields: FieldDraft; opened: ParentContent | null; locked: boolean; persist: () => void; redraw: () => void;
}) {
  const changed = useTyped(fields, persist, redraw);
  const header = opened?.header;
  const coreLabel = `${header?.kind === 'sentence' ? 'Translation' : 'Meanings'}, ${title}`;
  return <div className="entry-content live-editor" role="group" aria-label={`Edit ${title}`}>
    <PartEditor className="live-core" value={fields.core} editable={!locked} label={coreLabel} reading={header?.kind === 'sentence'}
      onChange={markdown => { fields.core = markdown; changed(); }} head={toolbar => topLine(header, toolbar)} />
    {facetsOf(parent).filter(facet => fields.facets[facet] !== undefined).map((facet: FacetType) =>
      <PartEditor key={facet} className="facet" data-facet={facet} data-unfilled={!hasText(fields.facets[facet]) || undefined}
        value={fields.facets[facet] ?? ''} editable={!locked} label={`${facetLabel(parent, facet)}, ${title}`}
        onChange={markdown => { fields.facets[facet] = markdown; changed(); }}
        head={toolbar => <h3 className="facet-title"><FacetTab parent={parent} facet={facet} />{toolbar}</h3>} />)}
  </div>;
}
