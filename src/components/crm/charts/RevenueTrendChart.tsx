'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fmtValue, fmtValueCompact, type DashboardUnit } from '../../../lib/formatCurrency';

export default function RevenueTrendChart({ data, unit = 'inr' }: { data: Array<{ period: string; revenue: number }>; unit?: DashboardUnit }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="period" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={(v) => fmtValueCompact(v, unit)} />
        <Tooltip
          contentStyle={{ background: 'color-mix(in srgb, var(--s2) 86%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.38)' }}
          labelStyle={{ color: '#E01E2C', fontWeight: 700 }}
          itemStyle={{ color: '#E01E2C' }}
          formatter={(v: any) => fmtValue(v, unit)}
        />
        <Line type="monotone" dataKey="revenue" stroke="#28B463" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
