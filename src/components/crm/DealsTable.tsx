'use client';
import Link from 'next/link';
import type { Deal } from '../../types/crm';
import StageBadge from './shared/StageBadge';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import { formatINR } from '../../lib/formatCurrency';

interface Props {
  deals: Deal[];
  loading?: boolean;
  onAssign?: (dealId: string, userId: string | null) => Promise<void>;
  onDelete?: (dealId: string) => void | Promise<void>;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is a real crm_deals column; `onSort(key)`
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

export const DEAL_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'amount', label: 'Amount' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'close_date', label: 'Close Date' },
  { key: 'owner', label: 'Owner' },
] as const;

export default function DealsTable({ deals, loading, onAssign, onDelete, selected, onToggle, onToggleAll, hiddenColumns, viewMode = 'table', sort, onSort }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const showSelection = !!onToggle && !!selected;
  const showActions = !!onDelete;
  const allSelected = showSelection && deals.length > 0 && deals.every((d) => selected!.has(d.id));
  const hidden = hiddenColumns ?? new Set<string>();
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;

  let colCount = (showSelection ? 1 : 0) + 1; // name always
  if (!hidden.has('amount'))     colCount += 1;
  if (!hidden.has('stage'))      colCount += 1;
  if (!hidden.has('status'))     colCount += 1;
  if (!hidden.has('close_date')) colCount += 1;
  if (!hidden.has('owner'))      colCount += 1;
  if (showActions)               colCount += 1;

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {showSelection && (
                <th style={{ ...th, width: 40 }}>
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                </th>
              )}
              <SortTh label="Name" sortKey="name" sort={sort} onSort={onSort} thStyle={th} />
              {!hidden.has('amount')     && <SortTh label="Amount" sortKey="amount" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Stage renders via a join (crm_deal_stages.name); the deals row
                  has only stage_id (a UUID), so it's left non-sortable. */}
              {!hidden.has('stage')      && <th style={th}>Stage</th>}
              {!hidden.has('status')     && <SortTh label="Status" sortKey="status" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Close Date column → real column expected_close_date. */}
              {!hidden.has('close_date') && <SortTh label="Close Date" sortKey="expected_close_date" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Owner shows owner_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('owner')      && <th style={th}>Owner</th>}
              {showActions               && <th style={{ ...th, textAlign: 'right' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">Loading...</td></tr>}
            {!loading && deals.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No deals.</td></tr>}
            {deals.map((d) => (
              <tr key={d.id}>
                {showSelection && (
                  <td style={td} data-label="">
                    <input type="checkbox" checked={selected!.has(d.id)} onChange={() => onToggle!(d.id)} />
                  </td>
                )}
                <td style={td} data-label="Name"><Link href={`/dashboard/crm/deals/${d.id}`} className="km-entity-link" title="Open deal detail">{d.name}</Link></td>
                {!hidden.has('amount')     && <td style={td} data-label="Amount">{formatINR(d.amount)}</td>}
                {!hidden.has('stage')      && <td style={td} data-label="Stage"><StageBadge name={d.stage_name} won={d.status === 'won'} lost={d.status === 'lost'} /></td>}
                {!hidden.has('status')     && <td style={td} data-label="Status"><span style={{ textTransform: 'capitalize' }}>{d.status}</span></td>}
                {!hidden.has('close_date') && (
                  <td style={td} data-label="Close Date">
                    {(() => {
                      // For a won / lost deal, prefer actual_close_date
                      // (set by winDeal / loseDeal) so the column shows
                      // when the deal actually closed, not when it was
                      // forecast. Open deals fall back to the forecast.
                      const closed = (d.status === 'won' || d.status === 'lost')
                        ? (d.actual_close_date as string | null | undefined) ?? d.expected_close_date
                        : d.expected_close_date;
                      return closed ? new Date(closed).toLocaleDateString() : '—';
                    })()}
                  </td>
                )}
                {!hidden.has('owner') && (
                  <td style={td} data-label="Owner">
                    {onAssign ? (
                      <InlineOwnerAssign
                        currentOwnerId={d.owner_id}
                        currentOwnerName={d.owner_name}
                        onAssign={(uid) => onAssign(d.id, uid)}
                        recordLabel={d.name}
                      />
                    ) : (
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>{d.owner_name || 'Unassigned'}</span>
                    )}
                  </td>
                )}
                {showActions && (
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="Action">
                    <button
                      type="button"
                      onClick={() => onDelete!(d.id)}
                      title="Delete this deal"
                      aria-label={`Delete ${d.name}`}
                      style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🗑 Delete
                    </button>
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
