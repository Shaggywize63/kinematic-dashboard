'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { ForecastPoint } from '../../../types/crm';
import { fmtValue, fmtValueCompact, type DashboardUnit } from '../../../lib/formatCurrency';
import { CHART, CHART_SEMANTIC, seriesColor, GLASS_TOOLTIP } from '../../../lib/chartTheme';

export default function ForecastChart({ data, unit = 'inr' }: { data: ForecastPoint[]; unit?: DashboardUnit }) {
  const pipelineC = seriesColor(0);
  const committedC = CHART_SEMANTIC.won;
  const bestC = seriesColor(4);
  const closedC = CHART_SEMANTIC.risk;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={CHART.margin}>
        <defs>
          <linearGradient id="gradPipeline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={pipelineC} stopOpacity={0.5} />
            <stop offset="95%" stopColor={pipelineC} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradCommitted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={committedC} stopOpacity={0.5} />
            <stop offset="95%" stopColor={committedC} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid {...CHART.grid} />
        <XAxis dataKey="period" {...CHART.axis} />
        <YAxis {...CHART.axis} tickFormatter={(v) => fmtValueCompact(v, unit)} />
        <Tooltip
          contentStyle={GLASS_TOOLTIP}
          labelStyle={{ color: 'var(--text)', fontWeight: 700 }}
          itemStyle={{ color: 'var(--text-dim)' }}
          formatter={(v: any) => fmtValue(v, unit)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="pipeline" stroke={pipelineC} fill="url(#gradPipeline)" name="Pipeline" />
        <Area type="monotone" dataKey="best_case" stroke={bestC} fillOpacity={0} strokeWidth={2} name="Best Case" />
        <Area type="monotone" dataKey="committed" stroke={committedC} fill="url(#gradCommitted)" name="Committed" />
        <Area type="monotone" dataKey="closed" stroke={closedC} fillOpacity={0} strokeWidth={2} name="Closed" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
