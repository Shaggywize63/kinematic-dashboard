'use client';
import Link from 'next/link';
import type { Account } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';

export default function AccountsTable({ accounts, loading }: { accounts: Account[]; loading?: boolean }) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Industry</th><th style={th}>Revenue</th><th style={th}>Employees</th><th style={th}>Owner</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && accounts.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No accounts found.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td style={td}><Link href={`/dashboard/crm/accounts/${a.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{a.name}</Link>{a.website && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.website}</div>}</td>
                <td style={td}>{a.industry || '—'}</td>
                <td style={td}>{a.annual_revenue ? `$${Number(a.annual_revenue).toLocaleString()}` : '—'}</td>
                <td style={td}>{a.employees || '—'}</td>
                <td style={td}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><OwnerAvatar name={a.owner_name} size={24} /><span style={{ fontSize: 12 }}>{a.owner_name || 'Unassigned'}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
