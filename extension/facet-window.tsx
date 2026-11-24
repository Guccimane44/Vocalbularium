import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { facetsOf } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { openAbout } from './about-sheet.tsx';
import { launchFacet } from './facet-tags.tsx';
import { direction, t } from './i18n.ts';
import { facetMark, facetName } from './catalog-text.ts';
import { facetsFull, MAX_FACETS } from './facet-limit.ts';
import { CATALOG } from '@vocabularium/domain/page-modules';
import { FamilyIcon } from './families.tsx';
import { clipFrames, FacetFlow } from './facet-flow.tsx';

// A parent's facet window (D13, 0.8.1), opened by Facet among the parent's
// actions, on a page and in deck settings. It lists every facet of the
// parent's module in the module's order, the core excepted, each with a tick,
// ticked for the facets the parent has. A tick or an untick applies at once,
// and the tag flies from the facet's row to the card; unticking a facet with
// content asks "Are you sure?" in its row first, as its Delete does beside its
// label. The window stays open for more until Escape, a click outside or
// another of the card's actions; Escape returns the focus to Facet. It
// unfolds below Facet, its rows dropping in as its edge reaches them.
// Each row's › opens the facet's page in the pages' sheet (D20, 0.13.0; from
// 0.8.1 an ⓘ expanded its explanation beneath the row). Since 0.13.3 (D23)
// it is a card on the surface with a heading naming the parent and a close,
// and two groups in the module's order: the facets on the card, each with a
// remove, and the others to add, each with a +; a facet moves between them.
// Since 0.16.4 a parent holding MAX_FACETS facets has its others disabled,
// with the reason beneath the group's name.
// Which parent's facet window is open, and whether it is closing: it stays
// on screen while it folds away and its frame flows back into the card's
// line, then `gone` takes it down. It closes whenever its card's actions do.
export function useFacetWindowState(opened: string | null) {
  const [holder, setHolder] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // Each opening is a new window, so Facet pressed again while it closes opens it afresh.
  const [round, setRound] = useState(0);
  useEffect(() => { if (holder && opened !== holder) setClosing(true); }, [opened]);
  return {
    holder, closing, round,
    toggle: (id: string) => { if (holder === id && !closing) setClosing(true); else { setHolder(id); setClosing(false); setRound(value => value + 1); } },
    close: () => { if (holder) setClosing(true); },
    gone: () => { setHolder(null); setClosing(false); }
  };
}

