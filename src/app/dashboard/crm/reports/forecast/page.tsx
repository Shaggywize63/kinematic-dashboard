'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { ForecastPoint } from '../../../../../types/crm';
import ForecastChart from '../../../../../components/crm/charts/ForecastChart';
import { downloadCsv } from '../../../../../lib/exportCsv';

export default function ForecastReportPage() {
  const [data, setData] = useState<ForecastPoint[]>([]);
  const [period, setPeriod] = useState<'month' | 'quarter'>('quarter');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    crmAnalytics.forecast(period).then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [period]);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Forecast</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}>
            <option value="month">Monthly</option><option value="quarter">Quarterly</option>
          </select>
          <button
            onClick={() => downloadCsv(`forecast-${period}`, data as any)}
            disabled={loading || data.length === 0}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
          >⬇ CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : <ForecastChart data={data} />}
    </div>
  );
}
