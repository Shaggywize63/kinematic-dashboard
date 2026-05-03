'use client';
import type { ActivityHeatPoint } from '../../../types/crm';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function ActivityHeatmap({ data }: { data: ActivityHeatPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const lookup = new Map<string, number>();
  data.forEach((d) => lookup.set(`${d.day}|${d.hour}`, d.value));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
        <thead>
          <tr>
            <th></th>
            {HOURS.map((h) => (
              <th key={h} style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 500, padding: 2 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((d) => (
            <tr key={d}>
              <td style={{ fontSize: 11, color: 'var(--text-dim)', padding: '0 8px 0 0', fontWeight: 600 }}>{d}</td>
              {HOURS.map((h) => {
                const v = lookup.get(`${d}|${h}`) || 0;
                const intensity = v / max;
                return (
                  <td
                    key={h}
                    title={`${d} ${h}:00 — ${v} activities`}
                    style={{
                      width: 22, height: 22, borderRadius: 4,
                      background: v ? `rgba(0,180,216,${0.15 + intensity * 0.85})` : 'var(--s3)',
                    }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
