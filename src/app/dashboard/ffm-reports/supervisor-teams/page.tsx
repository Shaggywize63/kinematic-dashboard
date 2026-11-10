'use client';
import { useMemo, useState } from 'react';
import { presetRange } from '../../../../components/attendance/RangePresets';
import { ffmReports, type SupervisorPayload, type SupervisorRow } from '../../../../components/ffm/reports/ffmReportsApi';
import {
  ReportHeader, FilterCard, StatGrid, Stat, Notes, StatusBox, DataTable, FooterRow, useReportData, csvOf, downloadCsv, type Col,
} from '../../../../components/ffm/reports/ReportKit';
import { fmtInr, fmtInt, fmtNum, fmtPct, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Supervisor Teams — one row per direct supervisor: team size, coverage and output. Measures that do not
 * reward a bigger team (calls per rep-day, revenue per rep) sit beside the totals, and the median of the
 * teams shown is the comparison basis. Reps with no supervisor on record form their own row.
 * Data: GET /api/v1/analytics/ffm/reports/supervisor-teams?from&to.
 */
export default function SupervisorTeamsReport() {
  const [from, setFrom] = useState(() => presetRange('fortnight').from);
  const [to, setTo] = useState(() => presetRange('fortnight').to);
  const problem = rangeProblem(from, to);
  const { data, loading, error, reload } = useReportData<SupervisorPayload>(
    () => ffmReports.supervisorTeams({ from, to }).then((r) => r.data), [from, to], !problem,
  );
  const rows = data?.rows ?? [];
  const med = data?.median ?? null;

  const cols: Array<Col<SupervisorRow>> = useMemo(() => [
    { key: 'supervisor_name', label: 'Supervisor', csv: (r) => r.supervisor_name },
    { key: 'reps', label: 'Reps', align: 'right', csv: (r) => r.reps },
    { key: 'active_reps', label: 'Reps visiting', align: 'right', hint: 'reps with at least one visited call', csv: (r) => r.active_reps },
    { key: 'planned_stops', label: 'Planned calls', align: 'right', csv: (r) => r.planned_stops },
    { key: 'visited_stops', label: 'Visited', align: 'right', csv: (r) => r.visited_stops },
    { key: 'adherence_pct', label: 'Adherence %', align: 'right', csv: (r) => r.adherence_pct, cell: (r) => fmtPct(r.adherence_pct) },
    { key: 'productive_pct', label: 'Productive %', align: 'right', hint: 'visits with a same-day order ÷ visits', csv: (r) => r.productive_pct, cell: (r) => fmtPct(r.productive_pct) },
    { key: 'calls_per_rep_day', label: 'Calls / rep-day', align: 'right', hint: 'visited calls ÷ (rep, day) pairs with a visit', csv: (r) => r.calls_per_rep_day, cell: (r) => fmtNum(r.calls_per_rep_day) },
    { key: 'orders', label: 'Orders', align: 'right', csv: (r) => r.orders },
    { key: 'revenue_inr', label: 'Revenue (₹)', align: 'right', csv: (r) => r.revenue_inr, cell: (r) => fmtInr(r.revenue_inr) },
    { key: 'revenue_per_rep_inr', label: 'Revenue / rep (₹)', align: 'right', csv: (r) => r.revenue_per_rep_inr, cell: (r) => fmtInr(r.revenue_per_rep_inr) },
    { key: 'days_present', label: 'Days present', align: 'right', hint: 'attendance days, all reps in the team', csv: (r) => r.days_present },
  ], []);

  const exportCsv = () => downloadCsv(`supervisor-teams-${from}_to_${to}.csv`, csvOf(cols, rows, med ? {
    adherence_pct: med.adherence_pct, productive_pct: med.productive_pct, calls_per_rep_day: med.calls_per_rep_day, revenue_per_rep_inr: med.revenue_per_rep_inr,
  } : undefined, 'Median team'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ReportHeader
        title="Supervisor Teams"
        intro="Team size, coverage and output per direct supervisor, with per-rep measures that do not favour bigger teams."
        onExport={exportCsv} exportDisabled={loading || rows.length === 0}
      />
      <FilterCard idPrefix="ffm-sup" from={from} to={to} onRange={(f, e) => { setFrom(f); setTo(e); }} />

      <StatusBox loading={loading} error={error} onRetry={reload}>
        <StatGrid>
          <Stat label="Teams" value={rows.length} />
          <Stat label="Reps in view" value={fmtInt(data?.reps_in_view ?? 0)} />
          <Stat label="Median adherence" value={fmtPct(med?.adherence_pct)} hint="across teams shown" />
          <Stat label="Median calls / rep-day" value={fmtNum(med?.calls_per_rep_day)} hint="across teams shown" />
        </StatGrid>
        <DataTable
          testId="supervisor-table" cols={cols} rows={rows} rowKey={(r) => r.supervisor_id ?? 'none'} minWidth={1100}
          empty="No supervised reps with activity in the selected range."
          initialSort={{ key: 'visited_stops', dir: 'desc' }}
          footer={med && rows.length > 0 ? <FooterRow cols={cols} label="Median team" values={{
            adherence_pct: fmtPct(med.adherence_pct), productive_pct: fmtPct(med.productive_pct), calls_per_rep_day: fmtNum(med.calls_per_rep_day), revenue_per_rep_inr: fmtInr(med.revenue_per_rep_inr),
          }} /> : null}
        />
        <Notes>
          Teams are the reps who report directly to each supervisor (not their wider tree). Totals grow with team size, so read the per-rep measures (calls per rep-day, revenue per rep)
          and percentages against the median team. Teams of one or two reps swing a lot from week to week, and territories differ in outlet density and order size:
          use this to find where to look, not to rank supervisors.
        </Notes>
      </StatusBox>
    </div>
  );
}
