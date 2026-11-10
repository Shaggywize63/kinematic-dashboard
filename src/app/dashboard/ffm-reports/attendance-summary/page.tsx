'use client';
import { useEffect, useRef, useState } from 'react';
import api from '../../../../lib/api';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { RangePresetPicker, presetRange, istToday } from '../../../../components/attendance/RangePresets';
import { ffmReports, type AttendanceExtraRow } from '../../../../components/ffm/reports/ffmReportsApi';
import { csvLine } from '../../../../components/ffm/reports/reportUtils';

/**
 * Attendance Summary — attendance roll-up per rep over a chosen date range.
 *
 * Data comes from GET /api/v1/attendance/summary?from&to, which does the
 * per-rep roll-up server-side (working days, present, late, half-day, leave and
 * absent — absents included, which a raw /attendance/team scan cannot give
 * because missing days return no row). The range is picked with the shared
 * presets (This week / 14 days / This month / Custom) and defaults to this
 * calendar month-to-date.
 *
 * Attendance % = present days ÷ working days. Late is a subset of Present.
 *
 * Extra columns (average check-in / check-out time, hours per day, total hours, days with no
 * check-out, regularised days) come from GET /api/v1/analytics/ffm/reports/attendance-extras, joined
 * to the summary rows by user id. They are best-effort: if that call fails the summary still shows
 * and those columns read "—". The CSV carries every column the table shows.
 */

interface SummaryApiRow {
  user_id?: string;
  name?: string;
  working_days?: number;
  present?: number;
  late?: number;
  half_day?: number;
  on_leave?: number;
  absent?: number;
}

