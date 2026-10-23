'use client';
/**
 * Attendance → "Monthly summary": one row per employee with their Present / Late / Half-day / Leave / Absent
 * counts for a chosen date range, from GET /api/v1/attendance/summary?from&to. The range is picked with the
 * shared presets (This week / 14 days / This month / Custom); it defaults to this calendar month-to-date. Late
 * is a subset of Present (a late arrival is still a present day). Sortable (worst offenders first by default)
 * and exportable as CSV.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, Download, RefreshCw, Search } from 'lucide-react';
import api, { type AttendanceSummaryRow } from '../../../lib/api';
import { downloadCsv } from '../../../lib/exportCsv';
import { SortLabel, type SortState } from '../../../lib/tableSort';
import { Button, Card, EmptyState, Eyebrow, IconButton, Input, T } from '../../../components/ui';
import { RangePresetPicker, presetRange, istToday } from '../../../components/attendance/RangePresets';

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

/** Human label for a from..to range, e.g. "1 Oct – 16 Oct 2026". */
function rangeLabel(from: string, to: string): string {
  const parse = (s: string) => new Date(s + 'T00:00:00Z');
  const base: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const f = parse(from);
  const t = parse(to);
  if (from === to) return `${f.toLocaleDateString('en-IN', base)} ${t.getUTCFullYear()}`;
  return `${f.toLocaleDateString('en-IN', base)} – ${t.toLocaleDateString('en-IN', { ...base, year: 'numeric' })}`;
}

/** A thin stacked bar of how the person's working days went — present / half / leave / absent. Decorative: the numbers are in the row. */
function MixBar({ r }: { r: AttendanceSummaryRow }) {
  const total = r.present + r.half_day + r.on_leave + r.absent;
  if (total <= 0) return null;
  const seg = (v: number, color: string) => (v > 0 ? <span style={{ width: `${(v / total) * 100}%`, background: color }} /> : null);
  return (
    <span aria-hidden title={`${r.present} present · ${r.half_day} half day · ${r.on_leave} leave · ${r.absent} absent`} style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 5, maxWidth: 150, background: 'var(--s4)' }}>
      {seg(r.present, 'var(--ok)')}{seg(r.half_day, 'var(--warn)')}{seg(r.on_leave, 'var(--info)')}{seg(r.absent, 'var(--red)')}
    </span>
  );
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

/** Opens one person's day-by-day view (a calendar plus times) for the range on screen. */
export interface PersonRequest { userId: string; name: string; from: string; to: string }

