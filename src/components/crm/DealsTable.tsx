'use client';
import Link from 'next/link';
import type { Deal } from '../../types/crm';
import StageBadge from './shared/StageBadge';
import OwnerAvatar from './shared/OwnerAvatar';

export default function DealsTable({ deals, loading }: { deals: Deal[]; loading?: boolean }) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Account</th><th style={th}>Amount</th><th style={th}>Stage</th><th style={th}>Status</th><th style={th}>Close Date</th><th style={th}>Owner</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && deals.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No deals.</td></tr>}
            {deals.map((d) => (
              <tr key={d.id}>
                <td style={td}><Link href={`/dashboard/crm/deals/${d.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{d.name}</Link></td>
                <td style={td}>{d.account_name || '—'}</td>
                <td style={td}>${Number(d.amount || 0).toLocaleString()}</td>
                <td style={td}><StageBadge name={d.stage_name} won={d.status === 'won'} lost={d.status === 'lost'} /></td>
                <td style={td}><span style={{ textTransform: 'capitalize' }}>{d.status}</span></td>
                <td style={td}>{d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : '—'}</td>
                <td style={td}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><OwnerAvatar name={d.owner_name} size={24} /><span style={{ fontSize: 12 }}>{d.owner_name || 'Unassigned'}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
