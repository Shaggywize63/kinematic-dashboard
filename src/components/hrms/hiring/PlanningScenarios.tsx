'use client';
// Scenarios: base, hire freeze and aggressive growth, each with editable assumptions (hires a month, attrition, average
// CTC). Projected headcount and cost to March 2027, saved in the store, and a side-by-side comparison of any two.

import { useState } from 'react';
import { Badge, Button, Card, CardTitle, Modal, Note, T } from '../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../ui';
import { fmtMonth, inr, inrShort } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import type { HiringState, Scenario } from '../../../lib/hrms/hiring/types';
import { FY_END, budgetFigures, fiscalMonths, monthlySeries, projectScenario, validateScenario, type PlanInput } from '../../../lib/hrms/hiring/engines';
import { deleteScenario, saveScenario } from '../../../lib/hrms/hiring/store';
import { Legend, LineChart } from './charts';
import { Row, report, subtle, toast } from './shared';

const NOW = PREVIEW_TODAY.slice(0, 7);
const short = (m: string) => fmtMonth(m).slice(0, 3);
const plus = (n: number, f: (x: number) => string) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${f(Math.abs(n))}`;

export default function PlanningScenarios({ db, st }: { db: HrmsDb; st: HiringState }) {
  const months = fiscalMonths();
  const input: PlanInput = { plan: st.plan, employees: db.employees, openings: st.openings, today: PREVIEW_TODAY };
  const startHc = monthlySeries(input, {}, [NOW])[0]!.committed;
  const spent = budgetFigures(input, st.openStartMonth, months).actualToDate;
  const run = (s: Scenario) => projectScenario(s, startHc, NOW, FY_END, spent);
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null);
  const [aId, setA] = useState('scn_base');
  const [bId, setB] = useState('scn_growth');
  const ids = st.scenarios.map((s) => s.id);
  const A = st.scenarios.find((s) => s.id === aId) ?? st.scenarios[0]!;
  const B = st.scenarios.find((s) => s.id === bId) ?? st.scenarios[1] ?? A;
  const ra = run(A), rb = run(B);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="scenarios">
      <Note>These are what-ifs, not forecasts. Each starts from the {startHc} people on the books or joining by the end of {fmtMonth(NOW)} and runs month by month to {fmtMonth(FY_END)}. Change the assumptions to see what they do.</Note>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
        {st.scenarios.map((s) => {
          const r = run(s);
          return (
            <Card key={s.id} padding={16} className="" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div data-testid={`scenario-${s.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{s.name}</h3>{s.builtIn && <Badge>Starting scenario</Badge>}</Row>
                {s.note && <div style={subtle}>{s.note}</div>}
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
                  <dt style={{ color: T.dim }}>Hires a month</dt><dd data-testid="a-hires" style={{ margin: 0, textAlign: 'right' }}>{s.hiresPerMonth}</dd>
                  <dt style={{ color: T.dim }}>Attrition a year</dt><dd style={{ margin: 0, textAlign: 'right' }}>{s.attritionPct}%</dd>
                  <dt style={{ color: T.dim }}>Average CTC</dt><dd style={{ margin: 0, textAlign: 'right' }}>{inrShort(s.avgCtc)}</dd>
                </dl>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
                  <span style={{ color: T.dim }}>Headcount, {short(FY_END)}</span><b data-testid="end-hc" style={{ textAlign: 'right', fontFamily: T.mono }}>{r.endHeadcount}</b>
                  <span style={{ color: T.dim }}>Cost, {short(months[8]!)} to {short(FY_END)}</span><b style={{ textAlign: 'right', fontFamily: T.mono }}>{inrShort(r.costToEnd)}</b>
                  <span style={{ color: T.dim }}>Whole year</span><b style={{ textAlign: 'right', fontFamily: T.mono }}>{inrShort(r.fyTotal)}</b>
                </div>
                <Row><Button size="sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>Edit</Button>{!s.builtIn && <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => { if (report(deleteScenario(s.id), 'Scenario deleted.')) { if (aId === s.id) setA(ids[0]!); if (bId === s.id) setB(ids[1] ?? ids[0]!); } }}>Delete</Button>}</Row>
              </div>
            </Card>
          );
        })}
        <Card padding={16} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <Button onClick={() => setEditing('new')}>Add a scenario</Button>
        </Card>
      </div>

      <Card padding={16}>
        <CardTitle right={<Row gap={8}>
          <div style={{ width: 190 }}><Select aria-label="Compare A" value={A.id} onChange={(e) => setA(e.target.value)}>{st.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
          <span style={{ color: T.dim, fontSize: 13 }}>with</span>
          <div style={{ width: 190 }}><Select aria-label="Compare B" value={B.id} onChange={(e) => setB(e.target.value)}>{st.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div></Row>}>Compare two</CardTitle>
        {A.id === B.id && <Note tone="warn">Choose two different scenarios to see a difference.</Note>}
        <div style={{ overflowX: 'auto', marginTop: A.id === B.id ? 10 : 0 }}>
          <table data-testid="compare" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
            <thead><tr><th scope="col" style={th}>Measure</th><th scope="col" style={{ ...th, textAlign: 'right' }}>{A.name}</th><th scope="col" style={{ ...th, textAlign: 'right' }}>{B.name}</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Difference</th></tr></thead>
            <tbody>
              <Cmp label="Headcount, March 2027" a={ra.endHeadcount} b={rb.endHeadcount} f={(x) => String(Math.round(x * 10) / 10)} id="hc" />
              <Cmp label="Cost, Dec to Mar" a={ra.costToEnd} b={rb.costToEnd} f={inr} id="cost" />
              <Cmp label="Whole year cost" a={ra.fyTotal} b={rb.fyTotal} f={inr} id="fy" />
              <Cmp label="Hires a month" a={A.hiresPerMonth} b={B.hiresPerMonth} f={String} id="hires" />
              <Cmp label="Attrition a year (%)" a={A.attritionPct} b={B.attritionPct} f={String} id="attr" />
            </tbody>
          </table>
        </div>
        <p data-testid="compare-summary" style={{ margin: '12px 0 8px', fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>
          {A.id === B.id ? 'Pick two different scenarios.' : (() => {
            const dh = Math.round((rb.endHeadcount - ra.endHeadcount) * 10) / 10;
            const dc = rb.costToEnd - ra.costToEnd;
            return <>By {fmtMonth(FY_END)}, <b>{B.name}</b> ends with {dh === 0 ? 'the same number of people as' : `${Math.abs(dh)} ${dh > 0 ? 'more' : 'fewer'} people than`} <b>{A.name}</b>, and costs {dc === 0 ? 'the same' : `${inrShort(Math.abs(dc))} ${dc > 0 ? 'more' : 'less'}`} over December to March.</>;
          })()}
        </p>
        <Legend items={[{ label: A.name, color: 'var(--hv-2)' }, { label: B.name, color: 'var(--hv-1)' }]} />
        <LineChart testId="compare-chart" ariaLabel={`Projected headcount, ${A.name} and ${B.name}`} height={210} integerTicks xLabels={[short(NOW), ...ra.rows.map((r) => short(r.month))]}
          series={[{ id: 'a', label: A.name, color: 'var(--hv-2)', values: [startHc, ...ra.rows.map((r) => r.headcount)] }, { id: 'b', label: B.name, color: 'var(--hv-1)', values: [startHc, ...rb.rows.map((r) => r.headcount)] }]} />
      </Card>

      <Card padding={16}>
        <CardTitle>How a scenario is worked out</CardTitle>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
          <li>Each month: headcount = last month&apos;s headcount + hires − (last month&apos;s headcount × attrition % ÷ 12).</li>
          <li>Cost for a month = that month&apos;s headcount × average CTC ÷ 12. Cost December to March adds the four months.</li>
          <li>Whole year = what the payroll actually cost from April to November + the projected cost December to March.</li>
          <li>It does not know which seats are approved. Check hiring against the plan on the Headcount tab and in Recruitment.</li>
        </ul>
      </Card>
      {editing && <ScenarioModal initial={editing === 'new' ? undefined : editing} base={st.scenarios[0]} onClose={() => setEditing(null)} />}
    </div>
  );
}
const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${T.border}`, fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' };

function Cmp({ label, a, b, f, id }: { label: string; a: number; b: number; f: (n: number) => string; id: string }) {
  const d = Math.round((b - a) * 10) / 10;
  return (
    <tr data-testid={`cmp-${id}`}><td style={td}>{label}</td><td style={{ ...td, textAlign: 'right' }}>{f(a)}</td><td style={{ ...td, textAlign: 'right' }}>{f(b)}</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: d === 0 ? T.dim : T.text }}>{d === 0 ? '0' : plus(d, f)}</td></tr>
  );
}

function ScenarioModal({ initial, base, onClose }: { initial?: Scenario; base?: Scenario; onClose: () => void }) {
  const seed = initial ?? base;
  const [f, setF] = useState({ name: initial?.name ?? '', hires: String(seed?.hiresPerMonth ?? 1), attr: String(seed?.attritionPct ?? 8), ctc: String(seed?.avgCtc ?? 700000), note: initial?.note ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErr(null); };
  const parsed = { name: f.name, hiresPerMonth: Number(f.hires), attritionPct: Number(f.attr), avgCtc: Number(f.ctc.replace(/,/g, '')) };
  const problems = validateScenario(parsed);
  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add a scenario'} width={560} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={problems.length > 0} title={problems[0]} onClick={() => {
        const r = saveScenario({ id: initial?.id, ...parsed, note: f.note });
        if (r.ok) { toast.success('Scenario saved.'); onClose(); } else setErr(r.error);
      }}>Save scenario</Button></>}>
      <FormGrid narrow={false} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Name" required htmlFor="sc-name"><Input id="sc-name" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Hires a month" required htmlFor="sc-hires" hint="Can be a fraction, such as 0.5"><Input id="sc-hires" inputMode="decimal" value={f.hires} onChange={(e) => set('hires', e.target.value)} /></Field>
        <Field label="Attrition a year (%)" required htmlFor="sc-attr"><Input id="sc-attr" inputMode="decimal" value={f.attr} onChange={(e) => set('attr', e.target.value)} /></Field>
        <Field label="Average CTC (₹ a year)" required htmlFor="sc-ctc"><Input id="sc-ctc" inputMode="numeric" value={f.ctc} onChange={(e) => set('ctc', e.target.value)} /></Field>
      </FormGrid>
      <Field label="Note" htmlFor="sc-note"><Textarea id="sc-note" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
      {problems.length > 0 && f.name !== '' && <div style={subtle}>{problems[0]}</div>}
      {err && <Note tone="red">{err}</Note>}
    </Modal>
  );
}
