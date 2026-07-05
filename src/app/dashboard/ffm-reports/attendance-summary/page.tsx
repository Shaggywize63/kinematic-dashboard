'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

/**
 * Attendance Summary — month-to-date attendance roll-up per rep.
 *
 * Data comes from /api/v1/attendance/team. The demo mock under
 * src/lib/demo/factoriesA.ts ships present/absent/late samples so
 * the demo account renders populated numbers without a backend.
 *
 * Each row shows: rep name, employee id, present days, late days,
 * absent days, average hours, attendance %.
 *
 * Late = checked in after 09:30 local. Half-day = total_hours < 6.
 * These thresholds match the FFM Analytics "punctuality" cut so the
 * two surfaces don't disagree on the same rep.
 */

type Row = {
  id: string;
  name: string;
  employee_id?: string;
  checkin_at?: string | null;
  checkout_at?: string | null;
  total_hours?: number | null;
  status?: string | null;
  display_status?: string | null;
  users?: { name?: string; employee_id?: string };
};

interface Summary {
  id: string;
  name: string;
  employeeId: string;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  avgHours: number;
  attendancePct: number;
}

const LATE_THRESHOLD_HOUR = 9; // 09:30
const LATE_THRESHOLD_MINUTE = 30;
const HALF_DAY_HOURS = 6;

// Type-aware column sorting reads the raw summary field per column key.
const attVal = (r: Summary, key: string): unknown => (r as unknown as Record<string, unknown>)[key];

export default function AttendanceSummaryReport() {
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getAttendanceTeam() as { success: boolean; data: Row[] };
        const team = res?.data ?? [];
        // Roll up a single day's punch into a one-row summary per rep —
        // the backend exposes one snapshot per call. A future iteration
        // can page over /attendance/history for a proper 30-day cut;
        // today this view is "today's snapshot, treated as a 1-day
        // window so the formula is at least visible".
        const summarised: Summary[] = team.map((r) => {
          const checkin = r.checkin_at ? new Date(r.checkin_at) : null;
          const hrs = Number(r.total_hours ?? 0);
          const status = (r.display_status || r.status || '').toString().toLowerCase();
          const isAbsent = status === 'absent' || status === 'leave' || (!checkin && !hrs);
          const isLate =
            !!checkin &&
            (checkin.getUTCHours() > LATE_THRESHOLD_HOUR ||
              (checkin.getUTCHours() === LATE_THRESHOLD_HOUR && checkin.getUTCMinutes() > LATE_THRESHOLD_MINUTE));
          const isHalfDay = !isAbsent && hrs < HALF_DAY_HOURS && hrs > 0;
          return {
            id: r.id,
            name: r.users?.name || r.name || 'Unnamed',
            employeeId: r.users?.employee_id || r.employee_id || '—',
            present: isAbsent ? 0 : 1,
            late: isLate ? 1 : 0,
            halfDay: isHalfDay ? 1 : 0,
            absent: isAbsent ? 1 : 0,
            avgHours: hrs,
            attendancePct: isAbsent ? 0 : isHalfDay ? 50 : 100,
          };
        });
        setRows(summarised);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load attendance');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportCsv = () => {
    const header = 'Name,Employee ID,Present,Late,Half Day,Absent,Avg Hours,Attendance %';
    const lines = rows.map((r) =>
      [r.name, r.employeeId, r.present, r.late, r.halfDay, r.absent, r.avgHours.toFixed(2), r.attendancePct].join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { sorted, sort, toggle } = useTableSort<Summary>(rows, attVal, { key: 'name', dir: 'asc' });

  if (loading) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading attendance…</div>;
  if (error) return <div style={{ padding: 16, color: '#ef4444' }}>{error}</div>;

  const total = rows.length;
  const present = rows.filter((r) => r.present === 1).length;
  const late = rows.filter((r) => r.late === 1).length;
  const absent = rows.filter((r) => r.absent === 1).length;
  const avgHours = total > 0 ? rows.reduce((s, r) => s + r.avgHours, 0) / total : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Attendance Summary</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Today&apos;s punch roll-up by rep. Late ≥ 09:30, half-day under {HALF_DAY_HOURS}h.
          </p>
        </div>
        <button
          onClick={exportCsv}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
        >
          ⬇ Export CSV
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Stat label="Team" value={total} />
        <Stat label="Present" value={present} />
        <Stat label="Late" value={late} accent={late > 0 ? '#f59e0b' : undefined} />
        <Stat label="Absent" value={absent} accent={absent > 0 ? '#ef4444' : undefined} />
        <Stat label="Avg hours" value={avgHours.toFixed(2)} />
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <tr>
              <Th><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></Th>
              <Th><SortLabel label="Emp ID" sortKey="employeeId" sort={sort} onToggle={toggle} /></Th>
              <Th align="right"><SortLabel label="Present" sortKey="present" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Late" sortKey="late" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Half day" sortKey="halfDay" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Absent" sortKey="absent" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Avg hrs" sortKey="avgHours" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Attendance" sortKey="attendancePct" sort={sort} onToggle={toggle} align="right" /></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <Td>{r.name}</Td>
                <Td><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-dim)' }}>{r.employeeId}</span></Td>
                <Td align="right">{r.present}</Td>
                <Td align="right" style={{ color: r.late > 0 ? '#f59e0b' : undefined, fontWeight: r.late > 0 ? 700 : undefined }}>{r.late}</Td>
                <Td align="right">{r.halfDay}</Td>
                <Td align="right" style={{ color: r.absent > 0 ? '#ef4444' : undefined, fontWeight: r.absent > 0 ? 700 : undefined }}>{r.absent}</Td>
                <Td align="right">{r.avgHours.toFixed(2)}</Td>
                <Td align="right">{r.attendancePct}%</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
