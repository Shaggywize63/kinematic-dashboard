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
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
