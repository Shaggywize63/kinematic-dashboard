'use client';
// The incentive plan, read-only, with a plain statement that it is company policy and sample data.

import { Badge, Card, CardTitle, KeyValue, Note, type Col } from '../ui';
import { DataTable } from './common';
import { fmtDate } from '../../../lib/hrms/format';
import type { IncentivePlan } from '../../../lib/hrms/field/types';

export default function PlanCard({ plan }: { plan: IncentivePlan }) {
  const cols: Col<IncentivePlan['bands'][number] & { id: string }>[] = [
    { key: 'band', label: 'Share of target', render: (b) => (b.to == null ? `Above ${b.from}%` : `${b.from}% to ${b.to}%`) },
    { key: 'rate', label: 'Rate on revenue in this band', align: 'right', render: (b) => (b.rate === 0 ? 'Nothing' : `${(b.rate * 100).toFixed(1).replace(/\.0$/, '')}%`) },
  ];
  return (
    <div data-testid="plan-card">
      <Card>
        <CardTitle right={<Badge tone="warn">Sample company policy</Badge>}>{plan.name}</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Note tone="warn">
            This plan is company policy, not a rule of law, and the numbers here are a sample written for the preview. It is shown so you can see how the screen works. It cannot be edited here.
          </Note>
          <KeyValue columns={3} rows={[
            { label: 'Effective from', value: fmtDate(plan.effectiveFrom) },
            { label: 'A deal pays once collected at least', value: `${plan.minCollectionPct}%` },
            { label: 'Clawback window', value: `${plan.clawbackWindowDays} days after closing` },
          ]} />
          <DataTable columns={cols} rows={plan.bands.map((b, i) => ({ ...b, id: `b${i}` }))} minWidth={360} />
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{plan.note}</div>
        </div>
      </Card>
    </div>
  );
}
