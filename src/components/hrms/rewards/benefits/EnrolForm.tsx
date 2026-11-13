'use client';
// The enrolment form for one employee, as the employee would see it: pick cover, add family, see the cost split and the
// monthly payroll deduction. The preview has no employee login, so HR opens it on the employee's behalf.

import { useId, useMemo, useState } from 'react';
import { Badge, Button, Modal, Note, T, useIsCompact } from '../../ui';
import { Field, Input, Segmented, Select } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { uid } from '../../../../lib/hrms/types';
import {
  RELATION_LABEL, ageOn, basicMonthlyOf, enrolmentEligibility, planOf, quoteEnrolment, tierOf, validateDependants, validateFlex, windowStatus,
} from '../../../../lib/hrms/rewards/engines';
import { submitEnrolment } from '../../../../lib/hrms/rewards/store';
import type { Dependant, Relation, RewardsState } from '../../../../lib/hrms/rewards/types';
import { Muted, report } from '../common';

export default function EnrolForm({ db, st, employeeId, onClose }: { db: HrmsDb; st: RewardsState; employeeId: string; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const emp = db.employees.find((e) => e.id === employeeId);
  const existing = st.benefits.enrolments.find((e) => e.employeeId === employeeId);
  const health = planOf(st.benefits.plans, 'health')!;
  const meal = planOf(st.benefits.plans, 'meal')!;
  const nps = planOf(st.benefits.plans, 'nps')!;
  const flex = planOf(st.benefits.plans, 'flex')!;

  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'enrolled' | 'waived'>(existing?.status ?? 'enrolled');
  const [healthTier, setHealthTier] = useState(existing?.healthTier ?? '');
  const [deps, setDeps] = useState<Dependant[]>(existing?.dependants ?? []);
  const [mealTier, setMealTier] = useState(existing?.mealTier ?? 'm0');
  const [npsTier, setNpsTier] = useState(existing?.npsTier ?? 'n0');
  const [flexText, setFlexText] = useState<Record<string, string>>(Object.fromEntries((flex.baskets ?? []).map((b) => [b.id, existing?.flex[b.id] ? String(existing.flex[b.id]) : ''])));

  const win = windowStatus(st.benefits.window, PREVIEW_TODAY);
  const elig = emp ? enrolmentEligibility(emp, health.coverStart) : { eligible: false, reason: 'No such employee.' };
  const locked = win.state !== 'open' || !elig.eligible;
  const flexAlloc = Object.fromEntries(Object.entries(flexText).map(([k, v]) => [k, Number(v) || 0]));
  const flexTotal = Object.values(flexAlloc).reduce((s, v) => s + v, 0);

  const depErrors = useMemo(() => (mode === 'enrolled' && health.dependants ? validateDependants(health.dependants, deps, health.coverStart) : []), [mode, deps, health]);
  const flexErrors = useMemo(() => (mode === 'enrolled' ? validateFlex(flex, flexAlloc) : []), [mode, flex, flexAlloc]); // eslint-disable-line react-hooks/exhaustive-deps
  const basic = emp ? basicMonthlyOf(db, emp, PREVIEW_TODAY) : 0;
  const quote = useMemo(
    () => quoteEnrolment(st.benefits.plans, { status: mode, healthTier, dependants: deps, mealTier, npsTier, flex: flexAlloc }, basic),
    [st.benefits.plans, mode, healthTier, deps, mealTier, npsTier, flexText, basic], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!emp) return null;
  let blocked = '';
  if (!elig.eligible) blocked = elig.reason ?? '';
  else if (win.state !== 'open') blocked = 'The enrolment window is closed. HR can extend it on the Enrolment tab.';
  else if (mode === 'enrolled' && !tierOf(health, healthTier)) blocked = 'Choose a health cover amount, or opt out.';
  else if (depErrors.length) blocked = depErrors[0]!;
  else if (flexErrors.length) blocked = flexErrors[0]!;

  const setDep = (i: number, patch: Partial<Dependant>) => setDeps((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addDep = () => setDeps((d) => [...d, { id: uid('dep'), name: '', relation: d.some((x) => x.relation === 'spouse') ? 'child' : 'spouse', dob: '' }]);

  async function save() {
    if (blocked || !emp || busy) return;
    setBusy(true);
    const r = await submitEnrolment({ employeeId, status: mode, healthTier: mode === 'enrolled' ? healthTier : undefined, dependants: deps, mealTier, npsTier, flex: flexAlloc });
    setBusy(false);
    if (report(r, mode === 'enrolled' ? `Enrolment saved for ${fullName(emp)}.` : `Opt-out recorded for ${fullName(emp)}.`)) onClose();
  }

  return (
    <Modal title={`Enrolment: ${fullName(emp)}`} onClose={onClose} width={760}
      footer={(
        <>
          {blocked && <span style={{ flex: 1, minWidth: 180, alignSelf: 'center', fontSize: 12.5, color: T.dim }}>{blocked}</span>}
          <Button style={{ height: 40 }} onClick={onClose}>Close</Button>
          <Button variant="primary" style={{ height: 40 }} disabled={!!blocked || busy} onClick={save}>{busy ? 'Saving…' : existing ? 'Update enrolment' : 'Save enrolment'}</Button>
        </>
      )}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5, color: T.dim }}>
        <span>{emp.code}</span>
        <Badge tone={win.state === 'open' ? 'ok' : 'warn'} dot>{win.state === 'open' ? `Window open, ${win.daysLeft} days left` : 'Window closed'}</Badge>
        <span>Cover starts {fmtDate(health.coverStart)}</span>
      </div>
      {!elig.eligible && <Note tone="warn">{elig.reason}</Note>}

      <Segmented value={mode} onChange={setMode} options={[{ value: 'enrolled', label: 'Enrol' }, { value: 'waived', label: 'Opt out of group health' }]} style={{ alignSelf: 'flex-start' }} />
      {mode === 'waived' && <Note>Opting out only skips group health, meal coupons, NPS and the flexible allowance. Accident cover is automatic and stays. You can change this while the window is open.</Note>}

      {mode === 'enrolled' && (
        <>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 14 }}>Group health insurance</h3>
            <Field label="Cover amount" required htmlFor={id('health')} hint="A family floater: one sum insured shared by you and the family you add.">
              <Select id={id('health')} value={healthTier} disabled={locked} onChange={(e) => setHealthTier(e.target.value)}>
                <option value="">Choose a cover amount</option>
                {health.tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6 }}>Family members covered</div>
              {deps.length === 0 && <Muted>None added. You are covered on your own.</Muted>}
              {deps.map((d, i) => {
                const age = /^\d{4}-\d{2}-\d{2}$/.test(d.dob) ? ageOn(d.dob, health.coverStart) : null;
                return (
                  <div key={d.id} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.4fr) 130px 150px auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <Input aria-label={`Family member ${i + 1} name`} placeholder="Name" value={d.name} disabled={locked} onChange={(e) => setDep(i, { name: e.target.value })} />
                    <Select aria-label={`Family member ${i + 1} relation`} value={d.relation} disabled={locked} onChange={(e) => setDep(i, { relation: e.target.value as Relation })}>
                      {(['spouse', 'child', 'parent'] as Relation[]).map((r) => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
                    </Select>
                    <Input aria-label={`Family member ${i + 1} date of birth`} type="date" value={d.dob} disabled={locked} max={PREVIEW_TODAY} onChange={(e) => setDep(i, { dob: e.target.value })} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {age != null && <span style={{ fontSize: 12.5, color: T.dim, whiteSpace: 'nowrap' }}>Age {age} at start</span>}
                      <Button size="sm" variant="ghost" disabled={locked} aria-label={`Remove family member ${i + 1}`} onClick={() => setDeps((x) => x.filter((_, j) => j !== i))}>Remove</Button>
                    </span>
                  </div>
                );
              })}
              <Button size="sm" disabled={locked} onClick={addDep}>Add a family member</Button>
              <Muted style={{ marginTop: 8 }}>We keep a name, relation and date of birth only. We never ask for or keep an Aadhaar, PAN or other ID number for a family member. Ages are checked on {fmtDate(health.coverStart)}.</Muted>
              {depErrors.length > 0 && (
                <div role="alert" data-testid="dependant-errors" style={{ marginTop: 8 }}>
                  <Note tone="red">{depErrors.map((e) => <div key={e}>{e}</div>)}</Note>
                </div>
              )}
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Field label="Meal coupons" htmlFor={id('meal')} hint="Taken from your pay each month.">
              <Select id={id('meal')} value={mealTier} disabled={locked} onChange={(e) => setMealTier(e.target.value)}>{meal.tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
            </Field>
            <Field label="NPS contribution" htmlFor={id('nps')} hint={basic ? `Your monthly basic is ${inr(basic)}. The amount moves from take-home into NPS.` : undefined}>
              <Select id={id('nps')} value={npsTier} disabled={locked} onChange={(e) => setNpsTier(e.target.value)}>{nps.tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
            </Field>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 14 }}>Flexible allowance</h3>
            <Muted>Budget {inr(flex.flexMonthly)} a month. Split it in multiples of 250. Allocated {inr(flexTotal)}, left {inr((flex.flexMonthly ?? 0) - flexTotal)}.</Muted>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
              {(flex.baskets ?? []).map((b) => (
                <Field key={b.id} label={b.label} htmlFor={id(`flex-${b.id}`)}>
                  <Input id={id(`flex-${b.id}`)} inputMode="numeric" placeholder="0" value={flexText[b.id] ?? ''} disabled={locked} onChange={(e) => setFlexText((f) => ({ ...f, [b.id]: e.target.value.replace(/\D/g, '') }))} />
                </Field>
              ))}
            </div>
            {flexErrors.length > 0 && <Note tone="red">{flexErrors[0]}</Note>}
          </section>
        </>
      )}

      <section data-testid="enrol-cost" style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 14 }}>What it costs</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420, fontSize: 13.5 }}>
            <thead>
              <tr>{['Item', 'A year', 'Company pays', 'You pay'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '6px 8px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.key}>
                  <td style={{ padding: '6px 8px', borderTop: `1px solid ${T.border}` }}>{l.label}</td>
                  <td style={{ padding: '6px 8px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{inr(l.annual)}</td>
                  <td style={{ padding: '6px 8px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{inr(l.employerAnnual)}</td>
                  <td style={{ padding: '6px 8px', borderTop: `1px solid ${T.border}`, textAlign: 'right' }}>{inr(l.employeeAnnual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
          <span>You pay <b data-testid="cost-employee">{inr(quote.employeeMonthly)}</b> a month through payroll</span>
          <span>The company pays <b data-testid="cost-employer">{inr(quote.employerMonthly)}</b> a month</span>
        </div>
        <Muted>Sample premiums. Payroll deduction and take-home effect are shown on the Cost and payroll tab.</Muted>
      </section>
    </Modal>
  );
}
