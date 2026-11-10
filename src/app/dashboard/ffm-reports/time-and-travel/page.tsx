'use client';
import { useMemo, useState } from 'react';
import { presetRange } from '../../../../components/attendance/RangePresets';
import { ffmReports, type TimeTravelPayload, type TimeTravelRow } from '../../../../components/ffm/reports/ffmReportsApi';
import {
  ReportHeader, FilterCard, StatGrid, Stat, Notes, StatusBox, DataTable, FooterRow, useReportData, csvOf, downloadCsv, type Col,
} from '../../../../components/ffm/reports/ReportKit';
import { fmtInt, fmtNum, fmtPct, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Time & Travel — distance, calls, time on site, first / last call of the day and attendance hours per
 * rep. "On-site share" is time on site ÷ attendance hours: a rough guide to how much of the working day
 * is spent in front of customers (the rest is travel, breaks and anything not checked in).
 * Data: GET /api/v1/analytics/ffm/reports/time-and-travel?from&to.
 */
export default function TimeAndTravelReport() {
  const [from, setFrom] = useState(() => presetRange('fortnight').from);
  const [to, setTo] = useState(() => presetRange('fortnight').to);
  const problem = rangeProblem(from, to);
  const { data, loading, error, reload } = useReportData<TimeTravelPayload>(
    () => ffmReports.timeAndTravel({ from, to }).then((r) => r.data), [from, to], !problem,
  );
  const rows = data?.rows ?? [];
  const med = data?.median ?? null;

  const cols: Array<Col<TimeTravelRow>> = useMemo(() => [
    { key: 'fe_name', label: 'Rep', csv: (r) => r.fe_name },
    { key: 'active_days', label: 'Days visiting', align: 'right', csv: (r) => r.active_days },
    { key: 'km_total', label: 'Km', align: 'right', hint: 'actual route km, planned km when actual is not recorded', csv: (r) => r.km_total, cell: (r) => fmtNum(r.km_total) },
    { key: 'km_per_day', label: 'Km / day', align: 'right', csv: (r) => r.km_per_day, cell: (r) => fmtNum(r.km_per_day) },
    { key: 'visited_stops', label: 'Visited calls', align: 'right', csv: (r) => r.visited_stops },
    { key: 'km_per_visit', label: 'Km / visit', align: 'right', csv: (r) => r.km_per_visit, cell: (r) => fmtNum(r.km_per_visit) },
    { key: 'timed_visits', label: 'Timed visits', align: 'right', hint: 'visits with both a check-in and a check-out', csv: (r) => r.timed_visits },
    { key: 'avg_dwell_min', label: 'On site (min)', align: 'right', hint: 'average per timed visit', csv: (r) => r.avg_dwell_min, cell: (r) => fmtNum(r.avg_dwell_min) },
    { key: 'onsite_hours', label: 'On site (h)', align: 'right', csv: (r) => r.onsite_hours, cell: (r) => fmtNum(r.onsite_hours) },
    { key: 'first_call_time', label: 'First call (IST)', align: 'right', hint: 'average over days visiting', csv: (r) => r.first_call_time, cell: (r) => r.first_call_time ?? '—' },
    { key: 'last_call_time', label: 'Last call (IST)', align: 'right', hint: 'average over days visiting', csv: (r) => r.last_call_time, cell: (r) => r.last_call_time ?? '—' },
    { key: 'avg_span_hours', label: 'Day span (h)', align: 'right', hint: 'first call to last activity, average', csv: (r) => r.avg_span_hours, cell: (r) => fmtNum(r.avg_span_hours) },
    { key: 'days_present', label: 'Days present', align: 'right', csv: (r) => r.days_present },
    { key: 'worked_hours', label: 'Worked (h)', align: 'right', hint: 'attendance hours', csv: (r) => r.worked_hours, cell: (r) => fmtNum(r.worked_hours) },
    { key: 'onsite_share_pct', label: 'On-site share %', align: 'right', hint: 'on site ÷ worked hours', csv: (r) => r.onsite_share_pct, cell: (r) => fmtPct(r.onsite_share_pct) },
  ], []);

  const exportCsv = () => downloadCsv(`time-and-travel-${from}_to_${to}.csv`, csvOf(cols, rows, med ? {
    km_per_visit: med.km_per_visit, avg_dwell_min: med.avg_dwell_min, avg_span_hours: med.avg_span_hours, onsite_share_pct: med.onsite_share_pct,
  } : undefined, 'Team median'));

  const t = data?.totals;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ReportHeader
        title="Time & Travel"
        intro="Distance, calls, time on site, first and last call of the day and attendance hours per rep."
        onExport={exportCsv} exportDisabled={loading || rows.length === 0}
      />
      <FilterCard idPrefix="ffm-tt" from={from} to={to} onRange={(f, e) => { setFrom(f); setTo(e); }} />

      <StatusBox loading={loading} error={error} onRetry={reload}>
        <StatGrid>
          <Stat label="Reps in view" value={rows.length} />
          <Stat label="Distance" value={fmtNum(t?.km_total ?? 0, ' km')} />
          <Stat label="Visited calls" value={fmtInt(t?.visited_stops ?? 0)} />
          <Stat label="On site" value={fmtNum(t?.onsite_hours ?? 0, ' h')} hint="timed visits only" />
          <Stat label="Worked" value={fmtNum(t?.worked_hours ?? 0, ' h')} hint="attendance hours" />
        </StatGrid>
        <DataTable
          testId="time-travel-table" cols={cols} rows={rows} rowKey={(r) => r.fe_id} minWidth={1400}
          empty="No visits or attendance in the selected range."
          initialSort={{ key: 'fe_name', dir: 'asc' }}
          footer={med && rows.length > 0 ? <FooterRow cols={cols} label="Team median" values={{
            km_per_visit: fmtNum(med.km_per_visit), avg_dwell_min: fmtNum(med.avg_dwell_min), avg_span_hours: fmtNum(med.avg_span_hours), onsite_share_pct: fmtPct(med.onsite_share_pct),
          }} /> : null}
        />
        <Notes>
          Time on site is measured only for visits with both a check-in and a check-out (up to 8 hours); a visit with no check-out is not timed, so on-site hours are a floor.
          First and last call are averages over the days the rep visited; the last call uses the check-out when there is one. On-site share = on-site hours ÷ attendance hours and is blank
          when either is missing. The rest of the day is travel, breaks and work that is not checked in. Compare reps with the team median shown, and allow for beat length.
        </Notes>
      </StatusBox>
    </div>
  );
}
