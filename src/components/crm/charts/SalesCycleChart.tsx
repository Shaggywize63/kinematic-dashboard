'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { CHART, seriesColor, GLASS_TOOLTIP } from '../../../lib/chartTheme';

export default function SalesCycleChart({ data }: { data: Array<{ stage: string; avg_days: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={CHART.margin}>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="stage" {...CHART.axis} />
        <YAxis {...CHART.axis} unit="d" />
        <Tooltip contentStyle={GLASS_TOOLTIP} labelStyle={{ color: 'var(--text)', fontWeight: 700 }} itemStyle={{ color: 'var(--text-dim)' }} />
        <Line type="monotone" dataKey="avg_days" stroke={seriesColor(4)} strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
