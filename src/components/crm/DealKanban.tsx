'use client';
import { useEffect, useState } from 'react';
import { DndContext, useDroppable, useDraggable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { toast } from 'sonner';
import type { Deal, Stage } from '../../types/crm';
import { crmDeals } from '../../lib/crmApi';
import { useCrmKanbanStore } from '../../stores/crmKanbanStore';
import DealCard from './DealCard';
import { formatINR } from '../../lib/formatCurrency';

function StageColumn({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + (d.amount || 0), 0);
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'rgba(123,97,255,0.08)' : 'var(--s3)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 10,
        minWidth: 260,
        maxWidth: 280,
        flex: '1 1 260px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '4px 6px' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{stage.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{deals.length} · {formatINR(total)}</div>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {deals.map((d) => <DraggableCard key={d.id} deal={d} />)}
      </div>
    </div>
  );
}

function DraggableCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <DealCard deal={deal} dragHandleProps={{ ...listeners, ...attributes }} />
    </div>
  );
}

export default function DealKanban({ stages, initialDeals }: { stages: Stage[]; initialDeals: Deal[] }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { deals, setDeals, moveDealOptimistic, rollbackMove } = useCrmKanbanStore();

  useEffect(() => {
    const byStage: Record<string, Deal[]> = {};
    stages.forEach((s) => (byStage[s.id] = []));
    initialDeals.forEach((d) => {
      if (!byStage[d.stage_id]) byStage[d.stage_id] = [];
      byStage[d.stage_id].push(d);
    });
    setDeals(byStage);
  }, [stages, initialDeals, setDeals]);

  const onDragEnd = async (e: DragEndEvent) => {
    const dealId = String(e.active.id);
    const toStageId = e.over ? String(e.over.id) : null;
    if (!toStageId) return;
    let fromStageId = '';
    Object.entries(deals).forEach(([sid, list]) => {
      if (list.find((d) => d.id === dealId)) fromStageId = sid;
    });
    if (!fromStageId || fromStageId === toStageId) return;
    moveDealOptimistic(dealId, fromStageId, toStageId);
    try {
      await crmDeals.moveStage(dealId, { stage_id: toStageId });
      toast.success('Deal moved');
    } catch (err: any) {
      rollbackMove(dealId, fromStageId, toStageId);
      toast.error(err.message || 'Move failed');
    }
  };

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {sortedStages.map((s) => <StageColumn key={s.id} stage={s} deals={deals[s.id] || []} />)}
      </div>
    </DndContext>
  );
}
