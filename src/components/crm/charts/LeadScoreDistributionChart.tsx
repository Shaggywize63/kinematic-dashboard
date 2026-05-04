'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import type { ScoreDistributionPoint } from '../../../types/crm';

const GRADE_COLORS: Record<string, string> = { A: '#28B463', B: '#7B61FF', C: '#F7B538', D: '#E01E2C' };

export default function LeadScoreDistributionChart({ data }: { data: ScoreDistributionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="bucket" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} />
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8 }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={GRADE_COLORS[d.grade] || '#666'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
