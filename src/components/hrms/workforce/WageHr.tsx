'use client';
// Wage access, HR view: the policy, the requests inbox, who can draw what, and what payroll will recover.

import { useId, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, DataTable, EmployeeCell, Note, Stat, StatGrid, T, type Col } from '../ui';
import { Field, Input } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import {
  approveWageRequest, declineWageRequest, savePolicy, TODAY,
} from '../../../lib/hrms/workforce/store';
import {
  ALL_TYPES, ROUND_TO, TYPE_LABEL, validateAmount, validatePolicy, wageStanding, wageSummary, type WageStanding,
} from '../../../lib/hrms/workforce/wageEngine';
import type { WageData, WagePolicy, WageRequest, WorkforceData } from '../../../lib/hrms/workforce/types';
import { Panel, REQUEST_TONE, REQUEST_WORD, ReasonModal, Row, muted, strong, twoCol } from './shared';

// ───────────────────────────── policy ─────────────────────────────
function PolicyCard({ policy }: { policy: WagePolicy }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<WagePolicy['eligibleTypes']>(policy.eligibleTypes);
  const [errors, setErrors] = useState<Partial<Record<keyof WagePolicy, string>>>({});

  const start = () => {
    setDraft({ maxSharePct: String(policy.maxSharePct), monthlyRequestLimit: String(policy.monthlyRequestLimit), fee: String(policy.fee), minTenureMonths: String(policy.minTenureMonths), minAmount: String(policy.minAmount) });
    setTypes(policy.eligibleTypes); setErrors({}); setEditing(true);
  };
  const save = () => {
    const next: WagePolicy = {
      maxSharePct: Number(draft.maxSharePct), monthlyRequestLimit: Number(draft.monthlyRequestLimit), fee: Number(draft.fee),
      minTenureMonths: Number(draft.minTenureMonths), minAmount: Number(draft.minAmount), eligibleTypes: types,
    };
    const errs = validatePolicy(next);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = savePolicy(next);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Policy saved. Amounts available are worked out again with it.');
    setEditing(false);
  };
  const fields: { key: keyof WagePolicy; label: string; hint?: string }[] = [
    { key: 'maxSharePct', label: 'Share of earned salary available (%)' },
    { key: 'monthlyRequestLimit', label: 'Requests allowed per month' },
    { key: 'fee', label: 'Fee per request (₹)' },
    { key: 'minTenureMonths', label: 'Minimum tenure (months)' },
    { key: 'minAmount', label: 'Smallest request (₹)', hint: `Multiples of ${ROUND_TO}` },
  ];

  return (
    <Panel title="Policy" testId="policy-card" right={editing ? undefined : <Button size="sm" onClick={start}>Edit policy</Button>}>
      {!editing ? (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 20px' }}>
          {[
            ['Share of earned salary', `${policy.maxSharePct}%`],
            ['Requests per month', String(policy.monthlyRequestLimit)],
            ['Fee per request', inr(policy.fee)],
            ['Minimum tenure', `${policy.minTenureMonths} months`],
            ['Smallest request', inr(policy.minAmount)],
            ['Who is eligible', policy.eligibleTypes.map((t) => TYPE_LABEL[t]).join(' and ') || 'Nobody'],
          ].map(([k, v]) => (
            <div key={k}><dt style={{ fontSize: 12, color: T.mute }}>{k}</dt><dd style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.text }} data-testid={`policy-${k!.toLowerCase().replace(/\W+/g, '-')}`}>{v}</dd></div>
          ))}
        </dl>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {fields.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`${id}-${f.key}`} error={errors[f.key]} hint={f.hint}>
                <Input id={`${id}-${f.key}`} type="number" inputMode="numeric" value={draft[f.key] ?? ''} invalid={!!errors[f.key]} onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setErrors({ ...errors, [f.key]: undefined }); }} />
              </Field>
            ))}
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 6 }}>Who is eligible</legend>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {ALL_TYPES.map((t) => (
                <label key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text, minHeight: 32 }}>
                  <input type="checkbox" checked={types.includes(t)} onChange={(e) => { setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t)); setErrors({ ...errors, eligibleTypes: undefined }); }} style={{ width: 16, height: 16, accentColor: 'var(--info)' }} />
                  {TYPE_LABEL[t]}
                </label>
              ))}
            </div>
            {errors.eligibleTypes && <div role="alert" style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{errors.eligibleTypes}</div>}
          </fieldset>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={save}>Save policy</Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <div style={{ ...muted, marginTop: 12 }}>
        The default is half of what has been earned so far, up to two requests a month, no fee, after three months, for permanent and fixed-term people. These are sample choices to try, not advice.
      </div>
    </Panel>
  );
}

