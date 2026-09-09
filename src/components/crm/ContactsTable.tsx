'use client';
import Link from 'next/link';
import { Users } from 'lucide-react';
import type { Contact } from '../../types/crm';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import OwnerAvatar from './shared/OwnerAvatar';
import { EmptyRow, LoadingRow, SortTh, subStyle, tdStyle, thStyle, type SortState } from './shared/tableBits';
import { Card, T } from '../ui';

interface Props {
  contacts: Contact[];
  loading?: boolean;
  isB2C?: boolean;
  onAssign?: (contactId: string, userId: string | null) => Promise<void>;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is a real crm_contacts column; `onSort(key)`
  // asks the parent to toggle/switch and refetch. Undefined = non-sortable UI.
  sort?: SortState;
  onSort?: (key: string) => void;
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
  const hidden = hiddenColumns ?? new Set<string>();
  const showAccount = !isB2C && !hidden.has('account');
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;
  let colCount = 1; // name
  if (showAccount)           colCount += 1;
  if (!hidden.has('email'))  colCount += 1;
  if (!hidden.has('phone'))  colCount += 1;
  if (!hidden.has('owner'))  colCount += 1;
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {/* Name column → real column first_name (single-column server sort). */}
              <SortTh label="Name" sortKey="first_name" sort={sort} onSort={onSort} />
              {/* Account shows the joined account_name (not a real crm_contacts
                  column) → non-sortable. */}
              {showAccount         && <th style={thStyle}>Account</th>}
              {!hidden.has('email') && <SortTh label="Email" sortKey="email" sort={sort} onSort={onSort} />}
              {!hidden.has('phone') && <SortTh label="Phone" sortKey="phone" sort={sort} onSort={onSort} />}
              {/* Owner shows owner_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('owner') && <th style={thStyle}>Owner</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={colCount} label="Loading contacts…" />}
            {!loading && contacts.length === 0 && (
              <EmptyRow
                colSpan={colCount}
                icon={<Users size={18} strokeWidth={1.8} />}
                title="No contacts yet"
                description={isB2C
                  ? 'Consumer contacts appear here once a lead is converted or a profile is imported.'
                  : 'Add people at the accounts you sell to, or import a list to get started.'}
              />
            )}
            {contacts.map((c) => {
              const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email;
              return (
                <tr key={c.id} className="km-row">
                  <td style={tdStyle} data-label="Name">
                    <Link href={`/dashboard/crm/contacts/${c.id}`} className="km-entity-link" title="Open contact detail" style={{ fontWeight: 600 }}>
                      {name}
                    </Link>
                    {c.title && <div style={subStyle}>{c.title}</div>}
                  </td>
                  {showAccount && (
                    <td style={tdStyle} data-label="Account">
                      {c.account_id && c.account_name
                        ? <Link href={`/dashboard/crm/accounts/${c.account_id}`} className="km-entity-link" title="Open account detail">{c.account_name}</Link>
                        : <span style={{ color: c.account_name ? T.text : T.mute }}>{c.account_name || '—'}</span>}
                    </td>
                  )}
                  {!hidden.has('email') && (
                    <td style={tdStyle} data-label="Email">
                      {c.email ? <a href={`mailto:${c.email}`} style={{ color: T.text, textDecoration: 'none' }}>{c.email}</a> : <span style={{ color: T.mute }}>—</span>}
                    </td>
                  )}
                  {!hidden.has('phone') && (
                    <td style={{ ...tdStyle, fontFamily: c.phone ? T.mono : undefined, fontSize: c.phone ? 12.5 : undefined }} data-label="Phone">
                      {c.phone ? <a href={`tel:${c.phone}`} style={{ color: T.text, textDecoration: 'none' }}>{c.phone}</a> : <span style={{ color: T.mute }}>—</span>}
                    </td>
                  )}
                  {!hidden.has('owner') && (
                    <td style={tdStyle} data-label="Owner">
                      {onAssign ? (
                        <InlineOwnerAssign
                          currentOwnerId={c.owner_id}
                          currentOwnerName={c.owner_name}
                          onAssign={(uid) => onAssign(c.id, uid)}
                        />
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: c.owner_name ? T.text : T.mute }}>
                          <OwnerAvatar name={c.owner_name} size={22} />
                          {c.owner_name || 'Unassigned'}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
