'use client';
import Link from 'next/link';
import type { Deal } from '../../types/crm';
import OwnerAvatar from './shared/OwnerAvatar';
import { formatINR } from '../../lib/formatCurrency';

export default function DealCard({ deal, dragHandleProps }: { deal: Deal; dragHandleProps?: any }) {
  return (
    <div
      {...(dragHandleProps || {})}
      style={{
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        cursor: dragHandleProps ? 'grab' : 'default',
      }}
    >
      <Link href={`/dashboard/crm/deals/${deal.id}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{deal.name}</Link>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{deal.account_name || '—'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ color: '#28B463', fontWeight: 700, fontSize: 12 }}>{formatINR(deal.amount)}</span>
        <OwnerAvatar name={deal.owner_name} size={22} />
      </div>
      {deal.ai_win_probability != null && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>✨ {Math.round(deal.ai_win_probability * 100)}% AI</div>
      )}
    </div>
  );
}