// ───────────────────────────── inbox ─────────────────────────────
function InboxRow({ db, wage, r }: { db: HrmsDb; wage: WageData; r: WageRequest }) {
  const e = db.employees.find((x) => x.id === r.employeeId);
  const [declining, setDeclining] = useState(false);
  if (!e) return null;
  // Judge the request as if it were new: its own waiting entry must not count against the person.
  const s = wageStanding(db, wage.policy, wage.requests.filter((x) => x.id !== r.id), r.employeeId, TODAY);
  const problems = s ? validateAmount(s, wage.policy, r.amount) : ['This person was not found.'];
  const approve = () => {
    const res = approveWageRequest(r.id);
    if (!res.ok) toast.error(res.error);
    else toast.success(`${fullName(e)}: ${inr(r.amount)} approved. It is now an advance in Payroll, recovered in ${fmtMonth(r.recoverIn ?? TODAY.slice(0, 7))}.`);
  };
  return (
    <Row testId={`request-${r.id}`} tone={problems.length ? 'warn' : undefined}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <EmployeeCell e={e} href={false} />
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Asks for <b data-testid={`request-amount-${r.id}`}>{inr(r.amount)}</b> on {fmtDate(r.requestedOn)}{r.note ? <> · &ldquo;{r.note}&rdquo;</> : null}
          </div>
          {s && (
            <div style={{ ...muted, marginTop: 4 }}>
              Available now <b style={{ color: T.text }}>{inr(s.available)}</b> (earned so far {inr(s.earned)}, less {inr(s.recoveriesDue)} due to payroll, {s.requestsUsed} of {s.requestLimit} requests used).
            </div>
          )}
          {problems.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: T.warn }} aria-label="Why this cannot be approved">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" disabled={problems.length > 0} title={problems[0]} aria-label={`Approve ${inr(r.amount)} for ${fullName(e)}`} onClick={approve}>Approve</Button>
          <Button aria-label={`Decline request from ${fullName(e)}`} onClick={() => setDeclining(true)}>Decline</Button>
        </div>
      </div>
      {declining && (
        <ReasonModal title={`Decline ${fullName(e)}, ${inr(r.amount)}`} intro="The person sees your reason. They can ask again later in the month."
          label="Reason" placeholder="For example: only ₹400 is available now, ask again after the 15th" confirmLabel="Decline" danger
          onSubmit={(t) => { const x = declineWageRequest(r.id, t); if (!x.ok) return x.error; toast.success('Request declined.'); return null; }} onClose={() => setDeclining(false)} />
      )}
    </Row>
  );
}

