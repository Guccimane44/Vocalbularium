import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Component, GenerationTarget, ModuleInstance, Page } from '@vocabularium/contracts';
import { CATALOG, isContentType, isModuleType } from '@vocabularium/domain/page-modules';
import { blockText, mainKeyOf } from '@vocabularium/domain/pages';
import { renderContent, renderParent } from '@vocabularium/domain/render';
import type { Rendered } from '@vocabularium/domain/render';
import type { MdBlock, MdInline } from '@vocabularium/domain/markdown';
import { parentContentOf } from '@vocabularium/domain/content';
import type { ParentContent } from '@vocabularium/domain/content';
import { hasText } from '@vocabularium/domain/markdown';
import { FacetEditor, LiveEditor, NoteEditor } from './live-editor.tsx';
import { facetsOf, isFacetOf, isParentType } from '@vocabularium/domain/parents';
import { facetName } from './catalog-text.ts';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import type { FieldDraft, PageEditorDraft } from '../types/editor-drafts.js';
import { FacetTab, FacetTags, FOLD_MS } from './facet-tags.tsx';
import type { TagLayout } from './facet-tags.tsx';
import { FacetWindow } from './facet-window.tsx';
import { FamilyIcon } from './families.tsx';
import { mainKeyTier } from './main-key.ts';
import { AT_THE_END, moduleLabel, numbered, ShapingArea, SixDots } from './shaping.tsx';
import type { RowParts } from './shaping.tsx';
import { direction, listFormat, t } from './i18n.ts';

// Icons for a card's actions, drawn like the family icons: 24px grid, 2.2 stroke.
const ACTION_ICONS = {
  edit: <><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  retry: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  delete: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M18 7l-1 13H7L6 7" /></>,
  // A bookmark, as a facet's tag is drawn (0.7.1).
  facet: <path d="M7 4h10v16l-5-3.5L7 20z" />,
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
const componentMenu = () => [t('card.menu.duplicate'), t('card.menu.copyText'), t('card.menu.moveToPage')];

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
  begin: (componentId: string, facet?: string) => void;
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
    {multiline ? <textarea rows={6} dir="auto" {...props} /> : <input dir="auto" {...props} />}
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
    <TextField id="main-key" labelText={t('module.mainKey')} value={draft.mainKey ?? ''} readOnly={locked} multiline={false} error={draft.fieldError}
      onChange={value => { draft.mainKey = value; persist(); }} />
    {inputs.map(module => <TextField key={module.id} id={`input-${module.id}`} value={draft.inputs?.[module.id] ?? ''} readOnly={locked}
      labelText={module.type === 'context' ? t('page.new.contextOptional') : moduleLabel(module.type)}
      onChange={value => { draft.inputs = { ...draft.inputs, [module.id]: value }; persist(); }} />)}
    {content.length > 0 && <p className="muted">{t('page.new.contentHint', { modules: listFormat(content.map(module => moduleLabel(module.type))) })}</p>}
    <div className="dialog-actions">
      <button disabled={busy} onClick={() => void cancel()}>{t('common.cancel')}</button>
      <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? t('common.trySavingAgain') : t('common.save')}</button>
    </div>
    {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
  </section>;
}

