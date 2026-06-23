'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { ForecastPoint } from '../../../../../types/crm';
import ForecastChart from '../../../../../components/crm/charts/ForecastChart';
import { downloadCsv } from '../../../../../lib/exportCsv';
import {
  ReportRangePicker,
  defaultReportRange,
  useReportCityKey,
  type ReportRange,
} from '../../../../../components/crm/reports/ReportFilters';

export default function ForecastReportPage() {
  const [data, setData] = useState<ForecastPoint[]>([]);
  const [period, setPeriod] = useState<'month' | 'quarter'>('quarter');
  // Forecast is naturally future-leaning, but the deals we pull in come
  // from a closing-date window. Default to next ~180 days so the chart
  // reaches a full quarter ahead by default. The user can widen / narrow.
  const [range, setRange] = useState<ReportRange>(() => {
    const base = defaultReportRange(180);
    // Push the "to" 180 days forward instead of looking back — the
    // helper defaults to a backward-looking window. Forecast wants the
    // opposite, so we shift.
    const today = new Date();
    const future = new Date(today);
    future.setDate(today.getDate() + 180);
    return { from: base.to, to: future.toISOString().slice(0, 10) };
  });
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();

  useEffect(() => {
    setLoading(true);
    crmAnalytics.forecast(period, range)
      .then((r) => setData(r.data || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [period, range.from, range.to, cityKey]);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Forecast</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ReportRangePicker range={range} onChange={setRange} />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13, height: 36 }}
          >
            <option value="month">Monthly</option><option value="quarter">Quarterly</option>
          </select>
          <button
            onClick={() => downloadCsv(`forecast-${period}`, data as any)}
            disabled={loading || data.length === 0}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, height: 36 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <ForecastChart data={data} />}
    </div>
  );
}
