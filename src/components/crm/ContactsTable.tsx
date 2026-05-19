'use client';
import Link from 'next/link';
import type { Contact } from '../../types/crm';
import InlineOwnerAssign from './shared/InlineOwnerAssign';

interface Props {
  contacts: Contact[];
  loading?: boolean;
  isB2C?: boolean;
  onAssign?: (contactId: string, userId: string | null) => Promise<void>;
}

/**
 * ContactsTable
 *
 * On wide screens this is a normal HTML <table>. On phones (≤640px),
 * `globals.css` flips `.responsive-cards` into a card-stack layout —
 * each row becomes a small card with `data-label`s replacing the
 * <thead>. No JS / no re-render — pure CSS via the global rule, so
 * every table that opts in (just add `responsive-cards` + data-label)
 * gets the same treatment.
 */
export default function ContactsTable({ contacts, loading, isB2C = false, onAssign }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const colCount = isB2C ? 4 : 5;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="responsive-cards" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              {!isB2C && <th style={th}>Account</th>}
              <th style={th}>Email</th>
              <th style={th}>Phone</th>
              <th style={th}>Owner</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">Loading...</td></tr>}
            {!loading && contacts.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No contacts found.</td></tr>}
            {contacts.map((c) => (
              <tr key={c.id}>
                <td style={td} data-label="Name">
                  <Link href={`/dashboard/crm/contacts/${c.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}
                  </Link>
                  {c.title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.title}</div>}
                </td>
                {!isB2C && <td style={td} data-label="Account">{c.account_name || '—'}</td>}
                <td style={td} data-label="Email">{c.email || '—'}</td>
                <td style={td} data-label="Phone">{c.phone || '—'}</td>
                <td style={td} data-label="Owner">
                  {onAssign ? (
                    <InlineOwnerAssign
                      currentOwnerId={c.owner_id}
                      currentOwnerName={c.owner_name}
                      onAssign={(uid) => onAssign(c.id, uid)}
                    />
                  ) : (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>{c.owner_name || 'Unassigned'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
