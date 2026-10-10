import type { CSSProperties, ReactNode } from 'react';
import {
  closestCenter, DndContext, KeyboardSensor, MeasuringStrategy, pointerWithin, PointerSensor, useDraggable, useDroppable, useSensor, useSensors
} from '@dnd-kit/core';
import type { Announcements, CollisionDetection, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addBlocked, CATALOG, WINDOW_MODULES } from '@vocabularium/domain/page-modules';
import type { ModuleType } from '@vocabularium/domain/page-modules';

// Shared by the page view and deck settings (D02): the module window, and a
// list whose items reorder by drag or keyboard and accept modules dragged in.

const WINDOW = 'window:';
const LIST_END = 'list-end';
export const moduleLabel = (type: string) => CATALOG[type as ModuleType]?.label ?? type;

type Labelled = { id: string; label: string };

// A pointer drop lands on the entry under the pointer; a keyboard drag has no
// pointer, so it uses the nearest entry instead.
const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

// Items are the movable entries below the main key. Indexes passed to the
// handlers count among those items, so the main key is never a target.
export function ShapingArea({ items, disabled, onAdd, onMove, children }: {
  items: Labelled[];
  disabled: boolean;
  onAdd: (type: string, index: number) => void;
  onMove: (id: string, index: number) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const name = (id: string | number) => {
    const value = String(id);
    return value.startsWith(WINDOW) ? moduleLabel(value.slice(WINDOW.length)) : items.find(item => item.id === value)?.label ?? 'the end';
  };
  const position = (id: string | number | undefined) => {
    const index = items.findIndex(item => item.id === String(id));
    return index < 0 ? items.length + 1 : index + 2;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `${name(active.id)} is over position ${position(over.id)}.` : `${name(active.id)} is not over the list.`,
    onDragEnd: ({ active, over }) => over ? `${name(active.id)} was dropped at position ${position(over.id)}.` : `${name(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`
  };
  function end({ active, over }: DragEndEvent) {
    if (!over || disabled) return;
    const target = String(over.id) === LIST_END ? items.length : items.findIndex(item => item.id === String(over.id));
    if (target < 0) return;
    const id = String(active.id);
    if (id.startsWith(WINDOW)) onAdd(id.slice(WINDOW.length), target);
    else if (items.findIndex(item => item.id === id) !== target) onMove(id, Math.min(target, items.length - 1));
  }
  return <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={end} accessibility={{ announcements }}
    measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}>
    <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy} disabled={disabled}>
      {children}
    </SortableContext>
  </DndContext>;
}

// A list entry that reorders by drag. The handle also starts a keyboard drag
// (Space, then the arrow keys); the row's own move buttons are the other path.
export function SortableRow({ id, label, disabled, className, children }: {
  id: string; label: string; disabled: boolean; className: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  // Translate only: cards of different heights keep their shape while moving.
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const handle = <button type="button" className="drag-handle" aria-label={`Drag ${label}`} disabled={disabled} {...attributes} {...listeners}>⠿</button>;
  return <article ref={setNodeRef} style={style} className={className} data-dragging={isDragging || undefined}>{children(handle)}</article>;
}

// Where a module dragged from the window lands after the last item.
export function DropEnd({ disabled }: { disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: LIST_END, disabled });
  return disabled ? null : <div ref={setNodeRef} className="drop-end" data-over={isOver || undefined}>Drop a module here to add it at the end</div>;
}

function WindowModule({ type, blocked, explain, onAdd }: { type: string; blocked: string | null; explain: boolean; onAdd: (type: string) => void }) {
  // Pointer drag only: from the keyboard, Add places the module at the end.
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id: WINDOW + type, disabled: Boolean(blocked) });
  const entry = CATALOG[type as ModuleType];
  return <li className="window-module" data-type={type} data-dragging={isDragging || undefined} aria-disabled={Boolean(blocked)}>
    <div ref={setNodeRef} className="window-module-body" style={{ transform: CSS.Translate.toString(transform) }} {...listeners}>
      <strong>{entry.label}</strong>
      <span className="muted">{entry.description}</span>
    </div>
    <button type="button" aria-label={`Add ${entry.label}`} disabled={Boolean(blocked)} onClick={() => onAdd(type)}>Add</button>
    {blocked && explain && <p className="window-reason muted">{blocked}</p>}
  </li>;
}

// The catalog beside the page or configuration. `unavailable` disables it as a
// whole (for example while editing); otherwise each module explains why it is
// unavailable, such as the limit or an existing Context.
export function ModuleWindow({ types, unavailable, onAdd, where }: {
  types: readonly string[]; unavailable?: string; onAdd: (type: string) => void; where: string;
}) {
  return <aside className="module-window" aria-labelledby="module-window-title">
    <h2 id="module-window-title">Modules</h2>
    <p className="muted">Drag a module into {where}, or use Add to put it at the end.</p>
    {unavailable && <p className="notice">{unavailable}</p>}
    <ul>
      {WINDOW_MODULES.map(type => <WindowModule key={type} type={type} onAdd={onAdd} explain={!unavailable}
        blocked={unavailable ? unavailable : addBlocked(types.map(value => ({ type: value })), type)} />)}
    </ul>
  </aside>;
}
