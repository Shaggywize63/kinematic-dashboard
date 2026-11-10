'use client';
import { useMemo, useState } from 'react';
import { presetRange } from '../../../../components/attendance/RangePresets';
import { ffmReports, type RepActivityRow, type RepActivityPayload } from '../../../../components/ffm/reports/ffmReportsApi';
import {
  ReportHeader, FilterCard, StatGrid, Stat, Notes, StatusBox, DataTable, FooterRow, useReportData, csvOf, downloadCsv, type Col,
} from '../../../../components/ffm/reports/ReportKit';
import { fmtDelta, fmtInr, fmtInt, fmtNum, fmtPct, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Rep Activity Comparison — one row per field rep over the chosen range: coverage, productivity,
 * orders, travel, time on site and attendance, next to the median of the reps shown.
 *
 * A comparison aid, not a score: every ratio sits beside the counts it comes from, and each
 * "vs median" column names its basis (the median of the reps in view). Beats differ in length,
 * outlet density and order size, so use it to ask questions, not to rank people.
 * Data: GET /api/v1/analytics/ffm/reports/rep-activity?from&to.
 */

const vs = (v: number | null | undefined, m: number | null | undefined): number | null =>
  v == null || m == null ? null : Math.round((v - m) * 10) / 10;

export default function RepActivityReport() {
  const [from, setFrom] = useState(() => presetRange('fortnight').from);
  const [to, setTo] = useState(() => presetRange('fortnight').to);
  const problem = rangeProblem(from, to);
  const { data, loading, error, reload } = useReportData<RepActivityPayload>(
    () => ffmReports.repActivity({ from, to }).then((r) => r.data), [from, to], !problem,
  );
  const rows = data?.rows ?? [];
  const med = data?.median ?? null;

  const cols: Array<Col<RepActivityRow>> = useMemo(() => [
    { key: 'fe_name', label: 'Rep', csv: (r) => r.fe_name },
    { key: 'planned_stops', label: 'Planned calls', align: 'right', csv: (r) => r.planned_stops },
    { key: 'visited_stops', label: 'Visited', align: 'right', csv: (r) => r.visited_stops },
    { key: 'adherence_pct', label: 'Adherence %', align: 'right', hint: 'visited ÷ planned calls', csv: (r) => r.adherence_pct, cell: (r) => fmtPct(r.adherence_pct) },
    { key: 'adherence_vs', label: 'Adherence vs median (pp)', align: 'right', csv: (r) => vs(r.adherence_pct, med?.adherence_pct), cell: (r) => fmtDelta(vs(r.adherence_pct, med?.adherence_pct)) },
    { key: 'active_days', label: 'Days visiting', align: 'right', csv: (r) => r.active_days },
    { key: 'calls_per_day', label: 'Calls / day', align: 'right', hint: 'visited calls ÷ days visiting', csv: (r) => r.calls_per_day, cell: (r) => fmtNum(r.calls_per_day) },
    { key: 'calls_vs', label: 'Calls / day vs median', align: 'right', csv: (r) => vs(r.calls_per_day, med?.calls_per_day), cell: (r) => fmtDelta(vs(r.calls_per_day, med?.calls_per_day)) },
    { key: 'productive_pct', label: 'Productive %', align: 'right', hint: 'visits with a same-day order ÷ visits', csv: (r) => r.productive_pct, cell: (r) => fmtPct(r.productive_pct) },
    { key: 'productive_vs', label: 'Productive vs median (pp)', align: 'right', csv: (r) => vs(r.productive_pct, med?.productive_pct), cell: (r) => fmtDelta(vs(r.productive_pct, med?.productive_pct)) },
    { key: 'orders', label: 'Orders', align: 'right', csv: (r) => r.orders },
    { key: 'revenue_inr', label: 'Revenue (₹)', align: 'right', csv: (r) => r.revenue_inr, cell: (r) => fmtInr(r.revenue_inr) },
    { key: 'aov_inr', label: 'AOV (₹)', align: 'right', hint: 'revenue ÷ orders', csv: (r) => r.aov_inr, cell: (r) => fmtInr(r.aov_inr) },
    { key: 'km_total', label: 'Km', align: 'right', csv: (r) => r.km_total, cell: (r) => fmtNum(r.km_total) },
    { key: 'km_per_visit', label: 'Km / visit', align: 'right', csv: (r) => r.km_per_visit, cell: (r) => fmtNum(r.km_per_visit) },
    { key: 'avg_dwell_min', label: 'On site (min)', align: 'right', hint: 'average check-in to check-out', csv: (r) => r.avg_dwell_min, cell: (r) => fmtNum(r.avg_dwell_min) },
    { key: 'first_call_time', label: 'First call (IST)', align: 'right', csv: (r) => r.first_call_time, cell: (r) => r.first_call_time ?? '—' },
    { key: 'last_call_time', label: 'Last call (IST)', align: 'right', csv: (r) => r.last_call_time, cell: (r) => r.last_call_time ?? '—' },
    { key: 'days_present', label: 'Days present', align: 'right', csv: (r) => r.days_present },
    { key: 'avg_hours', label: 'Avg hours / day', align: 'right', csv: (r) => r.avg_hours, cell: (r) => fmtNum(r.avg_hours) },
  ], [med]);

  const medianValues = med ? {
    adherence_pct: fmtPct(med.adherence_pct), calls_per_day: fmtNum(med.calls_per_day), productive_pct: fmtPct(med.productive_pct),
    aov_inr: fmtInr(med.aov_inr), km_per_visit: fmtNum(med.km_per_visit), avg_dwell_min: fmtNum(med.avg_dwell_min),
  } : null;

  const exportCsv = () => {
    const footer = med ? {
      adherence_pct: med.adherence_pct, calls_per_day: med.calls_per_day, productive_pct: med.productive_pct,
      aov_inr: med.aov_inr, km_per_visit: med.km_per_visit, avg_dwell_min: med.avg_dwell_min,
    } : undefined;
    downloadCsv(`rep-activity-${from}_to_${to}.csv`, csvOf(cols, rows, footer, 'Team median'));
  };

  const t = data?.totals;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ReportHeader
        title="Rep Activity Comparison"
        intro="Coverage, productivity, orders, travel, time on site and attendance per rep, beside the median of the reps shown. A comparison aid, not a score."
        onExport={exportCsv} exportDisabled={loading || rows.length === 0}
      />
      <FilterCard idPrefix="ffm-ra" from={from} to={to} onRange={(f, e) => { setFrom(f); setTo(e); }} />

      <StatusBox loading={loading} error={error} onRetry={reload}>
        <StatGrid>
          <Stat label="Reps in view" value={data?.reps_in_view ?? 0} />
          <Stat label="Visited calls" value={fmtInt(t?.visited_stops ?? 0)} hint={`of ${fmtInt(t?.planned_stops ?? 0)} planned`} />
          <Stat label="Adherence" value={fmtPct(t?.adherence_pct ?? 0)} />
          <Stat label="Productive" value={fmtPct(t?.productive_pct ?? 0)} hint="visits with a same-day order" />
          <Stat label="Orders" value={fmtInt(t?.orders ?? 0)} />
          <Stat label="Revenue" value={fmtInr(t?.revenue_inr ?? 0)} hint={`AOV ${fmtInr(t?.aov_inr ?? 0)}`} />
          <Stat label="Distance" value={fmtNum(t?.km_total ?? 0, ' km')} hint={`${fmtNum(t?.km_per_visit ?? 0)} km / visit`} />
        </StatGrid>

        <DataTable
          testId="rep-activity-table" cols={cols} rows={rows} rowKey={(r) => r.fe_id} minWidth={1500}
          empty="No field activity in the selected range."
          initialSort={{ key: 'fe_name', dir: 'asc' }}
          footer={medianValues && rows.length > 0 ? <FooterRow cols={cols} label="Team median" values={medianValues} /> : null}
        />
        <Notes>
          A call is one outlet for one rep on one day (several plans for the same outlet and day count once) and is visited when its status is visited,
          completed, done or checked out. Productive = the same rep booked a non-cancelled, non-draft order at that outlet on that day (IST). Distance is the
          actual route km when recorded, otherwise the planned route km. On site is measured only for visits with both a check-in and a check-out.
          &quot;vs median&quot; compares a rep with the median of the reps shown in this report (percentage points for %, difference for calls / day);
          beats differ in length and outlet density, so read it as a prompt to ask, not a ranking.
        </Notes>
      </StatusBox>
    </div>
  );
}