export function FacetWindow({ holderId, parent, title, facets, disabled, hasContent, onAdd, onRemove, onClose, closing = false, onGone }: {
  holderId: string; parent: ParentType; title: string; facets: readonly string[]; disabled: boolean;
  // Whether unticking would lose what the facet holds; never in deck settings.
  hasContent: (facet: FacetType) => boolean;
  onAdd: (facet: FacetType) => boolean | void | Promise<boolean | void>;
  // Removes the facet; false when it could not be saved, which puts its tick back.
  onRemove: (facet: FacetType) => boolean | void | Promise<boolean | void>;
  // `refocus` returns the focus to Facet, after Escape or the close.
  onClose: (refocus: boolean) => void;
  // Closing, it folds away, and `onGone` takes it down once it has.
  closing?: boolean; onGone?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const closingNow = useRef(closing);
  closingNow.current = closing;
  // The facet asking before it is removed, and the tick its question gives the
  // focus back to once the row shows its tick again.
  const [asking, setAsking] = useState<FacetType | null>(null);
  const [returning, setReturning] = useState<FacetType | null>(null);
  const ids = useId();
  // A tick shows at once, before the parent has saved it; what the parent
  // holds takes over as soon as it changes, and a failed add takes it back.
  const [wanted, setWanted] = useState<Readonly<Record<string, boolean>>>({});
  const holding = facets.join('|');
  useEffect(() => { setWanted({}); }, [holding]);
  const equipped = (facet: FacetType) => wanted[facet] ?? facets.includes(facet);
  // Facet, in the same card head; the window hangs below it from the card's top line, which flows round it (facet-flow.tsx).
  const trigger = () => root.current?.parentElement?.querySelector<HTMLElement>('[data-facet-trigger]') ?? null;
  const [place, setPlace] = useState<{ insetInlineStart: number; top: number }>();
  useLayoutEffect(() => {
    const head = root.current?.parentElement, facet = trigger();
    // It hangs from the card's top line, just below its 3px rule. Measured by
    // layout, not on screen, so a Facet still springing out of the tab counts
    // where it will stand.
    const card = root.current?.closest<HTMLElement>('.component');
    if (head && facet && card) setPlace({ insetInlineStart: direction() === 'rtl' ? head.offsetWidth - facet.offsetLeft - facet.offsetWidth : facet.offsetLeft,
      top: card.getBoundingClientRect().top - head.getBoundingClientRect().top + 3 });
  }, []);
  // Closing: the panel folds up while its frame flows back into the card's
  // line, then it goes; at once under reduced motion.
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => {
    if (!closing) return;
    const panel = root.current;
    if (!panel || matchMedia('(prefers-reduced-motion: reduce)').matches) { gone.current?.(); return; }
    // The window folds on the line's own timeline too, its lower edge always where the line has got back to.
    const closingTime = { duration: 460, easing: 'cubic-bezier(.5, 0, .3, 1)', fill: 'forwards' } as const;
    const motions: Animation[] = [];
    panel.parentElement?.querySelectorAll<SVGPathElement>('.facet-flow path[data-side]').forEach(path => {
      const total = Number(path.dataset.total), rule = Number(path.dataset.rule);
      path.getAnimations().forEach(motion => motion.cancel());
      motions.push(path.animate([{ strokeDasharray: `${total - rule} ${2 * total}`, strokeDashoffset: `${-rule}` }, { strokeDasharray: `${rule} ${2 * total}`, strokeDashoffset: '0' }], closingTime));
      if (path.dataset.side === '1') motions.push(panel.animate(clipFrames(panel, total - rule).reverse().map(frame => ({ ...frame, offset: 1 - Number(frame.offset) })), closingTime));
    });
    if (!motions.length) motions.push(panel.animate([{ opacity: 1 }, { opacity: 0 }], closingTime));
    let left = false;
    void Promise.all(motions.map(motion => motion.finished)).then(() => { if (!left) gone.current?.(); }, () => undefined);
    return () => { left = true; };
  }, [closing]);
  // The rows drop in once, as the window opens; a facet moving between the
  // groups later keeps still.
  const [opening, setOpening] = useState(true);
  useEffect(() => { const done = setTimeout(() => setOpening(false), 700); return () => clearTimeout(done); }, []);
  // Opened, the focus goes to the first row's button.
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>('.facet-toggle')?.focus(); }, []);
  useEffect(() => {
    // The pages' sheet opens over the window, which stays open beneath it.
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Facet itself toggles the window on its own click.
      if (!closingNow.current && !root.current?.contains(target) && !trigger()?.contains(target) && !target?.closest?.('.about-sheet')) close.current(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => {
    if (!returning) return;
    root.current?.querySelector<HTMLButtonElement>(`[data-facet="${returning}"] .facet-toggle`)?.focus();
    setReturning(null);
  }, [returning]);
  const answer = (facet: FacetType) => { setAsking(null); setReturning(facet); };
  const forget = (facet: FacetType) => setWanted(current => { const next = { ...current }; delete next[facet]; return next; });
  async function remove(facet: FacetType) {
    setWanted(current => ({ ...current, [facet]: false }));
    setReturning(facet);
    if (await onRemove(facet) === false) forget(facet);
  }
  async function toggle(facet: FacetType) {
    if (disabled) return;
    if (equipped(facet)) {
      if (hasContent(facet)) setAsking(facet); else void remove(facet);
      return;
    }
    if (full) return;
    setWanted(current => ({ ...current, [facet]: true }));
    setReturning(facet);
    launchFacet(holderId, facet, root.current?.querySelector(`[data-facet="${facet}"] .facet-tab-mark`)?.getBoundingClientRect());
    if (await onAdd(facet) === false) {
      launchFacet(holderId, facet, undefined);
      forget(facet);
    }
  }
  const headingId = `${ids}-heading`;
  // The heading names the parent by its tag, wherever the language puts it.
  const [before, after] = t('card.facetsOf', { card: '\uE000' }).split('\uE000');
  const family = CATALOG[parent].family ?? 'notes';
  const limitId = `${ids}-limit`;
  const all = facetsOf(parent);
  const full = facetsFull(all.filter(equipped).length);
  let drop = 0;
  const row = (facet: FacetType, on: boolean) => {
    const label = facetName(parent, facet);
    return <li key={facet} style={{ '--j': drop++ } as CSSProperties} className="facet-window-row" data-facet={facet} data-index={all.indexOf(facet)} data-equipped={on || undefined} data-asking={asking === facet || undefined}>
      <span className="facet-tab-mark" aria-hidden="true">{facetMark(parent, facet)}</span>
      <span className="facet-window-name">{label}</span>
      <button type="button" className="facet-about" aria-label={t('about.facet', { name: label })} aria-haspopup="dialog"
        onClick={() => openAbout({ kind: 'facet', module: parent, facet })}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {/* While the parent is busy the button still holds the focus, so it is only marked unavailable. */}
      <button type="button" className="facet-toggle" hidden={asking === facet} aria-disabled={disabled || (full && !on) || undefined}
        aria-describedby={full && !on ? limitId : undefined}
        aria-label={t(on ? 'action.removeNamed' : 'action.addNamed', { name: label })} onClick={() => void toggle(facet)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">{on ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M12 5v14M5 12h14" />}</svg>
      </button>
      {asking === facet && <FacetQuestion name={t('facet.fromCard', { facet: label, card: title })}
        onConfirm={() => { answer(facet); void remove(facet); }}
        onCancel={() => answer(facet)} />}
    </li>;
  };
  const group = (key: 'on' | 'add', members: FacetType[]) => members.length > 0 && <>
    <p className="facet-window-group" style={{ '--j': drop++ } as CSSProperties} id={`${ids}-${key}`}>{t(key === 'on' ? 'card.facetsOn' : 'card.facetsAdd')}</p>
    {key === 'add' && full && <p className="facet-window-limit" id={limitId}>{t('card.facetsFull', { count: MAX_FACETS })}</p>}
    <ul aria-labelledby={`${ids}-${key}`}>{members.map(facet => row(facet, key === 'on'))}</ul>
  </>;
  return <>{place && <FacetFlow target={root} closing={closing} />}<div ref={root} className="facet-window" data-opening={opening || undefined} data-closing={closing || undefined} inert={closing || undefined} role="group" aria-labelledby={headingId} style={place}
    onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (asking) answer(asking); else close.current(true);
    }}>
    <header className="facet-window-head">
      <h3 id={headingId}>{before}<span className="module-tag"><FamilyIcon family={family} />{title}</span>{after}</h3>
      <button type="button" className="facet-window-close" aria-label={t('common.close')} onClick={() => close.current(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>
    <div className="facet-window-body">
      {group('on', all.filter(equipped))}
      {group('add', all.filter(facet => !equipped(facet)))}
    </div>
  </div></>;
}

// The facet's question, as beside its label (page-view.tsx): "Are you sure?",
// the final Delete, and Cancel last, where the tick was, taking the focus.
function FacetQuestion({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <span className="facet-confirm" data-confirm="delete" role="group" aria-label={t('action.deleteAsk', { name })}>
    <span className="confirm-text" style={{ '--i': 2 } as CSSProperties}>{t('common.areYouSure')}</span>
    <button type="button" className="action-confirm" style={{ '--i': 1 } as CSSProperties} aria-label={t('action.confirmDelete', { name })} onClick={onConfirm}>{t('common.delete')}</button>
    <button type="button" ref={cancel} style={{ '--i': 0 } as CSSProperties} aria-label={t('action.keepNamed', { name })} onClick={onCancel}>{t('common.cancel')}</button>
  </span>;
}
