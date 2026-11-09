'use client';
// Attrition: exits by month and the rolling 12-month rate, from employees (exited or on notice, with a last working
// date) and the exit cases in Lifecycle. The formula is written out with this month's real numbers.

import Link from 'next/link';
import { Badge, Card, CardTitle, DataTable, Stat, StatGrid, T, type Col } from '../ui';
import { fmtDate, fmtMonth } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import { attritionSeries, exitRecords, fiscalMonths, type ExitRecord } from '../../../lib/hrms/hiring/engines';
import { ColumnChart, Legend, LineChart } from './charts';
import { deptName, empName, subtle } from './shared';

const short = (m: string) => fmtMonth(m).slice(0, 3);

export default function PlanningAttrition({ db }: { db: HrmsDb }) {
  const months = fiscalMonths();
  const recs = exitRecords(db.employees, db.exits, PREVIEW_TODAY);
  const series = attritionSeries(db.employees, recs, months, PREVIEW_TODAY);
  const past = series.filter((p) => p.rate != null);
  const now = past[past.length - 1];
  const serving = recs.filter((r) => r.kind === 'serving');
  const left12 = now?.exits12 ?? 0;
  const withNotice = now && now.averageHc ? ((left12 + serving.length) / now.averageHc) * 100 : null;

  const cols: Col<ExitRecord & { id: string }>[] = [
    { key: 'n', label: 'Person', sortValue: (r) => empName(db, r.employeeId), render: (r) => <Link href={`/dashboard/hrms/employees/${r.employeeId}`} style={{ color: T.text, fontWeight: 600, textDecoration: 'none' }}>{empName(db, r.employeeId)}</Link> },
    { key: 'd', label: 'Department', render: (r) => deptName(db, r.departmentId) },
    { key: 'l', label: 'Last working date', nowrap: true, sortValue: (r) => r.lastWorkingDate, render: (r) => fmtDate(r.lastWorkingDate) },
    { key: 's', label: 'Status', nowrap: true, render: (r) => <Badge tone={r.kind === 'left' ? 'neutral' : 'warn'} dot>{r.kind === 'left' ? 'Left' : 'Serving notice'}</Badge> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="attrition">
      <StatGrid>
        <div data-testid="stat-rate"><Stat label="Rolling 12-month rate" value={now?.rate == null ? '—' : `${now.rate}%`} hint={`${left12} left in the 12 months to ${fmtDate(PREVIEW_TODAY)}`} /></div>
        <div data-testid="stat-serving"><Stat label="Serving notice" value={serving.length} tone={serving.length ? 'warn' : undefined} hint={withNotice == null ? undefined : `Rate would be ${withNotice.toFixed(1)}% when they leave`} /></div>
        <Stat label="Average headcount" value={now ? now.averageHc.toFixed(1) : '—'} hint={now ? `${now.openingHc} a year ago, ${now.closingHc} now` : undefined} />
      </StatGrid>

      <Card padding={16}>
        <CardTitle>The formula, with these numbers</CardTitle>
        <p data-testid="attrition-formula" style={{ margin: 0, fontSize: 13.5, color: T.text, lineHeight: 1.65 }}>
          Attrition rate = people who left in the last 12 months ÷ average headcount × 100. Average headcount is the headcount a year ago plus the headcount now, divided by two.
          {now && <> For the 12 months to {fmtDate(PREVIEW_TODAY)}: <b>{left12}</b> left ÷ (<b>{now.openingHc}</b> + <b>{now.closingHc}</b>) ÷ 2 = <b>{now.averageHc.toFixed(1)}</b> average, so <b>{now.rate}%</b>.</>}
        </p>
        <p style={{ ...subtle, margin: '8px 0 0' }}>A person counts as having left on their last working date. People serving notice are shown separately and are not in the rate until that date passes. This uses the same method as the HR overview.</p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 14 }}>
        <Card padding={16}>
          <CardTitle>Exits by month</CardTitle>
          <Legend items={[{ label: 'Left', color: 'var(--hv-1)', box: true }, { label: 'Serving notice (leaving on a set date)', color: 'var(--hv-2)', box: true }]} />
          <ColumnChart testId="exits-chart" ariaLabel="Exits by month in the financial year" labels={months.map(short)} showValues={false} height={190}
            stacks={[{ id: 'left', label: 'left', color: 'var(--hv-1)', values: series.map((p) => p.left) }, { id: 'serving', label: 'serving notice', color: 'var(--hv-2)', values: series.map((p) => p.serving) }]} />
        </Card>
        <Card padding={16}>
          <CardTitle>Rolling 12-month rate</CardTitle>
          <LineChart testId="rate-chart" ariaLabel="Rolling 12-month attrition rate by month" height={190} yMin={0} xLabels={months.map(short)} format={(n) => `${n}%`}
            series={[{ id: 'rate', label: 'Rolling 12-month rate', color: 'var(--hv-1)', values: series.map((p) => p.rate) }]} />
        </Card>
      </div>

      <Card padding={16}>
        <CardTitle>Month by month</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="attrition-table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead><tr>{['Month', 'Left', 'Serving notice', 'Left in 12 months', 'Average headcount', 'Rate'].map((h, i) => <th key={h} scope="col" style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.month}><td style={td}>{fmtMonth(p.month)}</td><td style={{ ...td, textAlign: 'right' }}>{p.left}</td><td style={{ ...td, textAlign: 'right' }}>{p.serving}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.rate == null ? '—' : p.exits12}</td><td style={{ ...td, textAlign: 'right' }}>{p.rate == null ? '—' : p.averageHc.toFixed(1)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{p.rate == null ? '—' : `${p.rate}%`}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding={16}>
        <CardTitle>Exits and notices</CardTitle>
        <DataTable columns={cols} rows={recs.map((r) => ({ ...r, id: r.employeeId }))} minWidth={520} empty="No exits recorded." />
        <p style={{ ...subtle, margin: '10px 0 0' }}>From employee records and exit cases in <Link href="/dashboard/hrms/lifecycle?tab=exits" style={{ color: T.info }}>Lifecycle</Link>. Reasons for leaving are not shown here: they belong to the exit interview, not to a planning number.</p>
      </Card>
    </div>
  );
}
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}`, fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' };
