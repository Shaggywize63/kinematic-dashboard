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
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
}

export const DEAL_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'account', label: 'Account' },
  { key: 'amount', label: 'Amount' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'close_date', label: 'Close Date' },
  { key: 'owner', label: 'Owner' },
] as const;

export default function DealsTable({ deals, loading, onAssign, selected, onToggle, onToggleAll, hiddenColumns, viewMode = 'table' }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const showSelection = !!onToggle && !!selected;
  const allSelected = showSelection && deals.length > 0 && deals.every((d) => selected!.has(d.id));
  const hidden = hiddenColumns ?? new Set<string>();
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;

  let colCount = (showSelection ? 1 : 0) + 1; // name always
  if (!hidden.has('account'))    colCount += 1;
  if (!hidden.has('amount'))     colCount += 1;
  if (!hidden.has('stage'))      colCount += 1;
  if (!hidden.has('status'))     colCount += 1;
  if (!hidden.has('close_date')) colCount += 1;
  if (!hidden.has('owner'))      colCount += 1;

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
              <th style={th}>Name</th>
              {!hidden.has('account')    && <th style={th}>Account</th>}
              {!hidden.has('amount')     && <th style={th}>Amount</th>}
              {!hidden.has('stage')      && <th style={th}>Stage</th>}
              {!hidden.has('status')     && <th style={th}>Status</th>}
              {!hidden.has('close_date') && <th style={th}>Close Date</th>}
              {!hidden.has('owner')      && <th style={th}>Owner</th>}
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
                {!hidden.has('account') && (
                  <td style={td} data-label="Account">{d.account_id && d.account_name
                    ? <Link href={`/dashboard/crm/accounts/${d.account_id}`} className="km-entity-link" title="Open account detail">{d.account_name}</Link>
                    : (d.account_name || '—')}</td>
                )}
                {!hidden.has('amount')     && <td style={td} data-label="Amount">{formatINR(d.amount)}</td>}
                {!hidden.has('stage')      && <td style={td} data-label="Stage"><StageBadge name={d.stage_name} won={d.status === 'won'} lost={d.status === 'lost'} /></td>}
                {!hidden.has('status')     && <td style={td} data-label="Status"><span style={{ textTransform: 'capitalize' }}>{d.status}</span></td>}
                {!hidden.has('close_date') && <td style={td} data-label="Close Date">{d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : '—'}</td>}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
