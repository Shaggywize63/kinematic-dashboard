'use client';
import type { NextBestAction } from '../../types/crm';
import AiBadge from './shared/AiBadge';

export default function NextBestActionCard({ action, onLoad, loading }: { action?: NextBestAction | null; onLoad?: () => void; loading?: boolean }) {
  const tone = action?.priority === 'high' ? '#E01E2C' : action?.priority === 'medium' ? '#F7B538' : '#28B463';
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Next Best Action</div>
          <AiBadge />
        </div>
        {onLoad && (
          <button onClick={onLoad} disabled={loading} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
            {loading ? 'Thinking...' : 'Suggest'}
          </button>
        )}
      </div>
      {action ? (
        <div>
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700, marginBottom: 6 }}>{action.action}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>{action.rationale}</div>
          <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: tone, background: `${tone}1A`, border: `1px solid ${tone}40` }}>
            {action.priority}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No suggestion yet.</div>
      )}
    </div>
  );
}
