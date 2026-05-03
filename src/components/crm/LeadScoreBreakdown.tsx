'use client';
import type { ScoreFactor } from '../../types/crm';
import LeadScoreBadge from './LeadScoreBadge';
import AiBadge from './shared/AiBadge';

interface Props {
  score?: number | null;
  grade?: 'A' | 'B' | 'C' | 'D' | null;
  factors?: ScoreFactor[];
  onRefresh?: () => void;
  loading?: boolean;
}

export default function LeadScoreBreakdown({ score, grade, factors = [], onRefresh, loading }: Props) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Lead Score</div>
          <AiBadge />
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
          >
            {loading ? 'Scoring...' : 'Re-score'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <LeadScoreBadge score={score ?? null} grade={grade ?? null} />
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {(factors || []).length} contributing factors
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(factors || []).map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ flex: 1, color: 'var(--text)', fontWeight: 600 }}>
              {f.factor}
              {f.detail && <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>{f.detail}</span>}
            </div>
            <div style={{ width: 120, height: 6, background: 'var(--s3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.abs(f.contribution))}%`, height: '100%', background: f.contribution >= 0 ? '#28B463' : '#E01E2C' }} />
            </div>
            <div style={{ width: 50, textAlign: 'right', color: f.contribution >= 0 ? '#28B463' : '#E01E2C', fontWeight: 700 }}>
              {f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(0)}
            </div>
          </div>
        ))}
        {(!factors || factors.length === 0) && (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No score yet. Click Re-score to generate.</div>
        )}
      </div>
    </div>
  );
}
