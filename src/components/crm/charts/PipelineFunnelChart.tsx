'use client';
import { ResponsiveContainer, Tooltip, FunnelChart, Funnel, LabelList } from 'recharts';
import type { FunnelPoint } from '../../../types/crm';

const COLORS = ['#E01E2C', '#FF6B35', '#F7B538', '#00B4D8', '#28B463', '#7B61FF'];

export default function PipelineFunnelChart({ data }: { data: FunnelPoint[] }) {
  const enriched = data.map((d, i) => ({ name: d.stage, value: d.count, fill: COLORS[i % COLORS.length] }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <FunnelChart>
        <Tooltip contentStyle={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: '#E01E2C', fontWeight: 700 }} itemStyle={{ color: '#E01E2C' }} />
        <Funnel dataKey="value" data={enriched} isAnimationActive>
          <LabelList position="right" fill="#E8EDF8" stroke="none" dataKey="name" />
          <LabelList position="center" fill="#fff" stroke="none" dataKey="value" />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
