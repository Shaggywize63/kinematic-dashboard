'use client';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import type { Account } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';
import { EmptyRow, LoadingRow, SortTh, subStyle, tdStyle, thStyle, type SortState } from './shared/tableBits';
import { Card, T } from '../ui';

interface Props {
  accounts: Account[];
  loading?: boolean;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is a real crm_accounts column; `onSort(key)`
  // asks the parent to toggle/switch and refetch. Undefined = non-sortable UI.
  sort?: SortState;
  onSort?: (key: string) => void;
}

export const ACCOUNT_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'industry', label: 'Industry' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'employees', label: 'Employees' },
  { key: 'owner', label: 'Owner' },
] as const;

// Annual revenue is stored as a plain number; render it in the tenant's
// locale with no currency symbol assumption (the field is currency-agnostic).
function formatRevenue(v: Account['annual_revenue']): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, ''); }
  catch { return url; }
}

export default function AccountsTable({ accounts, loading, hiddenColumns, viewMode = 'table', sort, onSort }: Props) {
  const hidden = hiddenColumns ?? new Set<string>();
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;
  let colCount = 1; // name
  if (!hidden.has('industry'))  colCount += 1;
  if (!hidden.has('revenue'))   colCount += 1;
  if (!hidden.has('employees')) colCount += 1;
  if (!hidden.has('owner'))     colCount += 1;
  const num: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' };
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortTh label="Name" sortKey="name" sort={sort} onSort={onSort} />
              {!hidden.has('industry')  && <SortTh label="Industry" sortKey="industry" sort={sort} onSort={onSort} />}
              {/* Revenue column → real column annual_revenue. */}
              {!hidden.has('revenue')   && <SortTh label="Revenue" sortKey="annual_revenue" sort={sort} onSort={onSort} align="right" />}
              {!hidden.has('employees') && <SortTh label="Employees" sortKey="employees" sort={sort} onSort={onSort} align="right" />}
              {/* Owner shows owner_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('owner')     && <th style={thStyle}>Owner</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={colCount} label="Loading accounts…" />}
            {!loading && accounts.length === 0 && (
              <EmptyRow
                colSpan={colCount}
                icon={<Building2 size={18} strokeWidth={1.8} />}
                title="No accounts yet"
                description="Accounts group the contacts, deals and activity for one company. Create one, or convert a qualified lead."
              />
            )}
            {accounts.map((a) => {
              const revenue = formatRevenue(a.annual_revenue);
              const site = hostOf(a.website);
              return (
                <tr key={a.id} className="km-row">
                  <td style={tdStyle} data-label="Name">
                    <Link href={`/dashboard/crm/accounts/${a.id}`} className="km-entity-link" title="Open account detail" style={{ fontWeight: 600 }}>{a.name}</Link>
                    {site && <div style={subStyle}>{site}</div>}
                  </td>
                  {!hidden.has('industry')  && <td style={{ ...tdStyle, color: a.industry ? T.text : T.mute }} data-label="Industry">{a.industry || '—'}</td>}
                  {!hidden.has('revenue')   && <td style={{ ...num, color: revenue ? T.text : T.mute }} data-label="Revenue">{revenue ?? '—'}</td>}
                  {!hidden.has('employees') && <td style={{ ...num, color: a.employees ? T.text : T.mute }} data-label="Employees">{a.employees ? Number(a.employees).toLocaleString() : '—'}</td>}
                  {!hidden.has('owner') && (
                    <td style={tdStyle} data-label="Owner">
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
