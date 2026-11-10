'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { SourceROIRow } from '../../../../../types/crm';
import LeadSourceRoiChart from '../../../../../components/crm/charts/LeadSourceRoiChart';
import { downloadCsv } from '../../../../../lib/exportCsv';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { PlusDataTable, usePlusTable } from '../../../../../components/crm/analytics/PlusReport';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';
import { fmtInr, fmtInt, fmtPct, type Column } from '../../../../../lib/crm/plusFormat';

// The API now also returns funnel and unit-economics columns. Optional so an older backend / demo data still renders.
type Row = SourceROIRow & {
  qualified?: number | null; lead_to_deal_pct?: number | null; avg_deal_value?: number | null; revenue_per_lead?: number | null;
  cost_per_lead?: number | null; cost_per_deal?: number | null; revenue_share_pct?: number | null;
};

export default function LeadSourceRoiPage() {
  const [data, setData] = useState<SourceROIRow[]>([]);
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();
  // Lead source is a built-in lead field: withhold the report while an admin has it hidden.
  const gate = useLeadFieldGate();
  const blocked = gate.didLoad ? gate.blockedBy('lead_source_performance') : [];
  const sourceLabel = gate.labelFor('source_id', 'Source');
  useEffect(() => {
    setLoading(true);
    crmAnalytics.leadSourceRoi().then((r) => setData(r.data || [])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [cityKey]);

  // Defensive normalisation: tolerate either canonical (source/leads/revenue/cost/roi)
  // or legacy MV column shapes (source_name/lead_count/revenue_won/total_cost) so the
  // page never crashes on undefined fields.
  const rows: Row[] = useMemo(() => (data || []).map((raw: any) => {
    const revenue = Number(raw.revenue ?? raw.revenue_won ?? 0);
    const cost = Number(raw.cost ?? raw.total_cost ?? 0);
    const leads = Number(raw.leads ?? raw.lead_count ?? 0);
    const deals = Number(raw.deals ?? raw.converted_count ?? 0);
    const roi = raw.roi !== undefined && raw.roi !== null
      ? Number(raw.roi)
      : (cost > 0 ? (revenue - cost) / cost : (revenue > 0 ? 1 : 0));
    const opt = (k: string): number | null => (typeof raw[k] === 'number' ? raw[k] : null);
    return {
      source: String(raw.source ?? raw.source_name ?? 'Unspecified'),
      leads, deals, revenue, cost, roi,
      qualified: opt('qualified'), lead_to_deal_pct: opt('lead_to_deal_pct'), avg_deal_value: opt('avg_deal_value'), revenue_per_lead: opt('revenue_per_lead'),
      cost_per_lead: opt('cost_per_lead'), cost_per_deal: opt('cost_per_deal'), revenue_share_pct: opt('revenue_share_pct'),
    };
  }), [data]);

  const hasExtras = rows.some((r) => r.qualified !== null);
  const columns: Array<Column<Row>> = useMemo(() => {
    const cols: Array<Column<Row>> = [
      { label: sourceLabel, value: (r) => r.source },
      { label: 'Leads', value: (r) => r.leads, display: (r) => fmtInt(r.leads), numeric: true },
    ];
    if (hasExtras) cols.push({ label: 'Qualified', value: (r) => r.qualified, display: (r) => fmtInt(r.qualified), numeric: true });
    cols.push({ label: 'Deals won', value: (r) => r.deals, display: (r) => fmtInt(r.deals), numeric: true });
    if (hasExtras) cols.push({ label: 'Lead to deal %', value: (r) => r.lead_to_deal_pct, display: (r) => fmtPct(r.lead_to_deal_pct), numeric: true });
    cols.push({ label: 'Revenue (INR)', value: (r) => r.revenue, display: (r) => fmtInr(r.revenue), numeric: true });
    if (hasExtras) {
      cols.push(
        { label: 'Revenue share %', value: (r) => r.revenue_share_pct, display: (r) => fmtPct(r.revenue_share_pct), numeric: true },
        { label: 'Avg deal value (INR)', value: (r) => r.avg_deal_value, display: (r) => fmtInr(r.avg_deal_value), numeric: true },
        { label: 'Revenue per lead (INR)', value: (r) => r.revenue_per_lead, display: (r) => fmtInr(r.revenue_per_lead), numeric: true },
        { label: 'Cost per lead (INR)', value: (r) => r.cost_per_lead, display: (r) => fmtInr(r.cost_per_lead), numeric: true },
      );
    }
    cols.push({ label: 'Cost (INR)', value: (r) => r.cost, display: (r) => fmtInr(r.cost), numeric: true });
    if (hasExtras) cols.push({ label: 'Cost per deal (INR)', value: (r) => r.cost_per_deal, display: (r) => fmtInr(r.cost_per_deal), numeric: true });
    cols.push({ label: 'ROI %', value: (r) => Math.round(r.roi * 100), display: (r) => `${Math.round(r.roi * 100)}%`, numeric: true });
    return cols;
  }, [hasExtras, sourceLabel]);

  // Totals: sums, with every ratio recomputed from the sums (never an average of ratios).
  const totals: Row | null = useMemo(() => {
    if (!rows.length) return null;
    const sum = (k: 'leads' | 'deals' | 'revenue' | 'cost') => rows.reduce((s, r) => s + r[k], 0);
    const leads = sum('leads'), deals = sum('deals'), revenue = sum('revenue'), cost = sum('cost');
    return {
      source: 'All sources', leads, deals, revenue, cost, roi: cost > 0 ? (revenue - cost) / cost : revenue > 0 ? 1 : 0,
      ...(hasExtras ? {
        qualified: rows.reduce((s, r) => s + (r.qualified ?? 0), 0),
        lead_to_deal_pct: leads ? Math.round((deals / leads) * 1000) / 10 : null,
        revenue_share_pct: revenue > 0 ? 100 : null,
        avg_deal_value: deals ? Math.round(revenue / deals) : null,
        revenue_per_lead: leads ? Math.round(revenue / leads) : null,
        cost_per_lead: leads ? Math.round(cost / leads) : null,
        cost_per_deal: deals && cost ? Math.round(cost / deals) : null,
      } : {}),
    };
  }, [rows, hasExtras]);
  const tbl = usePlusTable(columns, rows, totals);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--text)', margin: 0 }}>Lead Source ROI</h3>
        {blocked.length === 0 && (
          <button
            onClick={() => downloadCsv('lead-source-roi', tbl.csvRows())}
            disabled={loading || rows.length === 0}
            aria-label="Download CSV"
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
          >⬇ CSV</button>
        )}
      </div>
      {blocked.length > 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>
          Hidden: an admin turned off the {sourceLabel} field in Settings, so leads cannot be grouped by it.
        </div>
      ) : loading || !gate.didLoad ? <div style={{ color: 'var(--text-dim)' }}>Loading...</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>
          No source data yet — leads need to be tied to a source for ROI to populate.
        </div>
      ) : (
        <>
          <LeadSourceRoiChart data={rows} />
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PlusDataTable tbl={tbl} rowKey={(r) => r.source} />
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Revenue = amount of won deals that came from the source&apos;s leads. Cost = leads × the cost per lead set on the source. ROI % = (revenue − cost) ÷ cost
              (100% when there is revenue but no cost set). Lead to deal % = deals won ÷ leads. All amounts are INR; blank means nothing to divide by.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
