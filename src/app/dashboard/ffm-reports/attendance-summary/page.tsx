'use client';
import { useEffect, useRef, useState } from 'react';
import api from '../../../../lib/api';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { RangePresetPicker, presetRange, istToday } from '../../../../components/attendance/RangePresets';

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
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Type-aware column sorting reads the raw summary field per column key.
const attVal = (r: Summary, key: string): unknown => (r as unknown as Record<string, unknown>)[key];

export default function AttendanceSummaryReport() {
  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo] = useState(() => presetRange('month').to);
  const [rows, setRows] = useState<Summary[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
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
        const res = (await api.getAttendanceSummary({ from, to })) as { success: boolean; data: any };
        if (id !== reqId.current) return;
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
    const header = 'Name,Working Days,Present,Late,Half Day,Leave,Absent,Attendance %';
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = sorted.map((r) =>
      [r.name, r.workingDays, r.present, r.late, r.halfDay, r.onLeave, r.absent, r.attendancePct].map(esc).join(','),
    );
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
          </div>

          <div style={{ overflowX: 'auto', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>Loading attendance…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>No attendance data for the selected range.</td></tr>
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
                  </tr>
                ))}
              </tbody>
            </table>
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
