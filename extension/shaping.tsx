import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, pointerWithin, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors
} from '@dnd-kit/core';
import type {
  Active, Announcements, CollisionDetection, DragEndEvent, DragMoveEvent, DragStartEvent, KeyboardCoordinateGetter, Over
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addBlocked, CATALOG, FAMILIES, FAMILY_LABELS, WINDOW_MODULES } from '@vocabularium/domain/page-modules';
import type { ModuleFamily, ModuleType } from '@vocabularium/domain/page-modules';
import { FamilyIcon } from './families.tsx';

// Shared by the page view and deck settings (D02, D04): a list whose entries
// reorder by drag, and the module window whose modules drag into the list.
// Every drag also works from the keyboard: Space picks up, the arrow keys
// move, Space drops, Escape cancels.

const WINDOW = 'window:';
const LIST_END = 'list-end';
// The module window itself: dropping a module back onto it cancels the drag.
const BACK = 'module-window';
export const moduleLabel = (type: string) => CATALOG[type as ModuleType]?.label ?? type;
const fromWindow = (active: Active | null) => Boolean(active && String(active.id).startsWith(WINDOW));
const windowType = (active: Active) => String(active.id).slice(WINDOW.length);

// A module from the window lands on the entry under the pointer, or goes back
// when the pointer is over the window again. Reordering uses the nearest entry:
// the list shifts as a card moves, so the entry under the pointer is often the
// card's own slot. A keyboard drag has no pointer and always uses the nearest
// entry; Escape puts it back.
const collision: CollisionDetection = args => {
  const list = { ...args, droppableContainers: args.droppableContainers.filter(entry => entry.id !== BACK) };
  if (!fromWindow(args.active)) return closestCenter(list);
  const hits = pointerWithin(args);
  const back = hits.find(hit => hit.id === BACK);
  if (back) return [back];
  return hits.length ? hits : closestCenter(list);
};

// List entries move with dnd-kit's sortable keyboard steps. A window module is
// not in the list, so its arrow keys step through the list's drop targets.
const keyboard: KeyboardCoordinateGetter = (event, args) => {
  const { active, droppableRects, droppableContainers, over, collisionRect } = args.context;
  if (!fromWindow(active)) return sortableKeyboardCoordinates(event, args);
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) || !collisionRect) return undefined;
  event.preventDefault();
  const targets = droppableContainers.getEnabled().filter(entry => entry.id !== BACK && droppableRects.get(entry.id))
    .sort((a, b) => droppableRects.get(a.id)!.top - droppableRects.get(b.id)!.top);
  if (!targets.length) return undefined;
  const back = event.code === 'ArrowUp' || event.code === 'ArrowLeft';
  const current = targets.findIndex(entry => entry.id === over?.id);
  const next = current < 0 ? (back ? targets.length - 1 : 0) : Math.min(targets.length - 1, Math.max(0, current + (back ? -1 : 1)));
  const rect = droppableRects.get(targets[next].id)!;
  return { x: rect.left + rect.width / 2 - collisionRect.width / 2, y: rect.top + rect.height / 2 - collisionRect.height / 2 };
};

// Stands where the drag handle would be on the main key, which stays first
// and cannot be moved or removed.
export const PinMark = () => <span className="pin-mark" role="img" aria-label="Fixed in first place" title="Fixed in first place">
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
</span>;

export type ShapeItem = { id: string; label: string };
type Result = boolean | void | Promise<boolean | void>;
// The list as it would be if the current drag ended now: entry IDs in order,
// and a module from the window with the index it would land at.
export type Projection = { ids: string[]; adding: { type: string; index: number } | null };

