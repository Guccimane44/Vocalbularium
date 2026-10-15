import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, pointerWithin, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors
} from '@dnd-kit/core';
import type {
  Active, Announcements, CollisionDetection, DragEndEvent, DragMoveEvent, DragStartEvent, KeyboardCoordinateGetter, Modifier, Over
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addBlocked, CATALOG, FAMILIES, FAMILY_LABELS, WINDOW_MODULES } from '@vocabularium/domain/page-modules';
import type { ModuleFamily, ModuleType } from '@vocabularium/domain/page-modules';
import { facetLabel, facetsOf, facetTargets, facetUnavailable, isParentType, PARENTS } from '@vocabularium/domain/parents';
import type { FacetHolder, FacetType, ParentType } from '@vocabularium/domain/parents';
import { launchFacet } from './facet-tags.tsx';
import type { GhostTag } from './facet-tags.tsx';
import { FamilyIcon } from './families.tsx';

// Shared by the page view and deck settings (D02, D04): a list whose entries
// reorder by drag, and the module window whose modules drag into the list.
// An entry drags by its label (D07); the six dots beside it open its menu.
// Every drag also works from the keyboard: Space picks up, the arrow keys
// move, Space drops, Escape cancels. Enter is left to the label's own click.

const WINDOW = 'window:';
// A facet from the window (D08): it lands only on a parent of its own type.
const FACET = 'facet:';
const LIST_END = 'list-end';
// The landing card a window module shows in the list where it would land.
const LANDING = 'landing';
// An entry being reordered moves only up and down its list, in its column;
// a module from the window follows the pointer until it is over the list.
const alongTheList: Modifier = ({ active, transform }) => fromWindow(active) || isFacet(active) ? transform : { ...transform, x: 0 };

// The module window itself: dropping a module back onto it cancels the drag.
const BACK = 'module-window';
export const moduleLabel = (type: string) => CATALOG[type as ModuleType]?.label ?? type;
const fromWindow = (active: Active | null) => Boolean(active && String(active.id).startsWith(WINDOW));
const windowType = (active: Active) => String(active.id).slice(WINDOW.length);
// Where a facet picked up with its + is placed (0.7.2): the tab of a parent
// that would take it, or the ghost of its tag there.
const PLACE = '.card-tab, .facet-tag[data-ghost]';
const PLACES = '.sortable-row[data-ghost-target] :is(.card-tab, .facet-tag[data-ghost])';
const isFacet = (active: Active | null) => Boolean(active && String(active.id).startsWith(FACET));
const facetId = (parent: string, facet: string) => `${FACET}${parent}:${facet}`;
function facetOf(id: string | number): { parent: ParentType; facet: FacetType } {
  const [parent, facet] = String(id).slice(FACET.length).split(':');
  return { parent: parent as ParentType, facet: facet as FacetType };
}
const facetName = (id: string | number) => { const { parent, facet } = facetOf(id); return `${PARENTS[parent].label} ${facetLabel(parent, facet)}`; };

// A module from the window lands on the entry under the pointer, or goes back
// when the pointer is over the window again. Reordering uses the nearest entry:
// the list shifts as a card moves, so the entry under the pointer is often the
// card's own slot. A keyboard drag has no pointer and always uses the nearest
// entry; Escape puts it back.
const collisionFor = (targets: { current: ReadonlySet<string> }): CollisionDetection => args => {
  // A facet lands only on a parent that would take it, under the pointer or,
  // from the keyboard, the nearest one; over the window it goes back.
  if (isFacet(args.active)) {
    const hits = pointerWithin(args);
    const back = hits.find(hit => hit.id === BACK);
    if (back) return [back];
    const onTarget = hits.filter(hit => targets.current.has(String(hit.id)));
    if (onTarget.length || args.pointerCoordinates) return onTarget;
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(entry => targets.current.has(String(entry.id))) });
  }
  const list = { ...args, droppableContainers: args.droppableContainers.filter(entry => entry.id !== BACK) };
  // An entry being reordered only lands among the entries: over the end zone
  // it is nearest the last one, so the others make room as for any place.
  if (!fromWindow(args.active)) return closestCenter({ ...list, droppableContainers: list.droppableContainers.filter(entry => entry.id !== LIST_END) });
  const hits = pointerWithin(args);
  const back = hits.find(hit => hit.id === BACK);
  if (back) return [back];
  return hits.length ? hits : closestCenter(list);
};

