'use client';
import { useMemo, useState } from 'react';
import { crmAnalyticsPlus, type SourcePerformanceRow } from '../../../../../lib/crmAnalyticsExtApi';
import PlusReport, { BarsChart, ChartCard, ChartGrid, usePlusReportData } from '../../../../../components/crm/analytics/PlusReport';
import { defaultReportRange, useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';
import { fmtDays, fmtInr, fmtInt, fmtPct, type Column } from '../../../../../lib/crm/plusFormat';
import { usePageTitle } from '../../../../../lib/pageTitle';

/**
 * Lead Source Performance: leads CREATED in the date range, grouped by source,
 * with how far each source's leads got and what they were worth. The lead
 * source is a built-in lead field: if an admin hides it, the report is withheld.
 */
export default function SourcePerformancePage() {
  usePageTitle('Lead Source Performance');
  const gate = useLeadFieldGate();
  const cityKey = useReportCityKey();
  const [range, setRange] = useState(() => defaultReportRange(90));
  const { data, loading, error, reload } = usePlusReportData(() => crmAnalyticsPlus.sourcePerformance(range), [range.from, range.to, cityKey]);

  const sourceLabel = gate.labelFor('source_id', 'Source');
  const columns: Array<Column<SourcePerformanceRow>> = useMemo(() => [
    { label: sourceLabel, value: (r) => r.source },
    { label: 'Leads', value: (r) => r.leads, display: (r) => fmtInt(r.leads), numeric: true },
    { label: 'Share of leads %', value: (r) => r.share_of_leads_pct, display: (r) => fmtPct(r.share_of_leads_pct), numeric: true },
    { label: 'Qualified', value: (r) => r.qualified, display: (r) => fmtInt(r.qualified), numeric: true },
    { label: 'Qualified %', value: (r) => r.qualified_pct, display: (r) => fmtPct(r.qualified_pct), numeric: true },
    { label: 'Converted', value: (r) => r.converted, display: (r) => fmtInt(r.converted), numeric: true },
    { label: 'Conversion %', value: (r) => r.conversion_pct, display: (r) => fmtPct(r.conversion_pct), numeric: true },
    { label: 'Lost', value: (r) => r.lost, display: (r) => fmtInt(r.lost), numeric: true },
    { label: 'Unqualified', value: (r) => r.unqualified, display: (r) => fmtInt(r.unqualified), numeric: true },
    { label: 'Open', value: (r) => r.open, display: (r) => fmtInt(r.open), numeric: true },
    { label: 'Avg days to convert', value: (r) => r.avg_days_to_convert, display: (r) => fmtDays(r.avg_days_to_convert), numeric: true },
    { label: 'Avg lead score', value: (r) => r.avg_score, numeric: true },
    { label: 'Won value (INR)', value: (r) => r.won_value, display: (r) => fmtInr(r.won_value), numeric: true },
    { label: 'Won value per lead (INR)', value: (r) => r.revenue_per_lead, display: (r) => fmtInr(r.revenue_per_lead), numeric: true },
    { label: 'Cost per lead (INR)', value: (r) => r.cost_per_lead, display: (r) => fmtInr(r.cost_per_lead), numeric: true },
    { label: 'Total cost (INR)', value: (r) => r.total_cost, display: (r) => fmtInr(r.total_cost), numeric: true },
    { label: 'Cost per converted lead (INR)', value: (r) => r.cost_per_converted, display: (r) => fmtInr(r.cost_per_converted), numeric: true },
  ], [sourceLabel]);

  const rows = data?.rows ?? [];
  const t = data?.totals;
  // "Best" only among sources with enough leads for a rate to mean something.
  const MIN = 5;
  const best = rows.filter((r) => r.leads >= MIN && r.conversion_pct !== null).sort((a, b) => (b.conversion_pct ?? 0) - (a.conversion_pct ?? 0))[0];
  const blocked = gate.didLoad ? gate.blockedBy('lead_source_performance') : [];
  const chartRows = rows.map((r) => ({ name: r.source, Leads: r.leads, Converted: r.converted, 'Conversion %': r.conversion_pct }));

  return (
    <PlusReport<SourcePerformanceRow>
      testId="report-source-performance"
      title="Lead Source Performance"
      description="Leads created in the date range, by source, and how far each source's leads got."
      range={{ value: range, onChange: setRange }}
      kpis={t ? [
        { label: 'Leads', value: fmtInt(t.leads) },
        { label: 'Converted', value: fmtInt(t.converted), hint: fmtPct(t.conversion_pct) },
        { label: 'Avg days to convert', value: fmtDays(t.avg_days_to_convert) },
        { label: 'Won value', value: fmtInr(t.won_value), hint: 'INR' },
        { label: 'Best converting source', value: best ? best.source : '—', hint: best ? `${fmtPct(best.conversion_pct)} of ${best.leads} leads (sources with ${MIN}+ leads)` : `needs a source with ${MIN}+ leads` },
      ] : []}
      columns={columns}
      rows={rows}
      totals={rows.length && t ? { ...t, source: 'All sources' } : null}
      rowKey={(r, i) => `${r.source_id ?? 'none'}-${i}`}
      loading={loading || !gate.didLoad}
      error={error}
      onRetry={reload}
      emptyTitle="No leads in this date range"
      emptyHint="Try a wider range, or clear the city filter."
      csvName="lead-source-performance"
      blockedMessage={blocked.length ? `An admin turned off the ${sourceLabel} field in Settings, so leads cannot be grouped by it.` : null}
      notes={(
        <>
          Leads are counted by the date they were created. <b>Qualified</b> = Qualified + Converted. <b>Conversion %</b> = converted ÷ leads from that source.
          <b> Avg days to convert</b> = days from creation to conversion, converted leads only. <b>Won value</b> = amount of the won deal each converted lead produced.
          <b> Cost</b> = leads × the cost per lead set on the source; it is blank until a cost is set. Open = still being worked (not converted, lost or unqualified).
        </>
      )}
    >
      {rows.length > 0 && (
        <ChartGrid>
          <ChartCard title="Leads and conversions by source"><BarsChart data={chartRows} xKey="name" keys={['Leads', 'Converted']} /></ChartCard>
          <ChartCard title="Conversion % by source"><BarsChart data={chartRows} xKey="name" keys={['Conversion %']} format={(v) => `${v}%`} /></ChartCard>
        </ChartGrid>
      )}
    </PlusReport>
  );
}
