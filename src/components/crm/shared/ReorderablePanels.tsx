'use client';
import { DndContext, type DragEndEvent, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { T } from '../../ui';

function SortablePanel({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="km-sp"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: 'relative',
      }}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        className="km-sp-grip"
        style={{
          position: 'absolute',
          top: -12,
          right: 14,
          zIndex: 2,
          background: T.raised,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: 4,
          cursor: 'grab',
          color: T.dim,
          lineHeight: 0,
        }}
      >
        <GripVertical size={14} strokeWidth={2} />
      </button>
      {/* A panel can render nothing (e.g. a card with no data for this record). Its wrapper is then :empty, and the CSS
          (globals.css, .km-sp) drops the whole slot — otherwise its handle floated over the NEXT panel as a second grip. */}
      <div className="km-sp-body">{children}</div>
    </div>
  );
}

/**
 * A per-user draggable vertical stack of named panels — the shared piece
 * behind detail-page panel reordering (lead/deal/account detail). `panels`
 * only needs an entry for a panel that is currently eligible to render
 * (e.g. omit a tenant-gated card's key rather than passing it as null); an
 * id in `order` with no matching entry is skipped, so a stale/renamed save
 * never breaks the page. Pair with `usePanelOrder` for the per-user order.
 */
export default function ReorderablePanels({ order, panels, onReorder }: {
  order: string[];
  panels: Record<string, React.ReactNode>;
  onReorder: (next: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const visible = order.filter((id) => panels[id] != null);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = visible.indexOf(String(active.id));
    const to = visible.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(visible, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={visible} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {visible.map((id) => <SortablePanel key={id} id={id}>{panels[id]}</SortablePanel>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
