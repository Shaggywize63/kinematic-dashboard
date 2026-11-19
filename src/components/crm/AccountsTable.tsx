'use client';
import Link from 'next/link';
import { Building2, MapPin } from 'lucide-react';
import type { Account } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';
import { EmptyRow, LoadingRow, SortTh, subStyle, tdStyle, thStyle, type SortState } from './shared/tableBits';
import { formatINR, formatINRCompact } from '../../lib/formatCurrency';
import type { FieldHelpers } from '../../lib/crmFieldOverrides';
import { Button, Card, T } from '../ui';

interface Props {
  accounts: Account[];
  loading?: boolean;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is a real crm_accounts column; `onSort(key)`
  // asks the parent to toggle/switch and refetch. Undefined = non-sortable UI.
  sort?: SortState;
  onSort?: (key: string) => void;
  /** Built-in field overrides (hide / relabel), the same rules as the account forms. */
  fields?: FieldHelpers;
  /** A search that matches nothing reads differently from no accounts at all. */
  searching?: boolean;
  onClearSearch?: () => void;
}

export const ACCOUNT_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'industry', label: 'Industry' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'open_deals', label: 'Open deals' },
  { key: 'won', label: 'Won' },
  { key: 'owner', label: 'Owner' },
] as const;

/** The built-in account field behind each list column, for the admin's hide / relabel overrides. Rollup columns have none. */
const COLUMN_FIELD: Record<string, string> = { industry: 'industry', owner: 'owner_id' };

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, ''); }
  catch { return url; }
}

/** "Maharashtra, India" from the account's location fields the admin has not hidden (accounts carry no city in the UI). */
function placeOf(a: Account, isHidden: (k: string) => boolean): string {
  return [isHidden('state') ? '' : a.state, isHidden('country') ? '' : a.country].map((x) => (x ?? '').toString().trim()).filter(Boolean).join(', ');
}

export default function AccountsTable({ accounts, loading, hiddenColumns, viewMode = 'table', sort, onSort, fields, searching, onClearSearch }: Props) {
  const isHidden = (k: string) => !!fields?.isHidden(k);
  const label = (key: string, def: string) => (fields ? fields.labelFor(key, def) : def);
  const hidden = new Set<string>(hiddenColumns ?? []);
  // A built-in field the admin hid on the account forms is hidden here too.
  for (const [col, key] of Object.entries(COLUMN_FIELD)) if (isHidden(key)) hidden.add(col);
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;
  const colCount = 1 + ['industry', 'contacts', 'open_deals', 'won', 'owner'].filter((c) => !hidden.has(c)).length;
  const num: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const zero = (n: number | undefined) => !n;

  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortTh label={label('name', 'Name')} sortKey="name" sort={sort} onSort={onSort} />
              {!hidden.has('industry')   && <SortTh label={label('industry', 'Industry')} sortKey="industry" sort={sort} onSort={onSort} />}
              {/* The three rollups are stamped by the list endpoint (not columns), so they are not server-sortable. */}
              {!hidden.has('contacts')   && <th style={{ ...thStyle, textAlign: 'right' }}>Contacts</th>}
              {!hidden.has('open_deals') && <th style={{ ...thStyle, textAlign: 'right' }}>Open deals</th>}
              {!hidden.has('won')        && <th style={{ ...thStyle, textAlign: 'right' }}>Won</th>}
              {/* Owner shows owner_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('owner')      && <th style={thStyle}>{label('owner_id', 'Owner')}</th>}
            </tr>
          </thead>
          <tbody>
            {loading && accounts.length === 0 && <LoadingRow colSpan={colCount} label="Loading accounts…" />}
            {!loading && accounts.length === 0 && (searching ? (
              <EmptyRow colSpan={colCount} icon={<Building2 size={18} strokeWidth={1.8} />} title="No accounts match this search"
                description="Search looks at the account name, website domain and industry."
                action={onClearSearch ? <Button size="sm" onClick={onClearSearch}>Clear search</Button> : undefined} />
            ) : (
              <EmptyRow colSpan={colCount} icon={<Building2 size={18} strokeWidth={1.8} />} title="No accounts yet"
                description="Accounts group the contacts, deals and activity for one company. Create one, or convert a qualified lead." />
            ))}
            {accounts.map((a) => {
              const site = isHidden('website') ? null : hostOf(a.website);
              const place = placeOf(a, isHidden);
              const openN = a.open_deals_count ?? 0;
              const wonV = a.won_deals_value ?? 0;
              return (
                <tr key={a.id} className="km-row" style={loading ? { opacity: 0.55 } : undefined}>
                  <td style={{ ...tdStyle, minWidth: 200 }} data-label={label('name', 'Name')}>
                    <Link href={`/dashboard/crm/accounts/${a.id}`} className="km-entity-link" title="Open account detail" style={{ fontWeight: 600 }}>
                      {isHidden('name') ? 'Open account' : a.name}
                    </Link>
                    {(site || place) && (
                      <div style={{ ...subStyle, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {site && <span>{site}</span>}
                        {place && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} strokeWidth={1.8} aria-hidden />{place}</span>}
                      </div>
                    )}
                  </td>
                  {!hidden.has('industry')   && <td style={{ ...tdStyle, color: a.industry ? T.text : T.mute }} data-label={label('industry', 'Industry')}>{a.industry || '—'}</td>}
                  {!hidden.has('contacts')   && <td style={{ ...num, color: zero(a.contacts_count) ? T.mute : T.text }} data-label="Contacts">{(a.contacts_count ?? 0).toLocaleString('en-IN')}</td>}
                  {!hidden.has('open_deals') && (
                    <td style={num} data-label="Open deals" data-testid={`account-open-${a.id}`}>
                      {openN ? (
                        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                          <span style={{ color: T.text, fontWeight: 600 }} title={formatINR(a.open_deals_value ?? 0)}>{formatINRCompact(a.open_deals_value ?? 0)}</span>
                          <span style={{ fontSize: 11, color: T.mute }}>{openN} {openN === 1 ? 'deal' : 'deals'}</span>
                        </span>
                      ) : <span style={{ color: T.mute }}>—</span>}
                    </td>
                  )}
                  {!hidden.has('won') && (
                    <td style={{ ...num, color: wonV ? T.ok : T.mute }} data-label="Won" title={wonV ? `${formatINR(wonV)} from ${a.won_deals_count ?? 0} won ${(a.won_deals_count ?? 0) === 1 ? 'deal' : 'deals'}` : undefined}>
                      {wonV ? formatINRCompact(wonV) : '—'}
                    </td>
                  )}
                  {!hidden.has('owner') && (
                    <td style={tdStyle} data-label={label('owner_id', 'Owner')}>
                      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: a.owner_name ? T.text : T.mute }}>
                        <OwnerAvatar name={a.owner_name} size={22} />
                        <span>{a.owner_name || 'Unassigned'}</span>
                      </div>
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