// One facet's content (D08): examples beside their translations, or its lines.
// Markdown as the domain reads it (D09, amended): paragraphs, lists, bold,
// italic, inline code and highlight, drawn as elements, never as HTML. The
// main key's yellow is a stored highlight like any other (D10, amended a fourth time).
function Inline({ runs, mainKey }: { runs: readonly MdInline[]; mainKey: string }) {
  return <>{runs.map((run, index) => {
    // The main key's yellow is a stored highlight (D10, amended a fourth time): the card adds none of its own.
    if (run.type === 'text') return <Fragment key={index}>{run.text}</Fragment>;
    if (run.type === 'break') return <br key={index} />;
    if (run.type === 'code') return <code key={index}>{run.text}</code>;
    const children = <Inline runs={run.children} mainKey={mainKey} />;
    // A size and a font the user set (D10, amended again).
    if (run.type === 'span') {
      const className = [run.size && `md-size-${run.size}`, run.font && `md-font-${run.font}`].filter(Boolean).join(' ');
      // A highlight colour (D10, amended a third time) is a highlight, in that colour.
      return run.highlight ? <mark key={index} className={`md-highlight md-highlight-${run.highlight}${className ? ` ${className}` : ''}`}>{children}</mark>
        : <span key={index} className={className}>{children}</span>;
    }
    return run.type === 'strong' ? <strong key={index}>{children}</strong> : run.type === 'em' ? <em key={index}>{children}</em>
      : <mark key={index} className="md-highlight">{children}</mark>;
  })}</>;
}
export function Markdown({ blocks, mainKey, className }: { blocks: readonly MdBlock[]; mainKey: string; className?: string }) {
  // Each block takes the direction of its own text (D14): a German card reads
  // left to right in a right-to-left interface, an Arabic one the other way.
  return <div className={`md${className ? ` ${className}` : ''}`}>{blocks.map((block, index) => block.type === 'paragraph'
    ? <p key={index} dir="auto"><Inline runs={block.children} mainKey={mainKey} /></p>
    : block.ordered
      ? <ol key={index} start={block.start} dir="auto">{block.items.map((item, at) =>
        <li key={at} data-number={block.start + at}><span><Inline runs={item} mainKey={mainKey} /></span></li>)}</ol>
      : <ul key={index} dir="auto">{block.items.map((item, at) => <li key={at}><Inline runs={item} mainKey={mainKey} /></li>)}</ul>)}</div>;
}

// A facet's Edit (0.7.5), Retry and Delete beside its label (0.7.3): Edit
// opens that facet alone in its editor (D10); Retry and Delete act at once
// when the facet has nothing in it, otherwise after "Are you sure?" in the
// same row, like a card's Retry and Delete. Its tag's remove asks here too
// (0.7.1). Retry regenerates the facet alone; its parent's core and other
// facets stay.
type FacetAsk = 'delete' | 'retry';
function FacetActions({ name, hasContent, canRetry, disabled, asking, setAsking, onDelete, onRetry, onEdit }: {
  name: string; hasContent: boolean; canRetry: boolean; disabled: boolean; asking: FacetAsk | null; setAsking: (value: FacetAsk | null) => void;
  // The core has no Delete (D10, amended).
  onDelete?: () => void; onRetry: () => void; onEdit?: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (asking) cancel.current?.focus(); }, [asking]);
  if (!asking) return <span className="facet-actions">
    {onEdit && <button type="button" className="facet-edit" aria-label={t('action.editNamed', { name })} disabled={disabled}
      onClick={onEdit}><ActionIcon name="edit" /></button>}
    {canRetry && <button type="button" className="facet-retry" aria-label={t('action.retryNamed', { name })} disabled={disabled}
      onClick={() => hasContent ? setAsking('retry') : onRetry()}><ActionIcon name="retry" /></button>}
    {onDelete && <button type="button" className="facet-delete" aria-label={t('action.deleteNamed', { name })} disabled={disabled}
      onClick={() => hasContent ? setAsking('delete') : onDelete()}><ActionIcon name="delete" /></button>}
  </span>;
  // The card's question mirrored (0.7.3): it springs out leftwards from the
  // row's end, and Cancel comes last, under the pointer that asked.
  const verb = asking === 'delete' ? t('common.delete') : t('common.retry');
  return <span className="facet-confirm" data-confirm={asking} role="group" aria-label={asking === 'delete' ? t('action.deleteAsk', { name }) : t('action.retryAsk', { name })}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setAsking(null); } }}>
    <span className="confirm-text" style={{ '--i': 2 } as CSSProperties}>{t('common.areYouSure')}</span>
    <button type="button" className="action-confirm" style={{ '--i': 1 } as CSSProperties} aria-label={asking === 'delete' ? t('action.confirmDelete', { name }) : t('action.confirmRetry', { name })}
      onClick={() => { setAsking(null); if (asking === 'delete') onDelete?.(); else onRetry(); }}>{verb}</button>
    <button type="button" ref={cancel} style={{ '--i': 0 } as CSSProperties} aria-label={t('action.keepNamed', { name })} onClick={() => setAsking(null)}>{t('common.cancel')}</button>
  </span>;
}