interface Summary {
  id: string;
  name: string;
  workingDays: number;
  present: number;
  late: number;
  halfDay: number;
  onLeave: number;
  absent: number;
  attendancePct: number;
  // From the extras endpoint (null when the rep has no punches in the range, or the call failed).
  avgCheckin: string | null;
  avgCheckout: string | null;
  avgHours: number | null;
  totalHours: number | null;
  missedCheckouts: number | null;
  regularised: number | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Type-aware column sorting reads the raw summary field per column key.
const attVal = (r: Summary, key: string): unknown => (r as unknown as Record<string, unknown>)[key];

export default function AttendanceSummaryReport() {
  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo] = useState(() => presetRange('month').to);
  const [rows, setRows] = useState<Summary[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [extrasOk, setExtrasOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [res, extrasRes] = await Promise.all([
          api.getAttendanceSummary({ from, to }) as Promise<{ success: boolean; data: any }>,
          ffmReports.attendanceExtras({ from, to }).then((r) => r?.data?.rows ?? null).catch(() => null),
        ]);
        if (id !== reqId.current) return;
        const extras = new Map<string, AttendanceExtraRow>((extrasRes ?? []).map((x) => [x.user_id, x]));
        setExtrasOk(extrasRes !== null);
        const d = res?.data && typeof res.data === 'object' && 'rows' in res.data ? res.data : res;
        const apiRows: SummaryApiRow[] = Array.isArray(d?.rows) ? d.rows : [];
        const summarised: Summary[] = apiRows.map((r, i) => {
          const present = n(r.present);
          const wd = n(r.working_days);
          return {
            id: String(r.user_id ?? i),
            name: r.name || 'Unnamed',
            workingDays: wd,
            present,
            late: n(r.late),
            halfDay: n(r.half_day),
            onLeave: n(r.on_leave),
            absent: n(r.absent),
            attendancePct: wd > 0 ? Math.round((present / wd) * 100) : 0,
            avgCheckin: extras.get(String(r.user_id ?? ''))?.avg_checkin_time ?? null,
            avgCheckout: extras.get(String(r.user_id ?? ''))?.avg_checkout_time ?? null,
            avgHours: extras.get(String(r.user_id ?? ''))?.avg_hours ?? null,
            totalHours: extras.get(String(r.user_id ?? ''))?.total_hours ?? null,
            missedCheckouts: extras.get(String(r.user_id ?? ''))?.missed_checkouts ?? null,
            regularised: extras.get(String(r.user_id ?? ''))?.regularised_days ?? null,
          };
        });
        setRows(summarised);
        setWorkingDays(Number.isFinite(Number(d?.working_days)) && d?.working_days != null ? Number(d.working_days) : null);
      } catch (e: any) {
        if (id !== reqId.current) return;
        setRows([]);
        setWorkingDays(null);
        setError(e?.message ?? 'Failed to load attendance');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [from, to]);

  const { sorted, sort, toggle } = useTableSort<Summary>(rows, attVal, { key: 'absent', dir: 'desc' });

  const exportCsv = () => {
    const header = csvLine([
      'Name', 'Working Days', 'Present', 'Late', 'Half Day', 'Leave', 'Absent', 'Attendance %',
      'Avg Check-in (IST)', 'Avg Check-out (IST)', 'Avg Hours/Day', 'Total Hours', 'Days With No Check-out', 'Regularised Days',
    ]);
    const lines = sorted.map((r) => csvLine([
      r.name, r.workingDays, r.present, r.late, r.halfDay, r.onLeave, r.absent, r.attendancePct,
      r.avgCheckin, r.avgCheckout, r.avgHours, r.totalHours, r.missedCheckouts, r.regularised,
    ]));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-summary-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = rows.length;
  const present = rows.reduce((s, r) => s + r.present, 0);
  const late = rows.reduce((s, r) => s + r.late, 0);
  const absent = rows.reduce((s, r) => s + r.absent, 0);
  const totalWorkingDays = rows.reduce((s, r) => s + r.workingDays, 0);
  const attendancePct = totalWorkingDays > 0 ? Math.round((present / totalWorkingDays) * 100) : 0;
  const hoursRows = rows.filter((r) => r.avgHours != null);
  const teamAvgHours = hoursRows.length ? Math.round((hoursRows.reduce((s, r) => s + (r.avgHours as number), 0) / hoursRows.length) * 10) / 10 : null;
  const missedCheckouts = rows.reduce((s, r) => s + (r.missedCheckouts ?? 0), 0);
  const inProgress = to === istToday();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Attendance Summary</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Per-rep roll-up over the selected range. Attendance % = present ÷ working days.
            {workingDays != null ? ` ${workingDays} working days${inProgress ? ' so far' : ''}.` : ''}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || rows.length === 0}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: loading || rows.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13, opacity: loading || rows.length === 0 ? 0.6 : 1 }}
        >
          ⬇ Export CSV
        </button>
      </header>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <RangePresetPicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} idPrefix="ffm-att" />
      </div>

      {error ? (
        <div style={{ padding: 16, color: '#ef4444' }}>{error}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Stat label="Team" value={total} />
            <Stat label="Present days" value={present} />
            <Stat label="Late" value={late} accent={late > 0 ? '#f59e0b' : undefined} />
            <Stat label="Absent days" value={absent} accent={absent > 0 ? '#ef4444' : undefined} />
            <Stat label="Attendance %" value={`${attendancePct}%`} />
            <Stat label="Avg hours / day" value={teamAvgHours != null ? `${teamAvgHours} h` : '—'} />
            <Stat label="Days, no check-out" value={extrasOk ? missedCheckouts : '—'} accent={missedCheckouts > 0 ? '#f59e0b' : undefined} />
          </div>

          <div style={{ overflowX: 'auto', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <tr>
                  <Th><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></Th>
                  <Th align="right"><SortLabel label="Working days" sortKey="workingDays" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Present" sortKey="present" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Late" sortKey="late" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Half day" sortKey="halfDay" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Leave" sortKey="onLeave" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Absent" sortKey="absent" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Attendance" sortKey="attendancePct" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Avg check-in" sortKey="avgCheckin" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Avg check-out" sortKey="avgCheckout" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Avg hours / day" sortKey="avgHours" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Total hours" sortKey="totalHours" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Days, no check-out" sortKey="missedCheckouts" sort={sort} onToggle={toggle} align="right" /></Th>
                  <Th align="right"><SortLabel label="Regularised" sortKey="regularised" sort={sort} onToggle={toggle} align="right" /></Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>Loading attendance…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>No attendance data for the selected range.</td></tr>
                ) : sorted.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <Td>{r.name}</Td>
                    <Td align="right" style={{ color: 'var(--text-dim)' }}>{r.workingDays}</Td>
                    <Td align="right">{r.present}</Td>
                    <Td align="right" style={{ color: r.late > 0 ? '#f59e0b' : undefined, fontWeight: r.late > 0 ? 700 : undefined }}>{r.late}</Td>
                    <Td align="right">{r.halfDay}</Td>
                    <Td align="right">{r.onLeave}</Td>
                    <Td align="right" style={{ color: r.absent > 0 ? '#ef4444' : undefined, fontWeight: r.absent > 0 ? 700 : undefined }}>{r.absent}</Td>
                    <Td align="right">{r.attendancePct}%</Td>
                    <Td align="right">{r.avgCheckin ?? '—'}</Td>
                    <Td align="right">{r.avgCheckout ?? '—'}</Td>
                    <Td align="right">{r.avgHours != null ? `${r.avgHours}` : '—'}</Td>
                    <Td align="right">{r.totalHours != null ? `${r.totalHours}` : '—'}</Td>
                    <Td align="right" style={{ color: (r.missedCheckouts ?? 0) > 0 ? '#f59e0b' : undefined, fontWeight: (r.missedCheckouts ?? 0) > 0 ? 700 : undefined }}>{r.missedCheckouts ?? '—'}</Td>
                    <Td align="right">{r.regularised ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Check-in / check-out times are IST averages over the days present; hours are the stored attendance hours (else check-out minus check-in).
            &quot;Days, no check-out&quot; counts past days with a check-in but no check-out; regularised days were corrected by a manager.
            {extrasOk ? '' : ' The time and hours columns could not be loaded for this range.'}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return <th style={{ padding: '10px 12px', textAlign: align ?? 'left', fontWeight: 700 }}>{children}</th>;
}

function Td({ children, align, style }: { children: React.ReactNode; align?: 'right' | 'left'; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', textAlign: align ?? 'left', color: 'var(--text)', ...style }}>{children}</td>;
}