// The list below a pinned first entry (the main key), and the module window
// beside it. Indexes passed to the handlers count among the movable entries,
// so nothing is ever placed above the pinned one. A handler returning false
// reports a failed save, which restores the saved order.
export function ShapingArea<T extends ShapeItem>({ items, types, disabled, unavailable, pinned, label, where, onAdd, onMove, renderItem, preview }: {
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
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  // Shown between the list and the module window, following every drag as it happens.
  preview?: (projection: Projection) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboard }));
  const ids = items.map(item => item.id);
  const key = ids.join('|');
  // The order shown: changed at once on a drop, so a card never snaps back
  // while its move is being saved, and reset whenever the saved order changes.
  const [order, setOrder] = useState(ids);
  const [adding, setAdding] = useState<{ type: string; index: number } | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [projected, setProjected] = useState<string[] | null>(null);
  const saved = useRef(ids);
  saved.current = ids;
  useEffect(() => { setOrder(ids); setAdding(null); }, [key]);
  const byId = new Map(items.map(item => [item.id, item]));
  const shown = [...order.filter(id => byId.has(id)), ...ids.filter(id => !order.includes(id))].map(id => byId.get(id)!);

  const name = (id: string | number) => {
    const value = String(id);
    return value.startsWith(WINDOW) ? moduleLabel(value.slice(WINDOW.length)) : byId.get(value)?.label ?? 'the end';
  };
  // Where a window module would land: before the entry it is over, or after it
  // when a pointer is in its lower half; at the end over the end zone.
  function landing(active: Active, over: Over | null, keyboardDrag: boolean): number | null {
    if (!over || String(over.id) === BACK) return null;
    if (String(over.id) === LIST_END) return shown.length;
    const index = shown.findIndex(item => item.id === String(over.id));
    if (index < 0) return null;
    const rect = active.rect.current.translated;
    if (keyboardDrag || !rect) return index;
    return rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 ? index + 1 : index;
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `${name(active.id)} is not over the list.`;
      if (String(over.id) === BACK) return `${name(active.id)} is back in the module window.`;
      if (String(over.id) === LIST_END) return `${name(active.id)} is over the end.`;
      const at = fromWindow(active) ? landing(active, over, true) : shown.findIndex(item => item.id === String(over.id));
      return at === null || at < 0 ? `${name(active.id)} is over the end.` : `${name(active.id)} is over position ${at + 2}.`;
    },
    onDragEnd: ({ active, over }) => over && String(over.id) !== BACK ? `${name(active.id)} was dropped.` : `${name(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`
  };
  const keyboardDrag = (event: { activatorEvent: Event }) => event.activatorEvent instanceof KeyboardEvent;
  function start({ active }: DragStartEvent) { setDragged(String(active.id)); setSlot(null); setProjected(null); }
  function move(event: DragMoveEvent) {
    if (fromWindow(event.active)) { setSlot(landing(event.active, event.over, keyboardDrag(event))); return; }
    if (!preview || !event.over) return;
    const from = order.indexOf(String(event.active.id));
    const to = String(event.over.id) === LIST_END ? order.length - 1 : order.indexOf(String(event.over.id));
    const next = from < 0 || to < 0 ? null : arrayMove(order, from, to);
    setProjected(current => current?.join('|') === next?.join('|') ? current : next);
  }
  function finish() { setDragged(null); setSlot(null); setProjected(null); }
  async function end(event: DragEndEvent) {
    const { active, over } = event;
    const target = fromWindow(active) ? landing(active, over, keyboardDrag(event)) : null;
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

  const rows: ReactNode[] = shown.map(item => <SortableRow key={item.id} item={item} disabled={disabled} renderItem={renderItem}
    insertBefore={slot !== null && shown[slot]?.id === item.id} />);
  if (adding) rows.splice(Math.min(adding.index, rows.length), 0,
    <div key="adding" className="component adding" role="status">Adding {moduleLabel(adding.type)}…</div>);
  return <DndContext sensors={sensors} collisionDetection={collision} accessibility={{ announcements }}
    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    onDragStart={start} onDragMove={move} onDragOver={move} onDragEnd={end} onDragCancel={finish}>
    <div className={`shaping-layout${preview ? ' with-preview' : ''}`}>
      <section className="shaping-list" aria-label={label}>
        {pinned}
        <SortableContext items={shown.map(item => item.id)} strategy={verticalListSortingStrategy} disabled={disabled}>
          {rows}
        </SortableContext>
        <DropEnd disabled={disabled} active={slot === shown.length} />
      </section>
      {preview?.({
        ids: projected ?? shown.map(item => item.id),
        adding: dragged?.startsWith(WINDOW) && slot !== null ? { type: dragged.slice(WINDOW.length), index: slot } : adding
      })}
      <ModuleWindow types={types} disabled={disabled} unavailable={unavailable} where={where} />
    </div>
    <DragOverlay dropAnimation={null}>
      {dragged?.startsWith(WINDOW) && <div className="drag-preview">{moduleLabel(dragged.slice(WINDOW.length))}</div>}
    </DragOverlay>
  </DndContext>;
}

