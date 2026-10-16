import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Component, GenerationTarget, ModuleInstance, Page } from '@vocabularium/contracts';
import { CATALOG, isContentType, isModuleType } from '@vocabularium/domain/page-modules';
import { blockText, mainKeyOf } from '@vocabularium/domain/pages';
import { emphasise, renderContent, renderParent } from '@vocabularium/domain/render';
import type { Rendered } from '@vocabularium/domain/render';
import type { MdBlock, MdInline } from '@vocabularium/domain/markdown';
import { parentContentOf } from '@vocabularium/domain/content';
import type { ParentContent } from '@vocabularium/domain/content';
import { hasText } from '@vocabularium/domain/markdown';
import { LiveEditor } from './live-editor.tsx';
import { facetLabel, isFacetOf, isParentType } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import type { FieldDraft, PageEditorDraft } from '../types/editor-drafts.js';
import { FacetTags, FOLD_MS } from './facet-tags.tsx';
import type { TagLayout } from './facet-tags.tsx';
import { FamilyIcon } from './families.tsx';
import { mainKeyTier } from './main-key.ts';
import { AT_THE_END, moduleLabel, numbered, ShapingArea, SixDots } from './shaping.tsx';
import type { RowParts } from './shaping.tsx';

// Icons for a card's actions, drawn like the family icons: 24px grid, 2.2 stroke.
const ACTION_ICONS = {
  edit: <><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  retry: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  delete: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M18 7l-1 13H7L6 7" /></>,
  fold: <><path d="M7 20l5-5 5 5" /><path d="M7 4l5 5 5-5" /></>,
  unfold: <><path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" /></>
} as const;
export const ActionIcon = ({ name }: { name: keyof typeof ACTION_ICONS }) => <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true"
  fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ACTION_ICONS[name]}</svg>;

// The comet that runs round a generating card's tab: its head, then a fading
// trail. When the work ends it keeps running a moment while it fades away.
const SPARK_TRAIL = Array.from({ length: 16 }, (_, index) => index);
const SPARK_FADE_MS = 600;
function Spark({ active }: { active: boolean }) {
  const [shown, setShown] = useState(active);
  useEffect(() => {
    if (active) { setShown(true); return; }
    const timer = setTimeout(() => setShown(false), SPARK_FADE_MS);
    return () => clearTimeout(timer);
  }, [active]);
  if (!active && !shown) return null;
  return <span className="spark" aria-hidden="true" data-ending={!active || undefined}>
    {SPARK_TRAIL.map(index => <i key={index} style={{ '--n': index } as CSSProperties} />)}
  </span>;
}

// A deleted card pops where it stands, like a bubble, before it goes (0.6.3).
const POOF_MS = 240;

// The six-dot menu on each card; its entries are placeholders (0.6.3).
const COMPONENT_MENU = ['Duplicate', 'Copy text', 'Move to page…'] as const;

type Deck = { id: string; name: string; modules: ModuleInstance[] };
type Props = {
  page?: Page;
  deck?: Deck;
  draft?: PageEditorDraft;
  isNew: boolean;
  editing: boolean;
  busy: boolean;
  error?: string;
  pendingSaves: Array<{ operationId: string }>;
  retryPendingSave: (operationId: string) => Promise<void>;
  navigate: (hash: string) => void;
  begin: (componentId: string) => void;
  persist: () => void;
  redraw: () => void;
  save: () => Promise<boolean>;
  cancel: () => Promise<void>;
  discardUnavailable: () => Promise<void>;
  deletePage: () => Promise<void>;
  generate: (target: GenerationTarget, confirmed?: boolean) => Promise<void>;
  addModule: (type: string, position?: number) => Promise<boolean>;
  moveComponent: (componentId: string, position: number) => Promise<boolean>;
  deleteComponent: (component: Component) => Promise<boolean | void>;
  addFacet: (componentId: string, parent: ParentType, facet: FacetType) => Promise<boolean>;
  deleteFacet: (componentId: string, parent: ParentType, facet: FacetType) => Promise<boolean>;
};

// `error` is shown inside the empty field, in place of its text, until the
// user types; screen readers hear it once.
function TextField({ id, labelText, value, readOnly, multiline = true, error, onChange }:
  { id: string; labelText: string; value: string; readOnly: boolean; multiline?: boolean; error?: string; onChange: (value: string) => void }) {
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { if (error) field.current?.focus(); }, [error]);
  const props = { id, ref: field, defaultValue: value, readOnly, placeholder: error, 'aria-invalid': error ? true : undefined,
    className: error ? 'field-error' : undefined, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
  return <div className="component-field">
    <label htmlFor={id}>{labelText}</label>
    {multiline ? <textarea rows={6} {...props} /> : <input {...props} />}
    {error && <span className="visually-hidden" role="alert">{error}</span>}
  </div>;
}

