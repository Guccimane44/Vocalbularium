import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

// The facet window's frame is the card's own top line: as the window
// opens, the line flows in from both of the card's top corners, turns down at
// the window's edges and runs round it, the two streams meeting in the middle
// of its bottom edge, where they stop: nothing bounces. The line above
// the window stays where it is and becomes the frame's top. While the window is
// open the card draws no line of its own (page-view.css), so this one is the
// only line along its top.

const RULE = 3;
const FILLET = 10;
const CORNER = 12;
const FLOW_MS = 520;

type Geometry = { left: number; top: number; width: number; height: number; radius: number; start: number; end: number; bottom: number };

// A side's path from its corner of the card's top edge to the middle of the
// window's bottom edge.
function sidePath(g: Geometry, side: 1 | -1) {
  const bottom = g.bottom;
  const y = RULE / 2, r = g.radius, f = FILLET;
  const middle = (g.start + g.end) / 2;
  if (side === 1) {
    return `M${y} ${r} A${r - y} ${r - y} 0 0 1 ${r} ${y} L${g.start - f} ${y} Q${g.start} ${y} ${g.start} ${y + f} `
      + `L${g.start} ${bottom - CORNER} Q${g.start} ${bottom} ${g.start + CORNER} ${bottom} L${middle} ${bottom}`;
  }
  const w = g.width;
  return `M${w - y} ${r} A${r - y} ${r - y} 0 0 0 ${w - r} ${y} L${g.end + f} ${y} Q${g.end} ${y} ${g.end} ${y + f} `
    + `L${g.end} ${bottom - CORNER} Q${g.end} ${bottom} ${g.end - CORNER} ${bottom} L${middle} ${bottom}`;
}

// How much of a side lies along the card's top edge before it turns down.
const ruleLength = (g: Geometry, side: 1 | -1) => (g.radius - RULE / 2) * Math.PI / 2
  + (side === 1 ? g.start - FILLET - g.radius : g.width - g.radius - (g.end + FILLET));

// The window opens on the line's own timeline, never on one of its own: its
// lower edge is wherever the line has got to down the sides, so the two move as one.
export function clipFrames(panel: HTMLElement, frame: number): Keyframe[] {
  const height = panel.offsetHeight, fillet = Math.PI * FILLET / 2;
  const reached = (progress: number) => {
    const along = progress * frame;
    const down = along < fillet ? along * FILLET / fillet : FILLET + along - fillet;
    return Math.min(height, Math.max(0, down - RULE / 2));
  };
  const steps = 24;
  return Array.from({ length: steps + 1 }, (_, step) => {
    const shown = reached(step / steps);
    return { offset: step / steps, clipPath: `inset(0 0 ${shown >= height ? -40 : height - shown}px 0 round 0 0 12px 12px)` };
  });
}

function unfold(panel: HTMLElement, frame: number) {
  panel.animate(clipFrames(panel, frame), { duration: FLOW_MS, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'both' });
}

export function FacetFlow({ target, closing }: { target: RefObject<HTMLElement | null>; closing: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const played = useRef(false);
  useLayoutEffect(() => {
    const panel = target.current, head = panel?.parentElement, card = head?.closest<HTMLElement>('.component');
    if (!panel || !head || !card) return;
    const measure = () => {
      const h = head.getBoundingClientRect(), c = card.getBoundingClientRect(), w = panel.getBoundingClientRect();
      setGeometry({ left: c.left - h.left, top: c.top - h.top, width: c.width, height: w.bottom - c.top + RULE,
        radius: parseFloat(getComputedStyle(card).borderTopLeftRadius) || 14,
        start: w.left - c.left, end: w.right - c.left, bottom: w.bottom - c.top });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    observer.observe(card);
    return () => observer.disconnect();
  }, [target]);
  useLayoutEffect(() => {
    // Closing, the window animates the line back itself (facet-window.tsx).
    if (!geometry || !svg.current || closing) return;
    const still = played.current || matchMedia('(prefers-reduced-motion: reduce)').matches;
    played.current = true;
    const panel = target.current;
    svg.current.querySelectorAll<SVGPathElement>('path[data-side]').forEach(path => {
      const side = Number(path.dataset.side) as 1 | -1;
      const total = path.getTotalLength(), rule = Math.min(ruleLength(geometry, side), total);
      path.dataset.total = String(total);
      path.dataset.rule = String(rule);
      const open = { strokeDasharray: `${total - rule} ${2 * total}`, strokeDashoffset: `${-rule}` };
      Object.assign(path.style, open);
      if (still) return;
      path.animate([{ strokeDasharray: `${rule} ${2 * total}`, strokeDashoffset: '0' }, open], { duration: FLOW_MS, easing: 'cubic-bezier(.5, 0, .2, 1)' });
      path.animate([{ strokeWidth: `${RULE}` }, { strokeWidth: `${RULE * 1.5}`, offset: .5 }, { strokeWidth: `${RULE}` }], { duration: FLOW_MS, easing: 'ease' });
      if (side === 1 && panel) unfold(panel, total - rule);
    });
  }, [geometry]);
  if (!geometry) return null;
  const y = RULE / 2;
  return <svg ref={svg} className="facet-flow" aria-hidden="true" width={geometry.width} height={geometry.height}
    viewBox={`0 0 ${geometry.width} ${geometry.height}`} style={{ left: geometry.left, top: geometry.top }}>
    <path d={`M${geometry.start - FILLET} ${y} L${geometry.end + FILLET} ${y}`} />
    <path data-side="1" d={sidePath(geometry, 1)} />
    <path data-side="-1" d={sidePath(geometry, -1)} />
  </svg>;
}
