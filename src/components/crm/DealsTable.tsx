'use client';
import Link from 'next/link';
import type { Deal } from '../../types/crm';
import StageBadge from './shared/StageBadge';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import LogoSpinner from '../shared/LogoSpinner';
import { formatINR } from '../../lib/formatCurrency';

interface Props {
  deals: Deal[];
  loading?: boolean;
  onAssign?: (dealId: string, userId: string | null) => Promise<void>;
  onDelete?: (dealId: string) => void | Promise<void>;
  // Inline edit: open the edit modal for one deal straight from the list.
  onEdit?: (deal: Deal) => void;
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
  { key: 'dealer', label: 'Dealer' },
  { key: 'amount', label: 'Amount' },
  { key: 'volume_kg', label: 'Volume (kg)' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'close_date', label: 'Close Date' },
  { key: 'owner', label: 'Owner' },
] as const;

// Cell value for the Volume (kg) column — reads the cached
// custom_fields.volume_kg the backend stamps on each deal row. Blank
// (not '—') when absent so non-tonnage tenants get a quiet column.
function volumeKgCell(d: Deal): string {
  const v = d.custom_fields?.volume_kg;
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-IN') : '';
}

export default function DealsTable({ deals, loading, onAssign, onDelete, onEdit, selected, onToggle, onToggleAll, hiddenColumns, viewMode = 'table', sort, onSort }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const showSelection = !!onToggle && !!selected;
  const showActions = !!onDelete || !!onEdit;
  const allSelected = showSelection && deals.length > 0 && deals.every((d) => selected!.has(d.id));
  const hidden = hiddenColumns ?? new Set<string>();
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;

  let colCount = (showSelection ? 1 : 0) + 1; // name always
  if (!hidden.has('dealer'))     colCount += 1;
  if (!hidden.has('amount'))     colCount += 1;
  if (!hidden.has('volume_kg'))  colCount += 1;
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
              {/* Dealer shows dealer_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('dealer')     && <th style={th}>Dealer</th>}
              {!hidden.has('amount')     && <SortTh label="Amount" sortKey="amount" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Volume lives inside the custom_fields jsonb → non-sortable. */}
              {!hidden.has('volume_kg')  && <th style={th}>Volume (kg)</th>}
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
            {loading && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center' }} data-label=""><div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><LogoSpinner size={38} label="Loading deals…" /></div></td></tr>}
            {!loading && deals.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No deals.</td></tr>}
            {deals.map((d) => (
              <tr key={d.id}>
                {showSelection && (
                  <td style={td} data-label="">
                    <input type="checkbox" checked={selected!.has(d.id)} onChange={() => onToggle!(d.id)} />
                  </td>
                )}
                <td style={td} data-label="Name">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Link href={`/dashboard/crm/deals/${d.id}`} className="km-entity-link" title="Open deal detail">{d.name}</Link>
                    {/* Always-visible inline-edit pencil so editing is
                        discoverable without scrolling to the Action column. */}
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(d)}
                        title="Edit this deal"
                        aria-label="Edit deal"
                        style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--primary)', lineHeight: 0, flexShrink: 0, opacity: 0.8 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                    )}
                  </div>
                </td>
                {!hidden.has('dealer')     && <td style={td} data-label="Dealer">{d.dealer_name ?? '—'}</td>}
                {!hidden.has('amount')     && <td style={td} data-label="Amount">{formatINR(d.amount)}</td>}
                {!hidden.has('volume_kg')  && <td style={td} data-label="Volume (kg)">{volumeKgCell(d)}</td>}
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
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                      {/* Inline edit — opens the edit modal in place so a rep
                          can fix one deal without leaving the list. */}
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(d)}
                          title="Edit this deal"
                          aria-label={`Edit ${d.name}`}
                          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(d.id)}
                          title="Delete this deal"
                          aria-label={`Delete ${d.name}`}
                          style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
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
