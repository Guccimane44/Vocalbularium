// A card's parts: its content as it reads (markdown, a parent's core and
// facets with their actions, spoken parts), its content rising in once
// generated, the confirmation ejected from its tab, the icons and spark
// its tab uses, and the card a module from the window lands as.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Announcements, DragEndEvent, Modifier } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import type { Component } from '@vocabularium/contracts';
import { CATALOG, isModuleType } from '@vocabularium/domain/page-modules';
import { blockText } from '@vocabularium/domain/pages';
import { renderContent, renderParent } from '@vocabularium/domain/render';
import type { Rendered } from '@vocabularium/domain/render';
import { plainInline } from '@vocabularium/domain/markdown';
import { CodeBlock, MathBlock } from './rich-blocks.tsx';
import type { MdBlock, MdInline } from '@vocabularium/domain/markdown';
import { parentContentOf, providerCore } from '@vocabularium/domain/content';
import { hasText } from '@vocabularium/domain/markdown';
import { facetsOf, inOrder, isParentType } from '@vocabularium/domain/parents';
import { coreLabel, facetName } from './catalog-text.ts';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { FacetTab } from './facet-tags.tsx';
import { openAbout } from './about-sheet.tsx';
import { FamilyIcon } from './families.tsx';
import { moduleLabel, SixDots } from './shaping.tsx';
import { currentLanguage, t } from './i18n.ts';
import { contentModule } from '@vocabularium/domain/catalog';
import { ClipPlayer, MAX_SPOKEN_LENGTH } from './audio.tsx';
import { isSpokenFacet } from '@vocabularium/domain/spoken';
import { plainLines } from '@vocabularium/domain/markdown';

// Icons for a card's actions, drawn like the family icons: 24px grid, 2.2 stroke.
const ACTION_ICONS = {
  edit: <><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  retry: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  delete: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M18 7l-1 13H7L6 7" /></>,
  // A bookmark, as a facet's tag is drawn (0.7.1).
  facet: <path d="M7 4h10v16l-5-3.5L7 20z" />,
  // The ⓘ of the facet window's rows.
  about: <><circle cx="12" cy="12" r="9.5" /><path d="M12 11v6" /><path d="M12 7.5h.01" /></>,
  fold: <><path d="M7 20l5-5 5 5" /><path d="M7 4l5 5 5-5" /></>,
  unfold: <><path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" /></>
} as const;
export const ActionIcon = ({ name }: { name: keyof typeof ACTION_ICONS }) => <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true"
  fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ACTION_ICONS[name]}</svg>;

