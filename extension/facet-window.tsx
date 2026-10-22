import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { facetAbbreviation, facetLabel, facetsOf } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { launchFacet } from './facet-tags.tsx';

// A parent's facet window (D13, 0.8.1), opened by Facet among the parent's
// actions, on a page and in deck settings. It lists every facet of the
// parent's module in the module's order, the core excepted, each with a tick,
// ticked for the facets the parent has. A tick or an untick applies at once,
// and the tag flies from the facet's row to the card; unticking a facet with
// content asks "Are you sure?" in its row first, as its Delete does beside its
// label. The window stays open for more until Escape, a click outside or
// another of the card's actions; Escape returns the focus to the card's tab.
export function FacetWindow({ holderId, parent, title, facets, disabled, hasContent, onAdd, onRemove, onClose }: {
  holderId: string; parent: ParentType; title: string; facets: readonly string[]; disabled: boolean;
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
  // A tick shows at once, before the parent has saved it; what the parent
  // holds takes over as soon as it changes, and a failed add takes it back.
  const [wanted, setWanted] = useState<Readonly<Record<string, boolean>>>({});
  const holding = facets.join('|');
  useEffect(() => { setWanted({}); }, [holding]);
  const equipped = (facet: FacetType) => wanted[facet] ?? facets.includes(facet);
  // Opened, the focus goes to the first row.
  useEffect(() => { root.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close.current(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => {
    if (!returning) return;
    root.current?.querySelector<HTMLInputElement>(`[data-facet="${returning}"] input[type="checkbox"]`)?.focus();
    setReturning(null);
  }, [returning]);
  const answer = (facet: FacetType) => { setAsking(null); setReturning(facet); };
  const forget = (facet: FacetType) => setWanted(current => { const next = { ...current }; delete next[facet]; return next; });
  async function remove(facet: FacetType) {
    setWanted(current => ({ ...current, [facet]: false }));
    if (await onRemove(facet) === false) forget(facet);
  }
  async function toggle(facet: FacetType) {
    if (disabled) return;
    if (equipped(facet)) {
      if (hasContent(facet)) setAsking(facet); else void remove(facet);
      return;
    }
    setWanted(current => ({ ...current, [facet]: true }));
    launchFacet(holderId, facet, root.current?.querySelector(`[data-facet="${facet}"] .facet-tab-mark`)?.getBoundingClientRect());
    if (await onAdd(facet) === false) {
      launchFacet(holderId, facet, undefined);
      forget(facet);
    }
  }
  return <div ref={root} className="facet-window" role="group" aria-label={`Facets of ${title}`}
    onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (asking) answer(asking); else close.current(true);
    }}>
    <ul>
      {facetsOf(parent).map(facet => {
        const label = facetLabel(parent, facet);
        const on = equipped(facet);
        return <li key={facet} className="facet-window-row" data-facet={facet} data-equipped={on || undefined}>
          <label>
            <span className="facet-tab-mark" aria-hidden="true">{facetAbbreviation(parent, facet)}</span>
            <span className="facet-window-name">{label}</span>
            {/* While the parent is busy a tick still holds the focus, so it is only marked unavailable. */}
            <input type="checkbox" checked={on} aria-disabled={disabled || undefined} hidden={asking === facet}
              onClick={event => { if (disabled) event.preventDefault(); }} onChange={() => void toggle(facet)} />
          </label>
          {asking === facet && <FacetQuestion name={`${label} from ${title}`}
            onConfirm={() => { answer(facet); void remove(facet); }}
            onCancel={() => answer(facet)} />}
        </li>;
      })}
    </ul>
  </div>;
}

// The facet's question, as beside its label (page-view.tsx): "Are you sure?",
// the final Delete, and Cancel last, where the tick was, taking the focus.
function FacetQuestion({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <span className="facet-confirm" data-confirm="delete" role="group" aria-label={`Delete ${name}?`}>
    <span className="confirm-text" style={{ '--i': 2 } as CSSProperties}>Are you sure?</span>
    <button type="button" className="action-confirm" style={{ '--i': 1 } as CSSProperties} aria-label={`Yes, delete ${name}`} onClick={onConfirm}>Delete</button>
    <button type="button" ref={cancel} style={{ '--i': 0 } as CSSProperties} aria-label={`Keep ${name}`} onClick={onCancel}>Cancel</button>
  </span>;
}
