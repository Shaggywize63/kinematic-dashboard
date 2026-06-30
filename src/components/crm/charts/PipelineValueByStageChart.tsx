'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import type { PipelineValuePoint } from '../../../types/crm';
import { fmtValue, fmtValueCompact, type DashboardUnit } from '../../../lib/formatCurrency';
import { CHART_PALETTE, GLASS_TOOLTIP, GradientDefs, grad, CHART } from '../../../lib/chartTheme';

const COLORS = CHART_PALETTE;

export default function PipelineValueByStageChart({ data, unit = 'inr' }: { data: PipelineValuePoint[]; unit?: DashboardUnit }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={CHART.margin}>
        <GradientDefs colors={COLORS} />
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="stage" {...CHART.axis} />
        <YAxis {...CHART.axis} tickFormatter={(v) => fmtValueCompact(v, unit)} />
        <Tooltip
          contentStyle={GLASS_TOOLTIP}
          cursor={{ fill: 'var(--s3)', opacity: 0.4 }}
          formatter={(v: any) => fmtValue(v, unit)}
        />
        <Bar dataKey="value" radius={CHART.barRadius} {...CHART.animation}>
          {data.map((_, i) => (
            <Cell key={i} fill={grad(COLORS[i % COLORS.length])} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
