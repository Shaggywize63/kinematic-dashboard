'use client';
import { useMemo, useState } from 'react';
import { crmAnalyticsPlus, type FollowupRow } from '../../../../../lib/crmAnalyticsExtApi';
import PlusReport, { BarsChart, ChartCard, ChartGrid, LinesChart, usePlusReportData } from '../../../../../components/crm/analytics/PlusReport';
import { defaultReportRange, useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { fmtDays, fmtInt, fmtPct, weekLabel, type Column } from '../../../../../lib/crm/plusFormat';
import { usePageTitle } from '../../../../../lib/pageTitle';

/**
 * Follow-up Compliance: scheduled activities (anything with a due time) whose
 * due time falls in the range, split by what happened to them. Counts people
 * by assignee (else owner), like Team Performance.
 */
export default function FollowupCompliancePage() {
  usePageTitle('Follow-up Compliance');
  const cityKey = useReportCityKey();
  const [range, setRange] = useState(() => defaultReportRange(30));
  const { data, loading, error, reload } = usePlusReportData(() => crmAnalyticsPlus.followupCompliance(range), [range.from, range.to, cityKey]);

  const columns: Array<Column<FollowupRow>> = useMemo(() => [
    { label: 'Person', value: (r) => r.owner },
    { label: 'Due', value: (r) => r.due, display: (r) => fmtInt(r.due), numeric: true },
    { label: 'Done on time', value: (r) => r.on_time, display: (r) => fmtInt(r.on_time), numeric: true },
    { label: 'Done late', value: (r) => r.late, display: (r) => fmtInt(r.late), numeric: true },
    { label: 'Overdue now', value: (r) => r.overdue, display: (r) => fmtInt(r.overdue), numeric: true },
    { label: 'Not yet due', value: (r) => r.upcoming, display: (r) => fmtInt(r.upcoming), numeric: true },
    { label: 'Done with no time recorded', value: (r) => r.done_untimed, display: (r) => fmtInt(r.done_untimed), numeric: true },
    { label: 'On-time %', value: (r) => r.compliance_pct, display: (r) => fmtPct(r.compliance_pct), numeric: true },
    { label: 'Avg days late', value: (r) => r.avg_days_late, display: (r) => fmtDays(r.avg_days_late), numeric: true },
    { label: 'Avg days overdue', value: (r) => r.avg_days_overdue, display: (r) => fmtDays(r.avg_days_overdue), numeric: true },
  ], []);

  const rows = data?.rows ?? [];
  const t = data?.totals;
  const trend = (data?.trend ?? []).map((w) => ({ name: weekLabel(w.week), 'Done on time': w.on_time, 'Done late': w.late, 'Overdue now': w.overdue, 'Not yet due': w.upcoming, 'On-time %': w.compliance_pct }));

  return (
    <PlusReport<FollowupRow>
      testId="report-followup-compliance"
      title="Follow-up Compliance"
      description="Scheduled follow-ups that fell due in the date range, and whether they were done on time."
      range={{ value: range, onChange: setRange }}
      kpis={t ? [
        { label: 'Follow-ups due', value: fmtInt(t.due) },
        { label: 'On-time %', value: fmtPct(t.compliance_pct), hint: 'on time ÷ (on time + late + overdue)' },
        { label: 'Done late', value: fmtInt(t.late), hint: t.avg_days_late === null ? undefined : `avg ${fmtDays(t.avg_days_late)} late` },
        { label: 'Overdue now', value: fmtInt(t.overdue), hint: t.avg_days_overdue === null ? undefined : `avg ${fmtDays(t.avg_days_overdue)} overdue` },
        { label: 'Not yet due', value: fmtInt(t.upcoming) },
      ] : []}
      columns={columns}
      rows={rows}
      totals={rows.length && t ? t : null}
      rowKey={(r, i) => `${r.owner_id ?? 'none'}-${i}`}
      loading={loading}
      error={error}
      onRetry={reload}
      emptyTitle="No follow-ups were due in this date range"
      emptyHint="Follow-ups and scheduled activities appear here once they have a due date."
      csvName="followup-compliance"
      notes={(
        <>
          A follow-up is any activity with a due time; cancelled ones are ignored. <b>Done on time</b> = completed at or before the due time; <b>Done late</b> = completed after it;
          <b> Overdue now</b> = not completed and the due time has passed; <b>Not yet due</b> = not completed, due in the future. <b>On-time %</b> = on time ÷ (on time + late + overdue);
          ones marked done with no completion time are shown but left out of the %. Each follow-up counts for the person it is assigned to, else its owner.
        </>
      )}
    >
      {trend.length > 0 && (
        <ChartGrid>
          <ChartCard title="Follow-ups due each week (by due date)"><BarsChart data={trend} xKey="name" keys={['Done on time', 'Done late', 'Overdue now', 'Not yet due']} stacked /></ChartCard>
          <ChartCard title="On-time % each week"><LinesChart data={trend} xKey="name" keys={['On-time %']} format={(v) => `${v}%`} /></ChartCard>
        </ChartGrid>
      )}
    </PlusReport>
  );
}
