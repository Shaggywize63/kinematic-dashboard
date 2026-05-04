'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { ActivityHeatPoint } from '../../../../../types/crm';
import ActivityHeatmap from '../../../../../components/crm/charts/ActivityHeatmap';

export default function ActivityHeatmapPage() {
  const [data, setData] = useState<ActivityHeatPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    crmAnalytics.activityHeatmap().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <h3 style={{ color: 'var(--text)', marginTop: 0, marginBottom: 14 }}>Activity Heatmap</h3>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <ActivityHeatmap data={data} />}
    </div>
  );
}
