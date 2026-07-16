'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { SourceROIRow } from '../../../types/crm';
import { CHART, CHART_SEMANTIC, GLASS_TOOLTIP } from '../../../lib/chartTheme';

export default function LeadSourceRoiChart({ data }: { data: SourceROIRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={CHART.margin}>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="source" {...CHART.axis} />
        <YAxis {...CHART.axis} />
        <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.25 }} contentStyle={GLASS_TOOLTIP} labelStyle={{ color: 'var(--text)', fontWeight: 700 }} itemStyle={{ color: 'var(--text-dim)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" fill={CHART_SEMANTIC.won} name="Revenue" radius={CHART.barRadius} />
        <Bar dataKey="cost" fill={CHART_SEMANTIC.risk} name="Cost" radius={CHART.barRadius} />
      </BarChart>
    </ResponsiveContainer>
  );
}
