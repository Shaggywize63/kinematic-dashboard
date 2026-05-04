'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function SalesCycleChart({ data }: { data: Array<{ stage: string; avg_days: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="stage" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} unit="d" />
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8 }} />
        <Line type="monotone" dataKey="avg_days" stroke="#00B4D8" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
