'use client';
import { useMemo, useState } from 'react';
import { crmAnalyticsPlus, type StageVelocityRow } from '../../../../../lib/crmAnalyticsExtApi';
import PlusReport, { BarsChart, ChartCard, ChartGrid, usePlusReportData } from '../../../../../components/crm/analytics/PlusReport';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { Select } from '../../../../../components/ui';
import { fmtDays, fmtInr, fmtInt, type Column } from '../../../../../lib/crm/plusFormat';
import { usePageTitle } from '../../../../../lib/pageTitle';

/**
 * Stage Velocity: how many days deals spend in each pipeline stage, from the
 * deal stage-change history, and how long open deals have been sitting.
 */
export default function StageVelocityPage() {
  usePageTitle('Stage Velocity');
  const cityKey = useReportCityKey();
  const [pipeline, setPipeline] = useState<string>('');
  const { data, loading, error, reload } = usePlusReportData(() => crmAnalyticsPlus.stageVelocity(pipeline || undefined), [pipeline, cityKey]);

  const columns: Array<Column<StageVelocityRow>> = useMemo(() => [
    { label: 'Stage', value: (r) => r.stage },
    { label: 'Type', value: (r) => r.stage_type },
    { label: 'Deals entered', value: (r) => r.deals_entered, display: (r) => fmtInt(r.deals_entered), numeric: true },
    { label: 'Completed stays', value: (r) => r.completed_stays, display: (r) => fmtInt(r.completed_stays), numeric: true },
    { label: 'Avg days in stage', value: (r) => r.avg_days, display: (r) => fmtDays(r.avg_days), numeric: true },
    { label: 'Median days in stage', value: (r) => r.median_days, display: (r) => fmtDays(r.median_days), numeric: true },
    { label: 'Longest stay (days)', value: (r) => r.max_days, display: (r) => fmtDays(r.max_days), numeric: true },
    { label: 'Open deals now', value: (r) => r.current_deals, display: (r) => fmtInt(r.current_deals), numeric: true },
    { label: 'Open value now (INR)', value: (r) => r.current_value, display: (r) => fmtInr(r.current_value), numeric: true },
    { label: 'Avg age of open deals (days)', value: (r) => r.avg_current_age_days, display: (r) => fmtDays(r.avg_current_age_days), numeric: true },
    { label: 'Slow open deals', value: (r) => r.slow_current_deals, display: (r) => fmtInt(r.slow_current_deals), numeric: true },
  ], []);

  const rows = data?.rows ?? [];
  const t = data?.totals;
  const open = rows.filter((r) => r.stage_type === 'open');
  const chart = open.map((r) => ({ name: r.stage, 'Avg days in stage': r.avg_days, 'Avg age of open deals (days)': r.avg_current_age_days }));
  const slow = open.reduce((s, r) => s + r.slow_current_deals, 0);

  return (
    <PlusReport<StageVelocityRow>
      testId="report-stage-velocity"
      title="Stage Velocity"
      description="How many days deals spend in each stage of a pipeline, and how long open deals have been sitting."
      controls={(data?.pipelines.length ?? 0) > 1 ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
          Pipeline
          <Select aria-label="Pipeline" value={pipeline || data?.pipeline_id || ''} onChange={(e) => setPipeline(e.target.value)} style={{ width: 200 }}>
            {data!.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
      ) : undefined}
      kpis={t ? [
        { label: 'Open deals', value: fmtInt(t.open_deals) },
        { label: 'Open value', value: fmtInr(t.open_value), hint: 'INR' },
        { label: 'Typical days through open stages', value: fmtDays(t.typical_days_through_open_stages), hint: 'sum of each stage average' },
        { label: 'Slow open deals', value: fmtInt(slow), hint: 'over 2x the stage average' },
      ] : []}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.stage_id}
      loading={loading}
      error={error}
      onRetry={reload}
      emptyTitle="No pipeline stages yet"
      emptyHint="Create a pipeline with stages in CRM Settings to see how deals move through it."
      csvName="stage-velocity"
      notes={(
        <>
          Worked out from the deal stage-change history. A <b>completed stay</b> is the time between a deal entering a stage and leaving it; <b>Avg / Median / Longest</b> are over completed stays.
          <b> Open deals now</b> and their <b>age</b> show how long open deals have been in their present stage. A deal with no history counts from its creation date.
          <b> Slow open deals</b> (a heuristic) are open deals sitting more than twice their stage&apos;s average, flagged only once a stage has 3 or more completed stays.
          Won and Lost stages have no stay time. Deals can re-enter a stage, so entered counts are stays, not unique deals.
        </>
      )}
    >
      {open.length > 0 && (
        <ChartGrid>
          <ChartCard title="Average days in each open stage"><BarsChart data={chart} xKey="name" keys={['Avg days in stage', 'Avg age of open deals (days)']} format={(v) => `${v} d`} /></ChartCard>
        </ChartGrid>
      )}
    </PlusReport>
  );
}
