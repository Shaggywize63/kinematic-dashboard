'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { ForecastPoint } from '../../../types/crm';
import { fmtValue, fmtValueCompact, type DashboardUnit } from '../../../lib/formatCurrency';

export default function ForecastChart({ data, unit = 'inr' }: { data: ForecastPoint[]; unit?: DashboardUnit }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <defs>
          <linearGradient id="gradPipeline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7B61FF" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#7B61FF" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradCommitted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#28B463" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#28B463" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="period" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={(v) => fmtValueCompact(v, unit)} />
        <Tooltip
          contentStyle={{ background: 'color-mix(in srgb, var(--s2) 86%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.38)' }}
          labelStyle={{ color: '#E01E2C', fontWeight: 700 }}
          itemStyle={{ color: '#E01E2C' }}
          formatter={(v: any) => fmtValue(v, unit)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="pipeline" stroke="#7B61FF" fill="url(#gradPipeline)" name="Pipeline" />
        <Area type="monotone" dataKey="best_case" stroke="#00B4D8" fillOpacity={0} strokeWidth={2} name="Best Case" />
        <Area type="monotone" dataKey="committed" stroke="#28B463" fill="url(#gradCommitted)" name="Committed" />
        <Area type="monotone" dataKey="closed" stroke="#F7B538" fillOpacity={0} strokeWidth={2} name="Closed" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
