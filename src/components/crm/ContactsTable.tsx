'use client';
import Link from 'next/link';
import type { Contact } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';

export default function ContactsTable({ contacts, loading }: { contacts: Contact[]; loading?: boolean }) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Account</th><th style={th}>Email</th><th style={th}>Phone</th><th style={th}>Owner</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && contacts.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No contacts found.</td></tr>}
            {contacts.map((c) => (
              <tr key={c.id}>
                <td style={td}><Link href={`/dashboard/crm/contacts/${c.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}</Link>{c.title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.title}</div>}</td>
                <td style={td}>{c.account_name || '—'}</td>
                <td style={td}>{c.email || '—'}</td>
                <td style={td}>{c.phone || '—'}</td>
                <td style={td}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><OwnerAvatar name={c.owner_name} size={24} /> <span style={{ fontSize: 12 }}>{c.owner_name || 'Unassigned'}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
