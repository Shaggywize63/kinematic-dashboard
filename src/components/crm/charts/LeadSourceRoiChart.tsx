'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { SourceROIRow } from '../../../types/crm';

export default function LeadSourceRoiChart({ data }: { data: SourceROIRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="source" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} />
        <Tooltip contentStyle={{ background: 'color-mix(in srgb, var(--s2) 86%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.38)' }} labelStyle={{ color: '#E01E2C', fontWeight: 700 }} itemStyle={{ color: '#E01E2C' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" fill="#28B463" name="Revenue" />
        <Bar dataKey="cost" fill="#E01E2C" name="Cost" />
      </BarChart>
    </ResponsiveContainer>
  );
}
