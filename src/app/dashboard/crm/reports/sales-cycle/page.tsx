'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import SalesCycleChart from '../../../../../components/crm/charts/SalesCycleChart';
import { downloadCsv } from '../../../../../lib/exportCsv';
import {
  ReportRangePicker,
  defaultReportRange,
  useReportCityKey,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';

export default function SalesCyclePage() {
  const [data, setData] = useState<Array<{ stage: string; avg_days: number }>>([]);
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(90));
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();

  useEffect(() => {
    setLoading(true);
    crmAnalytics.salesCycle(range)
      .then((r) => setData(r.data || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [range.from, range.to, cityKey]);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Sales Cycle by Stage</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ReportRangePicker range={range} onChange={setRange} />
          <button
            onClick={() => downloadCsv('sales-cycle', data as any)}
            disabled={loading || data.length === 0}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, height: 36 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <SalesCycleChart data={data} />}
    </div>
  );
}