// List entries move with dnd-kit's sortable keyboard steps. A window module is
// not in the list, so its arrow keys step through the list's drop targets.
const keyboardFor = (facetTargetIds: { current: ReadonlySet<string> }): KeyboardCoordinateGetter => (event, args) => {
  const { active, droppableRects, droppableContainers, over, collisionRect } = args.context;
  if (!fromWindow(active) && !isFacet(active)) return sortableKeyboardCoordinates(event, args);
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) || !collisionRect) return undefined;
  event.preventDefault();
  // A facet steps through the parents that would take it.
  const targets = droppableContainers.getEnabled().filter(entry => entry.id !== BACK && entry.id !== LANDING && droppableRects.get(entry.id) &&
    (!isFacet(active) || facetTargetIds.current.has(String(entry.id))))
    .sort((a, b) => droppableRects.get(a.id)!.top - droppableRects.get(b.id)!.top);
  if (!targets.length) return undefined;
  const back = event.code === 'ArrowUp' || event.code === 'ArrowLeft';
  // Over the landing card, the module stands before the entry that follows it.
  const landingRect = over?.id === LANDING ? droppableRects.get(LANDING) : undefined;
  const current = landingRect ? targets.findIndex(entry => droppableRects.get(entry.id)!.top >= landingRect.bottom - 1)
    : targets.findIndex(entry => entry.id === over?.id);
  const next = current < 0 ? (back ? targets.length - 1 : 0) : Math.min(targets.length - 1, Math.max(0, current + (back ? -1 : 1)));
  const rect = droppableRects.get(targets[next].id)!;
  return { x: rect.left + rect.width / 2 - collisionRect.width / 2, y: rect.top + rect.height / 2 - collisionRect.height / 2 };
};

export type ShapeItem = { id: string; label: string; holder?: FacetHolder };

