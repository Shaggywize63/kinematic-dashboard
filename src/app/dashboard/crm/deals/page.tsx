'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmDeals } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Deal } from '../../../../types/crm';
import DealsTable from '../../../../components/crm/DealsTable';

export default function DealsListPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  useEffect(() => {
    setLoading(true);
    (async () => {
      try { const r = await crmDeals.list(range); setDeals(r.data || []); }
      catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
    })();
  }, [range.from, range.to]);

  const filtered = deals.filter((d) => {
    if (q && !`${d.name} ${d.account_name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status && d.status !== status) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            <option value="">All</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option>
          </select>
        </div>
        <Link href="/dashboard/crm/deals/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Deal</Link>
      </div>
      <DealsTable deals={filtered} loading={loading} />
    </div>
  );
}
