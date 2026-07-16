'use client';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { CHART_SEMANTIC, GLASS_TOOLTIP } from '../../../lib/chartTheme';

export default function DealsWonLostChart({ won, lost }: { won: number; lost: number }) {
  const data = [
    { name: 'Won', value: won, fill: CHART_SEMANTIC.won },
    { name: 'Lost', value: lost, fill: CHART_SEMANTIC.lost },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" outerRadius={90} innerRadius={60} paddingAngle={2} stroke="var(--s2)" strokeWidth={2}>
          {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
        </Pie>
        <Tooltip contentStyle={GLASS_TOOLTIP} labelStyle={{ color: 'var(--text)', fontWeight: 700 }} itemStyle={{ color: 'var(--text-dim)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