// Identical modules in one list are told apart by number, in the list's
// order (0.7.2): with two German modules they are German 1 and German 2; a
// module alone of its type keeps its plain label.
export function numbered<T extends { type: string; label: string }>(items: readonly T[]): T[] {
  const count = new Map<string, number>();
  for (const item of items) count.set(item.type, (count.get(item.type) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map(item => {
    if (count.get(item.type)! < 2) return item;
    const n = (seen.get(item.type) ?? 0) + 1;
    seen.set(item.type, n);
    return { ...item, label: `${item.label} ${n}` };
  });
}
// What an entry needs to be dragged: spread `drag` on its label, which then
// starts a drag with the pointer or Space, and show `menu` before it. `ghost`
// is the facet picked up with its + that this entry would take, for its tags.
export type RowParts = { drag: Record<string, unknown>; menu: ReactNode; ghost?: GhostTag | null };
const KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space'] };
// The index onAdd receives from the window's +: after the last entry, whatever the list holds by then.
export const AT_THE_END = Number.POSITIVE_INFINITY;
type Result = boolean | void | Promise<boolean | void>;

// The list below a pinned first entry (the main key), and the module window
// beside it. Indexes passed to the handlers count among the movable entries,
// so nothing is ever placed above the pinned one. A handler returning false
// reports a failed save, which restores the saved order.
export function ShapingArea<T extends ShapeItem>({ items, types, disabled, unavailable, pinned, label, where, onAdd, onMove, onAddFacet, renderItem, menuItems = [], renderLanding = type => <span>{moduleLabel(type)}</span> }: {
  items: T[];
  // Every module type present, the pinned main key included, for the window's limits.
  types: readonly string[];
  disabled: boolean;
  unavailable?: string;
  // Shown above the list and never moved; the page view shows its main key as the title instead.
  pinned?: ReactNode;
  label: string;
  where: string;
  onAdd: (type: string, index: number) => Result;
  onMove: (id: string, index: number) => Result;
  // Adds a facet to one of the items, a parent of the facet's type (D08).
  onAddFacet?: (id: string, parent: ParentType, facet: FacetType) => Result;
  renderItem: (item: T, parts: RowParts) => ReactNode;
  // Placeholder entries for each row's menu.
  menuItems?: readonly string[];
  // How a module from the window looks in the list while it is dragged over
  // it and while it is being added, so it looks like the entries around it.
  renderLanding?: (type: string) => ReactNode;
}) {
  // The parents a dragged facet would land on.
  const facetTargetIds = useRef<ReadonlySet<string>>(new Set());
  const collision = useMemo(() => collisionFor(facetTargetIds), []);
  const keyboard = useMemo(() => keyboardFor(facetTargetIds), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboard, keyboardCodes: KEYBOARD_CODES }));
  const ids = items.map(item => item.id);
  const key = ids.join('|');
  // The order shown: changed at once on a drop, so a card never snaps back
  // while its move is being saved, and reset whenever the saved order changes.
  const [order, setOrder] = useState(ids);
  const [adding, setAdding] = useState<{ type: string; index: number } | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const saved = useRef(ids);
  const list = useRef<HTMLElement>(null);
  // Where a dropped module was last seen, so it can glide into its place.
  const settleFrom = useRef<DOMRect | null>(null);
  saved.current = ids;
  useEffect(() => { setOrder(ids); setAdding(null); }, [key]);
  const byId = new Map(items.map(item => [item.id, item]));
  // The local order only stands for a move still being saved. Once an entry
  // is added or removed, the saved order is shown at once, so a new entry
  // appears in its place rather than first at the end (0.6.3).
  const reordering = order.length === ids.length && ids.every(id => order.includes(id));
  const shown = (reordering ? order : ids).map(id => byId.get(id)!);
  // A module being added holds its place until its entry arrives.
  const waiting = adding && reordering ? adding : null;
  // dnd-kit compares the sortable IDs by identity and turns the other entries'
  // sliding off when they change, so keep one array while the order is the
  // same: the area re-renders on every pointer move of a drag.
  const shownKey = shown.map(item => item.id).join('|');
  const sortableIds = useMemo(() => shownKey ? shownKey.split('|') : [], [shownKey]);

  const name = (id: string | number) => {
    const value = String(id);
    if (value.startsWith(FACET)) return facetName(value);
    return value.startsWith(WINDOW) ? moduleLabel(value.slice(WINDOW.length)) : byId.get(value)?.label ?? 'the end';
  };
  const holders = items.flatMap(item => item.holder ? [item.holder] : []);
  // A parent by its label, numbered among the parents of its type by the list's owner (numbered).
  const holderName = (id: string) => byId.get(id)!.label;
  // Where a window module would land: before the entry it is over, or after it
  // when a pointer is in its lower half; at the end over the end zone.
  function landing(active: Active, over: Over | null, keyboardDrag: boolean): number | null {
    if (!over || String(over.id) === BACK) return null;
    if (String(over.id) === LANDING) return slot;
    if (String(over.id) === LIST_END) return shown.length;
    const index = shown.findIndex(item => item.id === String(over.id));
    if (index < 0) return null;
    const rect = active.rect.current.translated;
    if (keyboardDrag || !rect) return index;
    return rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 ? index + 1 : index;
  }
  // A keyboard drag is over a target as soon as it starts, and dnd-kit's live
  // region shows only the latest announcement of a render: a place announced
  // with the pickup also says it was picked up, or the pickup is never heard.
  const pickedUp = useRef<string | null>(null);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      pickedUp.current = `Picked up ${name(active.id)}.`;
      setTimeout(() => { pickedUp.current = null; });
      return pickedUp.current;
    },
    onDragOver: event => {
      const lead = pickedUp.current ? `${pickedUp.current} ` : '';
      pickedUp.current = null;
      return lead + overAnnouncement(event);
    },
    onDragEnd: ({ active, over }) => isFacet(active)
      ? over && facetTargetIds.current.has(String(over.id)) ? `${name(active.id)} was added to ${holderName(String(over.id))}.` : `${name(active.id)} was not added.`
      : over && String(over.id) !== BACK ? `${name(active.id)} was dropped.` : `${name(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`
  };
  function overAnnouncement({ active, over }: { active: Active; over: Over | null }) {
    if (isFacet(active)) {
      if (over && String(over.id) === BACK) return `${name(active.id)} is back in the module window.`;
      return over && facetTargetIds.current.has(String(over.id)) ? `${name(active.id)} is over ${holderName(String(over.id))}.`
        : `${name(active.id)} is not over a ${PARENTS[facetOf(active.id).parent].label} module.`;
    }
    if (!over) return `${name(active.id)} is not over the list.`;
    if (String(over.id) === BACK) return `${name(active.id)} is back in the module window.`;
    if (String(over.id) === LIST_END) return `${name(active.id)} is over the end.`;
    if (String(over.id) === LANDING) return `${name(active.id)} is over position ${(slot ?? shown.length) + 2}.`;
    const at = fromWindow(active) ? landing(active, over, true) : shown.findIndex(item => item.id === String(over.id));
    return at === null || at < 0 ? `${name(active.id)} is over the end.` : `${name(active.id)} is over position ${at + 2}.`;
  }
  const keyboardDrag = (event: { activatorEvent: Event }) => event.activatorEvent instanceof KeyboardEvent;
  function start({ active }: DragStartEvent) {
    if (isFacet(active)) {
      const { parent, facet } = facetOf(active.id);
      facetTargetIds.current = new Set(facetTargets(holders, parent, facet).map(holder => holder.id));
    }
    setDragged(String(active.id)); setSlot(null);
  }
  const [facetOver, setFacetOver] = useState<string | null>(null);
  function move(event: DragMoveEvent) {
    if (fromWindow(event.active)) setSlot(landing(event.active, event.over, keyboardDrag(event)));
    if (isFacet(event.active)) setFacetOver(event.over && facetTargetIds.current.has(String(event.over.id)) ? String(event.over.id) : null);
  }
  // The facet's targets outlive its drag: dnd-kit announces the drop after
  // onDragEnd, and a facet's next pickup sets them afresh.
  function finish() { setDragged(null); setSlot(null); setFacetOver(null); }
  // The facet's tag flies to its parent from where the facet was let go, or
  // from its place in the window when added with its + (0.7.1).
  async function addFacet(id: string, parent: ParentType, facet: FacetType, from?: DOMRect) {
    if (disabled || !onAddFacet) return;
    launchFacet(id, facet, from ?? document.querySelector(`.window-facet[data-parent="${parent}"][data-facet="${facet}"] .window-facet-body`)?.getBoundingClientRect());
    if (await onAddFacet(id, parent, facet) === false) launchFacet(id, facet, undefined);
  }
  // A facet's + with several parents that would take it picks the facet up
  // (0.7.2): each of them wears a ghost of its tag until one is clicked, or
  // its card is, which places the facet there; Escape, the + again or a
  // click elsewhere puts it back. With one such parent the + adds at once.
  const [picked, setPicked] = useState<{ parent: ParentType; facet: FacetType; placing: string | null } | null>(null);
  const reach = useRef(false);
  const ghostTargets = picked ? picked.placing ? new Set([picked.placing])
    : new Set(facetTargets(holders, picked.parent, picked.facet).map(holder => holder.id)) : new Set<string>();
  const plusOf = (parent: ParentType, facet: FacetType) =>
    document.querySelector<HTMLElement>(`.window-facet[data-parent="${parent}"][data-facet="${facet}"] .window-add`);
  function cancelPick(refocus: boolean) {
    if (!picked || picked.placing) return;
    setPicked(null);
    if (refocus) plusOf(picked.parent, picked.facet)?.focus();
  }
  function pick(parent: ParentType, facet: FacetType) {
    if (disabled || !onAddFacet) return;
    if (picked && !picked.placing && picked.parent === parent && picked.facet === facet) { cancelPick(false); return; }
    const targets = facetTargets(holders, parent, facet);
    if (targets.length === 1) { setPicked(null); void addFacet(targets[0]!.id, parent, facet); return; }
    if (!targets.length) return;
    reach.current = true;
    setPicked({ parent, facet, placing: null });
  }
  async function place(id: string) {
    if (!picked || picked.placing || disabled || !onAddFacet) return;
    const { parent, facet } = picked;
    setPicked({ parent, facet, placing: id });
    // The tag flies from the facet in the window into its ghost, as when added with a single target.
    launchFacet(id, facet, document.querySelector(`.window-facet[data-parent="${parent}"][data-facet="${facet}"] .window-facet-body`)?.getBoundingClientRect());
    if (await onAddFacet(id, parent, facet) === false) { launchFacet(id, facet, undefined); setPicked(null); }
  }
  // Picked up, the focus goes to the first ghost, scrolled into view.
  useEffect(() => {
    if (!picked || !reach.current) return;
    reach.current = false;
    const first = list.current?.querySelector<HTMLElement>('.facet-ghost');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked]);
  // What the parents hold, to notice when a ghost should go or move.
  const holderKey = holders.map(holder => `${holder.id}:${(holder.facets ?? []).join(',')}:${holder.status ?? ''}`).join('|');
  // A placed ghost goes once its facet has arrived, or its parent has gone;
  // a picked facet goes back when no parent would take it any more, or when
  // shaping turns off.
  useEffect(() => {
    if (!picked) return;
    if (picked.placing) {
      const holder = holders.find(each => each.id === picked.placing);
      if (!holder || holder.facets?.includes(picked.facet)) setPicked(null);
    } else if (disabled || !ghostTargets.size) setPicked(null);
  }, [holderKey, disabled, picked]);
  useEffect(() => {
    if (!picked || picked.placing) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest?.(`${PLACES}, .window-facet[data-picked]`)) cancelPick(false);
    };
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelPick(true); return; }
      // Tab and Shift+Tab move between the ghosts only.
      if (event.key !== 'Tab' || !(document.activeElement as Element | null)?.classList.contains('facet-ghost')) return;
      const ghosts = [...list.current?.querySelectorAll<HTMLElement>('.facet-ghost') ?? []];
      const at = ghosts.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      ghosts[(at + (event.shiftKey ? -1 : 1) + ghosts.length) % ghosts.length]?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keys, true); };
  }, [picked]);
  const ghostFor = (item: T): GhostTag | null => picked && ghostTargets.has(item.id)
    ? { facet: picked.facet, placing: Boolean(picked.placing), label: `Add ${facetLabel(picked.parent, picked.facet)} to ${holderName(item.id)}` } : null;

  // The window's + adds a module as the last entry: it waits at the end as a
  // dropped module does, scrolled into view.
  async function addAtEnd(type: string) {
    if (disabled) return;
    setAdding({ type, index: shown.length });
    requestAnimationFrame(() => list.current?.querySelector('.landing-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    // "At the end" is left to the list's owner: a page may hold more by then.
    if (await onAdd(type, AT_THE_END) === false) setAdding(null);
  }
  async function end(event: DragEndEvent) {
    const { active, over } = event;
    if (isFacet(active)) {
      const target = over && facetTargetIds.current.has(String(over.id)) ? String(over.id) : null;
      const from = document.querySelector('.facet-preview .facet-chip')?.getBoundingClientRect();
      finish();
      if (target) { const { parent, facet } = facetOf(active.id); await addFacet(target, parent, facet, from); }
      return;
    }
    const target = fromWindow(active) ? landing(active, over, keyboardDrag(event)) : null;
    if (target !== null) settleFrom.current = document.querySelector('.drag-preview [data-landing]')?.getBoundingClientRect() ?? null;
    finish();
    if (!over || disabled) return;
    if (fromWindow(active)) {
      if (target === null) return;
      setAdding({ type: windowType(active), index: target });
      if (await onAdd(windowType(active), target) === false) setAdding(null);
      return;
    }
    const from = order.indexOf(String(active.id));
    const to = String(over.id) === LIST_END ? order.length - 1 : order.indexOf(String(over.id));
    if (from < 0 || to < 0 || from === to) return;
    setOrder(arrayMove(order, from, to));
    if (await onMove(String(active.id), to) === false) setOrder(saved.current);
  }

  const facetDrag = dragged?.startsWith(FACET) ? dragged : null;
  const rows: ReactNode[] = shown.map(item => <SortableRow key={item.id} item={item} disabled={disabled} renderItem={renderItem} menuItems={menuItems}
    facet={facetDrag && facetTargetIds.current.has(item.id) ? facetOver === item.id ? 'over' : 'target' : undefined}
    ghost={ghostFor(item)} onPlace={() => void place(item.id)} />);
  // A window module over the list stands where it would land, like the entry
  // it will become, and the entries make room around it (0.6.3).
  const incoming = dragged?.startsWith(WINDOW) && slot !== null ? dragged.slice(WINDOW.length) : null;
  // A module from the window drags as an entry does (0.6.3): the module itself
  // follows the pointer in the list's column while a gap opens where it would
  // land, the same row that holds its place once dropped until the entry
  // arrives there.
  if (incoming !== null) rows.splice(Math.min(slot!, rows.length), 0, <LandingRow key="incoming" type={incoming} render={renderLanding} />);
  else if (waiting) rows.splice(Math.min(waiting.index, rows.length), 0, <LandingRow key="incoming" type={waiting.type} render={renderLanding} saving />);
  // The entries also slide into place when one is added or deleted, but not
  // when one is reordered: dnd-kit already settles a dropped entry, and the
  // positions remembered from before the drag would replay the cards from
  // where they stood before it, a visible jump back on every drop.
  const members = [...ids].sort().join('|');
  useMakeRoom(list, `${incoming ?? ''}:${incoming !== null ? slot : ''}:${members}`);
  // Dropped, the module glides from where it was let go into its gap, as a
  // dropped entry settles into its place.
  useLayoutEffect(() => {
    const from = settleFrom.current;
    const node = list.current?.querySelector<HTMLElement>('.landing-row[data-saving] [data-landing]');
    if (!from || !node) return;
    settleFrom.current = null;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const to = node.getBoundingClientRect();
    node.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) rotate(-1deg) scale(1.01)` }, { transform: 'none' }], MAKING_ROOM);
  });
  // Over the list, the dragged module keeps to the list's column, as an entry does.
  const slotNow = useRef(slot);
  slotNow.current = slot;
  const intoColumn: Modifier = ({ transform, activeNodeRect }) => {
    const box = list.current?.getBoundingClientRect();
    return slotNow.current === null || !box || !activeNodeRect ? transform : { ...transform, x: box.left - activeNodeRect.left };
  };
  return <DndContext sensors={sensors} collisionDetection={collision} accessibility={{ announcements }} modifiers={[alongTheList]}
    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    onDragStart={start} onDragMove={move} onDragOver={move} onDragEnd={end} onDragCancel={finish}>
    <div className="shaping-layout">
      {/* While a facet is picked up, the list drives its targets' glow on one beat (page-view.css). */}
      <section ref={list} className="shaping-list" aria-label={label} data-picking={(picked && !picked.placing) || undefined}>
        {pinned}
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy} disabled={disabled}>
          {rows}
        </SortableContext>
        <DropEnd disabled={disabled} active={slot === shown.length} />
      </section>
      <ModuleWindow types={types} disabled={disabled} unavailable={unavailable} where={where} addAtEnd={type => void addAtEnd(type)}
        holders={holders} picked={picked} pick={onAddFacet ? pick : undefined} />
    </div>
    <DragOverlay dropAnimation={null} modifiers={[intoColumn]}>
      {dragged?.startsWith(WINDOW) && <div className="drag-preview" style={incoming !== null ? { width: list.current?.clientWidth } : undefined}>
        <div className="sortable-row" data-dragging>{renderLanding(dragged.slice(WINDOW.length))}</div>
      </div>}
      {facetDrag && <div className={`drag-preview facet-preview fam-${PARENTS[facetOf(facetDrag).parent].family}`}>
        <span className="facet-chip" data-dragging>{facetName(facetDrag)}</span>
      </div>}
    </DragOverlay>
  </DndContext>;
}

// The other entries make room with the design system's ease-out (D05).
const MAKING_ROOM = { duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)' };

// A list entry that reorders by dragging its label, with the pointer or with
// Space and the arrow keys. A pointer that moves less than the activation
// distance is a click on the label instead.
function SortableRow<T extends ShapeItem>({ item, disabled, renderItem, menuItems, facet, ghost, onPlace }: {
  item: T; disabled: boolean; renderItem: (item: T, parts: RowParts) => ReactNode; menuItems: readonly string[];
  // While a facet is dragged: this entry would take it, or the facet is over it.
  facet?: 'target' | 'over';
  // While a facet picked up with its + would land here: a click on the
  // entry's tab or on its ghost places the facet (0.7.2).
  ghost: GhostTag | null; onPlace: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled, transition: MAKING_ROOM });
  // Translate only: cards of different heights keep their shape while moving.
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  // Space picks up and drops on keydown; its keyup would also click the label.
  const drag = { ref: setActivatorNodeRef, ...attributes, ...listeners,
    onKeyUp: (event: KeyboardEvent) => { if (event.code === 'Space') event.preventDefault(); } };
  const choosing = Boolean(ghost && !ghost.placing);
  return <div ref={setNodeRef} style={style} className="sortable-row" data-row-id={item.id} data-dragging={isDragging || undefined} data-facet-target={facet}
    data-ghost-target={choosing || undefined}
    onClickCapture={choosing ? event => {
      if (!(event.target as Element).closest(PLACE)) return;
      event.preventDefault(); event.stopPropagation(); onPlace();
    } : undefined}>
    {renderItem(item, { drag, menu: <RowMenu label={item.label} items={menuItems} />, ghost })}
  </div>;
}

// Six dots drawn as circles: a text glyph turns uneven when a dragged entry tilts.
export const SixDots = () => <svg className="six-dots" viewBox="0 0 10 16" aria-hidden="true" fill="currentColor">
  {[3, 8, 13].flatMap(y => [2.5, 7.5].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
</svg>;

// The six dots before an entry's label: a menu of what else can be done with
// it. Its entries are placeholders for now (0.6.3).
export function RowMenu({ label, items }: { label: string; items: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <span ref={root} className="row-menu" onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation(); setOpen(false); button.current?.focus();
  }}>
    <button ref={button} type="button" className="menu-button" aria-label={`More for ${label}`} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)}><SixDots /></button>
    {open && <ul id={menuId} className="row-menu-list" role="menu" aria-label={`More for ${label}`}>
      {items.map(entry => <li key={entry} role="menuitem" aria-disabled="true">{entry}<span className="soon">Coming soon</span></li>)}
    </ul>}
  </span>;
}

// The landing card: a drop target of its own, so the pointer resting on it
// keeps the module where it is.
function LandingRow({ type, render, saving = false }: { type: string; render: (type: string) => ReactNode; saving?: boolean }) {
  const { setNodeRef } = useDroppable({ id: LANDING, disabled: saving });
  return <div ref={setNodeRef} className="sortable-row landing-row" data-row-id={LANDING} data-saving={saving || undefined} role={saving ? 'status' : undefined}>
    {render(type)}
    {saving && <span className="visually-hidden">Adding {moduleLabel(type)}…</span>}
  </div>;
}

// When the landing card moves, the entries around it slide into their new
// places, as they do when an entry is reordered (dur-spring-like ease-out).
function useMakeRoom(list: { current: HTMLElement | null }, key: string) {
  const tops = useRef(new Map<string, number>());
  const last = useRef(key);
  useLayoutEffect(() => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [])];
    const next = new Map(rows.map(row => [row.dataset.rowId!, row.getBoundingClientRect().top]));
    const changed = last.current !== key;
    last.current = key;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (changed && !still) for (const row of rows) {
      const before = tops.current.get(row.dataset.rowId!);
      const shift = before === undefined ? 0 : before - next.get(row.dataset.rowId!)!;
      const target = row.firstElementChild as HTMLElement | null;
      if (shift && target) target.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], MAKING_ROOM);
    }
    tops.current = next;
  });
}

// Where a module dragged from the window lands after the last entry.
function DropEnd({ disabled, active }: { disabled: boolean; active: boolean }) {
  const { setNodeRef } = useDroppable({ id: LIST_END, disabled });
  return disabled ? null : <div ref={setNodeRef} className="drop-end" data-over={active || undefined}>Drop a module here to add it at the end</div>;
}

function WindowModule({ type, blocked, explain, present, addAtEnd, children }: {
  type: string; blocked: string | null; explain: boolean; present: boolean; addAtEnd: (type: string) => void; children?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: WINDOW + type, disabled: Boolean(blocked) });
  const entry = CATALOG[type as ModuleType];
  return <li className={`window-module fam-${entry.family}`} data-type={type} data-dragging={isDragging || undefined} aria-disabled={Boolean(blocked)}>
    <div ref={setNodeRef} className="window-module-body" {...attributes} {...listeners}
      aria-label={`${entry.label}: ${entry.description}${present ? ' Already here.' : ''}`} aria-roledescription="draggable module">
      <strong>{entry.label}</strong>
      <span className="muted">{entry.description}</span>
      {present && <span className="window-present">Already here</span>}
    </div>
    {/* Adds the module as the last entry, without dragging (0.6.3). */}
    <button type="button" className="window-add" aria-label={`Add ${entry.label} at the end`} disabled={Boolean(blocked)} onClick={() => addAtEnd(type)}>
      <PlusIcon />
    </button>
    {blocked && explain && <p className="window-reason muted">{blocked}</p>}
    {children}
  </li>;
}

const PlusIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;

// A parent's facet in the window (D08), drawn as a part of its parent. It
// drags like a module but lands only on a parent of its own type. Its + adds
// it to the one parent that would take it; with several, it picks the facet
// up for the user to place on one of them by its ghost tag (0.7.2), and
// pressed again puts it back. With none, it is disabled; why is told only to
// assistive technology, never as text in the window (0.7.1).
function WindowFacet({ parent, facet, blocked, several, picked, pick }: {
  parent: ParentType; facet: FacetType; blocked: string | null; several: boolean; picked: boolean; pick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: facetId(parent, facet), disabled: Boolean(blocked) });
  const label = facetLabel(parent, facet);
  const definition = PARENTS[parent].facets[facet]!;
  const name = `${PARENTS[parent].label} ${label}`;
  return <li className="window-facet" data-parent={parent} data-facet={facet} data-dragging={isDragging || undefined} data-picked={picked || undefined}
    aria-disabled={Boolean(blocked)}>
    <div ref={setNodeRef} className="window-facet-body" {...attributes} {...listeners}
      aria-label={`${name}: ${definition.description} Adds to a ${PARENTS[parent].label} module.${blocked ? ` ${blocked}` : ''}`} aria-roledescription="draggable facet">
      <span className="facet-chip">{label}</span>
    </div>
    <button type="button" className="window-add" aria-label={`Add ${name}`} disabled={Boolean(blocked)}
      aria-pressed={several || picked ? picked : undefined} onClick={pick}><PlusIcon /></button>
  </li>;
}

// A "?" beside a heading whose explanation shows on hover, or on a click or
// Enter that keeps it open until Escape, another click or a click elsewhere.
function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  useEffect(() => {
    if (!pinned) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setPinned(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [pinned]);
  const open = pinned || hovered;
  return <span ref={root} className="help-tip" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setPinned(false); setHovered(false); } }}>
    <button type="button" className="help-button" aria-label={label} aria-expanded={open} aria-controls={tipId}
      onClick={() => setPinned(!pinned)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" /><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 3.6" /><path d="M12 17.2h.01" />
      </svg>
    </button>
    <span id={tipId} className="help-text" role="note" hidden={!open}>{children}</span>
  </span>;
}

// A parent is found by its facets' names too (D08).
const searchText = (type: ModuleType) => [CATALOG[type].label, CATALOG[type].description,
  ...(isParentType(type) ? facetsOf(type).map(facet => facetLabel(type, facet)) : [])].join(' ').toLocaleLowerCase();

// The catalog beside the list, and the place a dragged module goes back to.
// Modules are grouped by family; the families of modules already present
// start open, and the search filters every module by name and description.
// `disabled` turns it off as a whole (for example while a component is being
// edited), with `unavailable` as an optional notice; otherwise each module
// says why it is unavailable, such as the limit or an existing Context.
function ModuleWindow({ types, disabled, unavailable, where, addAtEnd, holders, picked, pick }: {
  types: readonly string[]; disabled: boolean; unavailable?: string; where: string; addAtEnd: (type: string) => void;
  holders: readonly FacetHolder[];
  // The facet picked up with its +, if any; `pick` is absent where facets cannot be added.
  picked: { parent: ParentType; facet: FacetType; placing: string | null } | null;
  pick?: (parent: ParentType, facet: FacetType) => void;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: BACK });
  const searchId = useId();
  const [query, setQuery] = useState('');
  const familyOf = (type: ModuleType) => CATALOG[type].family as ModuleFamily;
  const [open, setOpen] = useState(() => new Set(types.filter(type => CATALOG[type as ModuleType]?.family).map(type => familyOf(type as ModuleType))));
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matching = WINDOW_MODULES.filter(type => terms.every(term => searchText(type).includes(term)));
  const groups = FAMILIES.map(family => ({ family, modules: matching.filter(type => familyOf(type) === family),
    total: WINDOW_MODULES.filter(type => familyOf(type) === family).length })).filter(group => group.modules.length);
  return <aside ref={setNodeRef} className="module-window" aria-labelledby="module-window-title" data-over={(isOver && fromWindow(active)) || undefined}>
    <div className="window-head">
      <h2 id="module-window-title">Modules</h2>
      <HelpTip label="How to add modules">
        Drag a module into {where}, or back here to put it back. A facet goes onto a module of its own type. From the keyboard: Space picks it up, the arrow keys move it, Space drops it, Escape puts it back.
      </HelpTip>
    </div>
    <label className="visually-hidden" htmlFor={searchId}>Search modules</label>
    <input id={searchId} className="window-search" type="search" placeholder="Search modules" value={query} onChange={event => setQuery(event.target.value)} />
    {unavailable && <p className="notice">{unavailable}</p>}
    {!groups.length && <p className="muted">No module matches “{query.trim()}”.</p>}
    {groups.map(({ family, modules, total }) => <details key={family} className={`window-family fam-${family}`} open={terms.length > 0 || open.has(family)}
      onToggle={event => {
        if (terms.length) return;
        const next = new Set(open);
        if ((event.target as HTMLDetailsElement).open) next.add(family); else next.delete(family);
        if (next.size !== open.size) setOpen(next);
      }}>
      <summary><span className="fam-chip"><FamilyIcon family={family} /></span>{FAMILY_LABELS[family]}<span className="family-count">{total}</span></summary>
      <ul>
        {modules.map(type => <WindowModule key={type} type={type} explain={!disabled} present={types.includes(type)} addAtEnd={addAtEnd}
          blocked={disabled ? unavailable ?? 'Unavailable' : addBlocked(types.map(value => ({ type: value })), type)}>
          {isParentType(type) && pick && <ul className="window-facets" aria-label={`${CATALOG[type].label} facets`}>
            {facetsOf(type).map(facet => <WindowFacet key={facet} parent={type} facet={facet}
              several={facetTargets(holders, type, facet).length > 1} picked={Boolean(picked && !picked.placing && picked.parent === type && picked.facet === facet)}
              pick={() => pick(type, facet)}
              blocked={disabled ? unavailable ?? 'Unavailable' : facetUnavailable(holders, type, facet)} />)}
          </ul>}
        </WindowModule>)}
      </ul>
    </details>)}
  </aside>;
}