// A new page starts with the deck's modules: the user fills the main key and
// any Context and Text; content modules wait until generated.
function NewPageEditor({ draft, deck, busy, persist, save, cancel }: Pick<Props, 'persist' | 'save' | 'cancel' | 'busy'> & { draft: PageEditorDraft; deck: Deck }) {
  const locked = busy || Boolean(draft.pending && !draft.errorCode);
  const inputs = deck.modules.filter(module => module.type === 'context' || module.type === 'text');
  const content = deck.modules.filter(module => isContentType(module.type));
  return <section className="page-components">
    <TextField id="main-key" labelText="Main key" value={draft.mainKey ?? ''} readOnly={locked} multiline={false} error={draft.fieldError}
      onChange={value => { draft.mainKey = value; persist(); }} />
    {inputs.map(module => <TextField key={module.id} id={`input-${module.id}`} value={draft.inputs?.[module.id] ?? ''} readOnly={locked}
      labelText={module.type === 'context' ? 'Context (optional)' : moduleLabel(module.type)}
      onChange={value => { draft.inputs = { ...draft.inputs, [module.id]: value }; persist(); }} />)}
    {content.length > 0 && <p className="muted">Saving does not generate. The page also gets {content.map(module => moduleLabel(module.type)).join(', ')}; use Generate missing after saving to fill them from the main key.</p>}
    <div className="dialog-actions">
      <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
      <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
    </div>
    {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
  </section>;
}

// One facet's content (D08): examples beside their translations, or its lines.
// Markdown as the domain reads it (D09, amended): paragraphs, lists, bold,
// italic, inline code and highlight, drawn as elements, never as HTML. The
// main key is emphasised wherever it occurs in the text.
function Inline({ runs, mainKey }: { runs: readonly MdInline[]; mainKey: string }) {
  return <>{runs.map((run, index) => {
    if (run.type === 'text') return <Fragment key={index}>{emphasise(run.text, mainKey).map((part, at) => part.key ? <mark key={at}>{part.text}</mark> : part.text)}</Fragment>;
    if (run.type === 'break') return <br key={index} />;
    if (run.type === 'code') return <code key={index}>{run.text}</code>;
    const children = <Inline runs={run.children} mainKey={mainKey} />;
    return run.type === 'strong' ? <strong key={index}>{children}</strong> : run.type === 'em' ? <em key={index}>{children}</em>
      : <mark key={index} className="md-highlight">{children}</mark>;
  })}</>;
}
export function Markdown({ blocks, mainKey, className }: { blocks: readonly MdBlock[]; mainKey: string; className?: string }) {
  return <div className={`md${className ? ` ${className}` : ''}`}>{blocks.map((block, index) => block.type === 'paragraph'
    ? <p key={index}><Inline runs={block.children} mainKey={mainKey} /></p>
    : block.ordered
      ? <ol key={index} start={block.start}>{block.items.map((item, at) =>
        <li key={at} data-number={block.start + at}><span><Inline runs={item} mainKey={mainKey} /></span></li>)}</ol>
      : <ul key={index}>{block.items.map((item, at) => <li key={at}><Inline runs={item} mainKey={mainKey} /></li>)}</ul>)}</div>;
}

// A facet's Retry and Delete beside its label (0.7.3): each at once when the
// facet has nothing in it, otherwise after "Are you sure?" in the same row,
// like a card's Retry and Delete. Its tag's remove asks here too (0.7.1).
// Retry regenerates the facet alone; its parent's core and other facets stay.
type FacetAsk = 'delete' | 'retry';
function FacetActions({ name, hasContent, canRetry, disabled, asking, setAsking, onDelete, onRetry }: {
  name: string; hasContent: boolean; canRetry: boolean; disabled: boolean; asking: FacetAsk | null; setAsking: (value: FacetAsk | null) => void;
  onDelete: () => void; onRetry: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (asking) cancel.current?.focus(); }, [asking]);
  if (!asking) return <span className="facet-actions">
    {canRetry && <button type="button" className="facet-retry" aria-label={`Retry ${name}`} disabled={disabled}
      onClick={() => hasContent ? setAsking('retry') : onRetry()}><ActionIcon name="retry" /></button>}
    <button type="button" className="facet-delete" aria-label={`Delete ${name}`} disabled={disabled}
      onClick={() => hasContent ? setAsking('delete') : onDelete()}><ActionIcon name="delete" /></button>
  </span>;
  // The card's question mirrored (0.7.3): it springs out leftwards from the
  // row's end, and Cancel comes last, under the pointer that asked.
  const verb = asking === 'delete' ? 'Delete' : 'Retry';
  return <span className="facet-confirm" data-confirm={asking} role="group" aria-label={`${verb} ${name}?`}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setAsking(null); } }}>
    <span className="confirm-text" style={{ '--i': 2 } as CSSProperties}>Are you sure?</span>
    <button type="button" className="action-confirm" style={{ '--i': 1 } as CSSProperties} aria-label={`Yes, ${verb.toLowerCase()} ${name}`}
      onClick={() => { setAsking(null); if (asking === 'delete') onDelete(); else onRetry(); }}>{verb}</button>
    <button type="button" ref={cancel} style={{ '--i': 0 } as CSSProperties} aria-label={`Keep ${name}`} onClick={() => setAsking(null)}>Cancel</button>
  </span>;
}

