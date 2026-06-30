'use client';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';

export default function DealsWonLostChart({ won, lost }: { won: number; lost: number }) {
  const data = [
    { name: 'Won', value: won, fill: '#28B463' },
    { name: 'Lost', value: lost, fill: '#E01E2C' },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" outerRadius={90} innerRadius={60} paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
        </Pie>
        <Tooltip contentStyle={{ background: 'color-mix(in srgb, var(--s2) 86%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.38)' }} labelStyle={{ color: '#E01E2C', fontWeight: 700 }} itemStyle={{ color: '#E01E2C' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
