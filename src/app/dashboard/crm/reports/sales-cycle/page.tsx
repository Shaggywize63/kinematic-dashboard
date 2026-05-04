'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import SalesCycleChart from '../../../../../components/crm/charts/SalesCycleChart';

export default function SalesCyclePage() {
  const [data, setData] = useState<Array<{ stage: string; avg_days: number }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    crmAnalytics.salesCycle().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <h3 style={{ color: 'var(--text)', marginTop: 0, marginBottom: 14 }}>Sales Cycle by Stage</h3>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <SalesCycleChart data={data} />}
    </div>
  );
}
