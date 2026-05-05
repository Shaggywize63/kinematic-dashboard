'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import SalesCycleChart from '../../../../../components/crm/charts/SalesCycleChart';
import { downloadCsv } from '../../../../../lib/exportCsv';

export default function SalesCyclePage() {
  const [data, setData] = useState<Array<{ stage: string; avg_days: number }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    crmAnalytics.salesCycle().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Sales Cycle by Stage</h3>
        <button
          onClick={() => downloadCsv('sales-cycle', data as any)}
          disabled={loading || data.length === 0}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
        >⬇ CSV</button>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <SalesCycleChart data={data} />}
    </div>
  );
}
