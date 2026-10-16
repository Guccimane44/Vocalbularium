import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { facetAbbreviation, facetLabel, ordered } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';

// A parent's facets as bookmark tags on its card (0.7.1), one per facet in the
// parent's order, each marked with its facet's abbreviation. Where they sit
// follows the card:
// - `edge`: a card with content, the tags stuck out of its left edge;
// - `folded`: a folded card, the tags hanging from the right of its bottom edge;
// - `hanging`: a card that is only its tab (an empty or generating component,
//   and every module in deck settings), the tags hung below the tab on chains.
// A facet added from the module window flies there from where it was let go;
// folding and unfolding move the tags along the card's edge between the left
// side and the bottom right; a deleted facet's tag pops. Under reduced motion
// each simply stands in its place.
export type TagLayout = 'edge' | 'folded' | 'hanging';

// A facet picked up with its + in the module window, waiting to be placed
// (0.7.2): each parent that would take it wears a ghost of its tag in the slot
// the tag would take, and the real tags make room. Placed, the ghost stays on
// its parent until the facet arrives there and its tag takes the ghost's place.
// `label` is the ghost's accessible name, such as "Add Synonyms to German 2".
export type GhostTag = { facet: FacetType; label: string; placing: boolean };

// Where an added facet was last seen in the module window, by parent and facet,
// so that its tag can fly from there once the parent has it.
const launches = new Map<string, { rect: DOMRect; at: number }>();
const LAUNCH_TTL_MS = 15000;
// Without a place (the add failed), whatever was recorded is forgotten.
export function launchFacet(holderId: string, facet: string, rect: DOMRect | undefined) {
  if (rect) launches.set(`${holderId}:${facet}`, { rect, at: Date.now() });
  else launches.delete(`${holderId}:${facet}`);
}
function takeLaunch(holderId: string, facet: string): DOMRect | null {
  const key = `${holderId}:${facet}`;
  const launch = launches.get(key);
  launches.delete(key);
  return launch && Date.now() - launch.at < LAUNCH_TTL_MS ? launch.rect : null;
}

const still = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
// Folding and the tags take turns, so the two never pull against each other
// (page-view.css holds the same durations as --fold and --tag-travel):
// folding, the tags first travel along the still edge to the bottom right,
// then the card folds and they ride its bottom edge up; unfolding, the card
// opens with them riding its bottom edge down, then they travel back.
export const FOLD_MS = 500;
export const TAG_TRAVEL_MS = 600;
const ALONG_THE_EDGE = { duration: TAG_TRAVEL_MS, easing: 'cubic-bezier(.45,0,.25,1)' };
const FLIGHT = { duration: 560, easing: 'cubic-bezier(.3,.7,.2,1)' };
export const TAG_POP_MS = 240;

type Spot = { x: number; y: number };

// Keyframes for a move from `from` to the tag's place (0, 0) by way of
// `corner`, both as offsets from that place: two straight runs joined by a
// rounded turn, sampled by distance so the speed stays even through the turn.
const ROUNDING = 14;
function alongTheEdge(from: Spot, corner: Spot): Keyframe[] {
  const to = { x: 0, y: 0 };
  const run = (a: Spot, b: Spot) => Math.hypot(b.x - a.x, b.y - a.y);
  const toward = (a: Spot, b: Spot, distance: number) => {
    const length = run(a, b) || 1;
    return { x: a.x + (b.x - a.x) * distance / length, y: a.y + (b.y - a.y) * distance / length };
  };
  const r = Math.min(ROUNDING, run(from, corner) / 2, run(corner, to) / 2);
  const enter = toward(corner, from, r), leave = toward(corner, to, r);
  // The turn as a quadratic curve through the corner, in a few short steps.
  const turn = Array.from({ length: 7 }, (_, index) => {
    const t = (index + 1) / 8;
    return { x: (1 - t) ** 2 * enter.x + 2 * (1 - t) * t * corner.x + t * t * leave.x,
      y: (1 - t) ** 2 * enter.y + 2 * (1 - t) * t * corner.y + t * t * leave.y };
  });
  const points = [from, enter, ...turn, leave, to];
  const lengths = points.map((point, index) => index ? run(points[index - 1]!, point) : 0);
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let travelled = 0;
  return points.map((point, index) => {
    travelled += lengths[index]!;
    return { transform: `translate(${point.x}px, ${point.y}px)`, offset: travelled / total };
  });
}

