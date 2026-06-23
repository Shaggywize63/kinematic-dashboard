'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { SourceROIRow } from '../../../../../types/crm';
import LeadSourceRoiChart from '../../../../../components/crm/charts/LeadSourceRoiChart';
import { formatINR } from '../../../../../lib/formatCurrency';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';

export default function LeadSourceRoiPage() {
  const [data, setData] = useState<SourceROIRow[]>([]);
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();
  useEffect(() => {
    setLoading(true);
    crmAnalytics.leadSourceRoi().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [cityKey]);

  // Defensive normalisation: tolerate either canonical (source/leads/revenue/cost/roi)
  // or legacy MV column shapes (source_name/lead_count/revenue_won/total_cost) so the
  // page never crashes on undefined fields.
  const rows: SourceROIRow[] = (data || []).map((raw: any) => {
    const revenue = Number(raw.revenue ?? raw.revenue_won ?? 0);
    const cost = Number(raw.cost ?? raw.total_cost ?? 0);
    const leads = Number(raw.leads ?? raw.lead_count ?? 0);
    const deals = Number(raw.deals ?? raw.converted_count ?? 0);
    const roi = raw.roi !== undefined && raw.roi !== null
      ? Number(raw.roi)
      : (cost > 0 ? (revenue - cost) / cost : (revenue > 0 ? 1 : 0));
    return {
      source: String(raw.source ?? raw.source_name ?? 'Unspecified'),
      leads, deals, revenue, cost, roi,
    };
  });

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Lead Source ROI</h3>
        <button
          onClick={() => downloadCsv('lead-source-roi', rows as any, ['source', 'leads', 'deals', 'revenue', 'cost', 'roi'])}
          disabled={loading || rows.length === 0}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
        >⬇ CSV</button>
      </div>
      {loading ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>
          No source data yet — leads need to be tied to a source for ROI to populate.
        </div>
      ) : (
        <>
          <LeadSourceRoiChart data={rows} />
          <div style={{ marginTop: 18, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Source</th>
                  <th style={th}>Leads</th>
                  <th style={th}>Deals</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Cost</th>
                  <th style={th}>ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source}>
                    <td style={td}>{r.source}</td>
                    <td style={td}>{r.leads.toLocaleString()}</td>
                    <td style={td}>{r.deals.toLocaleString()}</td>
                    <td style={td}>{formatINR(r.revenue)}</td>
                    <td style={td}>{formatINR(r.cost)}</td>
                    <td style={{ ...td, color: r.roi >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                      {(r.roi * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