// The comet that runs round a generating card's tab: its head, then a fading
// trail. When the work ends it keeps running a moment while it fades away.
const SPARK_TRAIL = Array.from({ length: 16 }, (_, index) => index);
const SPARK_FADE_MS = 600;
export function Spark({ active }: { active: boolean }) {
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

// One facet's content (D08): examples beside their translations, or its lines.
// Markdown as the domain reads it (D09, amended): paragraphs, lists, tables,
// bold, italic, inline code and highlight, drawn as elements; since D17 a
// formula is KaTeX's HTML and code highlight.js's. The
// main key's yellow is a stored highlight like any other (D10, amended a fourth time).
function Inline({ runs, mainKey }: { runs: readonly MdInline[]; mainKey: string }) {
  return <>{runs.map((run, index) => {
    // The main key's yellow is a stored highlight (D10, amended a fourth time): the card adds none of its own.
    if (run.type === 'text') return <Fragment key={index}>{run.text}</Fragment>;
    if (run.type === 'break') return <br key={index} />;
    if (run.type === 'code') return <code key={index}>{run.text}</code>;
    if (run.type === 'math') return <MathBlock key={index} tex={run.tex} display={false} />;
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
export function Markdown({ blocks, mainKey, className, retrying }: { blocks: readonly MdBlock[]; mainKey: string; className?: string; retrying?: boolean }) {
  // Each block takes the direction of its own text (D14): a German card reads
  // left to right in a right-to-left interface, an Arabic one the other way.
  return <div className={`md${className ? ` ${className}` : ''}`} data-retrying={retrying || undefined} aria-busy={retrying || undefined}>{blocks.map((block, index) => block.type === 'paragraph'
    ? <p key={index} dir="auto"><Inline runs={block.children} mainKey={mainKey} /></p>
    // A formula and code (D17).
    : block.type === 'math' ? <MathBlock key={index} tex={block.tex} display />
    : block.type === 'code' ? <CodeBlock key={index} language={block.language} text={block.text} />
    // A table (D17) scrolls inside its container on a narrow card.
    : block.type === 'table'
      ? <div key={index} className="md-table" role="region" tabIndex={0} aria-label={block.header.map(plainInline).filter(Boolean).join(', ')}><table dir="auto">
        <thead><tr>{block.header.map((cell, at) => <th key={at} scope="col"><Inline runs={cell} mainKey={mainKey} /></th>)}</tr></thead>
        <tbody>{block.rows.map((row, at) => <tr key={at}>{row.map((cell, column) => column === 0
          ? <th key={column} scope="row"><Inline runs={cell} mainKey={mainKey} /></th>
          : <td key={column}><Inline runs={cell} mainKey={mainKey} /></td>)}</tr>)}</tbody>
      </table></div>
    : block.ordered
      ? <ol key={index} start={block.start} dir="auto">{block.items.map((item, at) =>
        <li key={at} data-number={block.start + at}><span><Inline runs={item} mainKey={mainKey} /></span></li>)}</ol>
      : <ul key={index} dir="auto">{block.items.map((item, at) => <li key={at}><Inline runs={item} mainKey={mainKey} /></li>)}</ul>)}</div>;
}

// A facet's Edit (0.7.5), Retry and Delete beside its label (0.7.3): Edit
// opens that facet alone in its editor (D10); Retry and Delete act at once
// when the facet has nothing in it, otherwise after "Are you sure?" in the
// same row, like a card's Retry and Delete. Retry regenerates the facet alone; its parent's core and other
// facets stay. Retry is unavailable where the facet has nothing to generate.
// About, first, opens the facet's page in the pages' sheet, as its › in the facet window
// does (0.12.1; its page since 0.13.0, D20).
export type FacetAsk = 'delete' | 'retry';
function FacetActions({ name, hasContent, canRetry, disabled, asking, setAsking, onDelete, onRetry, onEdit, onAbout }: {
  name: string; hasContent: boolean; canRetry: boolean; disabled: boolean; asking: FacetAsk | null; setAsking: (value: FacetAsk | null) => void;
  // The core has no Delete (D10, amended).
  onDelete?: () => void; onRetry: () => void; onEdit?: () => void; onAbout: () => void;
}) {
  if (!asking) return <span className="facet-actions">
    <button type="button" className="facet-about-open" aria-label={t('about.facet', { name })} aria-haspopup="dialog"
      onClick={onAbout}><ActionIcon name="about" /></button>
    {onEdit && <button type="button" className="facet-edit" aria-label={t('action.editNamed', { name })} disabled={disabled}
      onClick={onEdit}><ActionIcon name="edit" /></button>}
    <button type="button" className="facet-retry" aria-label={t('action.retryNamed', { name })} disabled={disabled || !canRetry}
      onClick={() => hasContent ? setAsking('retry') : onRetry()}><ActionIcon name="retry" /></button>
    {onDelete && <button type="button" className="facet-delete" aria-label={t('action.deleteNamed', { name })} disabled={disabled}
      onClick={() => hasContent ? setAsking('delete') : onDelete()}><ActionIcon name="delete" /></button>}
  </span>;
  return <PartConfirm name={name} asking={asking} setAsking={setAsking} onDelete={onDelete} onRetry={onRetry} />;
}
// A part's question (0.7.3), a facet's or the core's (D28): the card's question
// mirrored, springing out leftwards from the row's end, Cancel last, under the
// pointer that asked.
function PartConfirm({ name, asking, setAsking, onDelete, onRetry }: {
  name: string; asking: FacetAsk; setAsking: (value: FacetAsk | null) => void; onDelete?: () => void; onRetry: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
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
// The part `editing` names when the core is open in its own editor (0.16.2).
export const CORE_PART = '@core';
// The part the server names when the core regenerates on its own (D28).
export const CORE_RETRY = 'core';
export type FacetControls = { title: string; disabled: boolean; onDelete: (facet: FacetType) => void; onRetry: (facet: FacetType) => void;
  // The card's facets, each shown with its heading (D10, amended a sixth time).
  facets?: readonly string[];
  // A facet's own Edit (D10), and the facet open in its editor with what to draw there.
  onEdit?: (facet: FacetType) => void; editing?: { facet: string; node: ReactNode };

  asking: { facet: FacetType; kind: FacetAsk } | null; setAsking: (facet: FacetType | null, kind?: FacetAsk) => void;
  retrying?: string; failed?: string;
  // The card's own Retry, which a part that is not spoken offers beside its note (D24).
  onRetryCard?: () => void;
  // The core's own Edit (0.16.2), as a facet's; absent where the core is spoken.
  onEditCore?: () => void;
  // The core's own Retry (D28), beside its Edit; absent where it is not offered.
  onRetryCore?: () => void;
  // A facet moved among the card's facets, to a position counted from 0 (D26); false when the save failed.
  onMoveFacet?: (facet: FacetType, position: number) => Promise<boolean> };

// Whether a module's core is spoken rather than written (D24): it has no text
// of its own, so no Edit, and Pronunciation no facets either.
export const isSpokenModule = (type: string) => isParentType(type) && Boolean(contentModule(type).core.spoken);
// A completed card's spoken parts (D24): its core, when the module speaks its
// main key, and whether it can; and each spoken facet's lines, one clip each.
export type Spoken = Readonly<{ componentId: string; core?: Readonly<{ speakable: boolean; tooLong: boolean }>; facets: Readonly<Record<string, readonly string[]>> }>;
export function spokenOf(item: Component, mainKey: string): Spoken | undefined {
  if (!isParentType(item.moduleType) || item.status !== 'completed') return undefined;
  const data = parentContentOf(item.content);
  if (!data) return undefined;
  const type = item.moduleType as ParentType;
  const module = contentModule(type);
  const texts = data.facets as Record<string, string | undefined>;
  const facets = Object.fromEntries(module.facets.filter(facet => facet.spoken && hasText(texts[facet.id]))
    .map(facet => [facet.id, plainLines(texts[facet.id]!).map(line => line.trim()).filter(Boolean)]));
  if (!module.core.spoken && !Object.keys(facets).length) return undefined;
  const core = module.core.spoken ? { speakable: Boolean(module.core.spoken(providerCore(type, data))), tooLong: mainKey.trim().length > MAX_SPOKEN_LENGTH } : undefined;
  return { componentId: item.id, ...(core ? { core } : {}), facets };
}

// A component's content for reading: a parent's structured data (D09), drawn
// as its text once was, or plain text; and whether there is any.
export function readContent(type: string, content: Component['content']): { rendered: Rendered; present: boolean } {
  const data = isParentType(type) ? parentContentOf(content) : null;
  // A Pronunciation card names its key's language in the interface language (D24).
  if (data) return { rendered: renderParent(type as ParentType, data, currentLanguage()), present: true };
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
export function Content({ type, rendered, mainKey, controls, spoken }: {
  type: string; rendered: Rendered; mainKey: string; controls?: FacetControls; spoken?: Spoken;
}) {
  // Context and Text as markdown (D10, amended a fourth time), edited from their tab.
  if (rendered.kind === 'note') return <Markdown blocks={rendered.blocks} mainKey={mainKey} className="note-body" />;
  const parent = isParentType(type) ? type : null;
  // A facet's own Retry needs content that follows the parent's layout, and a
  // facet the card's flags rule out has nothing to generate (D17): its Retry is unavailable.
  const ruled = rendered.kind === 'parent' ? rendered.ruledOut : {};
  const canRetryFacet = (facet: FacetType) => rendered.kind === 'parent' && !ruled[facet];
  // While the facet generates on its own, the spark runs round its tab (0.7.4).
  const facetHead = (facet: FacetType, hasContent = true, grip?: ReactNode) => parent && <h3 className="facet-title">
    {grip}
    <FacetTab parent={parent} facet={facet}><Spark active={controls?.retrying === facet} /></FacetTab>
    {controls?.retrying === facet ? <span className="visually-hidden">{t('status.generatingEllipsis')}</span>
      : controls?.failed === facet && <span className="facet-note" data-note="failed">{t('card.retryFailed')}</span>}
    {controls && <FacetActions name={t('facet.fromCard', { facet: facetName(parent, facet), card: controls.title })} hasContent={hasContent} canRetry={canRetryFacet(facet)}
      disabled={controls.disabled} asking={controls.asking?.facet === facet ? controls.asking.kind : null}
      setAsking={kind => controls.setAsking(kind ? facet : null, kind ?? undefined)}
      onDelete={() => controls.onDelete(facet)} onRetry={() => controls.onRetry(facet)}
      // A spoken facet's lines are not edited (D24).
      onEdit={controls.onEdit && !isSpokenFacet(parent, facet) ? () => controls.onEdit!(facet) : undefined} onAbout={() => openAbout({ kind: 'facet', module: parent, facet })} />}
  </h3>;
  const section = (facet: string, slot?: FacetSlot) => ({ className: 'facet', 'data-facet': facet, tabIndex: -1,
    'data-retrying': controls?.retrying === facet || undefined, 'aria-busy': controls?.retrying === facet || undefined,
    ...(slot ? { ref: slot.ref, style: slot.style, 'data-dragging': slot.dragging || undefined } : {}) });
  if (rendered.kind === 'plain') return rendered.text ? <pre dir="auto">{rendered.text}</pre> : null;
  const { heading, reading, core, facets } = rendered;
  // One facet's part of the card, in the place the card's order gives it.
  const part = (name: FacetType, slot?: FacetSlot): ReactNode => {
    const facet = facets.find(each => each.facet === name);
    // The facet open in its own editor (D10) stands in its place.
    if (controls?.editing?.facet === name) return <Fragment key={name}>{controls.editing.node}</Fragment>;
    // A spoken facet (D24): each line beside its own player row.
    const lines = spoken?.facets[name];
    if (facet && lines?.length) return <section key={name} {...section(name, slot)}>
      {facetHead(name, true, slot?.grip)}
      <div className="facet-body spoken-lines">{lines.map((line, index) => <div className="spoken-line" key={index}>
        <span className="spoken-text" dir="auto">{line}</span>
        <ClipPlayer componentId={spoken!.componentId} part={name} line={index} text={line} speakable tooLong={line.length > MAX_SPOKEN_LENGTH} />
      </div>)}</div>
    </section>;
    if (facet) return <section key={name} {...section(name, slot)}>
      {facetHead(name, true, slot?.grip)}
      <Markdown blocks={facet.body} mainKey={mainKey} className="facet-body" />
    </section>;
    // A facet the card has without content: its heading only, dimmed (D10, amended a sixth time),
    // also while it generates on its own.
    return controls?.retrying === name || controls?.facets?.includes(name)
      ? <section key={name} {...section(name, slot)} data-unfilled data-pending={controls?.retrying === name || undefined}>{facetHead(name, false, slot?.grip)}</section> : null;
  };
  // The card's facets in its own order (D26); without controls, the parent's.
  const order = parent ? (controls?.facets ? inOrder(parent, [...controls.facets, ...facetsOf(parent)]) : facetsOf(parent)) : [];
  // A card's facets reorder by their grips, except while a part is open in its editor.
  const sortable = Boolean(parent && controls?.onMoveFacet && controls.facets && controls.facets.length > 1 && !controls.editing);

  // The core open in its own editor (0.16.2) stands in place of its top line and text.
  const coreEditing = controls?.editing?.facet === CORE_PART ? controls.editing.node : null;
  const coreRetrying = controls?.retrying === CORE_RETRY;
  const coreAsking = (controls?.asking?.facet as string | undefined) === CORE_PART && controls?.asking?.kind === 'retry' && Boolean(controls?.onRetryCore);
  const coreName = controls && parent && t('facet.fromCard', { facet: coreLabel(parent, reading ? 'sentence' : 'word_phrase'), card: controls.title });
  // The core's top line, then its markdown; each facet's markdown in its container (D09).
  return <div className="entry-content">
    {coreEditing}
    {!coreEditing && heading && <p className="entry-heading" dir="auto">
      {/* An Expertise core names no language (D11) and shows no labels. */}
      {heading.language && <span className="entry-language">{heading.language}</span>}
      <span className="entry-key">{heading.key}</span>
      {heading.pronunciation && <span className="entry-pronunciation">{heading.pronunciation}</span>}
      {/* Word or sentence, and a German word's grammatical role, in the module's language (D17, K51). */}
      {heading.labels.map(label => <span key={label} className="entry-label">{label}</span>)}
      {/* The core's own Edit (0.16.2) and Retry (D28), at the end of its top line, shown as a facet's actions are;
          Retry asks first, as a facet's does, and both are hidden while the core regenerates. */}
      {controls && coreAsking ? <PartConfirm name={coreName ?? ''} asking="retry" setAsking={value => controls.setAsking(value ? CORE_PART as FacetType : null, 'retry')}
        onRetry={controls.onRetryCore!} />
        : controls && !coreRetrying && (controls.onEditCore || controls.onRetryCore) && <span className="facet-actions core-actions">
        {controls.onEditCore && <button type="button" className="facet-edit" aria-label={t('action.editNamed', { name: coreName ?? '' })}
          disabled={controls.disabled} onClick={controls.onEditCore}><ActionIcon name="edit" /></button>}
        {controls.onRetryCore && <button type="button" className="facet-retry" aria-label={t('action.retryNamed', { name: coreName ?? '' })}
          disabled={controls.disabled} onClick={() => controls.setAsking(CORE_PART as FacetType, 'retry')}><ActionIcon name="retry" /></button>}
      </span>}
      {controls?.failed === CORE_RETRY && <span className="facet-note" data-note="failed">{t('card.retryFailed')}</span>}
    </p>}
    {/* A spoken core's player, beneath its top line (D24, direction A). */}
    {!coreEditing && spoken?.core && <ClipPlayer componentId={spoken.componentId} part="core" line={0} text={mainKey.trim()}
      speakable={spoken.core.speakable} tooLong={spoken.core.tooLong} onRetryCard={controls?.onRetryCard} />}
    {/* While the core regenerates on its own (D28), its text dims inside a ring in the family colour. */}
    {!coreEditing && core.length > 0 && <Markdown blocks={core} mainKey={mainKey} className={reading ? 'entry-core reading' : 'entry-core'}
      retrying={coreRetrying} />}
    {coreRetrying && <span className="visually-hidden">{t('status.generatingEllipsis')}</span>}
    {parent && (sortable ? <FacetSorter parent={parent} title={controls!.title} facets={inOrder(parent, controls!.facets!)} disabled={controls!.disabled}
      onMove={controls!.onMoveFacet!}>
      {(shown: readonly FacetType[]) => inOrder(parent, [...shown, ...facetsOf(parent)]).map(name => shown.includes(name)
        ? <SortableFacet key={name} id={name} label={t('action.moveNamed', { name: t('facet.fromCard', { facet: facetName(parent, name), card: controls!.title }) })}
          disabled={controls!.disabled}>{slot => part(name, slot)}</SortableFacet>
        : part(name))}
    </FacetSorter> : order.map(name => part(name)))}
  </div>;
}

// Where a card's facet section stands while its facets are reordered (D26):
// its node, its movement, and the grip before its tab that drags it.
type FacetSlot = { ref: Ref<HTMLElement>; style: CSSProperties; dragging: boolean; grip: ReactNode };
// The facets move along the card only, as the cards move along the page.
const alongTheCard: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const FACET_KEYS = { start: ['Space'], cancel: ['Escape'], end: ['Space'] };
const MAKING_ROOM = { duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)' };

// A card's facets reordered by their grips (D26), with the pointer or with Space
// and the arrow keys. The order shown changes at once on a drop, so a facet never
// snaps back while its move is saved, and returns to the saved one if the save fails.
function FacetSorter({ parent, title, facets, disabled, onMove, children }: {
  parent: ParentType; title: string; facets: readonly FacetType[]; disabled: boolean;
  onMove: (facet: FacetType, position: number) => Promise<boolean>; children: (shown: readonly FacetType[]) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: FACET_KEYS }));
  const key = facets.join('|');
  const [order, setOrder] = useState<readonly FacetType[]>(facets);
  useEffect(() => { setOrder(facets); }, [key]);
  // The local order only stands while it holds the same facets as the card.
  const shown = order.length === facets.length && facets.every(facet => order.includes(facet)) ? order : facets;
  const shownKey = shown.join('|');
  const ids = useMemo(() => [...shown], [shownKey]);
  const name = (id: string | number) => t('facet.fromCard', { facet: facetName(parent, String(id) as FacetType), card: title });
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('shaping.pickedUp', { name: name(active.id) }),
    onDragOver: ({ active, over }) => over ? t('shaping.overPosition', { name: name(active.id), position: shown.indexOf(String(over.id) as FacetType) + 1 })
      : t('shaping.notMoved', { name: name(active.id) }),
    onDragEnd: ({ active, over }) => t(over ? 'shaping.dropped' : 'shaping.notMoved', { name: name(active.id) }),
    onDragCancel: ({ active }) => t('shaping.cancelled', { name: name(active.id) })
  };
  async function end({ active, over }: DragEndEvent) {
    if (!over || disabled) return;
    const from = shown.indexOf(String(active.id) as FacetType), to = shown.indexOf(String(over.id) as FacetType);
    if (from < 0 || to < 0 || from === to) return;
    setOrder(arrayMove([...shown], from, to));
    if (await onMove(shown[from]!, to) === false) setOrder(facets);
  }
  // Its live region and instructions go to the page's body, so a card holds no status but its own.
  return <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements, container: document.body }} modifiers={[alongTheCard]} onDragEnd={end}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>{children(shown)}</SortableContext>
  </DndContext>;
}

// One facet's section as it reorders: its grip, before its tab, drags it.
function SortableFacet({ id, label, disabled, children }: { id: FacetType; label: string; disabled: boolean; children: (slot: FacetSlot) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled, transition: MAKING_ROOM });
  // Space picks up and drops on keydown; its keyup would also click the grip.
  const grip = <button type="button" className="facet-grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={label} title={label}
    onKeyUp={(event: KeyboardEvent) => { if (event.code === 'Space') event.preventDefault(); }}><SixDots /></button>;
  return <>{children({ ref: setNodeRef, style: { transform: DndCSS.Translate.toString(transform), transition }, dragging: isDragging, grip })}</>;
}


// Motion (D05): when a component finishes generating while the page is open,
// its content rises into the card line by line, and screen readers hear how
// the attempt ended.
// A facet's own Retry (0.7.3) is announced by the facet's name, and only its
// section lights up.
export function Reveal({ status, title, facet, failedFacet, children }: {
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

// Deleting or retrying a component that has content asks first, ejected from
// the tab like its actions (0.6.3): the final Delete or Retry and Cancel, then
// the question. Cancel lands where the button just clicked was, under the
// pointer, so a second click does not act; the final button stands to its left.
export function ConfirmAction({ kind, title, offset, onConfirm, onCancel }: {
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
// Folded in deck settings, where every module is a folded card (0.13.2).
export function LandingCard({ type, folded = false }: { type: string; folded?: boolean }) {
  const family = isModuleType(type) ? CATALOG[type].family ?? 'notes' : 'notes';
  return <article className={`component fam-${family}`} data-empty={!folded || undefined} data-folded={folded || undefined} data-landing data-type={type} aria-hidden="true">
    <div className="card-head"><div className="card-tab">
      <span className="row-menu"><span className="menu-button"><SixDots /></span></span>
      <h2><span className="tab-button"><FamilyIcon family={family} /><span className="tab-label">{moduleLabel(type)}</span></span></h2>
    </div></div>
  </article>;
}

