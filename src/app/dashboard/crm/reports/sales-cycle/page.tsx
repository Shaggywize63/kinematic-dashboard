'use client';
import { useEffect, useMemo, useState } from 'react';
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
import { PlusDataTable, usePlusTable } from '../../../../../components/crm/analytics/PlusReport';
import { fmtDays, fmtInt, monthLabel, type Column } from '../../../../../lib/crm/plusFormat';

// The API returns one row per month the deals were CLOSED, with the average days from deal creation to close, and now
// also how many deals sit behind it and how spread they are. The extras are optional so an older backend still renders.
type Row = { month?: string; stage?: string; avg_days: number; deals?: number; median_days?: number; fastest_days?: number; slowest_days?: number };

export default function SalesCyclePage() {
  const [data, setData] = useState<Row[]>([]);
  const [range, setRange] = useState<ReportRange>(() => defaultReportRange(90));
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();

  useEffect(() => {
    setLoading(true);
    crmAnalytics.salesCycle(range)
      .then((r) => setData((r.data || []) as unknown as Row[]))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [range.from, range.to, cityKey]);

  const label = (r: Row) => (r.month ? monthLabel(r.month) : r.stage ?? '');
  const columns: Array<Column<Row>> = useMemo(() => [
    { label: 'Month closed', value: (r) => (r.month ?? r.stage ?? ''), display: (r) => label(r) },
    { label: 'Deals won', value: (r) => r.deals ?? null, display: (r) => fmtInt(r.deals), numeric: true },
    { label: 'Avg days to close', value: (r) => r.avg_days, display: (r) => fmtDays(r.avg_days), numeric: true },
    { label: 'Median days to close', value: (r) => r.median_days ?? null, display: (r) => fmtDays(r.median_days), numeric: true },
    { label: 'Fastest (days)', value: (r) => r.fastest_days ?? null, display: (r) => fmtDays(r.fastest_days), numeric: true },
    { label: 'Slowest (days)', value: (r) => r.slowest_days ?? null, display: (r) => fmtDays(r.slowest_days), numeric: true },
  ], []);

  // Overall row: the average is weighted by how many deals each month holds; the median of medians is not meaningful, so it is left blank.
  const totals: Row | null = useMemo(() => {
    if (!data.length) return null;
    const hasCounts = data.every((r) => typeof r.deals === 'number');
    const n = data.reduce((s, r) => s + (r.deals ?? 0), 0);
    const avg = hasCounts && n > 0 ? data.reduce((s, r) => s + r.avg_days * (r.deals ?? 0), 0) / n : data.reduce((s, r) => s + r.avg_days, 0) / data.length;
    return {
      month: undefined, stage: 'All months', avg_days: Math.round(avg * 10) / 10,
      ...(hasCounts ? { deals: n, fastest_days: Math.min(...data.map((r) => r.fastest_days ?? Infinity)), slowest_days: Math.max(...data.map((r) => r.slowest_days ?? 0)) } : {}),
    };
  }, [data]);
  const tbl = usePlusTable(columns, data, totals);

  // The chart plots a `stage` x-axis; this endpoint's x value is the month the deals closed.
  const chartData = data.map((r) => ({ stage: label(r), avg_days: r.avg_days }));

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Sales Cycle</h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Days from a deal being created to being closed won, by the month it closed.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ReportRangePicker range={range} onChange={setRange} />
          <button
            onClick={() => downloadCsv('sales-cycle', tbl.csvRows())}
            disabled={loading || data.length === 0}
            aria-label="Download CSV"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700, height: 36 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <>
          <SalesCycleChart data={chartData} />
          {data.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '8px 0' }}>No deals were closed won in this date range.</div>
          ) : (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PlusDataTable tbl={tbl} rowKey={(r, i) => `${r.month ?? r.stage}-${i}`} />
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Counts deals closed won in the range that have a close date. Days = close date minus the date the deal was created. The all-months average is weighted by deals. For time spent inside each pipeline stage see the Stage Velocity report.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
