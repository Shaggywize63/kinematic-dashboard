'use client';
/**
 * Daily Travel Report → Team view: one row per employee who checked in on the chosen date, with the shift, mode of
 * transport, distance, customer visits and halts, from GET /api/v1/attendance/daily-report/team?date=.
 * Sortable, exportable as CSV, and a row opens that person's day.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, MapPinOff, RefreshCw } from 'lucide-react';
import api, { type DailyReportTeamRow } from '../../lib/api';
import { downloadCsv } from '../../lib/exportCsv';
import { SortLabel, useTableSort, type SortState } from '../../lib/tableSort';
import { fmtKm, fmtDay, istToday, isYmd, modeText, readTeamReport, teamCsvRows, TEAM_CSV_COLUMNS } from '../../lib/travelReport';
import { fmtClock, fmtMinutes } from '../../lib/visitTime';
import { Button, Card, EmptyState, Eyebrow, Field, IconButton, Input, T } from '../ui';
import { shareInflight } from './shareInflight';
import { alertBox, td, tdNum, tdTime, th } from './styles';

// What each sortable column compares. Times sort by the instant, the mode by what is shown.
const sortValue = (r: DailyReportTeamRow, key: string): unknown => {
  switch (key) {
    case 'name': return r.name;
    case 'checkin_at': return r.checkin_at ? Date.parse(r.checkin_at) : null;
    case 'checkout_at': return r.checkout_at ? Date.parse(r.checkout_at) : null;
    case 'mode': return r.mode || r.label ? modeText(r.mode, r.label) : null;
    case 'total_km': return r.total_km;
    case 'visits': return r.visits;
    case 'halts': return r.halts;
    default: return null;
  }
};
const INITIAL_SORT: SortState = { key: 'name', dir: 'asc' };

export default function TeamReport({ date, onDateChange, onOpen, clientId }: {
  date: string; onDateChange: (d: string) => void; onOpen: (userId: string) => void; clientId: string;
}) {
  const [rows, setRows] = useState<DailyReportTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // A newer date / client / refresh makes an older answer irrelevant.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const res = await shareInflight(`team|${clientId}|${date}`, () => api.getDailyTravelReportTeam(date));
      if (id !== reqId.current) return;
      const team = readTeamReport(res);
      if (!team) throw new Error('The server sent an unexpected response.');
      setRows(team.rows);
    } catch (e) {
      if (id !== reqId.current) return;
      setRows([]);
      setError((e as Error)?.message || 'Could not load the team report.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [date, clientId]);

  // Refetch when the date changes AND when the global client picker changes (the report is per client).
  useEffect(() => { load(); }, [load]);

  const { sorted, sort, toggle } = useTableSort(rows, sortValue, INITIAL_SORT);

  const exportCsv = () => {
    if (sorted.length === 0) return;
    downloadCsv(`daily-travel-team-${date}`, teamCsvRows(sorted, date), [...TEAM_CSV_COLUMNS]);
  };

  const columns: Array<{ key: string; label: string; right?: boolean }> = [
    { key: 'name', label: 'Employee' }, { key: 'checkin_at', label: 'Check-in' }, { key: 'checkout_at', label: 'Check-out' },
    { key: 'mode', label: 'Mode' }, { key: 'total_km', label: 'Distance', right: true },
    { key: 'visits', label: 'Visits', right: true }, { key: 'halts', label: 'Halts', right: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Date" htmlFor="tr-team-date" style={{ width: 190 }}>
          <Input id="tr-team-date" type="date" value={date} max={istToday()} onChange={(e) => { if (isYmd(e.target.value)) onDateChange(e.target.value); }} />
        </Field>
        <IconButton label="Refresh team report" onClick={load} style={{ marginBottom: 2 }}>
          <RefreshCw size={16} strokeWidth={1.6} style={loading ? { animation: 'kspin 1s linear infinite' } : undefined} />
        </IconButton>
        <div style={{ flex: 1 }} />
        <Button onClick={exportCsv} disabled={loading || sorted.length === 0} icon={<Download size={16} strokeWidth={1.6} />}>Export CSV</Button>
      </div>

      {error && <div role="alert" style={alertBox}>{error}</div>}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>{fmtDay(date)}</Eyebrow>
          <div style={{ fontSize: 12.5, color: T.dim }}>
            Everyone who checked in on this day. Pick a person to see their route, customer visits, halts and timeline.
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ ...th, textAlign: c.right ? 'right' : 'left' }}>
                    <SortLabel label={c.label} sortKey={c.key} sort={sort} onToggle={toggle} align={c.right ? 'right' : 'left'} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} style={{ ...td, borderBottom: 0, textAlign: 'center', color: T.mute, padding: 32 }}>Loading team report…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ ...td, borderBottom: 0, padding: 0 }}>
                  <EmptyState
                    icon={<MapPinOff size={20} strokeWidth={1.6} />}
                    title={error ? 'Could not load the team report' : `No one checked in on ${fmtDay(date)}`}
                    description={error ? 'Use the refresh button to try again.' : 'People appear here once they have an attendance record for the day.'}
                  />
                </td></tr>
              ) : sorted.map((r) => (
                <tr
                  key={r.user_id} data-testid="team-row" onClick={() => onOpen(r.user_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={td}>
                    <button
                      type="button" aria-label={`Open ${r.name}'s day`}
                      style={{ background: 'none', border: 0, padding: 0, margin: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, color: T.text }}
                    >
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                      {r.employee_id && <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute }}>{r.employee_id}</span>}
                    </button>
                  </td>
                  <td style={tdTime}>{fmtClock(r.checkin_at)}</td>
                  <td style={tdTime}>{r.checkout_at ? fmtClock(r.checkout_at) : <span style={{ color: T.mute }}>—</span>}</td>
                  <td style={td}>{r.mode || r.label ? modeText(r.mode, r.label) : <span style={{ color: T.mute }}>—</span>}</td>
                  <td style={tdNum}>{fmtKm(r.total_km)}</td>
                  <td style={tdNum}>
                    {r.visits}
                    {r.visits > 0 && <div style={{ fontSize: 11, color: T.mute }}>{fmtMinutes(r.visit_minutes)}</div>}
                  </td>
                  <td style={tdNum}>
                    {r.halts}
                    {r.halts > 0 && <div style={{ fontSize: 11, color: T.mute }}>{fmtMinutes(r.halt_minutes)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
