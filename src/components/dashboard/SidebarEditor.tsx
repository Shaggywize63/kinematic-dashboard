'use client';
import { useMemo, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NavPrefs } from '../../lib/navPrefs';

/**
 * Drag-and-drop editor for the left sidebar. Lets a user reorder nav sections
 * and the items within each section; the result is saved as per-user NavPrefs
 * and applied to the live sidebar (which itself stays a plain click-nav — the
 * drag surface lives only in this modal, so navigation is never affected).
 *
 * Scope: reorder sections, and reorder items WITHIN a section. Moving an item
 * to a different section is intentionally out of scope (sections mirror
 * feature packages / entitlements).
 */

export interface EditorItem { href: string; label: string; icon: string }
export interface EditorGroup { label: string; items: EditorItem[] }

// Namespaced ids so a section label can never collide with an item href, and
// so drag-end can tell which list moved. Labels/hrefs never contain '§§'.
const SEP = '§§';
const secId = (label: string) => `sec${SEP}${label}`;
const itemId = (label: string, href: string) => `item${SEP}${label}${SEP}${href}`;
const isSec = (id: string) => id.startsWith(`sec${SEP}`);
const parseItem = (id: string) => {
  const parts = id.split(SEP); // ['item', label, href]
  return { label: parts[1], href: parts.slice(2).join(SEP) };
};

function Row({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', marginBottom: 6, borderRadius: 8,
        background: 'var(--s3)', border: '1px solid var(--border)',
        cursor: 'grab', touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1 }}>⋮⋮</span>
      {children}
    </div>
  );
}

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => <path key={i} d={i === 0 ? seg : `M${seg}`} />)}
    </svg>
  );
}

export default function SidebarEditor({
  groups, onSave, onReset, onClose,
}: {
  groups: EditorGroup[];
  onSave: (prefs: NavPrefs) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  // Working copy of the order: section labels + hrefs per section.
  const [sections, setSections] = useState<string[]>(() => groups.map((g) => g.label));
  const [itemsBySection, setItemsBySection] = useState<Record<string, string[]>>(
    () => Object.fromEntries(groups.map((g) => [g.label, g.items.map((i) => i.href)])),
  );

  // Lookups for rendering label + icon from an href.
  const meta = useMemo(() => {
    const m = new Map<string, EditorItem>();
    for (const g of groups) for (const it of g.items) m.set(it.href, it);
    return m;
  }, [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = String(active.id), o = String(over.id);
    if (isSec(a) && isSec(o)) {
      setSections((prev) => {
        const from = prev.findIndex((l) => secId(l) === a);
        const to = prev.findIndex((l) => secId(l) === o);
        return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
      });
      return;
    }
    if (!isSec(a) && !isSec(o)) {
      const pa = parseItem(a), po = parseItem(o);
      if (pa.label !== po.label) return; // no cross-section moves
      setItemsBySection((prev) => {
        const list = prev[pa.label] || [];
        const from = list.indexOf(pa.href);
        const to = list.indexOf(po.href);
        if (from < 0 || to < 0) return prev;
        return { ...prev, [pa.label]: arrayMove(list, from, to) };
      });
    }
  };

  const save = () => {
    onSave({ sectionOrder: sections, itemOrder: itemsBySection });
    onClose();
  };
  const reset = () => { onReset(); onClose(); };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 20, color: 'var(--text)', boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Customise menu</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-dim)' }}>
          Drag to reorder sections, and items within a section. Saved just for you.
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map(secId)} strategy={verticalListSortingStrategy}>
            {sections.map((label) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <Row id={secId(label)}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)' }}>
                    {label}
                  </span>
                </Row>
                <div style={{ paddingLeft: 16 }}>
                  <SortableContext items={(itemsBySection[label] || []).map((h) => itemId(label, h))} strategy={verticalListSortingStrategy}>
                    {(itemsBySection[label] || []).map((href) => {
                      const it = meta.get(href);
                      if (!it) return null;
                      return (
                        <Row key={href} id={itemId(label, href)}>
                          <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}><Icon d={it.icon} /></span>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</span>
                        </Row>
                      );
                    })}
                  </SortableContext>
                </div>
              </div>
            ))}
          </SortableContext>
        </DndContext>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
          <button
            onClick={reset}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            Reset to default
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
