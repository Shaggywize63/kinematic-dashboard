'use client';
/**
 * Attendance → "Monthly summary": one row per employee with their Present / Late / Half-day / Leave / Absent
 * counts for a calendar month, from GET /api/v1/attendance/summary?from&to. Late is a subset of Present
 * (a late arrival is still a present day). Sortable (worst offenders first by default) and exportable as CSV.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, Download, RefreshCw } from 'lucide-react';
import api, { type AttendanceSummaryRow } from '../../../lib/api';
import { downloadCsv } from '../../../lib/exportCsv';
import { SortLabel, type SortState } from '../../../lib/tableSort';
import { Button, Card, EmptyState, Eyebrow, Field, IconButton, Input, T } from '../../../components/ui';

const th: CSSProperties = { padding: '12px 14px', textAlign: 'left', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };
const num: CSSProperties = { ...td, textAlign: 'right', fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

type SortKey = 'name' | 'working_days' | 'present' | 'late' | 'half_day' | 'on_leave' | 'absent';
const COLUMNS: Array<{ key: SortKey; label: string; csv: string }> = [
  { key: 'working_days', label: 'Working days', csv: 'Working days' },
  { key: 'present', label: 'Present', csv: 'Present' },
  { key: 'late', label: 'Late', csv: 'Late' },
  { key: 'half_day', label: 'Half day', csv: 'Half day' },
  { key: 'on_leave', label: 'Leave', csv: 'Leave' },
  { key: 'absent', label: 'Absent', csv: 'Absent' },
];

const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/** First day of the month, and the last day we ask for: the month's end, but never past today (IST). */
function monthRange(month: string): { from: string; to: string; label: string; partial: boolean } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = `${month}-01`;
  const today = istToday();
  if (from > today) return null; // the month has not started
  const monthEnd = `${month}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
  const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { from, to: monthEnd > today ? today : monthEnd, label, partial: monthEnd > today };
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const normalise = (r: any): AttendanceSummaryRow => ({
  user_id: String(r?.user_id ?? ''),
  name: String(r?.name || (r?.user_id ? String(r.user_id).slice(0, 8) : '—')),
  working_days: n(r?.working_days), present: n(r?.present), late: n(r?.late),
  half_day: n(r?.half_day), on_leave: n(r?.on_leave), absent: n(r?.absent),
});
/** A name that starts with = + - @ would run as a formula when the CSV is opened in a spreadsheet. */
const csvText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export default function MonthlySummary({ clientId }: { clientId: string }) {
  const currentMonth = istToday().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Worst first: the people with the most absences lead the table until the user picks another column.
  const [sort, setSort] = useState<SortState>({ key: 'absent', dir: 'desc' });
  const reqId = useRef(0);

  const range = useMemo(() => monthRange(month), [month]);
  const from = range?.from;
  const to = range?.to;

  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (!from || !to) { setRows([]); setWorkingDays(null); setError(''); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res: any = await api.getAttendanceSummary({ from, to });
      if (id !== reqId.current) return; // a newer month / client has been asked for since
      const d = res?.data && typeof res.data === 'object' && 'rows' in res.data ? res.data : res;
      setRows((Array.isArray(d?.rows) ? d.rows : []).map(normalise));
      setWorkingDays(Number.isFinite(Number(d?.working_days)) && d?.working_days != null ? Number(d.working_days) : null);
    } catch (e) {
      if (id !== reqId.current) return;
      setRows([]);
      setWorkingDays(null);
      setError((e as Error)?.message || 'Failed to load the monthly summary');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [from, to]);

  // Refetch when the month changes AND when the global client picker changes (summary is per client).
  useEffect(() => { load(); }, [load, clientId]);

  const sorted = useMemo(() => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    const key = (sort.key || 'absent') as SortKey;
    return rows
      .map((r, i) => [r, i] as const)
      .sort(([a, ai], [b, bi]) => {
        const c = key === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : a[key] - b[key];
        return c !== 0 ? c * mul : ai - bi;
      })
      .map(([r]) => r);
  }, [rows, sort]);

  const totals = useMemo(() => rows.reduce(
    (t, r) => ({ present: t.present + r.present, late: t.late + r.late, half_day: t.half_day + r.half_day, on_leave: t.on_leave + r.on_leave, absent: t.absent + r.absent }),
    { present: 0, late: 0, half_day: 0, on_leave: 0, absent: 0 },
  ), [rows]);

  // First click on a number column = biggest first; on the name column = A to Z. Clicking the active column flips it.
  const toggleSort = (k: string) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: k === 'name' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    if (!range || sorted.length === 0) return;
    const cols = ['Employee', ...COLUMNS.map((c) => c.csv)];
    const body: Array<Record<string, unknown>> = sorted.map((r) => ({
      Employee: csvText(r.name), 'Working days': r.working_days, Present: r.present, Late: r.late,
      'Half day': r.half_day, Leave: r.on_leave, Absent: r.absent,
    }));
    body.push({ Employee: 'Total', 'Working days': '', Present: totals.present, Late: totals.late, 'Half day': totals.half_day, Leave: totals.on_leave, Absent: totals.absent });
    downloadCsv(`attendance-summary-${month}`, body, cols);
  };

  const inProgress = !!range?.partial;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Month" htmlFor="att-summary-month" style={{ width: 190 }}>
          <Input id="att-summary-month" type="month" value={month} max={currentMonth} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <IconButton label="Refresh monthly summary" onClick={load} style={{ marginBottom: 2 }}>
          <RefreshCw size={16} strokeWidth={1.6} style={loading ? { animation: 'kspin 1s linear infinite' } : undefined} />
        </IconButton>
        <div style={{ flex: 1 }} />
        <Button onClick={exportCsv} disabled={loading || sorted.length === 0} icon={<Download size={16} strokeWidth={1.6} />}>Export CSV</Button>
      </div>

      {error && (
        <div role="alert" style={{ background: T.redWash, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: T.red }}>{error}</div>
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>{range ? range.label : 'Monthly summary'}</Eyebrow>
          <div style={{ fontSize: 12.5, color: T.dim }}>
            {workingDays != null ? <><span style={{ fontFamily: T.mono }}>{workingDays}</span> working days{inProgress ? ' so far' : ''} · </> : null}
            Late arrivals are counted within Present. Absent = a working day with no check-in and no approved leave.
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}><SortLabel label="Employee" sortKey="name" sort={sort} onToggle={toggleSort} /></th>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={{ ...th, textAlign: 'right' }}><SortLabel label={c.label} sortKey={c.key} sort={sort} onToggle={toggleSort} align="right" /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLUMNS.length + 1} style={{ ...td, borderBottom: 0, textAlign: 'center', color: T.mute, padding: 32 }}>Loading monthly summary…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} style={{ ...td, borderBottom: 0, padding: 0 }}>
                  <EmptyState
                    icon={<CalendarDays size={20} strokeWidth={1.6} />}
                    title={range ? `No attendance data for ${range.label}` : 'Pick a month that has started'}
                    description={range ? 'Employees appear here once the month has working days to count.' : 'The summary only covers months up to today.'}
                  />
                </td></tr>
              ) : sorted.map((r) => (
                <tr key={r.user_id || r.name} data-testid="summary-row">
                  <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ ...num, color: T.dim }}>{r.working_days}</td>
                  <td style={num}>{r.present}</td>
                  <td style={{ ...num, color: r.late > 0 ? T.warn : T.mute }}>{r.late}</td>
                  <td style={num}>{r.half_day}</td>
                  <td style={num}>{r.on_leave}</td>
                  <td style={{ ...num, color: r.absent > 0 ? T.red : T.mute, fontWeight: r.absent > 0 ? 600 : 400 }}>{r.absent}</td>
                </tr>
              ))}
            </tbody>
            {!loading && sorted.length > 0 && (
              <tfoot>
                <tr data-testid="summary-total">
                  <td style={{ ...td, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, fontWeight: 700 }}>Total</td>
                  <td style={{ ...num, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, color: T.mute }}>—</td>
                  <td style={{ ...num, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, fontWeight: 700 }}>{totals.present}</td>
                  <td style={{ ...num, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, fontWeight: 700 }}>{totals.late}</td>
                  <td style={{ ...num, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, fontWeight: 700 }}>{totals.half_day}</td>
                  <td style={{ ...num, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, fontWeight: 700 }}>{totals.on_leave}</td>
                  <td style={{ ...num, borderBottom: 0, borderTop: `1px solid ${T.borderStrong}`, fontWeight: 700 }}>{totals.absent}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
