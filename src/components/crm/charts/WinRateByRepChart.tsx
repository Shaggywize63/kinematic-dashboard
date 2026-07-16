'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import type { WinRatePoint } from '../../../types/crm';
import { CHART, CHART_SEMANTIC, GLASS_TOOLTIP } from '../../../lib/chartTheme';

export default function WinRateByRepChart({ data }: { data: WinRatePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={CHART.margin}>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="bucket" {...CHART.axis} />
        <YAxis {...CHART.axis} />
        <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.25 }} contentStyle={GLASS_TOOLTIP} labelStyle={{ color: 'var(--text)', fontWeight: 700 }} itemStyle={{ color: 'var(--text-dim)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="won" stackId="a" fill={CHART_SEMANTIC.won} name="Won" />
        <Bar dataKey="lost" stackId="a" fill={CHART_SEMANTIC.lost} name="Lost" radius={CHART.barRadius} />
      </BarChart>
    </ResponsiveContainer>
  );
}