export function FacetTags({ holderId, parent, facets, filled, layout, title, disabled = false, ghost, onOpen, onRemove }: {
  holderId: string; parent: ParentType; facets: readonly string[]; layout: TagLayout; title: string; disabled?: boolean;
  // The facets with content on the card (0.7.3); the others wear a blander
  // tag. Absent where content does not apply, as in deck settings.
  filled?: readonly string[];
  // The facet picked up in the module window, when this parent would take it.
  ghost?: GhostTag | null;
  // Clicking a tag shows its facet's section; absent where a card has none.
  onOpen?: (facet: FacetType) => void;
  onRemove?: (facet: FacetType) => void;
}) {
  const ghostFacet = ghost && !facets.includes(ghost.facet) ? ghost.facet : null;
  const shown = ordered(parent, ghostFacet ? [...facets, ghostFacet] : facets);
  const key = `${shown.join('|')}:${ghostFacet ?? ''}`;
  // Tags popping away, each where it stood.
  const [leaving, setLeaving] = useState<ReadonlyArray<{ facet: FacetType; index: number }>>([]);
  const root = useRef<HTMLUListElement>(null);
  const before = useRef<{ facets: readonly FacetType[]; ghost: FacetType | null; layout: TagLayout; spots: Map<string, Spot> } | null>(null);
  // Unfolding, the tags stay on the bottom edge while the card opens, and
  // only then go back to the left side.
  const [prior, setPrior] = useState(layout);
  const [holding, setHolding] = useState(false);
  const unfolding = prior === 'folded' && layout === 'edge';
  if (layout !== prior) { setPrior(layout); setHolding(unfolding && !still()); }
  const place: TagLayout = (layout !== prior ? unfolding && !still() : holding) ? 'folded' : layout;
  // Where the tags stand now, against the card, so a scroll in between changes nothing.
  const measure = () => {
    const list = root.current, card = list?.closest<HTMLElement>('.component');
    if (!list || !card) return null;
    const tags = [...list.querySelectorAll<HTMLElement>('.facet-tag:not([data-leaving])')];
    for (const tag of tags) for (const animation of tag.getAnimations()) if (animation.id === 'facet-tag') animation.cancel();
    const box = card.getBoundingClientRect();
    return { tags, spots: new Map(tags.map(tag => {
      const rect = tag.getBoundingClientRect();
      return [tag.dataset.facet!, { x: rect.left - box.left, y: rect.top - box.top }];
    })) };
  };
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => {
      // The card has opened: the tags set out from where its bottom edge now is.
      const now = measure();
      if (now && before.current) before.current = { ...before.current, spots: now.spots };
      setHolding(false);
    }, FOLD_MS);
    return () => clearTimeout(timer);
  }, [holding]);

  useLayoutEffect(() => {
    const list = root.current;
    const card = list?.closest<HTMLElement>('.component');
    if (!list || !card) return;
    const previous = before.current;
    // A ghost that goes was never a facet: it vanishes without popping.
    const gone = previous ? previous.facets.filter(facet => !shown.includes(facet) && facet !== previous.ghost) : [];
    if (gone.length && !still()) {
      setLeaving(current => [...current.filter(item => !gone.includes(item.facet)),
        ...gone.map(facet => ({ facet, index: previous!.facets.indexOf(facet) }))]);
      setTimeout(() => setLeaving(current => current.filter(item => !gone.includes(item.facet))), TAG_POP_MS);
    }
    const { tags, spots } = measure()!;
    before.current = { facets: shown, ghost: ghostFacet, layout: place, spots };
    if (!previous || still()) return;
    const turned = previous.layout !== place;
    tags.forEach((tag, index) => {
      const facet = tag.dataset.facet!;
      const to = spots.get(facet)!;
      const from = previous.spots.get(facet);
      const play = (keyframes: Keyframe[], timing: KeyframeAnimationOptions) => { tag.animate(keyframes, { ...timing, id: 'facet-tag' }); };
      // A tag arriving where its ghost waited flies in from the window too (0.7.2).
      const replacing = facet === previous.ghost && facet !== ghostFacet;
      if (!from || replacing) {
        // A new tag flies in from the window, or pops in when it came from elsewhere.
        const launch = takeLaunch(holderId, facet);
        if (!launch && replacing) return;
        if (!launch) { play([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: TAG_POP_MS, easing: 'cubic-bezier(.34,1.56,.64,1)' }); return; }
        const rect = tag.getBoundingClientRect();
        const dx = launch.left + launch.width / 2 - (rect.left + rect.width / 2), dy = launch.top + launch.height / 2 - (rect.top + rect.height / 2);
        const lift = Math.min(80, Math.hypot(dx, dy) / 4);
        play([{ transform: `translate(${dx}px, ${dy}px) scale(1.15)`, opacity: .6 },
          { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.1)`, opacity: 1, offset: .5 },
          { transform: 'none', opacity: 1 }], FLIGHT);
        return;
      }
      const dx = from.x - to.x, dy = from.y - to.y;
      if (!dx && !dy) return;
      const timing = { ...ALONG_THE_EDGE, delay: index * 40, fill: 'backwards' as const };
      // Between the left side and the bottom right, a tag keeps to the card's
      // edge: down the left side, round the corner and along the bottom, or
      // back the same way.
      const corner = turned && previous.layout === 'edge' && place === 'folded' ? { x: dx, y: 0 }
        : turned && previous.layout === 'folded' && place === 'edge' ? { x: 0, y: dy } : null;
      play(corner ? alongTheEdge({ x: dx, y: dy }, corner)
        : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing);
    });
  }, [key, place]);

  // The list stays while empty, so the last tag can still pop and a facet added later flies in.
  const tag = (facet: FacetType, index: number, gone = false) => {
    const label = facetLabel(parent, facet);
    const unfilled = filled && !filled.includes(facet);
    const mark = <span className="facet-tag-mark" aria-hidden="true">{facetAbbreviation(parent, facet)}</span>;
    // A ghost is the tag's outline; clicking it, or its card, places the facet
    // there (shaping.tsx handles the click). The key stays the facet's, so
    // the placed ghost turns into the tag that arrives in its place.
    if (facet === ghostFacet) return <li key={facet} className="facet-tag" data-facet={facet} data-ghost={ghost!.placing ? 'placing' : ''}
      style={{ '--i': index } as CSSProperties}>
      <svg className="facet-ghost-shape" viewBox="0 0 24 30" aria-hidden="true"><path d="M.8 .8H23.2V29.2L12 22.8L.8 29.2Z" /></svg>
      {ghost!.placing ? <span className="facet-tag-open" aria-hidden="true">{mark}</span>
        : <button type="button" className="facet-tag-open facet-ghost" aria-label={ghost!.label}>{mark}</button>}
    </li>;
    return <li key={facet} className="facet-tag" data-facet={facet} data-leaving={gone || undefined} data-unfilled={unfilled || undefined}
      style={{ '--i': index } as CSSProperties} aria-hidden={gone || undefined}>
      {/* A facet with nothing in it has nothing to show: its tag is not a button,
          so clicking it moves nothing (0.7.3). */}
      {onOpen && !gone && !unfilled ? <button type="button" className="facet-tag-open" aria-label={`Show ${label} in ${title}`} onClick={() => onOpen(facet)}>{mark}</button>
        : <span className="facet-tag-open" role="img" aria-label={unfilled ? `${label}, empty` : label}>{mark}</span>}
      {onRemove && !gone && <button type="button" className="facet-tag-remove" aria-label={`Remove ${label} from ${title}`} disabled={disabled}
        onClick={() => onRemove(facet)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>}
    </li>;
  };
  return <ul ref={root} className="facet-tags" data-layout={place} aria-label={shown.length ? `${title} facets` : undefined}
    hidden={!shown.length && !leaving.length || undefined} style={{ '--n': shown.length } as CSSProperties}>
    {shown.map((facet, index) => tag(facet, index))}
    {leaving.filter(item => !shown.includes(item.facet)).map(item => tag(item.facet, item.index, true))}
  </ul>;
}
