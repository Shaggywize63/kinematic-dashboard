'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { ActivityHeatPoint } from '../../../../../types/crm';
import ActivityHeatmap from '../../../../../components/crm/charts/ActivityHeatmap';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { PlusDataTable, usePlusTable } from '../../../../../components/crm/analytics/PlusReport';
import { fmtInt, fmtPct, type Column } from '../../../../../lib/crm/plusFormat';
import { weekdayRows, type DayRow } from '../../../../../lib/crm/heatmapRollup';

export default function ActivityHeatmapPage() {
  const [data, setData] = useState<ActivityHeatPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();
  useEffect(() => {
    setLoading(true);
    crmAnalytics.activityHeatmap().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [cityKey]);

  const rows = useMemo(() => weekdayRows(data), [data]);
  const columns: Array<Column<DayRow>> = useMemo(() => [
    { label: 'Weekday', value: (r) => r.weekday },
    { label: 'Activities', value: (r) => r.activities, display: (r) => fmtInt(r.activities), numeric: true },
    { label: 'Share of activities %', value: (r) => r.share_pct, display: (r) => fmtPct(r.share_pct), numeric: true },
    { label: 'Days in window', value: (r) => r.days_in_window, display: (r) => fmtInt(r.days_in_window), numeric: true },
    { label: 'Avg activities per day', value: (r) => r.avg_per_day, numeric: true },
    { label: 'Busiest hour (UTC)', value: (r) => r.busiest_hour, numeric: true },
  ], []);
  const tbl = usePlusTable(columns, rows, null);
  const hasActivity = rows.some((r) => r.activities > 0);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Activity Heatmap (last 31 days)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => downloadCsv('activity-heatmap', data as any, ['date', 'hour', 'count'])}
            disabled={loading || data.length === 0}
            aria-label="Download CSV"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
          >⬇ CSV</button>
          <button
            onClick={() => downloadCsv('activity-by-weekday', tbl.csvRows())}
            disabled={loading || !hasActivity}
            aria-label="Download weekday CSV"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
          >⬇ Weekday CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <>
          <ActivityHeatmap data={data} />
          {hasActivity && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5 }}>By weekday</div>
              <PlusDataTable tbl={tbl} rowKey={(r) => r.weekday} />
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Activities are counted when logged. Days and hours are UTC, the same as the heatmap above. Average per day divides by the days of that weekday in the 31-day window, including quiet ones.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
