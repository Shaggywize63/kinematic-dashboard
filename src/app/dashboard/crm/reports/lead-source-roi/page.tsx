'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { SourceROIRow } from '../../../../../types/crm';
import LeadSourceRoiChart from '../../../../../components/crm/charts/LeadSourceRoiChart';

export default function LeadSourceRoiPage() {
  const [data, setData] = useState<SourceROIRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    crmAnalytics.leadSourceRoi().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <h3 style={{ color: 'var(--text)', marginTop: 0, marginBottom: 14 }}>Lead Source ROI</h3>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : (
        <>
          <LeadSourceRoiChart data={data} />
          <div style={{ marginTop: 18, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Source</th><th style={th}>Leads</th><th style={th}>Deals</th><th style={th}>Revenue</th><th style={th}>Cost</th><th style={th}>ROI</th></tr></thead>
              <tbody>{data.map((r) => (
                <tr key={r.source}><td style={td}>{r.source}</td><td style={td}>{r.leads}</td><td style={td}>{r.deals}</td><td style={td}>${r.revenue.toLocaleString()}</td><td style={td}>${r.cost.toLocaleString()}</td><td style={{ ...td, color: r.roi >= 0 ? '#28B463' : '#E01E2C' }}>{(r.roi * 100).toFixed(0)}%</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
