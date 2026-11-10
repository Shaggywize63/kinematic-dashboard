'use client';
import { useEffect, useMemo, useState } from 'react';
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
import { PlusDataTable, usePlusTable } from '../../../../../components/crm/analytics/PlusReport';
import { fmtInr, fmtInt, fmtPct, type Column } from '../../../../../lib/crm/plusFormat';

// The API now also returns deal counts, the average probability and the expected total for each period.
// Optional so an older backend / demo data still renders.
type Row = ForecastPoint & { open_deals?: number; won_deals?: number; avg_probability?: number; expected_total?: number };

export default function ForecastReportPage() {
  const [data, setData] = useState<Row[]>([]);
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
      .then((r) => setData((r.data || []) as Row[]))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [period, range.from, range.to, cityKey]);

  const columns: Array<Column<Row>> = useMemo(() => [
    { label: 'Period', value: (r) => r.period },
    { label: 'Closed won (INR)', value: (r) => r.closed, display: (r) => fmtInr(r.closed), numeric: true },
    { label: 'Committed (INR)', value: (r) => r.committed, display: (r) => fmtInr(r.committed), numeric: true },
    { label: 'Expected total (INR)', value: (r) => r.expected_total ?? r.closed + r.committed, display: (r) => fmtInr(r.expected_total ?? r.closed + r.committed), numeric: true },
    { label: 'Open pipeline (INR)', value: (r) => r.pipeline, display: (r) => fmtInr(r.pipeline), numeric: true },
    { label: 'Best case (INR)', value: (r) => r.best_case, display: (r) => fmtInr(r.best_case), numeric: true },
    { label: 'Open deals', value: (r) => r.open_deals ?? null, display: (r) => fmtInt(r.open_deals), numeric: true },
    { label: 'Won deals', value: (r) => r.won_deals ?? null, display: (r) => fmtInt(r.won_deals), numeric: true },
    { label: 'Avg probability %', value: (r) => r.avg_probability ?? null, display: (r) => fmtPct(r.avg_probability), numeric: true },
  ], []);

  // Totals: sums, with the average probability weighted by each period's open deals.
  const totals: Row | null = useMemo(() => {
    if (!data.length) return null;
    const sum = (k: 'closed' | 'committed' | 'pipeline' | 'best_case' | 'open_deals' | 'won_deals') => data.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const open = sum('open_deals');
    const hasCounts = data.some((r) => r.open_deals !== undefined);
    return {
      period: 'Total', closed: sum('closed'), committed: sum('committed'), pipeline: sum('pipeline'), best_case: sum('best_case'),
      expected_total: sum('closed') + sum('committed'),
      ...(hasCounts ? { open_deals: open, won_deals: sum('won_deals'), avg_probability: open > 0 ? Math.round((data.reduce((s, r) => s + (r.avg_probability ?? 0) * (r.open_deals ?? 0), 0) / open) * 10) / 10 : 0 } : {}),
    };
  }, [data]);
  const tbl = usePlusTable(columns, data, totals);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Forecast</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ReportRangePicker range={range} onChange={setRange} />
          <select
            aria-label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13, height: 36 }}
          >
            <option value="month">Monthly</option><option value="quarter">Quarterly</option>
          </select>
          <button
            onClick={() => downloadCsv(`forecast-${period}`, tbl.csvRows())}
            disabled={loading || data.length === 0}
            aria-label="Download CSV"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, height: 36 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <>
          <ForecastChart data={data} />
          {data.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '8px 0' }}>No deals with an expected close date in this range.</div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PlusDataTable tbl={tbl} rowKey={(r) => r.period} />
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Open deals are placed in the month of their expected close date; won deals in the month they closed. <b>Committed</b> = open deal amount × probability (the deal&apos;s own, else its stage&apos;s).
                <b> Expected total</b> = closed won + committed. <b>Open pipeline</b> and <b>Best case</b> are the full amount of open deals. Amounts are in INR.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