export default function MonthlySummary({ clientId, onOpenPerson }: { clientId: string; onOpenPerson?: (p: PersonRequest) => void }) {
  // Default to this calendar month-to-date; the user can switch to any preset or a custom range.
  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo] = useState(() => presetRange('month').to);
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  // Worst first: the people with the most absences lead the table until the user picks another column.
  const [sort, setSort] = useState<SortState>({ key: 'absent', dir: 'desc' });
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (!from || !to) { setRows([]); setWorkingDays(null); setError(''); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res: any = await api.getAttendanceSummary({ from, to });
      if (id !== reqId.current) return; // a newer range / client has been asked for since
      const d = res?.data && typeof res.data === 'object' && 'rows' in res.data ? res.data : res;
      setRows((Array.isArray(d?.rows) ? d.rows : []).map(normalise));
      setWorkingDays(Number.isFinite(Number(d?.working_days)) && d?.working_days != null ? Number(d.working_days) : null);
    } catch (e) {
      if (id !== reqId.current) return;
      setRows([]);
      setWorkingDays(null);
      setError((e as Error)?.message || 'Failed to load the summary');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [from, to]);

  // Refetch when the range changes AND when the global client picker changes (summary is per client).
  useEffect(() => { load(); }, [load, clientId]);

  const sorted = useMemo(() => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    const key = (sort.key || 'absent') as SortKey;
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
      .map((r, i) => [r, i] as const)
      .sort(([a, ai], [b, bi]) => {
        const c = key === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : a[key] - b[key];
        return c !== 0 ? c * mul : ai - bi;
      })
      .map(([r]) => r);
  }, [rows, sort, q]);

  // The totals row follows what is listed, so a search narrows it too.
  const totals = useMemo(() => sorted.reduce(
    (t, r) => ({ present: t.present + r.present, late: t.late + r.late, half_day: t.half_day + r.half_day, on_leave: t.on_leave + r.on_leave, absent: t.absent + r.absent }),
    { present: 0, late: 0, half_day: 0, on_leave: 0, absent: 0 },
  ), [sorted]);

  // First click on a number column = biggest first; on the name column = A to Z. Clicking the active column flips it.
  const toggleSort = (k: string) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: k === 'name' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    if (sorted.length === 0) return;
    const cols = ['Employee', ...COLUMNS.map((c) => c.csv)];
    const body: Array<Record<string, unknown>> = sorted.map((r) => ({
      Employee: csvText(r.name), 'Working days': r.working_days, Present: r.present, Late: r.late,
      'Half day': r.half_day, Leave: r.on_leave, Absent: r.absent,
    }));
    body.push({ Employee: 'Total', 'Working days': '', Present: totals.present, Late: totals.late, 'Half day': totals.half_day, Leave: totals.on_leave, Absent: totals.absent });
    downloadCsv(`attendance-summary-${from}_to_${to}`, body, cols);
  };

  const label = rangeLabel(from, to);
  const inProgress = to === istToday();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <RangePresetPicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} idPrefix="msum" />
        </div>
        <div style={{ position: 'relative', width: 220, marginBottom: 2 }}>
          <Search size={15} strokeWidth={1.6} aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees…" aria-label="Search employees" style={{ paddingLeft: 34 }} />
        </div>
        <IconButton label="Refresh monthly summary" onClick={load} style={{ marginBottom: 2 }}>
          <RefreshCw size={16} strokeWidth={1.6} style={loading ? { animation: 'kspin 1s linear infinite' } : undefined} />
        </IconButton>
        <Button onClick={exportCsv} disabled={loading || sorted.length === 0} icon={<Download size={16} strokeWidth={1.6} />}>Export CSV</Button>
      </div>

      {error && (
        <div role="alert" style={{ background: T.redWash, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: T.red }}>{error}</div>
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>{label}</Eyebrow>
          <div style={{ fontSize: 12.5, color: T.dim }}>
            {workingDays != null ? <><span style={{ fontFamily: T.mono }}>{workingDays}</span> working days{inProgress ? ' so far' : ''} · </> : null}
            Late arrivals are counted within Present. Absent = a working day with no check-in and no approved leave.{onOpenPerson ? ' Click a name to see their days.' : ''}
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
                <tr><td colSpan={COLUMNS.length + 1} style={{ ...td, borderBottom: 0, textAlign: 'center', color: T.mute, padding: 32 }}>Loading summary…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} style={{ ...td, borderBottom: 0, padding: 0 }}>
                  <EmptyState
                    icon={<CalendarDays size={20} strokeWidth={1.6} />}
                    title={q.trim() && rows.length > 0 ? 'No employee matches your search' : `No attendance data for ${label}`}
                    description={q.trim() && rows.length > 0 ? 'Try another name.' : 'Employees appear here once the range has working days to count.'}
                  />
                </td></tr>
              ) : sorted.map((r) => (
                <tr key={r.user_id || r.name} data-testid="summary-row">
                  <td style={{ ...td, fontWeight: 500 }}>
                    {onOpenPerson && r.user_id ? (
                      <button type="button" className="att-name" onClick={() => onOpenPerson({ userId: r.user_id, name: r.name, from, to })} title="See this person's days" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 500, color: T.text, cursor: 'pointer', textAlign: 'left' }}>{r.name}</button>
                    ) : r.name}
                    <MixBar r={r} />
                  </td>
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
