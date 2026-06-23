'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { ActivityHeatPoint } from '../../../../../types/crm';
import ActivityHeatmap from '../../../../../components/crm/charts/ActivityHeatmap';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';

export default function ActivityHeatmapPage() {
  const [data, setData] = useState<ActivityHeatPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();
  useEffect(() => {
    setLoading(true);
    crmAnalytics.activityHeatmap().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [cityKey]);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Activity Heatmap (last 31 days)</h3>
        <button
          onClick={() => downloadCsv('activity-heatmap', data as any, ['date', 'hour', 'count'])}
          disabled={loading || data.length === 0}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
        >⬇ CSV</button>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <ActivityHeatmap data={data} />}
    </div>
  );
}
