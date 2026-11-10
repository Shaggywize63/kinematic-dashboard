'use client';
import { useMemo, useState } from 'react';
import { istToday } from '../../../../components/attendance/RangePresets';
import { ffmReports, type OutletGapRow, type OutletGapsPayload } from '../../../../components/ffm/reports/ffmReportsApi';
import {
  ReportHeader, FilterCard, FilterSelect, StatGrid, Stat, Notes, StatusBox, DataTable, Pill,
  useReportData, useRepOptions, csvOf, downloadCsv, type Col,
} from '../../../../components/ffm/reports/ReportKit';
import { addDaysYmd, fmtDay, fmtInr, fmtInt, fmtNum, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Outlet Visit Gaps — outlets planned in the window and how long it has been since each was last visited
 * (never-visited outlets first, then the longest gap), with the rep who planned it most and the outlet's
 * orders in the window. Filter by rep and by "not visited for at least N days".
 * Data: GET /api/v1/analytics/ffm/reports/outlet-visit-gaps?from&to&user_id&min_days&limit.
 */
const LIMIT = 500;
const MIN_DAYS = [
  { value: '0', label: 'Any' }, { value: '7', label: '7 days or more' }, { value: '14', label: '14 days or more' },
  { value: '30', label: '30 days or more' }, { value: '60', label: '60 days or more' },
];

export default function OutletVisitGapsReport() {
  const [from, setFrom] = useState(() => addDaysYmd(istToday(), -59));
  const [to, setTo] = useState(() => istToday());
  const [userId, setUserId] = useState('');
  const [minDays, setMinDays] = useState('0');
  const problem = rangeProblem(from, to);
  const { data, loading, error, reload } = useReportData<OutletGapsPayload>(
    () => ffmReports.outletVisitGaps({ from, to, user_id: userId || undefined, min_days: Number(minDays), limit: LIMIT }).then((r) => r.data),
    [from, to, userId, minDays], !problem,
  );
  const options = useRepOptions(data?.rep_options);
  const rows = data?.rows ?? [];
  const s = data?.summary;

  const cols: Array<Col<OutletGapRow>> = useMemo(() => [
    { key: 'outlet_name', label: 'Outlet', csv: (r) => r.outlet_name },
    { key: 'city', label: 'City', csv: (r) => r.city },
    { key: 'rep_name', label: 'Planned most by', hint: 'the rep with the most planned calls for this outlet', csv: (r) => r.rep_name },
    { key: 'planned_calls', label: 'Planned calls', align: 'right', csv: (r) => r.planned_calls },
    { key: 'visited_calls', label: 'Visited calls', align: 'right', csv: (r) => r.visited_calls },
    { key: 'status', label: 'Status', csv: (r) => (r.days_since_last_visit === null ? 'Not visited in window' : 'Visited'),
      cell: (r) => (r.days_since_last_visit === null ? <Pill title="No visited call in the selected window">Not visited in window</Pill> : 'Visited') },
    { key: 'last_visit_date', label: 'Last visit', align: 'right', csv: (r) => r.last_visit_date, cell: (r) => fmtDay(r.last_visit_date) },
    // Never-visited rows sort as the longest gap, as the server orders them.
    { key: 'days_since_last_visit', label: 'Days since last visit', align: 'right', csv: (r) => r.days_since_last_visit,
      sort: (r) => (r.days_since_last_visit === null ? 1e9 : r.days_since_last_visit), cell: (r) => (r.days_since_last_visit === null ? '—' : fmtInt(r.days_since_last_visit)) },
    { key: 'last_order_date', label: 'Last order', align: 'right', csv: (r) => r.last_order_date, cell: (r) => fmtDay(r.last_order_date) },
    { key: 'orders', label: 'Orders', align: 'right', csv: (r) => r.orders },
    { key: 'revenue_inr', label: 'Revenue (₹)', align: 'right', csv: (r) => r.revenue_inr, cell: (r) => fmtInr(r.revenue_inr) },
  ], []);

  const exportCsv = () => downloadCsv(`outlet-visit-gaps-${from}_to_${to}.csv`, csvOf(cols, rows));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ReportHeader
        title="Outlet Visit Gaps"
        intro="Outlets planned in the window and how long since each was last visited, longest gap first."
        onExport={exportCsv} exportDisabled={loading || rows.length === 0}
      />
      <FilterCard idPrefix="ffm-gap" from={from} to={to} onRange={(f, e) => { setFrom(f); setTo(e); }}>
        <FilterSelect id="ffm-gap-rep" label="Rep" value={userId} onChange={setUserId}
          options={[{ value: '', label: 'All reps' }, ...options.map((o) => ({ value: o.id, label: o.name }))]} />
        <FilterSelect id="ffm-gap-min" label="Not visited for" value={minDays} onChange={setMinDays} options={MIN_DAYS} />
      </FilterCard>

      <StatusBox loading={loading} error={error} onRetry={reload}>
        <StatGrid>
          <Stat label="Outlets" value={fmtInt(s?.outlets ?? 0)} />
          <Stat label="Visited in window" value={fmtInt(s?.visited ?? 0)} />
          <Stat label="Not visited in window" value={fmtInt(s?.never_visited ?? 0)} />
          <Stat label="Avg days since visit" value={fmtNum(s?.avg_days_since_last_visit)} hint="outlets visited in the window" />
        </StatGrid>
        <DataTable
          testId="outlet-gaps-table" cols={cols} rows={rows} rowKey={(r) => r.store_id} minWidth={1050}
          empty="No outlets match the selected range and filters."
          initialSort={{ key: 'days_since_last_visit', dir: 'desc' }}
        />
        {data && data.total > rows.length && (
          <Notes>Showing the first {fmtInt(rows.length)} of {fmtInt(data.total)} outlets, longest gap first. Narrow by rep or by days to see the rest.</Notes>
        )}
        <Notes>
          Outlets are those on a route plan in the window. Days since last visit is counted to {data?.as_of ? fmtDay(data.as_of) : 'today'} from the most recent visited call; an outlet with no visited
          call in the window is shown as not visited (its real gap is at least the length of the window). Orders are non-cancelled, non-draft orders booked by your reps for the outlet in the window.
          A long gap can mean the outlet is closed, was moved off the beat on purpose, or has no pin: check before treating it as missed.
        </Notes>
      </StatusBox>
    </div>
  );
}