// What a parent card's facets need to be retried or deleted, the facet asking
// "Are you sure?", and the facet regenerating on its own or whose Retry failed.
type FacetControls = { title: string; disabled: boolean; onDelete: (facet: FacetType) => void; onRetry: (facet: FacetType) => void;
  asking: { facet: FacetType; kind: FacetAsk } | null; setAsking: (facet: FacetType | null, kind?: FacetAsk) => void;
  retrying?: string; failed?: string };

// A component's content for reading: a parent's structured data (D09), drawn
// as its text once was, or plain text; and whether there is any.
export function readContent(type: string, content: Component['content']): { rendered: Rendered; present: boolean } {
  const data = isParentType(type) ? parentContentOf(content) : null;
  if (data) return { rendered: renderParent(type as ParentType, data), present: true };
  const text = blockText(content);
  return { rendered: renderContent(type, text), present: Boolean(text) };
}

// Generated content as its parent's render contract describes (D08): the core,
// then each facet with content under its label, in the parent's order. A facet
// waiting for Retry is only its tag (0.7.4). Anything else, and the user's own text, is plain text with its line breaks.
export function Content({ type, rendered, mainKey, controls }: {
  type: string; rendered: Rendered; mainKey: string; controls?: FacetControls;
}) {
  const parent = isParentType(type) ? type : null;
  // A facet's own Retry needs content that follows the parent's layout.
  const canRetry = rendered.kind === 'parent';
  const facetHead = (facet: FacetType) => parent && <h3 className="facet-title">
    <span>{facetLabel(parent, facet)}</span>
    {controls?.retrying === facet ? <span className="facet-note" data-note="generating">Generating…</span>
      : controls?.failed === facet && <span className="facet-note" data-note="failed">Retry failed</span>}
    {controls && <FacetActions name={`${facetLabel(parent, facet)} from ${controls.title}`} hasContent canRetry={canRetry}
      disabled={controls.disabled} asking={controls.asking?.facet === facet ? controls.asking.kind : null}
      setAsking={kind => controls.setAsking(kind ? facet : null, kind ?? undefined)}
      onDelete={() => controls.onDelete(facet)} onRetry={() => controls.onRetry(facet)} />}
  </h3>;
  const section = (facet: string) => ({ className: 'facet', 'data-facet': facet, tabIndex: -1,
    'data-retrying': controls?.retrying === facet || undefined, 'aria-busy': controls?.retrying === facet || undefined });
  if (rendered.kind === 'plain') return rendered.text ? <pre>{rendered.text}</pre> : null;
  const { heading, core, facets } = rendered;
  // The core's top line, then its markdown; each facet's markdown in its container (D09).
  return <div className="entry-content">
    {heading && <p className="entry-heading">
      <span className="entry-language">{heading.language}</span>
      <span className="entry-key">{heading.key}</span>
      {heading.pronunciation && <span className="entry-pronunciation">{heading.pronunciation}</span>}
    </p>}
    {core.length > 0 && <Markdown blocks={core} mainKey={mainKey} className={heading ? 'entry-core' : 'entry-core reading'} />}
    {facets.map(facet => <section key={facet.facet} {...section(facet.facet)}>
      {facetHead(facet.facet)}
      <Markdown blocks={facet.body} mainKey={mainKey} className="facet-body" />
    </section>)}
  </div>;
}

// A live-editor draft as plain lines, shown when its page or card is gone meanwhile.
const draftText = (fields: FieldDraft): string => [fields.core, ...Object.values(fields.facets)].filter(text => hasText(text)).join('\n\n');

