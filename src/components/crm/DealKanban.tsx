'use client';
import { useEffect, useState } from 'react';
import { DndContext, useDroppable, useDraggable, type DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { toast } from 'sonner';
import type { Deal, Stage } from '../../types/crm';
import { crmDeals } from '../../lib/crmApi';
import { useCrmKanbanStore } from '../../stores/crmKanbanStore';
import DealCard from './DealCard';
import { formatINR } from '../../lib/formatCurrency';

// Kanban column. On phones (≤640px) `globals.css` overrides the width to
// ~88vw so each column dominates the viewport and the user swipes
// horizontally between columns instead of seeing four squished panes.
function StageColumn({ stage, deals, showWeighted }: { stage: Stage; deals: Deal[]; showWeighted: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => {
    const amount = d.amount || 0;
    if (!showWeighted) return s + amount;
    const pct = d.ai_win_probability ?? d.probability ?? stage.default_probability ?? 100;
    return s + (amount * pct) / 100;
  }, 0);
  return (
    <div
      ref={setNodeRef}
      className="kanban-column"
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
        scrollSnapAlign: 'start',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '4px 6px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5, wordBreak: 'break-word' }}>{stage.name}</div>
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

// Detect touch device once on mount so we can use a long-press to start
// drags on phones (prevents accidental drags during horizontal column
// scroll). Desktop keeps the immediate-drag PointerSensor.
function useIsTouchDevice() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setTouch('ontouchstart' in window || (navigator as any)?.maxTouchPoints > 0);
  }, []);
  return touch;
}

export default function DealKanban({ stages, initialDeals, showWeighted = false }: { stages: Stage[]; initialDeals: Deal[]; showWeighted?: boolean }) {
  const isTouch = useIsTouchDevice();
  // Touch: 250ms long-press + 8px tolerance so swiping the board
  // horizontally doesn't trigger drag mode by accident. Mouse: still
  // immediate, 5px threshold (matches the pre-mobile behaviour).
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } });
  const sensors = useSensors(isTouch ? touch : pointer);
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
      const targetStage = stages.find((s) => s.id === toStageId);
      if (targetStage?.stage_type === 'won') {
        import('canvas-confetti').then(({ default: confetti }) => {
          confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors: ['#28B463', '#F7B538', '#3E9EFF', '#E01E2C', '#7B61FF'] });
          window.setTimeout(() => {
            confetti({ particleCount: 80, spread: 60, origin: { x: 0.2, y: 0.7 }, colors: ['#28B463', '#F7B538'] });
            confetti({ particleCount: 80, spread: 60, origin: { x: 0.8, y: 0.7 }, colors: ['#3E9EFF', '#7B61FF'] });
          }, 250);
        }).catch(() => { /* confetti is decorative — never block on it */ });
      }
    } catch (err: any) {
      rollbackMove(dealId, fromStageId, toStageId);
      toast.error(err.message || 'Move failed');
    }
  };

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {/* On phones the touch hint sits above the board so reps know how to
          drag. Hidden on desktop. */}
      <div className="kanban-touch-hint" style={{
        display: 'none',
        fontSize: 11, color: 'var(--text-dim)', padding: '6px 10px',
        background: 'var(--s3)', border: '1px solid var(--border)',
        borderRadius: 8, marginBottom: 8, textAlign: 'center',
      }}>
        💡 Long-press a card to drag it. Swipe ↔ to scroll between stages.
      </div>
      <div
        className="kanban-board"
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollSnapType: 'x proximity',
        }}>
        {sortedStages.map((s) => <StageColumn key={s.id} stage={s} deals={deals[s.id] || []} showWeighted={showWeighted} />)}
      </div>
    </DndContext>
  );
}
