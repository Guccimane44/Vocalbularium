import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

// The facet window's frame is the card's own top line: as the window
// opens, the line flows in from both of the card's top corners, turns down at
// the window's edges and runs round it, the two streams meeting in the middle
// of its bottom edge, which dips and springs back as they meet. The line above
// the window stays where it is and becomes the frame's top. While the window is
// open the card draws no line of its own (page-view.css), so this one is the
// only line along its top.

const RULE = 3;
const FILLET = 10;
const CORNER = 12;
const FLOW_MS = 520;
const POUR_MS = 620;
const DIP = 12;

type Geometry = { left: number; top: number; width: number; height: number; radius: number; start: number; end: number; bottom: number };

// A side's path from its corner of the card's top edge to the middle of the
// window's bottom edge; `bottom` moves for the dip.
function sidePath(g: Geometry, side: 1 | -1, bottom = g.bottom) {
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

export function FacetFlow({ target, closing }: { target: RefObject<HTMLElement | null>; closing: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const played = useRef(false);
  useLayoutEffect(() => {
    const panel = target.current, head = panel?.parentElement, card = head?.closest<HTMLElement>('.component');
    if (!panel || !head || !card) return;
    const measure = () => {
      const h = head.getBoundingClientRect(), c = card.getBoundingClientRect(), w = panel.getBoundingClientRect();
      setGeometry({ left: c.left - h.left, top: c.top - h.top, width: c.width, height: w.bottom - c.top + DIP + RULE,
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
      const at = (bottom: number) => `path("${sidePath(geometry, side, bottom)}")`;
      path.animate([{ d: at(geometry.bottom), offset: 0 }, { d: at(geometry.bottom), offset: .72 }, { d: at(geometry.bottom + DIP), offset: .86 },
        { d: at(geometry.bottom - 3), offset: .94 }, { d: at(geometry.bottom), offset: 1 }], { duration: POUR_MS, easing: 'ease-out' });
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
