'use client';
import { useMemo } from 'react';
import type { FunnelPoint } from '../../../types/crm';

// Custom funnel — Recharts' built-in <Funnel> doesn't surface drop-off rates
// or stage-to-stage conversion, which is the most useful read on a CRM funnel.
// This version draws each stage as a tapered band and labels both the absolute
// count and the conversion-from-top%. Between adjacent stages we render a
// chevron with the stage-to-stage retention rate so the bottleneck is obvious.

const STAGE_COLORS = ['#3E9EFF', '#7B61FF', '#F7B538', '#FF6B35', '#28B463', '#E01E2C'];

export default function PipelineFunnelChart({ data }: { data: FunnelPoint[] }) {
  const stages = useMemo(() => data.filter((d) => d.count >= 0), [data]);
  const top = stages[0]?.count ?? 0;
  const max = stages.reduce((m, d) => Math.max(m, d.count), 0) || 1;

  if (stages.length === 0) {
    return (
      <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        No funnel data yet.
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 4px 4px' }}>
      {stages.map((s, i) => {
        const next = stages[i + 1];
        const widthPct = (s.count / max) * 100;
        const fromTopPct = top > 0 ? (s.count / top) * 100 : 0;
        const stageToNextPct = next && s.count > 0 ? (next.count / s.count) * 100 : null;
        const color = STAGE_COLORS[i % STAGE_COLORS.length];
        return (
          <div key={s.stage}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 12, alignItems: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{s.stage}</div>
              <div style={{ position: 'relative', height: 36 }}>
                <div style={{
                  position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                  width: `${Math.max(widthPct, 6)}%`, height: '100%',
                  background: `linear-gradient(90deg, ${color}cc, ${color}88)`,
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 13,
                  boxShadow: `0 2px 12px ${color}55`,
                  transition: 'width 480ms cubic-bezier(.2,.8,.2,1)',
                }}>
                  {s.count.toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
                {top > 0 ? `${fromTopPct.toFixed(0)}% of top` : '—'}
              </div>
            </div>
            {next && (
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 12, alignItems: 'center', height: 18 }}>
                <div />
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: stageToNextPct !== null && stageToNextPct < 30 ? '#E01E2C' : 'var(--text-dim)',
                    background: 'var(--s3)', border: '1px solid var(--border)',
                    padding: '1px 8px', borderRadius: 999,
                  }}>
                    {stageToNextPct !== null
                      ? `${stageToNextPct.toFixed(0)}% → ${next.stage}`
                      : `0% → ${next.stage}`}
                  </div>
                </div>
                <div />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, padding: '10px 12px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
        <span>Top-of-funnel: <strong style={{ color: 'var(--text)' }}>{top.toLocaleString()}</strong></span>
        <span>Bottom: <strong style={{ color: 'var(--text)' }}>{stages[stages.length - 1].count.toLocaleString()}</strong></span>
        <span>Overall conversion: <strong style={{ color: top > 0 && stages[stages.length - 1].count / top >= 0.2 ? '#28B463' : '#E01E2C' }}>
          {top > 0 ? `${((stages[stages.length - 1].count / top) * 100).toFixed(1)}%` : '—'}
        </strong></span>
      </div>
    </div>
  );
}
