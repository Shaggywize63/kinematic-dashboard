'use client';
// Wage access, Employee view: what this person can draw today, why, a slider to ask for part of it, and their history.

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, KeyValue, ProgressBar, T } from '../ui';
import { Field, Select, Textarea } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { cancelWageRequest, submitWageRequest, TODAY } from '../../../lib/hrms/workforce/store';
import { ROUND_TO, sliderRange, validateAmount, type WageStanding } from '../../../lib/hrms/workforce/wageEngine';
import type { WorkforceData } from '../../../lib/hrms/workforce/types';
import { Panel, REQUEST_TONE, REQUEST_WORD, Row, muted, twoCol } from './shared';

function Draw({ s, wf }: { s: WageStanding; wf: WorkforceData }) {
  const id = useId();
  const policy = wf.wage.policy;
  const range = sliderRange(s, policy);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const value = range ? Math.min(range.max, Math.max(range.min, amount ?? range.max)) : 0;
  const errors = range ? validateAmount(s, policy, value) : validateAmount(s, policy, 0);

  if (!range) {
    return (
      <div data-testid="cannot-draw" style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
        {s.eligible
          ? <>There is nothing to draw right now. The smallest request is {inr(policy.minAmount)} and {inr(s.available)} is available. It grows each day as more salary is earned.</>
          : <>This person cannot draw right now.</>}
      </div>
    );
  }
  const submit = () => {
    const r = submitWageRequest(s.employeeId, value, note);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Request for ${inr(value)} sent. It waits for HR in the HR view.`);
    setNote(''); setAmount(null);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label htmlFor={`${id}-r`} style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>How much do you want to draw?</label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
          <span data-testid="draw-amount" style={{ fontFamily: T.heading, fontSize: 30, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{inr(value)}</span>
          <span style={muted}>of {inr(range.max)} available</span>
        </div>
        <input id={`${id}-r`} type="range" aria-label="Amount to draw" min={range.min} max={range.max} step={range.step} value={value} onChange={(e) => setAmount(Number(e.target.value))}
          style={{ width: '100%', marginTop: 8, accentColor: 'var(--info)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', ...muted }}><span>{inr(range.min)}</span><span>{inr(range.max)}</span></div>
      </div>
      <Field label="Note for HR (optional)" htmlFor={`${id}-n`}>
        <Textarea id={`${id}-n`} value={note} style={{ minHeight: 56 }} placeholder="What it is for, if you want to say" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.55 }}>
        Fee: <b style={{ color: T.text }}>{inr(policy.fee)}</b>. {inr(value + policy.fee)} is taken from your pay in one go, in the {fmtMonth(TODAY.slice(0, 7))} payroll. You get {inr(value)} now, so your salary on payday is {inr(value + policy.fee)} lower.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" data-testid="request-submit" disabled={errors.length > 0} title={errors[0]} onClick={submit}>Request {inr(value)}</Button>
        {errors.length > 0 && <span style={{ fontSize: 12.5, color: T.red }}>{errors[0]}</span>}
      </div>
    </div>
  );
}

export default function WageEmployee({ db, wf, standings, narrow }: { db: HrmsDb; wf: WorkforceData; standings: Map<string, WageStanding>; narrow: boolean }) {
  const id = useId();
  const people = db.employees.filter((e) => standings.has(e.id));
  const [pick, setPick] = useState<string>(people.find((e) => e.id === 'emp_5')?.id ?? people[0]?.id ?? '');
  const e = db.employees.find((x) => x.id === pick);
  const s = standings.get(pick);
  const policy = wf.wage.policy;
  const mine = wf.wage.requests.filter((r) => r.employeeId === pick).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="Choose a person" right={<span style={muted}>In the live product this is whoever is signed in</span>}>
        <div style={{ maxWidth: 420 }}>
          <Field label="Employee" htmlFor={`${id}-e`}>
            <Select id={`${id}-e`} aria-label="Choose employee" value={pick} onChange={(ev) => setPick(ev.target.value)}>
              {people.map((p) => <option key={p.id} value={p.id}>{fullName(p)} ({p.code})</option>)}
            </Select>
          </Field>
        </div>
      </Panel>

      {e && s && (
        <div style={twoCol(narrow, 420)} key={pick}>
          <Panel title={`${fullName(e)}, ${fmtMonth(s.month)}`} testId="employee-card">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <Avatar name={fullName(e)} size={40} />
              <div>
                {s.eligible
                  ? <div data-testid="can-take" style={{ fontFamily: T.heading, fontSize: 20, fontWeight: 700, color: T.text }}>You can take up to {inr(s.available)}</div>
                  : <div data-testid="not-eligible" style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text }}>Not available right now</div>}
                <div style={muted}>{s.eligible ? `Up to ${policy.maxSharePct}% of what you have earned so far this month.` : 'See why below.'}</div>
              </div>
            </div>
            {!s.eligible && (
              <ul style={{ margin: '0 0 14px', paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, color: T.warn, lineHeight: 1.6 }} aria-label="Why not available">
                {s.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            <Draw key={`${pick}-${s.available}`} s={s} wf={wf} />
          </Panel>

          <Panel title="How this was worked out" testId="breakdown">
            <KeyValue columns={2} rows={[
              { label: 'Net pay for the month (full attendance)', value: inr(s.net) },
              { label: 'Days counted', value: `${s.paidDays} of ${s.daysInMonth}${s.unpaidDays ? ` (${s.unpaidDays} unpaid)` : ''}` },
              { label: 'Earned so far', value: <b>{inr(s.earned)}</b> },
              { label: 'Loans and advances due in payroll', value: s.recoveriesDue ? `− ${inr(s.recoveriesDue)}` : '₹0' },
              { label: `Your share (${policy.maxSharePct}%), rounded down to ${inr(ROUND_TO)}`, value: inr(s.cap) },
              { label: 'Already drawn this month', value: s.drawn ? `− ${inr(s.drawn)}` : '₹0' },
              { label: 'Requests used', value: `${s.requestsUsed} of ${s.requestLimit}` },
              { label: 'Available now', value: <b>{inr(s.available)}</b> },
            ]} />
            <div style={{ margin: '12px 0 4px' }}><ProgressBar pct={s.net ? (s.earned / s.net) * 100 : 0} tone="info" /></div>
            <div style={muted}>{Math.round(s.net ? (s.earned / s.net) * 100 : 0)}% of this month&rsquo;s net pay is earned so far. Today counts as a full day. This is a simple pro-rata, not a payslip: the real figures come from the payroll run.</div>
          </Panel>
        </div>
      )}

      {e && (
        <Panel title={`Requests by ${fullName(e)}`} testId="my-history">
          {mine.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.dim }}>No requests yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mine.map((r) => (
                <Row key={r.id} testId={`my-request-${r.id}`}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13.5 }}>
                      <b>{inr(r.amount)}</b> for {fmtMonth(r.month)} · asked {fmtDate(r.requestedOn)}
                      {r.reason && <span style={{ color: T.dim }}> · {r.reason}</span>}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <Badge tone={REQUEST_TONE[r.status]} dot>{REQUEST_WORD[r.status]}</Badge>
                      {r.status === 'pending' && <Button size="sm" aria-label={`Cancel request ${r.id}`} onClick={() => { cancelWageRequest(r.id); toast.success('Request cancelled.'); }}>Cancel</Button>}
                    </span>
                  </div>
                </Row>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
