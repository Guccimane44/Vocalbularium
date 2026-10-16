import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import type { ParentContent } from '@vocabularium/domain/content';
import { fromEditorDoc, hasText, toEditorDoc } from '@vocabularium/domain/markdown';
import type { EditorNode } from '@vocabularium/domain/markdown';
import { facetLabel, facetsOf } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import type { FieldDraft } from '../types/editor-drafts.js';
import { FacetTab } from './facet-tags.tsx';

// The live-formatting editor (D09, amended; 0.7.4): a parent card's core and
// each of its facets as one editor each, in place, formatting markdown as the
// user types (**bold**, *italic*, - and 1. lists, `code`, ==highlight==) with
// the characters not staying visible, and Cmd/Ctrl+B and +I. Only the
// supported subset exists in the editor; anything pasted outside it becomes
// plain text. The module's name, the facet names and the core's top line are
// shown, never edited. A facet without content keeps its place with an empty
// editor and a dimmed name. Opening the editor moves the focus nowhere.

// TipTap with only the subset: no headings, quotes, code blocks, rules,
// strikethrough, underline or links, and no blank line added after a list.
const EXTENSIONS = [
  StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false, strike: false, underline: false, link: false, trailingNode: false }),
  Highlight
];

function MarkdownEditor({ value, label, editable, onChange }: {
  value: string; label: string; editable: boolean; onChange: (markdown: string) => void;
}) {
  const changed = useRef(onChange);
  changed.current = onChange;
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: toEditorDoc(value) as never,
    editable,
    immediatelyRender: true,
    editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true', class: 'md md-editor' } },
    onUpdate: ({ editor: current }) => changed.current(fromEditorDoc(current.getJSON() as EditorNode))
  });
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  return <EditorContent editor={editor} className="md-editor-frame" />;
}

export function LiveEditor({ parent, title, fields, opened, locked, persist, redraw }: {
  parent: ParentType; title: string; fields: FieldDraft; opened: ParentContent | null; locked: boolean; persist: () => void; redraw: () => void;
}) {
  // The card redraws only when a facet flips between empty and having text,
  // so its tags and dimmed names follow what is typed.
  const shape = () => JSON.stringify(Object.entries(fields.facets).map(([facet, text]) => [facet, hasText(text)]));
  const typed = useRef(shape());
  const changed = () => { persist(); const now = shape(); if (now !== typed.current) { typed.current = now; redraw(); } };
  const header = opened?.header;
  return <div className="entry-content live-editor" role="group" aria-label={`Edit ${title}`}>
    {header?.kind === 'word' && <p className="entry-heading" aria-label={`${header.language}, ${header.key}${header.romanization ? `, ${header.romanization}` : ''} (not editable)`}>
      <span className="entry-language">{header.language}</span><span className="entry-key">{header.key}</span>
      {header.romanization && <span className="entry-pronunciation">{header.romanization}</span>}
    </p>}
    <MarkdownEditor value={fields.core} editable={!locked} label={`${header?.kind === 'sentence' ? 'Translation' : 'Meanings'}, ${title}`}
      onChange={markdown => { fields.core = markdown; changed(); }} />
    {facetsOf(parent).filter(facet => fields.facets[facet] !== undefined).map((facet: FacetType) =>
      <section key={facet} className="facet" data-facet={facet} data-unfilled={!hasText(fields.facets[facet]) || undefined}>
        <h3 className="facet-title"><FacetTab parent={parent} facet={facet} /></h3>
        <MarkdownEditor value={fields.facets[facet] ?? ''} editable={!locked} label={`${facetLabel(parent, facet)}, ${title}`}
          onChange={markdown => { fields.facets[facet] = markdown; changed(); }} />
      </section>)}
  </div>;
}
