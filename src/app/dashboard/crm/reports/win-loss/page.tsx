'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { WinRatePoint } from '../../../../../types/crm';
import WinRateByRepChart from '../../../../../components/crm/charts/WinRateByRepChart';
import { downloadCsv } from '../../../../../lib/exportCsv';
import {
  ReportRangePicker,
  defaultReportRange,
  useReportCityKey,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';

export default function WinLossReportPage() {
  const [data, setData] = useState<WinRatePoint[]>([]);
  const [by, setBy] = useState<'rep' | 'source' | 'stage'>('rep');
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(90));
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();

  useEffect(() => {
    setLoading(true);
    crmAnalytics.winRate(by, range)
      .then((r) => setData(r.data || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [by, range.from, range.to, cityKey]);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Win Rate</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ReportRangePicker range={range} onChange={setRange} />
          <select
            value={by}
            onChange={(e) => setBy(e.target.value as any)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13, height: 36 }}
          >
            <option value="rep">By Rep</option><option value="source">By Source</option><option value="stage">By Stage</option>
          </select>
          <button
            onClick={() => downloadCsv(`win-rate-by-${by}`, data as any)}
            disabled={loading || data.length === 0}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, height: 36 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <WinRateByRepChart data={data} />}
    </div>
  );
}