function ComponentBody({ item, title, editable, draft, locked, persist, redraw, mainKey, controls }: {
  item: Component; title: string; editable: boolean; draft?: PageEditorDraft; locked: boolean; persist: () => void; redraw: () => void; mainKey: string; controls?: FacetControls;
}) {
  // A parent in its live editor (D09), drawn from the content it opened with:
  // the card may be regenerating meanwhile.
  const fields = draft?.fields?.[item.id];
  if (editable && fields && isParentType(item.moduleType)) return <>
    <LiveEditor parent={item.moduleType} title={title} fields={fields} redraw={redraw} persist={persist}
      opened={(draft?.fieldStored?.[item.id] as ParentContent | undefined) ?? parentContentOf(item.content)} locked={locked || item.status === 'loading'} />
    {item.status === 'loading' && <p className="notice">This component is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
  </>;
  if (editable && draft) return <>
    <TextField id={`component-${item.id}`} labelText={`Edit ${title}`} value={draft.texts[item.id]}
      error={item.moduleType === 'main-key' ? draft.fieldError : undefined}
      readOnly={locked || item.status === 'loading'} multiline={item.moduleType !== 'main-key' || mainKeyTier(draft.texts[item.id]) === 'passage'}
      onChange={value => { draft.texts[item.id] = value; persist(); }} />
    {item.status === 'loading' && <p className="notice">This component is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
  </>;
  const { rendered, present } = readContent(item.moduleType, item.content);
  return present ? <Content type={item.moduleType} rendered={rendered} mainKey={mainKey} controls={controls} /> : null;
}

// Motion (D05): when a component finishes generating while the page is open,
// its content rises into the card line by line, and screen readers hear how
// the attempt ended.
// A facet's own Retry (0.7.3) is announced by the facet's name, and only its
// section lights up, as when its tag shows it.
function Reveal({ status, title, facet, failedFacet, children }: {
  status: string | null; title: string; facet?: { id: string; name: string }; failedFacet?: string; children: ReactNode;
}) {
  const previous = useRef(status);
  const retried = useRef(facet);
  const body = useRef<HTMLDivElement>(null);
  const [revealing, setRevealing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const ended = previous.current === 'loading' && status !== 'loading';
    const was = retried.current;
    previous.current = status; retried.current = facet;
    if (status === 'loading') setAnnouncement('');
    if (!ended) return;
    if (was) {
      const failed = failedFacet === was.id;
      setAnnouncement(failed ? `${title}: ${was.name} failed to generate.` : `${title}: ${was.name} generated.`);
      const section = body.current?.querySelector<HTMLElement>(`.facet[data-facet="${CSS.escape(was.id)}"]`);
      if (!section || failed) return;
      section.dataset.shown = '';
      const timer = setTimeout(() => { delete section.dataset.shown; }, 1200);
      return () => clearTimeout(timer);
    }
    setAnnouncement(status === 'failed' ? `${title}: generation failed.` : `${title} generated.`);
    if (status !== 'completed') return;
    setRevealing(true);
    const timer = setTimeout(() => setRevealing(false), 1200);
    return () => clearTimeout(timer);
  }, [status, title, facet, failedFacet]);
  return <div ref={body} className="card-body" data-reveal={revealing || undefined}>
    {children}
    <span className="visually-hidden" role="status">{announcement}</span>
  </div>;
}

// Under the title, how the latest run read the main key (D08): as a word or
// as a sentence. It names no language and cannot be changed directly.
function Interpretation({ value }: { value: Page['interpretation'] }) {
  if (!value) return null;
  return <p className="interpretation" data-interpretation={value}>Read as a {value === 'sentence' ? 'sentence' : 'word'}</p>;
}

// The page title: the main key in its tier; a passage is cut after six lines.
export function MainKeyTitle({ text }: { text: string }) {
  const tier = mainKeyTier(text);
  const title = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const node = title.current;
    if (!node || tier !== 'passage') { setOverflows(false); return; }
    const measure = () => setOverflows(expanded || node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, tier, expanded]);
  return <>
    <h1 ref={title} className="main-key" data-tier={tier} data-expanded={expanded || undefined}>{text}</h1>
    {overflows && <button className="show-all" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show all'}</button>}
  </>;
}

// Deleting or retrying a component that has content asks first, ejected from
// the tab like its actions (0.6.3): the final Delete or Retry and Cancel, then
// the question. Cancel lands where the button just clicked was, under the
// pointer, so a second click does not act; the final button stands to its left.
function ConfirmAction({ kind, title, offset, onConfirm, onCancel }: {
  kind: 'delete' | 'retry'; title: string; offset: number; onConfirm: () => void; onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    setInset(Math.max(0, offset - (confirm.current?.offsetWidth ?? 0) - 4));
    cancel.current?.focus();
  }, [offset]);
  const questionId = `confirm-${title.replace(/\W+/g, '-')}`;
  const verb = kind === 'delete' ? 'Delete' : 'Retry';
  return <div className="card-actions" role="group" aria-label={`${verb} ${title}?`} aria-describedby={questionId} data-open data-confirm={kind}
    style={{ paddingLeft: inset }}>
    <button ref={confirm} style={{ '--i': 0 } as CSSProperties} className="action-confirm" aria-label={`Yes, ${verb.toLowerCase()} ${title}`} onClick={onConfirm}>
      <ActionIcon name={kind} />{verb}</button>
    <button ref={cancel} style={{ '--i': 1 } as CSSProperties} aria-label={`Keep ${title}`} onClick={onCancel}>Cancel</button>
    <span id={questionId} className="confirm-text" style={{ '--i': 2 } as CSSProperties}>Are you sure?</span>
  </div>;
}

