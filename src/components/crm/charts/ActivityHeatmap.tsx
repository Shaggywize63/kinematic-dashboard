'use client';
import { useMemo } from 'react';
import type { ActivityHeatPoint } from '../../../types/crm';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Combined heatmap: 31 days (rows) × 24 hours (columns).
// Shows date totals on the right, hour totals at the bottom, peak cell highlighted.
export default function ActivityHeatmap({ data }: { data: ActivityHeatPoint[] }) {
  const { dates, lookup, max, rowTotals, colTotals, total, activeDays, peakHour } = useMemo(() => {
    const lookup = new Map<string, number>();
    const dateSet = new Set<string>();
    let max = 0;
    for (const p of data) {
      if (typeof p.hour !== 'number') continue;
      const key = `${p.date}|${p.hour}`;
      lookup.set(key, p.count);
      dateSet.add(p.date);
      if (p.count > max) max = p.count;
    }
    const dates = Array.from(dateSet).sort(); // ascending; latest at bottom

    const rowTotals = new Map<string, number>();
    const colTotals = new Map<number, number>();
    let total = 0;
    for (const p of data) {
      if (typeof p.hour !== 'number') continue;
      total += p.count;
      rowTotals.set(p.date, (rowTotals.get(p.date) ?? 0) + p.count);
      colTotals.set(p.hour, (colTotals.get(p.hour) ?? 0) + p.count);
    }
    const activeDays = Array.from(rowTotals.values()).filter((v) => v > 0).length;

    let peakHour = 0;
    let peakHourCount = 0;
    colTotals.forEach((v, h) => {
      if (v > peakHourCount) { peakHourCount = v; peakHour = h; }
    });

    return { dates, lookup, max: Math.max(1, max), rowTotals, colTotals, total, activeDays, peakHour };
  }, [data]);

  if (dates.length === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>No activity in the last 31 days.</div>;
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    const day = d.getUTCDate().toString().padStart(2, '0');
    const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    return { day, mon, dow };
  };

  const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Stat label="Days shown" value={dates.length.toString()} />
        <Stat label="Total activities" value={total.toLocaleString()} />
        <Stat label="Active days" value={`${activeDays} / ${dates.length}`} />
        <Stat label="Peak hour (UTC)" value={fmtHour(peakHour)} />
        <Stat label="Daily avg" value={(total / Math.max(1, dates.length)).toFixed(1)} />
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 600, border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 10 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--s2)', zIndex: 2 }}>
              <th style={{ padding: '6px 10px 6px 8px', minWidth: 90, textAlign: 'left', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, borderBottom: '1px solid var(--border)' }}>Date</th>
              {HOURS.map((h) => (
                <th key={h} style={{ padding: '4px 0', minWidth: 26, color: 'var(--text-dim)', fontWeight: 600, fontSize: 9, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                  {h}
                </th>
              ))}
              <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 50 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const { day, mon, dow } = fmtDate(date);
              const rowTotal = rowTotals.get(date) ?? 0;
              const isWeekend = dow === 'Sat' || dow === 'Sun';
              return (
                <tr key={date}>
                  <td style={{
                    padding: '4px 10px 4px 8px',
                    color: isWeekend ? 'var(--text-dim)' : 'var(--text)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    background: isWeekend ? 'var(--s3)' : 'transparent',
                  }}>
                    <span style={{ fontSize: 11 }}>{day} {mon}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6 }}>{dow}</span>
                  </td>
                  {HOURS.map((h) => {
                    const count = lookup.get(`${date}|${h}`) ?? 0;
                    const intensity = count / max;
                    const bg = count
                      ? `rgba(99,102,241,${0.18 + intensity * 0.78})`
                      : (isWeekend ? 'rgba(255,255,255,0.02)' : 'transparent');
                    return (
                      <td
                        key={h}
                        title={`${date} ${fmtHour(h)} · ${count} activit${count === 1 ? 'y' : 'ies'}`}
                        style={{
                          width: 26, height: 22, borderRadius: 3,
                          background: bg,
                          textAlign: 'center', verticalAlign: 'middle',
                          fontSize: 9, fontWeight: 700,
                          color: intensity > 0.55 ? '#fff' : 'var(--text)',
                          padding: 0,
                        }}
                      >
                        {count > 0 ? count : ''}
                      </td>
                    );
                  })}
                  <td style={{
                    padding: '4px 10px',
                    textAlign: 'right',
                    color: rowTotal > 0 ? 'var(--text)' : 'var(--text-dim)',
                    fontWeight: 700,
                    fontSize: 11,
                    borderLeft: '1px solid var(--border)',
                    background: 'var(--s3)',
                  }}>
                    {rowTotal || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--s2)', zIndex: 2 }}>
            <tr>
              <td style={{ padding: '6px 10px 6px 8px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, borderTop: '1px solid var(--border)' }}>Hour total</td>
              {HOURS.map((h) => {
                const ct = colTotals.get(h) ?? 0;
                const isPeak = h === peakHour && ct > 0;
                return (
                  <td key={h} style={{
                    padding: '4px 0',
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: isPeak ? 'var(--primary)' : (ct > 0 ? 'var(--text)' : 'var(--text-dim)'),
                    borderTop: '1px solid var(--border)',
                    background: isPeak ? 'rgba(99,102,241,0.12)' : 'transparent',
                  }}>
                    {ct || ''}
                  </td>
                );
              })}
              <td style={{
                padding: '6px 10px',
                textAlign: 'right',
                color: 'var(--text)',
                fontWeight: 800,
                fontSize: 12,
                borderLeft: '1px solid var(--border)',
                borderTop: '1px solid var(--border)',
                background: 'var(--s3)',
              }}>
                {total}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((i) => (
            <span key={i} style={{
              width: 14, height: 14, borderRadius: 3,
              background: i === 0 ? 'transparent' : `rgba(99,102,241,${0.18 + i * 0.78})`,
              border: i === 0 ? '1px solid var(--border)' : 'none',
            }} />
          ))}
          <span>More</span>
        </div>
        <span>· Hours shown in UTC. Hover any cell for the exact date & hour.</span>
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