// A list entry that reorders by dragging its handle, with the pointer or with
// Space and the arrow keys.
function SortableRow<T extends ShapeItem>({ item, disabled, insertBefore, renderItem }: {
  item: T; disabled: boolean; insertBefore: boolean; renderItem: (item: T, handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled });
  // Translate only: cards of different heights keep their shape while moving.
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const handle = <button type="button" className="drag-handle" aria-label={`Drag ${item.label}`} disabled={disabled} {...attributes} {...listeners}>⠿</button>;
  return <div ref={setNodeRef} style={style} className="sortable-row" data-dragging={isDragging || undefined} data-insert-before={insertBefore || undefined}>
    {renderItem(item, handle)}
  </div>;
}

// Where a module dragged from the window lands after the last entry.
function DropEnd({ disabled, active }: { disabled: boolean; active: boolean }) {
  const { setNodeRef } = useDroppable({ id: LIST_END, disabled });
  return disabled ? null : <div ref={setNodeRef} className="drop-end" data-over={active || undefined}>Drop a module here to add it at the end</div>;
}

function WindowModule({ type, blocked, explain, present }: { type: string; blocked: string | null; explain: boolean; present: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: WINDOW + type, disabled: Boolean(blocked) });
  const entry = CATALOG[type as ModuleType];
  return <li className={`window-module fam-${entry.family}`} data-type={type} data-dragging={isDragging || undefined} aria-disabled={Boolean(blocked)}>
    <div ref={setNodeRef} className="window-module-body" {...attributes} {...listeners}
      aria-label={`${entry.label}: ${entry.description}${present ? ' Already here.' : ''}`} aria-roledescription="draggable module">
      <strong>{entry.label}</strong>
      <span className="muted">{entry.description}</span>
      {present && <span className="window-present">Already here</span>}
    </div>
    {blocked && explain && <p className="window-reason muted">{blocked}</p>}
  </li>;
}

const searchText = (type: ModuleType) => `${CATALOG[type].label} ${CATALOG[type].description}`.toLocaleLowerCase();

// The catalog beside the list, and the place a dragged module goes back to.
// Modules are grouped by family; the families of modules already present
// start open, and the search filters every module by name and description.
// `disabled` turns it off as a whole (for example while a component is being
// edited), with `unavailable` as an optional notice; otherwise each module
// says why it is unavailable, such as the limit or an existing Context.
function ModuleWindow({ types, disabled, unavailable, where }: { types: readonly string[]; disabled: boolean; unavailable?: string; where: string }) {
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
    <h2 id="module-window-title">Modules</h2>
    <label className="visually-hidden" htmlFor={searchId}>Search modules</label>
    <input id={searchId} className="window-search" type="search" placeholder="Search modules" value={query} onChange={event => setQuery(event.target.value)} />
    <p className="muted window-help">Drag a module into {where}, or back here to put it back. From the keyboard: Space picks it up, the arrow keys move it, Space drops it, Escape puts it back.</p>
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
        {modules.map(type => <WindowModule key={type} type={type} explain={!disabled} present={types.includes(type)}
          blocked={disabled ? unavailable ?? 'Unavailable' : addBlocked(types.map(value => ({ type: value })), type)} />)}
      </ul>
    </details>)}
  </aside>;
}