// ───────────────────────────── the view ─────────────────────────────
export default function WageHr({ db, wf, standings, narrow }: { db: HrmsDb; wf: WorkforceData; standings: Map<string, WageStanding>; narrow: boolean }) {
  const { policy, requests } = wf.wage;
  const sum = wageSummary(db, policy, requests, TODAY);
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending').sort((a, b) => (b.decidedOn ?? b.requestedOn).localeCompare(a.decidedOn ?? a.requestedOn));
  const scheduled = requests.filter((r) => r.status === 'approved');
  const name = (id: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : id; };

  type Person = { id: string; s: WageStanding };
  const people: Person[] = Array.from(standings.entries()).map(([id, s]) => ({ id, s }));
  const cols: Col<Person>[] = [
    { key: 'emp', label: 'Employee', render: (p) => <EmployeeCell e={db.employees.find((e) => e.id === p.id)!} href={false} />, sortValue: (p) => name(p.id) },
    { key: 'ok', label: 'Eligible', render: (p) => (p.s.eligible ? <Badge tone="ok" dot>Yes</Badge> : <span style={{ fontSize: 12.5, color: T.dim }}><Badge tone="neutral" dot>No</Badge> {p.s.reasons[0]}</span>), sortValue: (p) => (p.s.eligible ? 0 : 1) },
    { key: 'earned', label: 'Earned so far', align: 'right', render: (p) => inr(p.s.earned), sortValue: (p) => p.s.earned, nowrap: true },
    { key: 'due', label: 'Due to payroll', align: 'right', render: (p) => (p.s.recoveriesDue ? inr(p.s.recoveriesDue) : '—'), sortValue: (p) => p.s.recoveriesDue, nowrap: true },
    { key: 'drawn', label: 'Drawn', align: 'right', render: (p) => (p.s.drawn ? inr(p.s.drawn) : '—'), sortValue: (p) => p.s.drawn, nowrap: true },
    { key: 'req', label: 'Requests', align: 'right', render: (p) => `${p.s.requestsUsed} of ${p.s.requestLimit}`, nowrap: true },
    { key: 'avail', label: 'Available', align: 'right', render: (p) => <b>{inr(p.s.available)}</b>, sortValue: (p) => p.s.available, nowrap: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatGrid>
        <Stat label="Waiting for a decision" value={sum.pending} tone={sum.pending ? 'warn' : undefined} hint={sum.pending ? 'In the inbox below' : 'Nothing waiting'} />
        <Stat label="Approved this month" value={inr(sum.approvedThisMonth)} hint={`${sum.requestsThisMonth} of the month's requests so far`} />
        <Stat label="Outstanding to recover" value={inr(sum.outstanding)} hint="Recovered by the next payroll run" />
        <Stat label="Can draw today" value={`${sum.eligible} of ${sum.eligibleTotal}`} hint={`${inr(sum.availableTotal)} available in total`} />
      </StatGrid>

      <div style={twoCol(narrow, 420)}>
        <PolicyCard policy={policy} />
        <Panel title="Requests inbox" testId="inbox" right={<Badge tone={pending.length ? 'warn' : 'neutral'}>{pending.length} waiting</Badge>}>
          {pending.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.dim }}>Nothing waiting. Requests made in the Employee view appear here.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{pending.map((r) => <InboxRow key={r.id} db={db} wage={wf.wage} r={r} />)}</div>
          )}
          <div style={{ ...muted, marginTop: 12 }}>
            Approving checks the request again against today&rsquo;s numbers. It cannot go through for more than is available or for someone who is not eligible. A person decides every request.
          </div>
        </Panel>
      </div>

      <Panel title="Recovery schedule" testId="recovery" right={<Link href="/dashboard/hrms/payroll?tab=loans" style={{ fontSize: 13, color: T.info, fontWeight: 600 }}>Open Loans and advances in Payroll</Link>}>
        {scheduled.length === 0 ? (
          <div style={{ fontSize: 13.5, color: T.dim }}>No approved advance is waiting to be recovered. An approved request becomes an advance in Payroll and is taken in one deduction.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scheduled.map((r) => {
              const loan = db.loans.find((l) => l.id === r.loanId);
              const left = loan ? Math.max(0, loan.principal - loan.recovered) : 0;
              return (
                <Row key={r.id} testId={`recovery-${r.id}`}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13.5 }}><span style={strong}>{name(r.employeeId)}</span>: {inr(r.amount)}{r.fee ? ` plus ${inr(r.fee)} fee` : ''}, taken in the {fmtMonth(r.recoverIn ?? '')} payroll</span>
                    {left > 0 ? <Badge tone="info" dot>{inr(left)} to recover</Badge> : <Badge tone="ok" dot>Recovered</Badge>}
                  </div>
                </Row>
              );
            })}
          </div>
        )}
        <div style={{ ...muted, marginTop: 10 }}>Total still to recover: <b style={{ color: T.text }}>{inr(sum.outstanding)}</b></div>
      </Panel>

      <Panel title="Who can draw today" testId="eligibility" right={<span style={muted}>Worked out from payroll, loans and attendance</span>}>
        <DataTable columns={cols} rows={people.map((p) => ({ ...p, id: p.id }))} minWidth={820} empty="No employees." />
        <div style={{ marginTop: 12 }}>
          <Note>
            <b>How the amount is worked out.</b> Net pay for the month at full attendance, times the days gone so far (counting today) over the days in the month, less loss-of-pay days. Take off the loans and advances payroll will recover this month. The person can draw {policy.maxSharePct}% of that, rounded down to {inr(ROUND_TO)}, less what they already drew.
          </Note>
        </div>
      </Panel>

      <Panel title="History" testId="history">
        <DataTable
          columns={[
            { key: 'who', label: 'Employee', render: (r: WageRequest) => name(r.employeeId), sortValue: (r: WageRequest) => name(r.employeeId) },
            { key: 'amt', label: 'Amount', align: 'right', render: (r: WageRequest) => inr(r.amount), sortValue: (r: WageRequest) => r.amount, nowrap: true },
            { key: 'month', label: 'Salary of', render: (r: WageRequest) => fmtMonth(r.month), nowrap: true },
            { key: 'st', label: 'Status', render: (r: WageRequest) => <Badge tone={REQUEST_TONE[r.status]} dot>{REQUEST_WORD[r.status]}</Badge>, nowrap: true },
            { key: 'by', label: 'Decided', render: (r: WageRequest) => (r.decidedOn ? `${fmtDate(r.decidedOn)} by ${r.decidedBy}` : '—') },
            { key: 'why', label: 'Note', render: (r: WageRequest) => r.reason ?? r.note ?? '—' },
          ] as Col<WageRequest>[]}
          rows={decided} minWidth={760} empty="No decided requests yet."
        />
      </Panel>
    </div>
  );
}
