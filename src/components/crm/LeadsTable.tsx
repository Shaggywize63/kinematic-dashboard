'use client';
import Link from 'next/link';
import type { Lead } from '../../types/crm';
import LeadScoreBadge from './LeadScoreBadge';
import OwnerAvatar from './shared/OwnerAvatar';

interface Props {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  loading?: boolean;
}

export default function LeadsTable({ leads, selected, onToggle, onToggleAll, loading }: Props) {
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const thStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
              </th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Company</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Owner</th>
              <th style={thStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }}>Loading leads...</td></tr>
            )}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }}>No leads found.</td></tr>
            )}
            {leads.map((l) => {
              const fullName = l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—';
              return (
                <tr key={l.id}>
                  <td style={tdStyle}><input type="checkbox" checked={selected.has(l.id)} onChange={() => onToggle(l.id)} /></td>
                  <td style={tdStyle}>
                    <Link href={`/dashboard/crm/leads/${l.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{fullName}</Link>
                    {l.title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{l.title}</div>}
                  </td>
                  <td style={tdStyle}>{l.company || '—'}</td>
                  <td style={tdStyle}>{l.email || '—'}</td>
                  <td style={tdStyle}><span style={{ textTransform: 'capitalize' }}>{l.status}</span></td>
                  <td style={tdStyle}><LeadScoreBadge score={l.score} grade={l.score_grade} /></td>
                  <td style={tdStyle}>{l.source_name || '—'}</td>
                  <td style={tdStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OwnerAvatar name={l.owner_name} size={24} /> <span style={{ fontSize: 12 }}>{l.owner_name || 'Unassigned'}</span></div></td>
                  <td style={tdStyle}>{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
