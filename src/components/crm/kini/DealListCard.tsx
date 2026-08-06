'use client';
import Link from 'next/link';
import type { Deal } from '../../../types/crm';

export default function DealListCard({ title, deals }: { title?: string; deals: Partial<Deal>[] }) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 8 }}>
      {title && <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, marginBottom: 8 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {deals.slice(0, 5).map((d, i) => (
          <Link key={d.id || i} href={`/dashboard/crm/deals/${d.id}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'var(--s4)', fontSize: 12, color: 'var(--text)' }}>
            <span style={{ fontWeight: 600 }}>{d.name || 'Untitled'}</span>
            <span style={{ color: '#28B463' }}>${Number(d.amount || 0).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
