'use client';
// Budget: planned vs actual annual CTC, the cost of open positions at the middle of their band, and the projected
// year-end spend. Every figure is explained in words under the numbers.

import { Card, CardTitle, DataTable, Note, Stat, StatGrid, T, type Col } from '../ui';
import { Select } from '../../ui';
import { fmtMonth, inr, inrShort } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { HiringState, Id } from '../../../lib/hrms/hiring/types';
import { bandMid, budgetFigures, fiscalMonths, isLive, seatsLeft, type PlanInput } from '../../../lib/hrms/hiring/engines';
import { setOpenStartMonth } from '../../../lib/hrms/hiring/store';
import { Legend, LineChart } from './charts';
import { Lead, Row, deptName, locName } from './shared';

const short = (m: string) => fmtMonth(m).slice(0, 3);

export default function PlanningBudget({ db, st }: { db: HrmsDb; st: HiringState }) {
  const months = fiscalMonths();
  const input: PlanInput = { plan: st.plan, employees: db.employees, openings: st.openings, today: PREVIEW_TODAY };
  const all = budgetFigures(input, st.openStartMonth, months);
  const live = st.openings.filter((o) => isLive(o) && seatsLeft(o) > 0);
  const variance = all.varianceVsPlan;
  const cur = months.filter((m) => m <= PREVIEW_TODAY.slice(0, 7));
  const lastCur = cur[cur.length - 1]!;

  const byDept = db.departments.map((d) => ({ id: d.id, b: budgetFigures(input, st.openStartMonth, months, { departmentId: d.id }) })).filter((x) => x.b.plannedFy > 0 || x.b.actualToDate > 0);
  type R = { id: Id; b: typeof all };
  const cols: Col<R>[] = [
    { key: 'd', label: 'Department', sortValue: (r) => deptName(db, r.id), render: (r) => <span style={{ fontWeight: 600 }}>{deptName(db, r.id)}</span> },
    { key: 'p', label: 'Planned for the year', align: 'right', sortValue: (r) => r.b.plannedFy, render: (r) => inrShort(r.b.plannedFy) },
    { key: 'a', label: `Actual to ${short(lastCur)}`, align: 'right', sortValue: (r) => r.b.actualToDate, render: (r) => inrShort(r.b.actualToDate) },
    { key: 'rr', label: 'Run rate today', align: 'right', sortValue: (r) => r.b.runRate, render: (r) => inrShort(r.b.runRate) },
    { key: 'o', label: 'Open positions (a year)', align: 'right', sortValue: (r) => r.b.openCostAnnual, render: (r) => inrShort(r.b.openCostAnnual) },
    { key: 'pr', label: 'Projected year end', align: 'right', sortValue: (r) => r.b.projectedWithHire, render: (r) => inrShort(r.b.projectedWithHire) },
    { key: 'v', label: 'Against plan', align: 'right', sortValue: (r) => r.b.varianceVsPlan, render: (r) => <b style={{ color: r.b.varianceVsPlan > 0 ? T.warn : T.ok }}>{r.b.varianceVsPlan > 0 ? '+' : ''}{inrShort(r.b.varianceVsPlan)}</b> },
  ];

  const planned = all.monthly.map((m) => m.planned);
  const actual = all.monthly.map((m) => (m.kind === 'actual' ? m.cost : null));
  const lastActualIdx = all.monthly.reduce((a, m, i) => (m.kind === 'actual' ? i : a), -1);
  const projected = all.monthly.map((m, i) => (i >= lastActualIdx ? m.cost : null));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="budget">
      <StatGrid>
        <div data-testid="stat-planned"><Stat label="Planned for the year" value={inrShort(all.plannedFy)} hint="Planned headcount x planned average CTC, each month" /></div>
        <div data-testid="stat-actual"><Stat label={`Actual, Apr to ${short(lastCur)}`} value={inrShort(all.actualToDate)} hint={`${all.monthsElapsed} months. Run rate today ${inrShort(all.runRate)} a year`} /></div>
        <div data-testid="stat-open"><Stat label="Open positions" value={inrShort(all.openCostAnnual)} hint={`${all.openSeats} seats at the middle of the band, a year`} tone="info" /></div>
        <div data-testid="stat-projected"><Stat label="Projected year end" value={inrShort(all.projectedWithHire)} tone={variance > 0 ? 'warn' : 'ok'} hint={`${variance > 0 ? 'Above' : 'Below'} plan by ${inrShort(Math.abs(variance))}`} /></div>
      </StatGrid>
      {all.missingCtc > 0 && <Note tone="warn">{all.missingCtc} {all.missingCtc === 1 ? 'person has' : 'people have'} no CTC on file and {all.missingCtc === 1 ? 'is' : 'are'} counted as zero in the actual figures.</Note>}

      <Card padding={16}>
        <CardTitle>Spend by month</CardTitle>
        <Lead>Planned is the plan. Actual is what the people on the payroll cost, month by month. Projected carries on from today with people already joining or leaving, and adds the open positions from the month you choose below.</Lead>
        <Legend items={[{ label: 'Planned', color: 'var(--hv-1)' }, { label: 'Actual', color: 'var(--hv-2)' }, { label: 'Projected', color: 'var(--hv-2)', dashed: true }]} />
        <LineChart testId="budget-chart" ariaLabel="Planned, actual and projected monthly CTC" height={220} xLabels={months.map(short)} format={(n) => inrShort(n)}
          series={[{ id: 'planned', label: 'Planned', color: 'var(--hv-1)', values: planned }, { id: 'actual', label: 'Actual', color: 'var(--hv-2)', values: actual }, { id: 'projected', label: 'Projected', color: 'var(--hv-2)', dashed: true, values: projected }]} />
      </Card>

      <Card padding={16}>
        <CardTitle right={<Row gap={8}><label htmlFor="open-start" style={{ fontSize: 12.5, color: T.dim }}>Open positions start costing from</label>
          <div style={{ width: 150 }}><Select id="open-start" value={st.openStartMonth} onChange={(e) => setOpenStartMonth(e.target.value)}>{months.filter((m) => m > PREVIEW_TODAY.slice(0, 7)).map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}</Select></div></Row>}>Cost of open positions</CardTitle>
        <Lead>Each unfilled seat on a live opening is costed at the middle of its pay band, from the month you choose to March 2027. The total row shows the cost for a full year and for the rest of this financial year.</Lead>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="open-cost" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
            <thead><tr><th scope="col" style={th}>Opening</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Seats</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Band middle</th><th scope="col" style={{ ...th, textAlign: 'right' }}>A year</th></tr></thead>
            <tbody>
              {live.map((o) => (
                <tr key={o.id}><td style={td}>{o.title} <span style={{ color: T.mute }}>· {locName(db, o.locationId)}</span></td><td style={{ ...td, textAlign: 'right' }}>{seatsLeft(o)}</td><td style={{ ...td, textAlign: 'right' }}>{inr(bandMid(o))}</td><td style={{ ...td, textAlign: 'right' }}>{inr(seatsLeft(o) * bandMid(o))}</td></tr>
              ))}
              <tr><td style={{ ...td, fontWeight: 700, borderTop: `2px solid ${T.border}` }} colSpan={3}>Total, a year  <span style={{ color: T.mute, fontWeight: 400 }}>· this year from {fmtMonth(st.openStartMonth)}: {inr(all.openCostFy)}</span></td><td style={{ ...td, textAlign: 'right', fontWeight: 700, borderTop: `2px solid ${T.border}` }}>{inr(all.openCostAnnual)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding={16}>
        <CardTitle>By department</CardTitle>
        <DataTable columns={cols} rows={byDept.map((x) => ({ id: x.id, b: x.b }))} minWidth={760} />
      </Card>

      <Card padding={16}>
        <CardTitle>How these are worked out</CardTitle>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
          <li><b style={{ color: T.text }}>Planned</b> = for each month, planned headcount x the department&apos;s planned average CTC / 12, added up for April to March.</li>
          <li><b style={{ color: T.text }}>Actual</b> = for each month up to now, the annual CTC of everyone on the payroll that month / 12. The current month uses today&apos;s headcount. Annual CTC comes from the employee record.</li>
          <li><b style={{ color: T.text }}>Projected year end</b> = actual to date + the months still to come for people already joining or leaving + the open positions at the middle of their band from the chosen month.</li>
          <li>This is a planning estimate. It leaves out bonus, incentive, overtime and statutory costs that sit outside CTC.</li>
        </ul>
      </Card>
    </div>
  );
}
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${T.border}`, fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' };
