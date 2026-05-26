'use client';
import Link from 'next/link';
import type { Account } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';

interface Props {
  accounts: Account[];
  loading?: boolean;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
}

export const ACCOUNT_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'industry', label: 'Industry' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'employees', label: 'Employees' },
  { key: 'owner', label: 'Owner' },
] as const;

export default function AccountsTable({ accounts, loading, hiddenColumns, viewMode = 'table' }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const hidden = hiddenColumns ?? new Set<string>();
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;
  let colCount = 1; // name
  if (!hidden.has('industry'))  colCount += 1;
  if (!hidden.has('revenue'))   colCount += 1;
  if (!hidden.has('employees')) colCount += 1;
  if (!hidden.has('owner'))     colCount += 1;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              {!hidden.has('industry')  && <th style={th}>Industry</th>}
              {!hidden.has('revenue')   && <th style={th}>Revenue</th>}
              {!hidden.has('employees') && <th style={th}>Employees</th>}
              {!hidden.has('owner')     && <th style={th}>Owner</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">Loading...</td></tr>}
            {!loading && accounts.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No accounts found.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td style={td} data-label="Name"><Link href={`/dashboard/crm/accounts/${a.id}`} className="km-entity-link" title="Open account detail">{a.name}</Link>{a.website && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.website}</div>}</td>
                {!hidden.has('industry')  && <td style={td} data-label="Industry">{a.industry || '—'}</td>}
                {!hidden.has('revenue')   && <td style={td} data-label="Revenue">{a.annual_revenue ? `$${Number(a.annual_revenue).toLocaleString()}` : '—'}</td>}
                {!hidden.has('employees') && <td style={td} data-label="Employees">{a.employees || '—'}</td>}
                {!hidden.has('owner')     && <td style={td} data-label="Owner"><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><OwnerAvatar name={a.owner_name} size={24} /><span style={{ fontSize: 12 }}>{a.owner_name || 'Unassigned'}</span></div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