// A module from the window, shown where it would land on the page: built
// like the empty card it will become, so the card that arrives takes its
// place unchanged. It is only a picture; the row says what is happening.
export function LandingCard({ type }: { type: string }) {
  const family = isModuleType(type) ? CATALOG[type].family ?? 'notes' : 'notes';
  return <article className={`component fam-${family}`} data-empty data-landing data-type={type} aria-hidden="true">
    <div className="card-head"><div className="card-tab">
      <span className="row-menu"><span className="menu-button"><SixDots /></span></span>
      <h2><span className="tab-button"><FamilyIcon family={family} /><span className="tab-label">{moduleLabel(type)}</span></span></h2>
    </div></div>
  </article>;
}

function readFolded(key: string | null): ReadonlySet<string> {
  try {
    const saved: unknown = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : [];
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function PageView({ page, deck, draft, isNew, editing, busy, error, pendingSaves, retryPendingSave,
  navigate, begin, persist, redraw, save, cancel, discardUnavailable, deletePage, generate, addModule, moveComponent, deleteComponent, addFacet, deleteFacet }: Props) {
  const [working, setWorking] = useState(false);
  // The card whose tab has ejected its actions; one at a time.
  const [opened, setOpened] = useState<string | null>(null);
  // Cards popping away: a deleted card pops where it stands first, then goes;
  // under reduced motion it goes at once, and a failed delete brings it back.
  const [vanishing, setVanishing] = useState<ReadonlySet<string>>(new Set());
  const vanish = (item: Component) => {
    const remove = () => void run(async () => { await deleteComponent(item); });
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { remove(); return; }
    setVanishing(current => new Set(current).add(item.id));
    setTimeout(() => {
      void run(async () => { try { await deleteComponent(item); } finally {
        setVanishing(current => { const next = new Set(current); next.delete(item.id); return next; });
      } });
    }, POOF_MS);
  };
  // The facet asking "Are you sure?" before it is deleted, on which card.
  const [askingFacet, setAskingFacet] = useState<{ id: string; facet: FacetType; kind: FacetAsk } | null>(null);
  // A tag shows its facet's section: the card unfolds first, then the section
  // scrolls into view and takes the focus (0.7.1).
  const showFacet = (item: Component, facet: FacetType, then?: () => void) => {
    const wasFolded = folded.has(item.id);
    if (wasFolded) fold(item.id, false);
    setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`[data-component-id="${CSS.escape(item.id)}"]`);
      const section = card?.querySelector<HTMLElement>(`.facet[data-facet="${CSS.escape(facet)}"]`) ?? card;
      const instant = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      section?.scrollIntoView({ block: 'center', behavior: instant ? 'auto' : 'smooth' });
      if (section?.classList.contains('facet')) { section.focus({ preventScroll: true }); section.dataset.shown = ''; setTimeout(() => { delete section.dataset.shown; }, 1200); }
      then?.();
    }, wasFolded ? FOLD_MS : 0);
  };
  // The card asking whether to delete, and where its Delete stood in the row.
  const [confirming, setConfirming] = useState<{ id: string; offset: number; kind: 'delete' | 'retry' } | null>(null);
  useEffect(() => { if (opened !== confirming?.id) setConfirming(null); }, [opened]);
  // Folded cards show only their tab on a slim band; remembered per page in
  // this browser, a convenience that never reaches the account (0.6.3).
  const foldKey = page ? `folded-${page.id}` : null;
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => readFolded(foldKey));
  useEffect(() => { setFolded(readFolded(foldKey)); }, [foldKey]);
  const fold = (id: string, value: boolean) => {
    const next = new Set(folded);
    if (value) next.add(id); else next.delete(id);
    setFolded(next);
    try { if (foldKey) localStorage.setItem(foldKey, JSON.stringify([...next])); } catch { /* Remembering is a convenience. */ }
  };
  useEffect(() => {
    if (!opened) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.(`[data-component-id="${CSS.escape(opened)}"] .card-head`)) setOpened(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [opened]);
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    try { await action(); } finally { setWorking(false); }
  };
  const notice = error && error !== draft?.error && <p className="notice error" role="alert">{error}</p>;
  if (!deck || (!page && !isNew)) return <>
    {notice}
    <h1>Page unavailable</h1>
    <p>This page or deck has been deleted.</p>
    {draft && <>
      <p className="notice">Your unsaved text is still here. Copy anything you want to keep before discarding it.</p>
      {[draft.mainKey, ...Object.values(draft.inputs ?? {}), ...Object.values(draft.texts), ...Object.values(draft.fields ?? {}).map(draftText)].filter(Boolean).map((text, index) => <pre key={index}>{text}</pre>)}
      <button onClick={() => void discardUnavailable()}>Discard draft</button>
    </>}
  </>;
  const back = <button className="back" onClick={() => navigate(`deck/${deck.id}`)}>← {deck.name}</button>;
  if (isNew || !page) return <>
    {notice}{back}
    <h1>A new page.</h1>
    {draft && <NewPageEditor draft={draft} deck={deck} busy={busy} persist={persist} save={save} cancel={cancel} />}
  </>;

  const [key, ...rest] = page.components;
  const locked = busy || Boolean(draft?.pending && !draft.errorCode);
  const editingId = editing ? draft?.componentId : undefined;
  // Shaping waits while a card is being edited; its Save and Cancel are right there.
  const disabled = Boolean(editingId) || busy;
  const known = new Set(page.components.map(item => item.id));
  const lost = editing && draft ? [...Object.keys(draft.texts), ...Object.keys(draft.fields ?? {})].filter(id => !known.has(id)) : [];
  const items = numbered(rest.map(item => ({ id: item.id, type: item.moduleType, label: moduleLabel(item.moduleType), component: item,
    holder: { id: item.id, type: item.moduleType, facets: item.facets, status: item.status } })));

  const mainKey = mainKeyOf(page.components);
  // A card's actions are ejected from its tab when the tab is clicked (D07);
  // a failed card keeps its Retry beside the tab. Choosing one closes them.
  const actions = (item: Component, title: string) => {
    const generated = isContentType(item.moduleType);
    const open = opened === item.id;
    if (!open && !(item.status === 'failed' && generated)) return null;
    if (open && confirming?.id === item.id) return <ConfirmAction kind={confirming.kind} title={title} offset={confirming.offset}
      onCancel={() => setConfirming(null)}
      onConfirm={() => {
        const kind = confirming.kind;
        setConfirming(null); setOpened(null);
        if (kind === 'delete') vanish(item);
        else void run(() => generate({ scope: 'component', componentId: item.id }, true));
      }} />;
    // Where a clicked button stands within the row, transforms aside: offsetLeft counts from the card's head.
    const ask = (kind: 'delete' | 'retry') => (event: { currentTarget: HTMLButtonElement }) => {
      const button = event.currentTarget;
      setConfirming({ id: item.id, kind, offset: button.offsetLeft - (button.parentElement?.offsetLeft ?? 0) });
    };
    // A component with nothing in it has nothing to lose: Delete and Retry act at once.
    const hasContent = readContent(item.moduleType, item.content).present;
    // An empty component is already only its tab: there is nothing to fold.
    const foldable = hasContent || item.status === 'failed';
    const isFolded = folded.has(item.id);
    const choose = (action: () => void) => () => { setOpened(null); action(); };
    let index = 0;
    const order = () => ({ '--i': index++ }) as CSSProperties;
    return <div id={`actions-${item.id}`} className="card-actions" role="group" aria-label={`${title} actions`} data-open={open || undefined}>
      {/* A parent is edited in its live editor once it has content (D09); Retry fills it first. */}
      {open && <button style={order()} aria-label={`Edit ${title}`} disabled={Boolean(editingId) || item.status === 'loading' || (isParentType(item.moduleType) && !parentContentOf(item.content))}
        onClick={choose(() => { if (isFolded) fold(item.id, false); begin(item.id); })}>
        <ActionIcon name="edit" />Edit</button>}
      {generated && <button style={order()} className={item.status === 'failed' ? 'action-failed' : undefined} aria-label={`Retry ${title}`}
        disabled={working || Boolean(editingId) || item.status === 'loading'}
        onClick={hasContent && open ? ask('retry') : choose(() => void run(() => generate({ scope: 'component', componentId: item.id })))}>
        <ActionIcon name="retry" />Retry</button>}
      {open && foldable && <button style={order()} aria-label={`${isFolded ? 'Unfold' : 'Fold'} ${title}`} onClick={choose(() => fold(item.id, !isFolded))}>
        <ActionIcon name={isFolded ? 'unfold' : 'fold'} />{isFolded ? 'Unfold' : 'Fold'}</button>}
      {open && <button style={order()} className="action-delete" aria-label={`Delete ${title}`} disabled={disabled || working || item.status === 'loading'}
        onClick={hasContent ? ask('delete') : choose(() => vanish(item))}>
        <ActionIcon name="delete" />Delete</button>}
    </div>;
  };
  const editor = (item: Component, title: string) => editingId === item.id && draft && <>
    <ComponentBody item={item} title={title} editable draft={draft} locked={locked} persist={persist} redraw={redraw} mainKey={mainKey} />
    <div className="component-tools">
      <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
      <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
    </div>
    {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
  </>;

  // One card: its index tab (menu, then the family and label, which drags the
  // card and, clicked, ejects its actions beside it), its status only while
  // unfinished, and its content. An empty component is only its tab. Editing
  // is one card at a time; Save and Cancel live in that card.
  const card = (item: Component, title: string, { drag, menu, ghost }: RowParts) => {
    const family = isModuleType(item.moduleType) ? CATALOG[item.moduleType].family ?? 'notes' : 'notes';
    const read = readContent(item.moduleType, item.content);
    const empty = !read.present && item.status !== 'loading' && item.status !== 'failed' && editingId !== item.id;
    const removeFacet = (facet: FacetType) => void run(async () => { await deleteFacet(item.id, item.moduleType as ParentType, facet); });
    // Confirmed in its row when the facet has content, as a card's Retry is beside its tab.
    const retryFacet = (facet: FacetType) => void run(() => generate({ scope: 'facet', componentId: item.id, facet }, true));
    const controls: FacetControls | undefined = isParentType(item.moduleType) ? { title, disabled: disabled || working || item.status === 'loading',
      onDelete: removeFacet, onRetry: retryFacet, asking: askingFacet?.id === item.id ? askingFacet : null,
      setAsking: (facet, kind = 'delete') => setAskingFacet(facet ? { id: item.id, facet, kind } : null),
      retrying: item.retryingFacet, failed: item.failedFacet } : undefined;
    // While it generates, a card is only its tab, with a spark running round
    // its edge; its content opens once there is some (0.6.3). A facet
    // regenerating on its own keeps the card open (0.7.3).
    const generating = item.status === 'loading' && !item.retryingFacet && editingId !== item.id;
    const isFolded = !empty && !generating && folded.has(item.id) && editingId !== item.id;
    const gone = vanishing.has(item.id);
    // The parent's facets as tags on the card's edge, or hung from its tab while it is only its tab (0.7.1).
    const layout: TagLayout = empty || generating ? 'hanging' : isFolded ? 'folded' : 'edge';
    // A ghost of a facet picked up in the window counts as a tag, so the card makes room for it (0.7.2).
    const tagCount = (item.facets?.length ?? 0) + (ghost && !item.facets?.includes(ghost.facet) ? 1 : 0);
    const tagged = Boolean(controls && tagCount);
    // Which facets have content: none on a card that is only its tab; on
    // content outside the parent's layout, the sections cannot be told apart,
    // so no tag is marked.
    const { rendered } = read;
    // While it is edited, a tag shows whether its facet has text in the draft (D09).
    const fieldDraft = editingId === item.id ? draft?.fields?.[item.id] : undefined;
    const filled = fieldDraft ? Object.entries(fieldDraft.facets).filter(([, text]) => hasText(text)).map(([facet]) => facet)
      : generating || !read.present ? [] : rendered.kind === 'parent' ? rendered.facets.map(each => each.facet) : undefined;
    const tags = controls ? <FacetTags holderId={item.id} parent={item.moduleType as ParentType} facets={item.facets ?? []} filled={filled}
      layout={layout} title={title} disabled={controls.disabled} ghost={ghost}
      // On an open card's edge a tag pulls out to its own Retry, which asks nothing (0.7.4).
      onRetry={layout === 'edge' && rendered.kind === 'parent' && editingId !== item.id ? retryFacet : undefined}
      retrying={item.retryingFacet} failed={item.failedFacet}
      onRemove={facet => {
        // A facet with content asks first, in its section; one waiting for Retry goes at once.
        const hasContent = rendered.kind === 'parent' && rendered.facets.some(each => each.facet === facet);
        if (hasContent && layout !== 'hanging') showFacet(item, facet, () => setAskingFacet({ id: item.id, facet, kind: 'delete' }));
        else removeFacet(facet);
      }} /> : null;
    return <article className={`component fam-${family}`} data-empty={empty || undefined} data-generating={generating || undefined}
      data-folded={isFolded || undefined} data-vanishing={gone || undefined} data-tagged={tagged ? layout : undefined}
      style={tagged ? { '--tags': tagCount } as CSSProperties : undefined}
      data-component-id={item.id} data-type={item.moduleType} data-status={item.status ?? undefined} data-editing={editingId === item.id || undefined}>
      <div className="card-head" onKeyDown={event => {
        if (event.key !== 'Escape' || opened !== item.id) return;
        setOpened(null);
        (event.currentTarget.querySelector('.tab-button') as HTMLElement | null)?.focus();
      }}>
        <div className="card-tab">
          {menu}
          <h2><button type="button" className="tab-button" {...drag} aria-disabled={undefined}
            aria-expanded={opened === item.id} aria-controls={opened === item.id ? `actions-${item.id}` : undefined}
            onClick={() => setOpened(opened === item.id ? null : item.id)}>
            <FamilyIcon family={family} />
            <span className="tab-label">{title}</span>
          </button></h2>
          <Spark active={generating} />
          {generating && <span className="visually-hidden" role="status">{title}: generating</span>}
        </div>
        {editingId !== item.id && actions(item, title)}
      </div>
      {!empty && <div className="card-fold"><div className="card-fold-inner" inert={isFolded || undefined}>
        {item.status === 'failed' && <p className="card-status"><span className="list-status" data-status="failed">Generation failed</span></p>}
        {editor(item, title) || <Reveal status={item.status} title={title} failedFacet={item.failedFacet}
          facet={item.retryingFacet && isParentType(item.moduleType) && isFacetOf(item.moduleType, item.retryingFacet)
            ? { id: item.retryingFacet, name: facetLabel(item.moduleType, item.retryingFacet) } : undefined}><ComponentBody item={item} title={title} editable={false} draft={draft} locked={locked} redraw={redraw} persist={persist} mainKey={mainKey} controls={controls} /></Reveal>}
      </div></div>}
      {tags}
    </article>;
  };

  return <>
    {notice}{back}
    <div className="page-header" data-component-id={key.id} data-type="main-key" data-editing={editingId === key.id || undefined}>
      <div className="page-title">
        {editingId === key.id ? editor(key, 'Main key') : <><MainKeyTitle text={mainKey} /><Interpretation value={page.interpretation} /></>}
      </div>
      <div className="title-actions">
        {editingId !== key.id && <button className="title-edit" aria-label="Edit Main key" disabled={Boolean(editingId)} onClick={() => begin(key.id)}>Edit</button>}
        <button disabled={busy || Boolean(editingId)} onClick={() => void deletePage()}>Delete page</button>
      </div>
    </div>
    <ShapingArea items={items} types={page.components.map(item => item.moduleType)} disabled={disabled}
      label="Components" where="the page"
      // The server appends a module sent without a position, after anything added meanwhile.
      onAdd={(type, index) => addModule(type, index === AT_THE_END ? undefined : index + 1)}
      onMove={(id, index) => moveComponent(id, index + 1)}
      onAddFacet={(id, parent, facet) => addFacet(id, parent, facet)}
      menuItems={COMPONENT_MENU}
      renderLanding={type => <LandingCard type={type} />}
      renderItem={(item, parts) => card(item.component, item.label, parts)} />
    {lost.map(id => <div key={id}>
      <p className="notice">The component you were editing no longer exists. Its unsaved text is preserved below.</p>
      <pre>{draft!.texts[id] ?? draftText(draft!.fields![id]!)}</pre>
      <button onClick={() => void cancel()}>Discard draft</button>
    </div>)}
    {!editingId && pendingSaves.map(item => <div className="notice" key={item.operationId}>
      <p>A change is waiting to be saved to your account.</p>
      <button onClick={() => void retryPendingSave(item.operationId)}>Try saving again</button>
    </div>)}
  </>;
}
