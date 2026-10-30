import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { facetsOf } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { openAbout } from './about-sheet.tsx';
import { launchFacet } from './facet-tags.tsx';
import { t } from './i18n.ts';
import { facetMark, facetName } from './catalog-text.ts';

// A parent's facet window (D13, 0.8.1), opened by Facet among the parent's
// actions, on a page and in deck settings. It lists every facet of the
// parent's module in the module's order, the core excepted, each with a tick,
// ticked for the facets the parent has. A tick or an untick applies at once,
// and the tag flies from the facet's row to the card; unticking a facet with
// content asks "Are you sure?" in its row first, as its Delete does beside its
// label. The window stays open for more until Escape, a click outside or
// another of the card's actions; Escape returns the focus to the card's tab.
// Each row's › opens the facet's page in the pages' sheet (D20, 0.13.0; from
// 0.8.1 an ⓘ expanded its explanation beneath the row). Since 0.13.3 (D23)
// it is a card on the surface with a heading naming the parent and a close,
// and two groups in the module's order: the facets on the card, each with a
// remove, and the others to add, each with a +; a facet moves between them.
export function FacetWindow({ holderId, parent, title, facets, disabled, onPage = true, hasContent, onAdd, onRemove, onClose }: {
  holderId: string; parent: ParentType; title: string; facets: readonly string[]; disabled: boolean;
  // On a page an added facet waits for Retry, which the heading says; deck settings hold no content.
  onPage?: boolean;
  // Whether unticking would lose what the facet holds; never in deck settings.
  hasContent: (facet: FacetType) => boolean;
  onAdd: (facet: FacetType) => boolean | void | Promise<boolean | void>;
  // Removes the facet; false when it could not be saved, which puts its tick back.
  onRemove: (facet: FacetType) => boolean | void | Promise<boolean | void>;
  // `refocus` returns the focus to the card's tab, after Escape.
  onClose: (refocus: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
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
  // Opened, the focus goes to the first row's button.
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>('.facet-toggle')?.focus(); }, []);
  useEffect(() => {
    // The pages' sheet opens over the window, which stays open beneath it.
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!root.current?.contains(target) && !target?.closest?.('.about-sheet')) close.current(false);
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
    setWanted(current => ({ ...current, [facet]: true }));
    setReturning(facet);
    launchFacet(holderId, facet, root.current?.querySelector(`[data-facet="${facet}"] .facet-tab-mark`)?.getBoundingClientRect());
    if (await onAdd(facet) === false) {
      launchFacet(holderId, facet, undefined);
      forget(facet);
    }
  }
  const headingId = `${ids}-heading`;
  const all = facetsOf(parent);
  const row = (facet: FacetType, on: boolean) => {
    const label = facetName(parent, facet);
    return <li key={facet} className="facet-window-row" data-facet={facet} data-index={all.indexOf(facet)} data-equipped={on || undefined} data-asking={asking === facet || undefined}>
      <span className="facet-tab-mark" aria-hidden="true">{facetMark(parent, facet)}</span>
      <span className="facet-window-name">{label}</span>
      <button type="button" className="facet-about" aria-label={t('about.facet', { name: label })} aria-haspopup="dialog"
        onClick={() => openAbout({ kind: 'facet', module: parent, facet })}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {/* While the parent is busy the button still holds the focus, so it is only marked unavailable. */}
      <button type="button" className="facet-toggle" hidden={asking === facet} aria-disabled={disabled || undefined}
        aria-label={t(on ? 'action.removeNamed' : 'action.addNamed', { name: label })} onClick={() => void toggle(facet)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">{on ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M12 5v14M5 12h14" />}</svg>
      </button>
      {asking === facet && <FacetQuestion name={t('facet.fromCard', { facet: label, card: title })}
        onConfirm={() => { answer(facet); void remove(facet); }}
        onCancel={() => answer(facet)} />}
    </li>;
  };
  const group = (key: 'on' | 'add', members: FacetType[]) => members.length > 0 && <>
    <p className="facet-window-group" id={`${ids}-${key}`}>{t(key === 'on' ? 'card.facetsOn' : 'card.facetsAdd')}</p>
    <ul aria-labelledby={`${ids}-${key}`}>{members.map(facet => row(facet, key === 'on'))}</ul>
  </>;
  return <div ref={root} className="facet-window" role="group" aria-labelledby={headingId}
    onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (asking) answer(asking); else close.current(true);
    }}>
    <header className="facet-window-head">
      <h3 id={headingId}>{t('card.facetsOf', { card: title })}</h3>
      <button type="button" className="facet-window-close" aria-label={t('common.close')} onClick={() => close.current(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>
    <div className="facet-window-body">
      {group('on', all.filter(equipped))}
      {group('add', all.filter(facet => !equipped(facet)))}
      {onPage && <p className="facet-window-hint">{t('card.facetsHint')}</p>}
    </div>
  </div>;
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
