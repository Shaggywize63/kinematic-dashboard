'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatINR, formatINRCompact } from '../../../lib/formatCurrency';

export default function RevenueTrendChart({ data }: { data: Array<{ period: string; revenue: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="period" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={(v) => formatINRCompact(v)} />
        <Tooltip
          contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8 }}
          labelStyle={{ color: '#E01E2C', fontWeight: 700 }}
          itemStyle={{ color: '#E01E2C' }}
          formatter={(v: any) => formatINR(v)}
        />
        <Line type="monotone" dataKey="revenue" stroke="#28B463" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
