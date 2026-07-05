'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

/**
 * Hours & Idle Time — working hours by rep against an 8-hour shift,
 * with idle minutes derived as `shift - working`. Idle is best-effort:
 * the backend doesn't expose a movement-based idle metric, so we
 * approximate idle = max(0, shiftMinutes - workingMinutes). Reps
 * checked out below the shift target read as having idled the rest.
 *
 * Data source: /api/v1/attendance/team. Demo mock fills five rows
 * with varied total_hours so the colour bands paint visibly on the
 * demo account.
 */

type Row = {
  id: string;
  name: string;
  employee_id?: string;
  checkin_at?: string | null;
  checkout_at?: string | null;
  total_hours?: number | null;
  users?: { name?: string; employee_id?: string };
};

interface Computed {
  id: string;
  name: string;
  employeeId: string;
  hours: number;
  shiftHours: number;
  idleHours: number;
  utilisationPct: number;
}

const SHIFT_HOURS = 8;

// Type-aware column sorting reads the raw computed field per column key.
const hoursVal = (r: Computed, key: string): unknown => (r as unknown as Record<string, unknown>)[key];

function pctColor(pct: number) {
  if (pct >= 85) return '#10B981';
  if (pct >= 60) return '#F59E0B';
  return '#EF4444';
}

export default function HoursIdleReport() {
  const [rows, setRows] = useState<Computed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getAttendanceTeam() as { success: boolean; data: Row[] };
        const team = res?.data ?? [];
        const computed: Computed[] = team.map((r) => {
          const hours = Number(r.total_hours ?? 0);
          const idle = Math.max(0, SHIFT_HOURS - hours);
          const util = SHIFT_HOURS > 0 ? Math.round((Math.min(hours, SHIFT_HOURS) / SHIFT_HOURS) * 100) : 0;
          return {
            id: r.id,
            name: r.users?.name || r.name || 'Unnamed',
            employeeId: r.users?.employee_id || r.employee_id || '—',
            hours,
            shiftHours: SHIFT_HOURS,
            idleHours: idle,
            utilisationPct: util,
          };
        });
        // Sort low → high so the worst utilisation surfaces at the top
        // (admins reviewing this typically want to act on idle reps first).
        computed.sort((a, b) => a.utilisationPct - b.utilisationPct);
        setRows(computed);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load hours');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportCsv = () => {
    const header = 'Name,Employee ID,Working hours,Shift hours,Idle hours,Utilisation %';
    const lines = rows.map((r) =>
      [r.name, r.employeeId, r.hours.toFixed(2), r.shiftHours, r.idleHours.toFixed(2), r.utilisationPct].join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-idle-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Initial sort mirrors the fetch's worst-utilisation-first ordering so the
  // view is unchanged until the user clicks another column.
  const { sorted, sort, toggle } = useTableSort<Computed>(rows, hoursVal, { key: 'utilisationPct', dir: 'asc' });

  if (loading) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading hours…</div>;
  if (error) return <div style={{ padding: 16, color: '#ef4444' }}>{error}</div>;

  const totalWorking = rows.reduce((s, r) => s + r.hours, 0);
  const totalIdle = rows.reduce((s, r) => s + r.idleHours, 0);
  const avgUtil = rows.length ? Math.round(rows.reduce((s, r) => s + r.utilisationPct, 0) / rows.length) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Hours &amp; Idle Time</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Working hours against a {SHIFT_HOURS}h shift. Idle ≈ shift &minus; working.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px',
            borderRadius: 8, fontWeight: 700, cursor: rows.length ? 'pointer' : 'not-allowed',
            opacity: rows.length ? 1 : 0.5, fontSize: 13,
          }}
        >
          ⬇ Export CSV
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Stat label="Team"            value={rows.length} />
        <Stat label="Working hrs"     value={totalWorking.toFixed(1)} />
        <Stat label="Idle hrs"        value={totalIdle.toFixed(1)} accent={totalIdle > 0 ? '#F59E0B' : undefined} />
        <Stat label="Avg utilisation" value={`${avgUtil}%`} accent={pctColor(avgUtil)} />
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <tr>
              <Th><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></Th>
              <Th><SortLabel label="Emp ID" sortKey="employeeId" sort={sort} onToggle={toggle} /></Th>
              <Th align="right"><SortLabel label="Working" sortKey="hours" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Idle" sortKey="idleHours" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th align="right"><SortLabel label="Utilisation" sortKey="utilisationPct" sort={sort} onToggle={toggle} align="right" /></Th>
              <Th>Progress</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <Td>{r.name}</Td>
                <Td><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-dim)' }}>{r.employeeId}</span></Td>
                <Td align="right">{r.hours.toFixed(2)}h</Td>
                <Td align="right" style={{ color: r.idleHours > 0 ? '#F59E0B' : undefined }}>{r.idleHours.toFixed(2)}h</Td>
                <Td align="right" style={{ color: pctColor(r.utilisationPct), fontWeight: 700 }}>{r.utilisationPct}%</Td>
                <Td>
                  <div style={{ height: 6, background: 'var(--s3)', borderRadius: 99, overflow: 'hidden', minWidth: 120 }}>
                    <div style={{ width: `${r.utilisationPct}%`, height: '100%', background: pctColor(r.utilisationPct), borderRadius: 99 }} />
                  </div>
                </Td>
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
