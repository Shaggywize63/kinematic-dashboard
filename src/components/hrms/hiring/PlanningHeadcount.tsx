'use client';
// Plan vs actual headcount by department or location, month by month for the financial year. Plan is seeded and
// editable; actual comes from the employees' join and last working dates; committed adds known joiners and leavers.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Toolbar, T, type Col } from '../ui';
import { Segmented, Select } from '../../ui';
import { fmtMonth } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { HiringState, Id } from '../../../lib/hrms/hiring/types';
import { FY_END, fiscalMonths, groupRows, monthlySeries, openSeats, type GroupRow, type PlanInput } from '../../../lib/hrms/hiring/engines';
import { LineChart, Legend } from './charts';
import { Lead, Row, subtle } from './shared';
import EditPlanModal from './EditPlanModal';

const THIS_MONTH = PREVIEW_TODAY.slice(0, 7);
const short = (m: string) => fmtMonth(m).slice(0, 3);
const gapColor = (g: number) => (g < 0 ? T.warn : g > 0 ? T.info : T.dim);
const signed = (g: number) => (g > 0 ? `+${g}` : String(g));

export default function PlanningHeadcount({ db, st }: { db: HrmsDb; st: HiringState }) {
  const [by, setBy] = useState<'department' | 'location'>('department');
  const [month, setMonth] = useState(THIS_MONTH);
  const [focus, setFocus] = useState<'all' | Id>('all');
  const [editing, setEditing] = useState(false);
  const months = fiscalMonths();
  const input: PlanInput = { plan: st.plan, employees: db.employees, openings: st.openings, today: PREVIEW_TODAY };
  const groups = by === 'department' ? db.departments.map((d) => ({ id: d.id, name: d.name })) : db.locations.map((l) => ({ id: l.id, name: l.name }));
  const nameOf = (id: Id) => groups.find((g) => g.id === id)?.name ?? id;
  const rows = groupRows(input, by, month, groups.map((g) => g.id));
  const filterFor = (id: Id) => (by === 'department' ? { departmentId: id } : { locationId: id });
  const total = monthlySeries(input, {}, [month])[0]!;
  const past = month <= THIS_MONTH;

  const cols: Col<GroupRow>[] = [
    { key: 'g', label: by === 'department' ? 'Department' : 'Location', sortValue: (r) => nameOf(r.key), render: (r) => <span style={{ fontWeight: 600 }}>{nameOf(r.key)}</span> },
    { key: 'plan', label: 'Planned', align: 'right', sortValue: (r) => r.plan, render: (r) => r.plan },
    { key: 'actual', label: past ? 'Actual' : 'Committed', align: 'right', sortValue: (r) => r.actual, render: (r) => r.actual },
    { key: 'gap', label: 'Gap', align: 'right', sortValue: (r) => r.gap, render: (r) => <b style={{ color: gapColor(r.gap) }}>{signed(r.gap)}</b> },
    { key: 'committed', label: 'Committed by month end', align: 'right', nowrap: true, render: (r) => r.committed },
    { key: 'open', label: 'Open seats (approved)', align: 'right', nowrap: true, sortValue: (r) => r.openSeats, render: (r) => r.openSeats },
  ];
  const footer = (
    <tfoot><tr style={{ background: T.panel }}>
      <td style={ft}>Company</td><td style={{ ...ft, textAlign: 'right' }}>{total.plan}</td><td style={{ ...ft, textAlign: 'right' }}>{past ? total.actual : total.committed}</td>
      <td style={{ ...ft, textAlign: 'right', color: gapColor(total.gap) }}>{signed(total.gap)}</td><td style={{ ...ft, textAlign: 'right' }}>{total.committed}</td><td style={{ ...ft, textAlign: 'right' }}>{openSeats(st.openings, {})}</td>
    </tr></tfoot>
  );

  const focusSeries = monthlySeries(input, focus === 'all' ? {} : filterFor(focus), months);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <Segmented value={by} onChange={(v) => { setBy(v); setFocus('all'); }} options={[{ value: 'department', label: 'By department' }, { value: 'location', label: 'By location' }]} />
        <div style={{ width: 170 }}><Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}</Select></div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" onClick={() => setEditing(true)}>Edit plan</Button>
      </Toolbar>

      <Card padding={16}>
        <CardTitle right={<Badge tone={past ? 'info' : 'neutral'}>{past ? (month === THIS_MONTH ? 'Actual as of today' : 'Actual at month end') : 'Future month: committed only'}</Badge>}>Plan vs actual, {fmtMonth(month)}</CardTitle>
        <Lead>Planned is the headcount you meant to have. Actual is who was on the payroll. Gap is actual (or committed, for a future month) minus planned: a negative gap means short of plan. Committed adds people with a joining date and takes out people with a last working date.</Lead>
        <div data-testid="plan-table"><DataTable columns={cols} rows={rows.map((r) => ({ ...r, id: r.key }))} minWidth={640} footer={footer} empty="No plan lines yet." /></div>
      </Card>

      <div data-testid="dept-charts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
        {groups.filter((g) => rows.some((r) => r.key === g.id)).map((g) => {
          const s = monthlySeries(input, filterFor(g.id), months);
          const cur = s.find((p) => p.month === month)!;
          return (
            <Card key={g.id} padding={16}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 14, fontWeight: 700, color: T.text }}>{g.name}</h3>
                <span style={{ fontSize: 12.5, color: T.dim }}>{short(month)}: plan {cur.plan}, {cur.actual != null ? 'actual' : 'committed'} {cur.actual ?? cur.committed}, <b style={{ color: gapColor(cur.gap) }}>gap {signed(cur.gap)}</b></span>
              </div>
              <Legend items={[{ label: 'Plan', color: 'var(--hv-1)' }, { label: 'Actual', color: 'var(--hv-2)' }, { label: 'Committed', color: 'var(--hv-2)', dashed: true }]} />
              <LineChart ariaLabel={`${g.name}: planned, actual and committed headcount by month`} height={170} xLabels={s.map((p) => short(p.month))} yMin={0} integerTicks
                series={[
                  { id: 'plan', label: 'Plan', color: 'var(--hv-1)', values: s.map((p) => p.plan) },
                  { id: 'actual', label: 'Actual', color: 'var(--hv-2)', values: s.map((p) => p.actual) },
                  { id: 'committed', label: 'Committed', color: 'var(--hv-2)', dashed: true, values: s.map((p, i) => (p.actual == null || s[i + 1]?.actual == null ? p.committed : null)) },
                ]} />
            </Card>
          );
        })}
      </div>

      <Card padding={16}>
        <CardTitle right={<div style={{ width: 220 }}><Select aria-label="Show months for" value={focus} onChange={(e) => setFocus(e.target.value)}><option value="all">Whole company</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>}>Month by month</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="monthly-table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead><tr>
              <th scope="col" style={th}>Month</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Planned</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Actual</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Committed</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Gap</th>
            </tr></thead>
            <tbody>
              {focusSeries.map((p) => (
                <tr key={p.month} style={p.month === month ? { background: T.raised } : undefined}>
                  <td style={td}>{fmtMonth(p.month)}{p.month === FY_END && <span style={{ color: T.mute }}> (year end, used for approvals)</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.plan}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.actual ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.committed}</td>
                  <td style={{ ...td, textAlign: 'right', color: gapColor(p.gap), fontWeight: 700 }}>{signed(p.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Row style={{ marginTop: 10 }}><span style={subtle}>The year-end column is what Recruitment reads as the approved headcount: planned minus people already there or joining, minus seats other open positions hold.</span></Row>
      </Card>
      {editing && <EditPlanModal db={db} st={st} onClose={() => setEditing(false)} />}
    </div>
  );
}
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${T.border}`, fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' };
const ft: React.CSSProperties = { padding: '11px 14px', fontSize: 13.5, fontWeight: 700, color: T.text, borderTop: `2px solid ${T.border}` };
