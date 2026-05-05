'use client';
import type { ActivityHeatPoint } from '../../../types/crm';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// 31-day calendar heatmap. Each cell = one date, intensity = activity count.
export default function ActivityHeatmap({ data }: { data: ActivityHeatPoint[] }) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>No activity in the last 31 days.</div>;
  }
  const max = Math.max(1, ...sorted.map((d) => d.count));

  const first = new Date(sorted[0].date + 'T00:00:00Z');
  const firstDow = (first.getUTCDay() + 6) % 7;
  const cells: Array<{ date: string; count: number } | null> = Array(firstDow).fill(null);
  sorted.forEach((d) => cells.push(d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<{ date: string; count: number } | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const totalCount = sorted.reduce((s, d) => s + d.count, 0);
  const activeDays = sorted.filter((d) => d.count > 0).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <Stat label="Days shown" value={sorted.length.toString()} />
        <Stat label="Total activities" value={totalCount.toLocaleString()} />
        <Stat label="Active days" value={`${activeDays} / ${sorted.length}`} />
        <Stat label="Daily avg" value={(totalCount / Math.max(1, sorted.length)).toFixed(1)} />
        <Stat label="Peak day" value={String(max)} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
          <thead>
            <tr>
              <th></th>
              {DOW.map((d) => (
                <th key={d} style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, padding: '0 0 4px', textAlign: 'center', minWidth: 38 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                <td style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, padding: '0 8px 0 0' }}>W{wi + 1}</td>
                {week.map((cell, ci) => {
                  if (!cell) return <td key={ci} style={{ width: 38, height: 38 }} />;
                  const intensity = cell.count / max;
                  const bg = cell.count
                    ? `rgba(99,102,241,${0.20 + intensity * 0.75})`
                    : 'var(--s3)';
                  const dateNum = new Date(cell.date + 'T00:00:00Z').getUTCDate();
                  return (
                    <td
                      key={ci}
                      title={`${cell.date} · ${cell.count} activit${cell.count === 1 ? 'y' : 'ies'}`}
                      style={{
                        width: 38, height: 38, borderRadius: 6,
                        background: bg,
                        border: `1px solid ${cell.count ? 'transparent' : 'var(--border)'}`,
                        textAlign: 'center', verticalAlign: 'middle',
                        fontSize: 11, fontWeight: 600,
                        color: intensity > 0.5 ? '#fff' : 'var(--text)',
                        padding: 0,
                      }}
                    >
                      <div>{dateNum}</div>
                      {cell.count > 0 && (
                        <div style={{ fontSize: 9, opacity: 0.85 }}>{cell.count}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)' }}>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: i === 0 ? 'var(--s3)' : `rgba(99,102,241,${0.20 + i * 0.75})`, border: i === 0 ? '1px solid var(--border)' : 'none' }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--s3)', padding: '6px 12px', borderRadius: 8, minWidth: 90 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
