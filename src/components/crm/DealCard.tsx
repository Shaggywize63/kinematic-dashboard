'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { Deal } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';
import { formatINR } from '../../lib/formatCurrency';
import { T } from '../ui';

/** Kanban card — an inner raised block (--s3, 8px) inside a stage column Card. */
export default function DealCard({ deal, dragHandleProps }: { deal: Deal; dragHandleProps?: any }) {
  return (
    <div
      {...(dragHandleProps || {})}
      style={{
        background: T.raised,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius.md,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: dragHandleProps ? 'grab' : 'default',
      }}
    >
      <Link href={`/dashboard/crm/deals/${deal.id}`} className="km-entity-link" style={{ fontSize: 13.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Open deal detail">{deal.name}</Link>
      <div style={{ fontSize: 12, color: deal.account_name ? T.dim : T.mute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.account_name || '—'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: T.text }}>{formatINR(deal.amount)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {deal.ai_win_probability != null && (
            <span title="KINI AI win probability" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: T.mono, fontSize: 11, color: T.info }}>
              <Sparkles size={12} strokeWidth={1.8} />{Math.round(deal.ai_win_probability * 100)}%
            </span>
          )}
          <OwnerAvatar name={deal.owner_name} size={22} />
        </div>
      </div>
    </div>
  );
}
