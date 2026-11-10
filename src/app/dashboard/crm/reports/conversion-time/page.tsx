'use client';
import { useEffect, useMemo, useState } from 'react';
import { crmAnalyticsPlus } from '../../../../../lib/crmAnalyticsExtApi';
import PlusReport, { BarsChart, ChartCard, ChartGrid, usePlusReportData } from '../../../../../components/crm/analytics/PlusReport';
import { defaultReportRange, useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { Segmented } from '../../../../../components/ui';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';
import { fmtDays, fmtInt, fmtPct, monthLabel, type Column } from '../../../../../lib/crm/plusFormat';
import { usePageTitle } from '../../../../../lib/pageTitle';

type View = 'distribution' | 'month' | 'owner' | 'source';
interface Row { label: string; leads: number; share_pct: number | null; avg_days: number | null; median_days: number | null }

/**
 * Lead Conversion Time: whole days from a lead being created to being converted,
 * for leads converted in the range. The owner and source splits are built-in
 * lead fields: each is withheld if an admin hides it.
 */
export default function ConversionTimePage() {
  usePageTitle('Lead Conversion Time');
  const gate = useLeadFieldGate();
  const cityKey = useReportCityKey();
  const [range, setRange] = useState(() => defaultReportRange(90));
  const [view, setView] = useState<View>('distribution');
  const { data, loading, error, reload } = usePlusReportData(() => crmAnalyticsPlus.conversionTime(range), [range.from, range.to, cityKey]);

  const ownerHidden = gate.didLoad && gate.blockedBy('dataset:conversion_time_by_owner').length > 0;
  const sourceHidden = gate.didLoad && gate.blockedBy('dataset:conversion_time_by_source').length > 0;
  const ownerLabel = gate.labelFor('owner_id', 'Owner');
  const sourceLabel = gate.labelFor('source_id', 'Source');
  // A view whose field was hidden after it was picked falls back to the always-available distribution.
  useEffect(() => {
    if ((view === 'owner' && ownerHidden) || (view === 'source' && sourceHidden)) setView('distribution');
  }, [view, ownerHidden, sourceHidden]);

  const t = data?.totals;
  const total = t?.converted ?? 0;
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const share = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : null);
    if (view === 'distribution') return data.buckets.map((b) => ({ label: b.bucket, leads: b.count, share_pct: share(b.count), avg_days: null, median_days: null }));
    const src = view === 'owner' ? data.by_owner : view === 'source' ? data.by_source : data.by_month;
    return src.map((g) => ({ label: view === 'month' ? monthLabel(g.label) : g.label, leads: g.converted, share_pct: share(g.converted), avg_days: g.avg_days, median_days: g.median_days }));
  }, [data, view, total]);

  const firstLabel = view === 'distribution' ? 'Days to convert' : view === 'owner' ? ownerLabel : view === 'source' ? sourceLabel : 'Month converted';
  const columns: Array<Column<Row>> = useMemo(() => {
    const base: Array<Column<Row>> = [
      { label: firstLabel, value: (r) => r.label },
      { label: 'Leads converted', value: (r) => r.leads, display: (r) => fmtInt(r.leads), numeric: true },
      { label: 'Share of conversions %', value: (r) => r.share_pct, display: (r) => fmtPct(r.share_pct), numeric: true },
    ];
    if (view === 'distribution') return base;
    return [...base,
      { label: 'Avg days to convert', value: (r) => r.avg_days, display: (r) => fmtDays(r.avg_days), numeric: true },
      { label: 'Median days to convert', value: (r) => r.median_days, display: (r) => fmtDays(r.median_days), numeric: true },
    ];
  }, [firstLabel, view]);

  const totalsRow: Row | null = t && rows.length ? { label: 'All converted leads', leads: t.converted, share_pct: t.converted ? 100 : null, avg_days: t.avg_days, median_days: t.median_days } : null;
  const chart = (data?.buckets ?? []).map((b) => ({ name: b.bucket, 'Leads converted': b.count }));
  const options = [
    { value: 'distribution' as View, label: 'Distribution' }, { value: 'month' as View, label: 'By month' },
    ...(ownerHidden ? [] : [{ value: 'owner' as View, label: `By ${ownerLabel.toLowerCase()}` }]),
    ...(sourceHidden ? [] : [{ value: 'source' as View, label: `By ${sourceLabel.toLowerCase()}` }]),
  ];

  return (
    <PlusReport<Row>
      testId="report-conversion-time"
      title="Lead Conversion Time"
      description="How many days it takes from a lead being created to being converted, for leads converted in the date range."
      range={{ value: range, onChange: setRange }}
      controls={<div style={{ maxWidth: '100%', overflowX: 'auto' }}><Segmented value={view} onChange={setView} options={options} /></div>}
      kpis={t ? [
        { label: 'Leads converted', value: fmtInt(t.converted) },
        { label: 'Median days', value: fmtDays(t.median_days) },
        { label: 'Average days', value: fmtDays(t.avg_days) },
        { label: '90% converted within', value: fmtDays(t.p90_days) },
        { label: 'Fastest', value: fmtDays(t.fastest_days) },
        { label: 'Slowest', value: fmtDays(t.slowest_days) },
      ] : []}
      columns={columns}
      rows={rows}
      totals={totalsRow}
      rowKey={(r, i) => `${r.label}-${i}`}
      loading={loading || !gate.didLoad}
      error={error}
      onRetry={reload}
      emptyTitle="No leads were converted in this date range"
      emptyHint="Try a wider range, or clear the city filter."
      csvName={`lead-conversion-time-${view}`}
      notes={(
        <>
          Counts leads whose conversion date is in the range. Days = time from the lead being created to being converted. <b>Median</b> is the middle value (half converted faster); <b>90% converted within</b> is the 90th percentile.
          The table and CSV follow the view chosen above (distribution, month{ownerHidden ? '' : `, ${ownerLabel.toLowerCase()}`}{sourceHidden ? '' : `, ${sourceLabel.toLowerCase()}`}).
        </>
      )}
    >
      {total > 0 && (
        <ChartGrid>
          <ChartCard title="Leads by days taken to convert"><BarsChart data={chart} xKey="name" keys={['Leads converted']} /></ChartCard>
        </ChartGrid>
      )}
    </PlusReport>
  );
}
