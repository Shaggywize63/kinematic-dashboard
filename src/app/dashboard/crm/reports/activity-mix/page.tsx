'use client';
import { useMemo, useState } from 'react';
import { crmAnalyticsPlus, type ActivityMixRow } from '../../../../../lib/crmAnalyticsExtApi';
import PlusReport, { BarsChart, ChartCard, ChartGrid, usePlusReportData } from '../../../../../components/crm/analytics/PlusReport';
import { defaultReportRange, useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { fmtInt, fmtPct, weekLabel, type Column } from '../../../../../lib/crm/plusFormat';
import { usePageTitle } from '../../../../../lib/pageTitle';

/** Activity Mix: what each person logged in the range, by type, with completion and call connect rate. */
export default function ActivityMixPage() {
  usePageTitle('Activity Mix');
  const cityKey = useReportCityKey();
  const [range, setRange] = useState(() => defaultReportRange(30));
  const { data, loading, error, reload } = usePlusReportData(() => crmAnalyticsPlus.activityMix(range), [range.from, range.to, cityKey]);

  const columns: Array<Column<ActivityMixRow>> = useMemo(() => [
    { label: 'Person', value: (r) => r.owner },
    { label: 'Total', value: (r) => r.total, display: (r) => fmtInt(r.total), numeric: true },
    { label: 'Calls', value: (r) => r.calls, display: (r) => fmtInt(r.calls), numeric: true },
    { label: 'Emails', value: (r) => r.emails, display: (r) => fmtInt(r.emails), numeric: true },
    { label: 'Meetings', value: (r) => r.meetings, display: (r) => fmtInt(r.meetings), numeric: true },
    { label: 'Site visits', value: (r) => r.site_visits, display: (r) => fmtInt(r.site_visits), numeric: true },
    { label: 'Tasks', value: (r) => r.tasks, display: (r) => fmtInt(r.tasks), numeric: true },
    { label: 'Notes', value: (r) => r.notes, display: (r) => fmtInt(r.notes), numeric: true },
    { label: 'SMS / WhatsApp', value: (r) => r.messages, display: (r) => fmtInt(r.messages), numeric: true },
    { label: 'Other', value: (r) => r.other, display: (r) => fmtInt(r.other), numeric: true },
    { label: 'Completed', value: (r) => r.completed, display: (r) => fmtInt(r.completed), numeric: true },
    { label: 'Completion %', value: (r) => r.completion_pct, display: (r) => fmtPct(r.completion_pct), numeric: true },
    { label: 'Calls with outcome', value: (r) => r.calls_with_outcome, display: (r) => fmtInt(r.calls_with_outcome), numeric: true },
    { label: 'Calls connected', value: (r) => r.calls_connected, display: (r) => fmtInt(r.calls_connected), numeric: true },
    { label: 'Call connect rate %', value: (r) => r.connect_rate_pct, display: (r) => fmtPct(r.connect_rate_pct), numeric: true },
    { label: 'Active days', value: (r) => r.active_days, display: (r) => fmtInt(r.active_days), numeric: true },
    { label: 'Avg activities per active day', value: (r) => r.avg_per_active_day, numeric: true },
  ], []);

  const rows = data?.rows ?? [];
  const t = data?.totals;
  const byType = (data?.by_type ?? []).map((x) => ({ name: x.type, Activities: x.count }));
  const byWeek = (data?.by_week ?? []).map((w) => ({ name: weekLabel(w.week), Logged: w.total, Completed: w.completed }));

  return (
    <PlusReport<ActivityMixRow>
      testId="report-activity-mix"
      title="Activity Mix"
      description="What each person logged in the date range, by type, with completion and call connect rate."
      range={{ value: range, onChange: setRange }}
      kpis={t ? [
        { label: 'Activities logged', value: fmtInt(t.total) },
        { label: 'Completion %', value: fmtPct(t.completion_pct), hint: `${fmtInt(t.completed)} completed` },
        { label: 'Calls', value: fmtInt(t.calls) },
        { label: 'Call connect rate', value: fmtPct(t.connect_rate_pct), hint: `${fmtInt(t.calls_connected)} of ${fmtInt(t.calls_with_outcome)} calls with an outcome` },
        { label: 'People active', value: fmtInt(rows.filter((r) => r.total > 0).length) },
      ] : []}
      columns={columns}
      rows={rows}
      totals={rows.length && t ? t : null}
      rowKey={(r, i) => `${r.owner_id ?? 'none'}-${i}`}
      loading={loading}
      error={error}
      onRetry={reload}
      emptyTitle="No activities were logged in this date range"
      emptyHint="Try a wider range, or clear the city filter."
      csvName="activity-mix"
      notes={(
        <>
          Activities are counted on the day they were <b>logged</b>, for the person they are assigned to (else their owner). <b>Completed</b> = has a completion time.
          <b> Call connect rate %</b> = calls whose outcome starts with &quot;Connected&quot; ÷ calls with an outcome recorded; calls with no outcome are left out, so the rate needs reps to record call outcomes.
          <b> Active days</b> = days the person logged anything in the range.
        </>
      )}
    >
      {rows.length > 0 && (
        <ChartGrid>
          <ChartCard title="Activities by type"><BarsChart data={byType} xKey="name" keys={['Activities']} /></ChartCard>
          <ChartCard title="Logged and completed each week"><BarsChart data={byWeek} xKey="name" keys={['Logged', 'Completed']} /></ChartCard>
        </ChartGrid>
      )}
    </PlusReport>
  );
}
