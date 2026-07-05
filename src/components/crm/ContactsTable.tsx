'use client';
import Link from 'next/link';
import type { Contact } from '../../types/crm';
import InlineOwnerAssign from './shared/InlineOwnerAssign';

interface Props {
  contacts: Contact[];
  loading?: boolean;
  isB2C?: boolean;
  onAssign?: (contactId: string, userId: string | null) => Promise<void>;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is a real crm_contacts column; `onSort(key)`
  // asks the parent to toggle/switch and refetch. Undefined = non-sortable UI.
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
}

// Clickable, server-side-sort header. Sorting happens on the backend via
// onSort → parent refetch; this only renders label + asc/desc/idle arrow.
function SortTh({ label, sortKey, sort, onSort, thStyle, align = 'left' }: {
  label: string;
  sortKey: string;
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  thStyle: React.CSSProperties;
  align?: 'left' | 'right';
}) {
  const th: React.CSSProperties = { ...thStyle, textAlign: align };
  if (!onSort) return <th style={th}>{label}</th>;
  const active = !!sort && sort.key === sortKey;
  const arrow = active ? (sort!.order === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th style={th}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => onSort(sortKey)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortKey); } }}
        title="Sort"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', color: active ? 'var(--primary)' : 'inherit', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {label}
        <span aria-hidden style={{ fontSize: 9, lineHeight: 1, opacity: active ? 1 : 0.4 }}>{arrow}</span>
      </span>
    </th>
  );
}

export const CONTACT_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'account', label: 'Account' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'owner', label: 'Owner' },
] as const;

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
export default function ContactsTable({ contacts, loading, isB2C = false, onAssign, hiddenColumns, viewMode = 'table', sort, onSort }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const hidden = hiddenColumns ?? new Set<string>();
  const showAccount = !isB2C && !hidden.has('account');
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;
  let colCount = 1; // name
  if (showAccount)           colCount += 1;
  if (!hidden.has('email'))  colCount += 1;
  if (!hidden.has('phone'))  colCount += 1;
  if (!hidden.has('owner'))  colCount += 1;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {/* Name column → real column first_name (single-column server sort). */}
              <SortTh label="Name" sortKey="first_name" sort={sort} onSort={onSort} thStyle={th} />
              {/* Account shows the joined account_name (not a real crm_contacts
                  column) → non-sortable. */}
              {showAccount         && <th style={th}>Account</th>}
              {!hidden.has('email') && <SortTh label="Email" sortKey="email" sort={sort} onSort={onSort} thStyle={th} />}
              {!hidden.has('phone') && <SortTh label="Phone" sortKey="phone" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Owner shows owner_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('owner') && <th style={th}>Owner</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">Loading...</td></tr>}
            {!loading && contacts.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No contacts found.</td></tr>}
            {contacts.map((c) => (
              <tr key={c.id}>
                <td style={td} data-label="Name">
                  <Link href={`/dashboard/crm/contacts/${c.id}`} className="km-entity-link" title="Open contact detail">
                    {c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}
                  </Link>
                  {c.title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.title}</div>}
                </td>
                {showAccount && (
                  <td style={td} data-label="Account">
                    {c.account_id && c.account_name
                      ? <Link href={`/dashboard/crm/accounts/${c.account_id}`} className="km-entity-link" title="Open account detail">{c.account_name}</Link>
                      : (c.account_name || '—')}
                  </td>
                )}
                {!hidden.has('email') && <td style={td} data-label="Email">{c.email || '—'}</td>}
                {!hidden.has('phone') && <td style={td} data-label="Phone">{c.phone || '—'}</td>}
                {!hidden.has('owner') && (
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
