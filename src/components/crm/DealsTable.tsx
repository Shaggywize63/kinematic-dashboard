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
}

export default function DealsTable({ deals, loading, onAssign, selected, onToggle, onToggleAll }: Props) {
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700, letterSpacing: 0.6 };
  const showSelection = !!onToggle && !!selected;
  const allSelected = showSelection && deals.length > 0 && deals.every((d) => selected!.has(d.id));
  const colCount = (showSelection ? 1 : 0) + 7;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="responsive-cards" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {showSelection && (
                <th style={{ ...th, width: 40 }}>
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                </th>
              )}
              <th style={th}>Name</th>
              <th style={th}>Account</th>
              <th style={th}>Amount</th>
              <th style={th}>Stage</th>
              <th style={th}>Status</th>
              <th style={th}>Close Date</th>
              <th style={th}>Owner</th>
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
                <td style={td} data-label="Account">{d.account_id && d.account_name
                  ? <Link href={`/dashboard/crm/accounts/${d.account_id}`} className="km-entity-link" title="Open account detail">{d.account_name}</Link>
                  : (d.account_name || '—')}</td>
                <td style={td} data-label="Amount">{formatINR(d.amount)}</td>
                <td style={td} data-label="Stage"><StageBadge name={d.stage_name} won={d.status === 'won'} lost={d.status === 'lost'} /></td>
                <td style={td} data-label="Status"><span style={{ textTransform: 'capitalize' }}>{d.status}</span></td>
                <td style={td} data-label="Close Date">{d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : '—'}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
