'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DndContext, useDroppable, useDraggable, type DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { toast } from 'sonner';
import { Building2, Hand } from 'lucide-react';
import type { Lead, LeadStatus } from '../../types/crm';
import { crmLeads } from '../../lib/crmApi';
import OwnerAvatar from './shared/OwnerAvatar';
import LogoSpinner from '../shared/LogoSpinner';
import { T, cardStyle } from '../ui';

export interface LeadKanbanStatus { value: string; label: string; color?: string }

const FALLBACK_STATUSES: LeadKanbanStatus[] = [
  { value: 'new', label: 'New' },
  { value: 'working', label: 'Working' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

// Converting a lead can create an account/deal as a side effect (see
// crmLeads.convert), so dropping a card onto this column would silently
// desync that state — blocked in favour of the dedicated Convert action.
const BLOCKED_DROP_STATUS = 'converted';
// These two route through disqualify() so the lifecycle audit /
// disqualified_at stamping fires the same way it does from the lead detail
// page's Disqualify action, instead of a plain status PATCH.
const DISQUALIFY_STATUSES = new Set(['unqualified', 'lost']);

function leadName(lead: Lead): string {
  return lead.display_name || lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead';
}

function StatusColumn({ status, leads }: { status: LeadKanbanStatus; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <div
      ref={setNodeRef}
      className="kanban-column"
      style={{
        ...cardStyle,
        background: isOver ? T.infoWash : T.card,
        borderColor: isOver ? T.info : T.border,
        padding: 10,
        minWidth: 260,
        maxWidth: 280,
        flex: '1 1 260px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',
        scrollSnapAlign: 'start',
        transition: 'background .12s ease, border-color .12s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, padding: '4px 4px 8px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {status.color && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, flexShrink: 0 }} />}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text, wordBreak: 'break-word', lineHeight: 1.3 }}>{status.label}</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.dim, background: T.raised, borderRadius: 999, padding: '1px 8px', flexShrink: 0, lineHeight: '18px' }}>{leads.length}</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {leads.map((l) => <DraggableLeadCard key={l.id} lead={l} />)}
        {leads.length === 0 && (
          <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12.5, color: T.mute, border: `1px dashed ${T.border}`, borderRadius: T.radius.md }}>Drop a lead here</div>
        )}
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...listeners}
        {...attributes}
        style={{
          background: T.raised,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius.md,
          padding: '10px 12px',
          marginBottom: 8,
          cursor: 'grab',
        }}
      >
        <Link href={`/dashboard/crm/leads/${lead.id}`} className="km-entity-link" style={{ fontSize: 13.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open lead detail">{leadName(lead)}</Link>
        <div style={{ fontSize: 12, color: lead.company ? T.dim : T.mute, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <Building2 aria-hidden size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{lead.company || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.dim }}>{lead.phone || '—'}</span>
          <OwnerAvatar name={lead.owner_name} size={22} />
        </div>
      </div>
    </div>
  );
}

export default function LeadKanban({ statuses, initialLeads, loading }: { statuses?: LeadKanbanStatus[] | null; initialLeads: Lead[]; loading?: boolean }) {
  const cols = statuses && statuses.length ? statuses : FALLBACK_STATUSES;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [byStatus, setByStatus] = useState<Record<string, Lead[]>>({});
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, Lead[]> = {};
    cols.forEach((c) => (next[c.value] = []));
    initialLeads.forEach((l) => {
      if (!next[l.status]) next[l.status] = [];
      next[l.status].push(l);
    });
    setByStatus(next);
    // cols is derived from `statuses`/the fallback constant each render; keying off initialLeads alone
    // (like DealKanban keys off stages+initialDeals) is enough since statuses rarely change mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeads]);

  const onDragEnd = async (e: DragEndEvent) => {
    const leadId = String(e.active.id);
    const toStatus = e.over ? String(e.over.id) : null;
    if (!toStatus) return;
    let fromStatus = '';
    Object.entries(byStatus).forEach(([st, list]) => {
      if (list.find((l) => l.id === leadId)) fromStatus = st;
    });
    if (!fromStatus || fromStatus === toStatus) return;

    if (toStatus === BLOCKED_DROP_STATUS) {
      toast.error("Converting creates the account/deal, so it isn't a plain move — open the lead and use Convert instead.");
      return;
    }

    const lead = byStatus[fromStatus].find((l) => l.id === leadId);
    if (!lead) return;
    setByStatus((cur) => {
      const next = { ...cur };
      next[fromStatus] = next[fromStatus].filter((l) => l.id !== leadId);
      next[toStatus] = [{ ...lead, status: toStatus as LeadStatus }, ...(next[toStatus] || [])];
      return next;
    });
    const col = cols.find((c) => c.value === toStatus);
    setMoving(col?.label || 'Updating');
    try {
      if (DISQUALIFY_STATUSES.has(toStatus)) {
        await crmLeads.disqualify(leadId, { status: toStatus as 'unqualified' | 'lost' });
      } else {
        await crmLeads.update(leadId, { status: toStatus as LeadStatus });
      }
      toast.success('Lead moved');
    } catch (err: any) {
      setByStatus((cur) => {
        const next = { ...cur };
        next[toStatus] = (next[toStatus] || []).filter((l) => l.id !== leadId);
        next[fromStatus] = [lead, ...(next[fromStatus] || [])];
        return next;
      });
      toast.error(err.message || 'Move failed');
    } finally {
      setMoving(null);
    }
  };

  if (loading && initialLeads.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center' }}><LogoSpinner size={40} label="Loading leads…" /></div>;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {/* Hidden on desktop; globals.css shows it on phones / tablets where the board stacks vertically. */}
      <div className="kanban-touch-hint" style={{
        display: 'none',
        fontSize: 12.5, color: T.dim, padding: '8px 12px',
        background: T.raised, border: `1px solid ${T.border}`,
        borderRadius: T.radius.md, marginBottom: 8, textAlign: 'center',
      }}>
        <Hand size={14} strokeWidth={1.6} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        Long-press a lead to drag it. Scroll down to see all statuses.
      </div>
      <div style={{ position: 'relative' }}>
        <div className="kanban-board" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x proximity' }}>
          {cols.map((c) => <StatusColumn key={c.value} status={c} leads={byStatus[c.value] || []} />)}
        </div>
        {moving && <LogoSpinner overlay size={56} label={`Moving to ${moving}…`} />}
      </div>
    </DndContext>
  );
}
