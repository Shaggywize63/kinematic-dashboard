'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import type { ScoreDistributionPoint } from '../../../types/crm';
import { GLASS_TOOLTIP, GradientDefs, grad, CHART, CHART_SEMANTIC } from '../../../lib/chartTheme';

// A (best) → D (worst): green → amber → red, sharing the kit's semantic ramp.
const GRADE_COLORS: Record<string, string> = {
  A: CHART_SEMANTIC.won, B: '#6366F1', C: CHART_SEMANTIC.risk, D: CHART_SEMANTIC.lost,
};
const GRADE_LIST = Object.values(GRADE_COLORS);

export default function LeadScoreDistributionChart({ data }: { data: ScoreDistributionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={CHART.margin}>
        <GradientDefs colors={GRADE_LIST} />
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="bucket" {...CHART.axis} />
        <YAxis {...CHART.axis} />
        <Tooltip contentStyle={GLASS_TOOLTIP} cursor={{ fill: 'var(--s3)', opacity: 0.4 }} />
        <Bar dataKey="count" radius={CHART.barRadius} {...CHART.animation}>
          {data.map((d, i) => (
            <Cell key={i} fill={grad(GRADE_COLORS[d.grade] || '#666')} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
