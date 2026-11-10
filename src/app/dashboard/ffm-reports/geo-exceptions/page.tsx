'use client';
import { useMemo, useState } from 'react';
import { presetRange } from '../../../../components/attendance/RangePresets';
import { ffmReports, type GeoPayload, type GeoRow, type GeoSummaryRow } from '../../../../components/ffm/reports/ffmReportsApi';
import {
  ReportHeader, FilterCard, FilterSelect, StatGrid, Stat, Notes, StatusBox, DataTable,
  useReportData, useRepOptions, csvOf, downloadCsv, type Col,
} from '../../../../components/ffm/reports/ReportKit';
import { fmtDay, fmtInt, fmtIstTime, fmtPct, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Geo-fence Exceptions — check-ins made further from the outlet than its geofence radius, largest first,
 * with each rep's share of check-ins outside and the app's mock-location / VPN alerts and server-flagged
 * GPS jumps for the same window. Evidence for a conversation, not a verdict: wrong map pins, large
 * premises and relocated outlets all show up here.
 * Data: GET /api/v1/analytics/ffm/reports/geo-exceptions?from&to&user_id&min_distance_m.
 */
const MIN_DIST = [
  { value: '0', label: 'Any distance' }, { value: '100', label: '100 m or more' }, { value: '250', label: '250 m or more' },
  { value: '500', label: '500 m or more' }, { value: '1000', label: '1 km or more' },
];

export default function GeoExceptionsReport() {
  const [from, setFrom] = useState(() => presetRange('fortnight').from);
  const [to, setTo] = useState(() => presetRange('fortnight').to);
  const [userId, setUserId] = useState('');
  const [minDist, setMinDist] = useState('0');
  const problem = rangeProblem(from, to);
  const { data, loading, error, reload } = useReportData<GeoPayload>(
    () => ffmReports.geoExceptions({ from, to, user_id: userId || undefined, min_distance_m: Number(minDist) }).then((r) => r.data),
    [from, to, userId, minDist], !problem,
  );
  const options = useRepOptions(data?.rep_options);
  const rows = data?.rows ?? [];
  const summary = data?.summary ?? [];

  const sumCols: Array<Col<GeoSummaryRow>> = useMemo(() => [
    { key: 'fe_name', label: 'Rep', csv: (r) => r.fe_name },
    { key: 'checkins', label: 'Check-ins', align: 'right', hint: 'visited calls with a recorded distance to the outlet', csv: (r) => r.checkins },
    { key: 'outside_geofence', label: 'Outside geofence', align: 'right', csv: (r) => r.outside_geofence },
    { key: 'outside_pct', label: 'Outside %', align: 'right', csv: (r) => r.outside_pct, cell: (r) => fmtPct(r.outside_pct) },
    { key: 'max_distance_m', label: 'Furthest (m)', align: 'right', csv: (r) => r.max_distance_m, cell: (r) => fmtInt(r.max_distance_m) },
    { key: 'mock_location', label: 'Mock-location alerts', align: 'right', csv: (r) => r.mock_location },
    { key: 'vpn_detected', label: 'VPN alerts', align: 'right', csv: (r) => r.vpn_detected },
    { key: 'suspect_pings', label: 'GPS jumps flagged', align: 'right', hint: 'location pings the server flagged as an impossible jump', csv: (r) => r.suspect_pings },
  ], []);
  const rowCols: Array<Col<GeoRow>> = useMemo(() => [
    { key: 'fe_name', label: 'Rep', csv: (r) => r.fe_name },
    { key: 'outlet_name', label: 'Outlet', csv: (r) => r.outlet_name },
    { key: 'beat', label: 'Beat', csv: (r) => r.beat },
    { key: 'day', label: 'Date', align: 'right', csv: (r) => r.day, cell: (r) => fmtDay(r.day) },
    { key: 'visited_at', label: 'Check-in (IST)', align: 'right', csv: (r) => fmtIstTime(r.visited_at) },
    { key: 'distance_m', label: 'Distance (m)', align: 'right', csv: (r) => r.distance_m, cell: (r) => fmtInt(r.distance_m) },
    { key: 'geofence_m', label: 'Geofence (m)', align: 'right', csv: (r) => r.geofence_m, cell: (r) => fmtInt(r.geofence_m) },
    { key: 'over_by_m', label: 'Over by (m)', align: 'right', csv: (r) => r.over_by_m, cell: (r) => fmtInt(r.over_by_m) },
  ], []);

  const exportCsv = () => downloadCsv(`geo-exceptions-${from}_to_${to}.csv`, `${csvOf(sumCols, summary)}\n\nCheck-ins outside the geofence\n${csvOf(rowCols, rows)}`);

  const outsideTotal = summary.reduce((s, r) => s + r.outside_geofence, 0);
  const repsAffected = summary.filter((r) => r.outside_geofence > 0).length;
  const mock = summary.reduce((s, r) => s + r.mock_location, 0);
  const vpn = summary.reduce((s, r) => s + r.vpn_detected, 0);
  const jumps = summary.reduce((s, r) => s + r.suspect_pings, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ReportHeader
        title="Geo-fence Exceptions"
        intro="Check-ins made further from the outlet than its geofence, with mock-location, VPN and GPS-jump alerts for the same window."
        onExport={exportCsv} exportDisabled={loading || (rows.length === 0 && summary.length === 0)}
      />
      <FilterCard idPrefix="ffm-geo" from={from} to={to} onRange={(f, e) => { setFrom(f); setTo(e); }}>
        <FilterSelect id="ffm-geo-rep" label="Rep" value={userId} onChange={setUserId}
          options={[{ value: '', label: 'All reps' }, ...options.map((o) => ({ value: o.id, label: o.name }))]} />
        <FilterSelect id="ffm-geo-min" label="Distance from outlet" value={minDist} onChange={setMinDist} options={MIN_DIST} />
      </FilterCard>

      <StatusBox loading={loading} error={error} onRetry={reload}>
        <StatGrid>
          <Stat label="Check-ins outside" value={fmtInt(outsideTotal)} />
          <Stat label="Reps with one" value={fmtInt(repsAffected)} hint={`of ${fmtInt(summary.length)} with check-ins or alerts`} />
          <Stat label="Mock-location alerts" value={fmtInt(mock)} />
          <Stat label="VPN alerts" value={fmtInt(vpn)} />
          <Stat label="GPS jumps flagged" value={fmtInt(jumps)} />
        </StatGrid>

        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>By rep</div>
        <DataTable testId="geo-summary-table" cols={sumCols} rows={summary} rowKey={(r) => r.fe_id} minWidth={900}
          empty="No check-ins or alerts in the selected range." initialSort={{ key: 'outside_geofence', dir: 'desc' }} />

        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Check-ins outside the geofence</div>
        <DataTable testId="geo-rows-table" cols={rowCols} rows={rows} rowKey={(r) => `${r.fe_id}|${r.day}|${r.outlet_name}|${r.visited_at}`} minWidth={900}
          empty="No check-ins outside the geofence in the selected range." initialSort={{ key: 'distance_m', dir: 'desc' }} />
        {data && data.total > rows.length && <Notes>Showing the largest {fmtInt(rows.length)} of {fmtInt(data.total)}.</Notes>}
        <Notes>
          A check-in is outside when the rep was further from the outlet than its geofence radius (100 m when the outlet has none). Often there is an innocent reason:
          the outlet&apos;s map pin is wrong or moved, the premises are large, or GPS was weak. Treat an exception as a question for the rep and a prompt to fix the pin, not as proof.
          Mock-location and VPN alerts are reported by the mobile app; GPS jumps are pings the server flagged as an impossible speed from the previous fix.
          The distance filter narrows the list below only; the by-rep table always shows every check-in in the range.
        </Notes>
      </StatusBox>
    </div>
  );
}
