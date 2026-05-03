'use client';
import type { Stage } from '../../types/crm';

export default function DealStageProgress({ stages, currentStageId, onMove }: { stages: Stage[]; currentStageId: string; onMove?: (stageId: string) => void }) {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const currentIdx = sorted.findIndex((s) => s.id === currentStageId);
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--s3)', borderRadius: 10 }}>
      {sorted.map((s, i) => {
        const reached = i <= currentIdx;
        const current = i === currentIdx;
        const bg = current ? 'var(--primary)' : reached ? 'rgba(40,180,99,0.18)' : 'transparent';
        const fg = current ? '#fff' : reached ? 'var(--green)' : 'var(--text-dim)';
        return (
          <button
            key={s.id}
            onClick={() => onMove && onMove(s.id)}
            disabled={!onMove}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 6, background: bg, color: fg, border: 'none', fontSize: 11, fontWeight: 700, cursor: onMove ? 'pointer' : 'default', textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