// What a parent card's facets need to be retried or deleted, the facet asking
// "Are you sure?", and the facet regenerating on its own or whose Retry failed.
type FacetControls = { title: string; disabled: boolean; onDelete: (facet: FacetType) => void; onRetry: (facet: FacetType) => void;
  // The card's facets, each shown with its heading (D10, amended a sixth time).
  facets?: readonly string[];
  // A facet's own Edit (D10), and the facet open in its editor with what to draw there.
  onEdit?: (facet: FacetType) => void; editing?: { facet: string; node: ReactNode };

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
// then each facet with content under its tab, in the parent's order. A facet
// waiting for Retry is only its tag (0.7.4), until its own Retry starts: then
// its section stands in its place, the spark running round its tab. Since
// D10's sixth amendment every facet the card has shows its heading, an empty
// one dimmed, without text, and with its Edit, Retry and Delete. Anything
// else, and the user's own text, is plain text with its line breaks.
export function Content({ type, rendered, mainKey, controls }: {
  type: string; rendered: Rendered; mainKey: string; controls?: FacetControls;
}) {
  // Context and Text as markdown (D10, amended a fourth time), edited from their tab.
  if (rendered.kind === 'note') return <Markdown blocks={rendered.blocks} mainKey={mainKey} className="note-body" />;
  const parent = isParentType(type) ? type : null;
  // A facet's own Retry needs content that follows the parent's layout.
  const canRetry = rendered.kind === 'parent';
  // While the facet generates on its own, the spark runs round its tab (0.7.4).
  const facetHead = (facet: FacetType, hasContent = true) => parent && <h3 className="facet-title">
    <FacetTab parent={parent} facet={facet}><Spark active={controls?.retrying === facet} /></FacetTab>
    {controls?.retrying === facet ? <span className="visually-hidden">{t('status.generatingEllipsis')}</span>
      : controls?.failed === facet && <span className="facet-note" data-note="failed">{t('card.retryFailed')}</span>}
    {controls && <FacetActions name={t('facet.fromCard', { facet: facetName(parent, facet), card: controls.title })} hasContent={hasContent} canRetry={canRetry}
      disabled={controls.disabled} asking={controls.asking?.facet === facet ? controls.asking.kind : null}
      setAsking={kind => controls.setAsking(kind ? facet : null, kind ?? undefined)}
      onDelete={() => controls.onDelete(facet)} onRetry={() => controls.onRetry(facet)}
      onEdit={controls.onEdit && (() => controls.onEdit!(facet))} />}
  </h3>;
  const section = (facet: string) => ({ className: 'facet', 'data-facet': facet, tabIndex: -1,
    'data-retrying': controls?.retrying === facet || undefined, 'aria-busy': controls?.retrying === facet || undefined });
  if (rendered.kind === 'plain') return rendered.text ? <pre dir="auto">{rendered.text}</pre> : null;
  const { heading, core, facets } = rendered;
  // The core's top line, then its markdown; each facet's markdown in its container (D09).
  return <div className="entry-content">
    {heading && <p className="entry-heading" dir="auto">
      {/* An Expertise core names no language (D11). */}
      {heading.language && <span className="entry-language">{heading.language}</span>}
      <span className="entry-key">{heading.key}</span>
      {heading.pronunciation && <span className="entry-pronunciation">{heading.pronunciation}</span>}
    </p>}
    {core.length > 0 && <Markdown blocks={core} mainKey={mainKey} className={heading ? 'entry-core' : 'entry-core reading'} />}
    {parent && facetsOf(parent).map(name => {
      const facet = facets.find(each => each.facet === name);
      // The facet open in its own editor (D10) stands in its place.
      if (controls?.editing?.facet === name) return <Fragment key={name}>{controls.editing.node}</Fragment>;
      if (facet) return <section key={name} {...section(name)}>
        {facetHead(name)}
        <Markdown blocks={facet.body} mainKey={mainKey} className="facet-body" />
      </section>;
      // A facet the card has without content: its heading only, dimmed (D10, amended a sixth time),
      // also while it generates on its own.
      return controls?.retrying === name || controls?.facets?.includes(name)
        ? <section key={name} {...section(name)} data-unfilled data-pending={controls?.retrying === name || undefined}>{facetHead(name, false)}</section> : null;
    })}
  </div>;
}

// A live-editor draft as plain lines, shown when its page or card is gone meanwhile.
const draftText = (fields: FieldDraft): string => [fields.core, ...Object.values(fields.facets)].filter(text => hasText(text)).join('\n\n');

function ComponentBody({ item, title, editable, draft, locked, persist, redraw, mainKey, controls, tools }: {
  item: Component; title: string; editable: boolean; draft?: PageEditorDraft; locked: boolean; persist: () => void; redraw: () => void; mainKey: string;
  controls?: FacetControls; tools?: ReactNode;
}) {
  // A parent in its live editor (D09), drawn from the content it opened with:
  // the card may be regenerating meanwhile.
  const fields = draft?.fields?.[item.id];
  // One facet open on its own (D10): the card as it reads, that facet in its editor with its Save and Cancel.
  if (editable && fields && draft?.facet && isParentType(item.moduleType)) {
    const { rendered } = readContent(item.moduleType, item.content);
    const facet = draft.facet as FacetType;
    const node = <FacetEditor key={facet} parent={item.moduleType} facet={facet} title={title} fields={fields} redraw={redraw} persist={persist}
      locked={locked || item.status === 'loading'}>
      {item.status === 'loading' && <p className="notice">{t('card.generatingDraft')}</p>}
      {tools}
    </FacetEditor>;
    return <Content type={item.moduleType} rendered={rendered} mainKey={mainKey} controls={controls && { ...controls, editing: { facet, node } }} />;
  }
  if (editable && fields && isParentType(item.moduleType)) return <>
    <LiveEditor parent={item.moduleType} title={title} fields={fields} redraw={redraw} persist={persist}
      opened={(draft?.fieldStored?.[item.id] as ParentContent | undefined) ?? parentContentOf(item.content)} locked={locked || item.status === 'loading'} />
    {item.status === 'loading' && <p className="notice">{t('card.generatingDraft')}</p>}
  </>;
  // Context and Text in the same toolbar editor (D10, amended a fourth time).
  if (editable && draft && (item.moduleType === 'context' || item.moduleType === 'text')) return <NoteEditor title={title} value={draft.texts[item.id] ?? ''}
    locked={locked} onChange={markdown => { draft.texts[item.id] = markdown; persist(); }} />;
  if (editable && draft) return <>
    <TextField id={`component-${item.id}`} labelText={t('action.editNamed', { name: title })} value={draft.texts[item.id]}
      error={item.moduleType === 'main-key' ? draft.fieldError : undefined}
      readOnly={locked || item.status === 'loading'} multiline={item.moduleType !== 'main-key' || mainKeyTier(draft.texts[item.id]) === 'passage'}
      onChange={value => { draft.texts[item.id] = value; persist(); }} />
    {item.status === 'loading' && <p className="notice">{t('card.generatingDraft')}</p>}
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
      setAnnouncement(t(failed ? 'card.facetFailedAnnouncement' : 'card.facetGeneratedAnnouncement', { card: title, facet: was.name }));
      const section = body.current?.querySelector<HTMLElement>(`.facet[data-facet="${CSS.escape(was.id)}"]`);
      if (!section || failed) return;
      section.dataset.shown = '';
      const timer = setTimeout(() => { delete section.dataset.shown; }, 1200);
      return () => clearTimeout(timer);
    }
    setAnnouncement(t(status === 'failed' ? 'card.failedAnnouncement' : 'card.generatedAnnouncement', { card: title }));
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
  return <p className="interpretation" data-interpretation={value}>{value === 'sentence' ? t('page.readAsSentence') : t('page.readAsWord')}</p>;
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
    <h1 ref={title} className="main-key" dir="auto" data-tier={tier} data-expanded={expanded || undefined}>{text}</h1>
    {overflows && <button className="show-all" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t('page.showLess') : t('page.showAll')}</button>}
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
  const verb = kind === 'delete' ? t('common.delete') : t('common.retry');
  return <div className="card-actions" role="group" aria-label={kind === 'delete' ? t('action.deleteAsk', { name: title }) : t('action.retryAsk', { name: title })} aria-describedby={questionId} data-open data-confirm={kind}
    style={{ paddingInlineStart: inset }}>
    <button ref={confirm} style={{ '--i': 0 } as CSSProperties} className="action-confirm" aria-label={kind === 'delete' ? t('action.confirmDelete', { name: title }) : t('action.confirmRetry', { name: title })} onClick={onConfirm}>
      <ActionIcon name={kind} />{verb}</button>
    <button ref={cancel} style={{ '--i': 1 } as CSSProperties} aria-label={t('action.keepNamed', { name: title })} onClick={onCancel}>{t('common.cancel')}</button>
    <span id={questionId} className="confirm-text" style={{ '--i': 2 } as CSSProperties}>{t('common.areYouSure')}</span>
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
  // The parent whose facet window is open (D13, 0.8.1); one at a time.
  const [facetsFor, setFacetsFor] = useState<string | null>(null);
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
    <h1>{t('page.unavailable.title')}</h1>
    <p>{t('page.unavailable.body')}</p>
    {draft && <>
      <p className="notice">{t('page.unavailable.draft')}</p>
      {[draft.mainKey, ...Object.values(draft.inputs ?? {}), ...Object.values(draft.texts), ...Object.values(draft.fields ?? {}).map(draftText)].filter(Boolean).map((text, index) => <pre key={index}>{text}</pre>)}
      <button onClick={() => void discardUnavailable()}>{t('common.discardDraft')}</button>
    </>}
  </>;
  const back = <button className="back" onClick={() => navigate(`deck/${deck.id}`)}>{t('page.back', { deck: deck.name })}</button>;
  if (isNew || !page) return <>
    {notice}{back}
    <h1>{t('page.new.title')}</h1>
    {draft && <NewPageEditor draft={draft} deck={deck} busy={busy} persist={persist} save={save} cancel={cancel} />}
  </>;

  const [key, ...rest] = page.components;
  const locked = busy || Boolean(draft?.pending && !draft.errorCode);
  const editingId = editing ? draft?.componentId : undefined;
  // Shaping waits while a card is being edited; its Save and Cancel are right there.
  const disabled = Boolean(editingId) || busy;
  const known = new Set(page.components.map(item => item.id));
  const lost = editing && draft ? [...Object.keys(draft.texts), ...Object.keys(draft.fields ?? {})].filter(id => !known.has(id)) : [];
  const items = numbered(rest.map(item => ({ id: item.id, type: item.moduleType, label: moduleLabel(item.moduleType), component: item })));

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
    // Where a clicked button stands within the row from its start, transforms aside:
    // offsetLeft counts from the card's head; a right-to-left row starts at its right.
    const ask = (kind: 'delete' | 'retry') => (event: { currentTarget: HTMLButtonElement }) => {
      const button = event.currentTarget, row = button.parentElement;
      const offset = direction() === 'rtl'
        ? (row ? row.offsetLeft + row.offsetWidth : 0) - (button.offsetLeft + button.offsetWidth)
        : button.offsetLeft - (row?.offsetLeft ?? 0);
      setConfirming({ id: item.id, kind, offset });
    };
    // A component with nothing in it has nothing to lose: Delete and Retry act at once.
    const hasContent = readContent(item.moduleType, item.content).present;
    // An empty component is already only its tab: there is nothing to fold.
    const foldable = hasContent || item.status === 'failed';
    const isFolded = folded.has(item.id);
    const choose = (action: () => void) => () => { setOpened(null); action(); };
    let index = 0;
    const order = () => ({ '--i': index++ }) as CSSProperties;
    return <div id={`actions-${item.id}`} className="card-actions" role="group" aria-label={t('card.actions', { card: title })} data-open={open || undefined}>
      {/* An empty parent can be written by hand too (D10, amended a fourth time). */}
      {open && <button style={order()} aria-label={t('action.editNamed', { name: title })} disabled={Boolean(editingId) || item.status === 'loading'}
        onClick={choose(() => { if (isFolded) fold(item.id, false); begin(item.id); })}>
        <ActionIcon name="edit" />{t('common.edit')}</button>}
      {generated && <button style={order()} className={item.status === 'failed' ? 'action-failed' : undefined} aria-label={t('action.retryNamed', { name: title })}
        disabled={working || Boolean(editingId) || item.status === 'loading'}
        onClick={hasContent && open ? ask('retry') : choose(() => void run(() => generate({ scope: 'component', componentId: item.id })))}>
        <ActionIcon name="retry" />{t('common.retry')}</button>}
      {/* A parent's facets are chosen in its facet window (D13, 0.8.1). */}
      {open && isParentType(item.moduleType) && <button style={order()} aria-label={t('card.facetsOf', { card: title })}
        disabled={disabled || working || item.status === 'loading'} onClick={choose(() => setFacetsFor(item.id))}>
        <ActionIcon name="facet" />{t('card.facet')}</button>}
      {open && foldable && <button style={order()} aria-label={t(isFolded ? 'card.unfoldNamed' : 'card.foldNamed', { card: title })} onClick={choose(() => fold(item.id, !isFolded))}>
        <ActionIcon name={isFolded ? 'unfold' : 'fold'} />{isFolded ? t('card.unfold') : t('card.fold')}</button>}
      {open && <button style={order()} className="action-delete" aria-label={t('action.deleteNamed', { name: title })} disabled={disabled || working || item.status === 'loading'}
        onClick={hasContent ? ask('delete') : choose(() => vanish(item))}>
        <ActionIcon name="delete" />{t('common.delete')}</button>}
    </div>;
  };
  const editor = (item: Component, title: string, controls?: FacetControls) => {
    if (editingId !== item.id || !draft) return null;
    const tools = <>
      <div className="component-tools">
        <button disabled={busy} onClick={() => void cancel()}>{t('common.cancel')}</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? t('common.trySavingAgain') : t('common.save')}</button>
      </div>
      {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
    </>;
    // A facet open on its own keeps its Save and Cancel below it (D10).
    if (draft.facet) return <ComponentBody item={item} title={title} editable draft={draft} locked={locked} persist={persist} redraw={redraw}
      mainKey={mainKey} controls={controls} tools={tools} />;
    return <>
      <ComponentBody item={item} title={title} editable draft={draft} locked={locked} persist={persist} redraw={redraw} mainKey={mainKey} />
      {tools}
    </>;
  };

  // One card: its index tab (menu, then the family and label, which drags the
  // card and, clicked, ejects its actions beside it), its status only while
  // unfinished, and its content. An empty component is only its tab. Editing
  // is one card at a time; Save and Cancel live in that card.
  const card = (item: Component, title: string, { drag, menu }: RowParts) => {
    const family = isModuleType(item.moduleType) ? CATALOG[item.moduleType].family ?? 'notes' : 'notes';
    const read = readContent(item.moduleType, item.content);
    const empty = !read.present && item.status !== 'loading' && item.status !== 'failed' && editingId !== item.id;
    const removeFacet = (facet: FacetType) => void run(async () => { await deleteFacet(item.id, item.moduleType as ParentType, facet); });
    // Confirmed in its row when the facet has content, as a card's Retry is beside its tab.
    const retryFacet = (facet: FacetType) => void run(() => generate({ scope: 'facet', componentId: item.id, facet }, true));
    const controls: FacetControls | undefined = isParentType(item.moduleType) ? { title, disabled: disabled || working || item.status === 'loading',
      onDelete: removeFacet, onRetry: retryFacet, asking: askingFacet?.id === item.id ? askingFacet : null,
      // A facet edits on its own (D10, 0.7.5), an empty one too (amended a sixth time).
      onEdit: facet => { setAskingFacet(null); begin(item.id, facet); }, facets: item.facets ?? [],
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
    const tagCount = item.facets?.length ?? 0;
    const tagged = Boolean(controls && tagCount);
    // Which facets have content: none on a card that is only its tab; on
    // content outside the parent's layout, the sections cannot be told apart,
    // so no tag is marked.
    const { rendered } = read;
    const hasContent = (facet: FacetType) => rendered.kind === 'parent' && rendered.facets.some(each => each.facet === facet);
    // While it is edited, a tag shows whether its facet has text in the draft (D09).
    const fieldDraft = editingId === item.id ? draft?.fields?.[item.id] : undefined;
    const filled = fieldDraft ? Object.entries(fieldDraft.facets).filter(([, text]) => hasText(text)).map(([facet]) => facet)
      : generating || !read.present ? [] : rendered.kind === 'parent' ? rendered.facets.map(each => each.facet) : undefined;
    const tags = controls ? <FacetTags holderId={item.id} parent={item.moduleType as ParentType} facets={item.facets ?? []} filled={filled}
      layout={layout} title={title} disabled={controls.disabled}
      // On an open card's edge a tag pulls out to its own Retry, which asks nothing (0.7.4).
      onRetry={layout === 'edge' && rendered.kind === 'parent' && editingId !== item.id ? retryFacet : undefined}
      retrying={item.retryingFacet} failed={item.failedFacet}
      onRemove={facet => {
        // A facet with content asks first, in its section; one waiting for Retry goes at once.
        if (hasContent(facet) && layout !== 'hanging') showFacet(item, facet, () => setAskingFacet({ id: item.id, facet, kind: 'delete' }));
        else removeFacet(facet);
      }} /> : null;
    const facetWindow = controls && facetsFor === item.id ? <FacetWindow holderId={item.id} parent={item.moduleType as ParentType} title={title}
      facets={item.facets ?? []} disabled={controls.disabled} hasContent={hasContent}
      onAdd={facet => addFacet(item.id, item.moduleType as ParentType, facet)}
      onRemove={async facet => { let saved = true; await run(async () => { saved = await deleteFacet(item.id, item.moduleType as ParentType, facet); }); return saved; }}
      onClose={refocus => {
        setFacetsFor(null);
        if (refocus) document.querySelector<HTMLElement>(`[data-component-id="${CSS.escape(item.id)}"] .tab-button`)?.focus();
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
          {generating && <span className="visually-hidden" role="status">{t('card.generatingStatus', { card: title })}</span>}
        </div>
        {editingId !== item.id && actions(item, title)}
        {facetWindow}
      </div>
      {!empty && <div className="card-fold"><div className="card-fold-inner" inert={isFolded || undefined}>
        {item.status === 'failed' && <p className="card-status"><span className="list-status" data-status="failed">{t('status.generationFailed')}</span></p>}
        {editor(item, title, controls) || <Reveal status={item.status} title={title} failedFacet={item.failedFacet}
          facet={item.retryingFacet && isParentType(item.moduleType) && isFacetOf(item.moduleType, item.retryingFacet)
            ? { id: item.retryingFacet, name: facetName(item.moduleType, item.retryingFacet) } : undefined}><ComponentBody item={item} title={title} editable={false} draft={draft} locked={locked} redraw={redraw} persist={persist} mainKey={mainKey} controls={controls} /></Reveal>}
      </div></div>}
      {tags}
    </article>;
  };

  return <>
    {notice}{back}
    <div className="page-header" data-component-id={key.id} data-type="main-key" data-editing={editingId === key.id || undefined}>
      <div className="page-title">
        {editingId === key.id ? editor(key, t('module.mainKey')) : <><MainKeyTitle text={mainKey} /><Interpretation value={page.interpretation} /></>}
      </div>
      <div className="title-actions">
        {editingId !== key.id && <button className="title-edit" aria-label={t('action.editNamed', { name: t('module.mainKey') })} disabled={Boolean(editingId)} onClick={() => begin(key.id)}>{t('common.edit')}</button>}
        <button disabled={busy || Boolean(editingId)} onClick={() => void deletePage()}>{t('page.delete')}</button>
      </div>
    </div>
    <ShapingArea items={items} types={page.components.map(item => item.moduleType)} disabled={disabled}
      label={t('page.components')} where="page"
      // The server appends a module sent without a position, after anything added meanwhile.
      onAdd={(type, index) => addModule(type, index === AT_THE_END ? undefined : index + 1)}
      onMove={(id, index) => moveComponent(id, index + 1)}
      menuItems={componentMenu()}
      renderLanding={type => <LandingCard type={type} />}
      renderItem={(item, parts) => card(item.component, item.label, parts)} />
    {lost.map(id => <div key={id}>
      <p className="notice">{t('page.lostComponent')}</p>
      <pre>{draft!.texts[id] ?? draftText(draft!.fields![id]!)}</pre>
      <button onClick={() => void cancel()}>{t('common.discardDraft')}</button>
    </div>)}
    {!editingId && pendingSaves.map(item => <div className="notice" key={item.operationId}>
      <p>{t('save.waiting')}</p>
      <button onClick={() => void retryPendingSave(item.operationId)}>{t('common.trySavingAgain')}</button>
    </div>)}
  </>;
}
