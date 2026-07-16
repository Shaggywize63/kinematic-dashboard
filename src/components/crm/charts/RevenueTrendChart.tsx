'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fmtValue, fmtValueCompact, type DashboardUnit } from '../../../lib/formatCurrency';
import { CHART, CHART_SEMANTIC, GLASS_TOOLTIP } from '../../../lib/chartTheme';

export default function RevenueTrendChart({ data, unit = 'inr' }: { data: Array<{ period: string; revenue: number }>; unit?: DashboardUnit }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={CHART.margin}>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="period" {...CHART.axis} />
        <YAxis {...CHART.axis} tickFormatter={(v) => fmtValueCompact(v, unit)} />
        <Tooltip
          contentStyle={GLASS_TOOLTIP}
          labelStyle={{ color: 'var(--text)', fontWeight: 700 }}
          itemStyle={{ color: 'var(--text-dim)' }}
          formatter={(v: any) => fmtValue(v, unit)}
        />
        <Line type="monotone" dataKey="revenue" stroke={CHART_SEMANTIC.won} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
