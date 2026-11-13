'use client';
// Claims tracker for group health: status flow, turnaround ageing, rejected claims with reasons, and the employee's statement
// of what has been claimed against the family sum insured.

import { useId, useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Modal, Note, SearchBox, Stat, StatGrid, T, Toolbar, type Col, type Tone } from '../../ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { Employee, HrmsDb } from '../../../../lib/hrms/types';
import {
  CLAIM_NEXT, CLAIM_REJECTION_REASONS, CLAIM_STATUS_LABEL, CLAIM_TAT, claimSla, claimsStatement, isClosedClaim, planOf, tierOf, type Sla,
} from '../../../../lib/hrms/rewards/engines';
import { moveClaim, registerClaim } from '../../../../lib/hrms/rewards/store';
import type { Claim, ClaimStatus, RewardsState } from '../../../../lib/hrms/rewards/types';
import { AdvisorNote, Muted, report } from '../common';

const STATUS_TONE: Record<ClaimStatus, Tone> = { submitted: 'info', in_review: 'info', query: 'warn', approved: 'ok', settled: 'ok', rejected: 'red' };
const SLA_TONE: Record<Sla['state'], Tone> = { on_track: 'ok', at_risk: 'warn', breached: 'red', met: 'ok', missed: 'red' };
const SLA_LABEL: Record<Sla['state'], string> = { on_track: 'On track', at_risk: 'At risk', breached: 'Over the limit', met: 'Within the limit', missed: 'Closed late' };
const MOVE_LABEL: Record<ClaimStatus, string> = { submitted: 'Submitted', in_review: 'Move to review', query: 'Raise a query', approved: 'Approve', settled: 'Mark settled', rejected: 'Reject' };

function SlaBadge({ c }: { c: Claim }) {
  const s = claimSla(c, PREVIEW_TODAY);
  return <Badge tone={SLA_TONE[s.state]} dot>Day {s.age} of {s.tat}: {SLA_LABEL[s.state]}</Badge>;
}

// ───────────────────────────── detail and moves ─────────────────────────────
function ClaimModal({ db, claim, onClose }: { db: HrmsDb; claim: Claim; onClose: () => void }) {
  const base = useId();
  const emp = db.employees.find((e) => e.id === claim.employeeId);
  const [to, setTo] = useState<ClaimStatus | null>(null);
  const [approved, setApproved] = useState(String(claim.claimed));
  const [reason, setReason] = useState<string>(CLAIM_REJECTION_REASONS[0]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const next = CLAIM_NEXT[claim.status];

  async function go() {
    if (!to || busy) return;
    setBusy(true);
    const r = await moveClaim(claim.id, to, { note, approved: to === 'approved' ? Number(approved) : undefined, reason: to === 'rejected' ? (reason.startsWith('Other') ? note : reason) : undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    report(r, `Claim ${claim.ref} moved to ${CLAIM_STATUS_LABEL[to].toLowerCase()}.`);
    setTo(null); setNote(''); setErr('');
  }

  return (
    <Modal title={`Claim ${claim.ref}`} onClose={onClose} width={640}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={STATUS_TONE[claim.status]} dot>{CLAIM_STATUS_LABEL[claim.status]}</Badge><SlaBadge c={claim} />
        <Badge>{claim.kind === 'cashless' ? 'Cashless' : 'Reimbursement'}</Badge>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <b>{emp ? fullName(emp) : '—'}</b>, patient: {claim.patient}{claim.relation !== 'self' ? ` (${claim.relation})` : ''}<br />
        {claim.hospital}. Claimed {inr(claim.claimed)}{claim.approved != null ? `, approved ${inr(claim.approved)}` : ''}. Filed {fmtDate(claim.filedOn)}{claim.closedOn ? `, closed ${fmtDate(claim.closedOn)}` : ''}.
      </div>
      {claim.status === 'rejected' && (
        <Note tone="red"><b>Rejected:</b> {claim.rejectionReason}. Share this with the employee. They can reply, and a reply reopens the claim for review. A person decides the outcome.</Note>
      )}
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 13.5, fontFamily: T.heading }}>Status trail</h3>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {claim.trail.map((t, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13 }}>
              <span style={{ color: T.dim, flex: '0 0 92px' }}>{fmtDate(t.on)}</span>
              <span style={{ flex: '1 1 0', minWidth: 0, overflowWrap: 'anywhere' }}><b>{CLAIM_STATUS_LABEL[t.status]}</b>{t.note && <span style={{ color: T.dim }}>. {t.note}</span>}</span>
            </li>
          ))}
        </ol>
      </div>
      {next.length > 0 && !to && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {next.map((s) => <Button key={s} variant={s === 'rejected' ? 'danger' : s === 'approved' || s === 'settled' ? 'primary' : 'secondary'} style={{ height: 40 }}
            onClick={() => { setTo(s); setErr(''); }}>{claim.status === 'rejected' ? 'Reopen for review' : MOVE_LABEL[s]}</Button>)}
        </div>
      )}
      {next.length === 0 && <Muted>A settled claim is final.</Muted>}
      {to && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <b style={{ fontSize: 14 }}>{claim.status === 'rejected' ? 'Reopen for review' : MOVE_LABEL[to]}</b>
          {to === 'approved' && (
            <Field label="Approved amount (₹)" required htmlFor={`${base}-amt`} hint={`Claimed ${inr(claim.claimed)}.`}>
              <Input id={`${base}-amt`} inputMode="numeric" value={approved} onChange={(e) => setApproved(e.target.value.replace(/\D/g, ''))} />
            </Field>
          )}
          {to === 'rejected' && (
            <Field label="Reason for rejection" required htmlFor={`${base}-why`}>
              <Select id={`${base}-why`} value={reason} onChange={(e) => setReason(e.target.value)}>{CLAIM_REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
            </Field>
          )}
          <Field label={claim.status === 'rejected' ? "Employee's reply or reason for review" : 'Note'} required={claim.status === 'rejected' || (to === 'rejected' && reason.startsWith('Other'))} htmlFor={`${base}-note`} error={err}>
            <Textarea id={`${base}-note`} rows={2} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button style={{ height: 40 }} onClick={() => setTo(null)}>Back</Button>
            <Button variant={to === 'rejected' ? 'danger' : 'primary'} style={{ height: 40 }} disabled={busy} onClick={go}>Confirm</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────── register ─────────────────────────────
function RegisterModal({ db, st, onClose }: { db: HrmsDb; st: RewardsState; onClose: () => void }) {
  const base = useId();
  const enrolled = st.benefits.enrolments.filter((e) => e.status === 'enrolled').map((e) => db.employees.find((x) => x.id === e.employeeId)).filter((e): e is Employee => !!e);
  const [empId, setEmpId] = useState('');
  const [patient, setPatient] = useState('self');
  const [kind, setKind] = useState<Claim['kind']>('cashless');
  const [hospital, setHospital] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const en = st.benefits.enrolments.find((e) => e.employeeId === empId);
  async function go() {
    if (busy) return;
    const dep = en?.dependants.find((d) => d.id === patient);
    setBusy(true);
    const r = await registerClaim({ employeeId: empId, patient: dep?.name ?? 'Self', relation: dep ? dep.relation : 'self', kind, hospital, claimed: Number(amount) });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    report(r, `Claim ${r.ref} registered.`);
    onClose();
  }
  return (
    <Modal title="Register a claim" onClose={onClose} width={540}
      footer={<><Button style={{ height: 40 }} onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} disabled={busy} onClick={go}>Register claim</Button></>}>
      <Field label="Employee" required htmlFor={`${base}-e`}>
        <Select id={`${base}-e`} value={empId} onChange={(e) => { setEmpId(e.target.value); setPatient('self'); setErr(''); }}>
          <option value="">Select an enrolled employee</option>
          {enrolled.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
        </Select>
      </Field>
      <FormGrid narrow>
        <Field label="Patient" required htmlFor={`${base}-p`}>
          <Select id={`${base}-p`} value={patient} disabled={!empId} onChange={(e) => setPatient(e.target.value)}>
            <option value="self">Self</option>
            {en?.dependants.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.relation})</option>)}
          </Select>
        </Field>
        <Field label="Type" htmlFor={`${base}-k`}>
          <Select id={`${base}-k`} value={kind} onChange={(e) => setKind(e.target.value as Claim['kind'])}>
            <option value="cashless">Cashless (hospital is paid directly)</option>
            <option value="reimbursement">Reimbursement</option>
          </Select>
        </Field>
        <Field label="Hospital or clinic" required htmlFor={`${base}-h`}><Input id={`${base}-h`} value={hospital} onChange={(e) => setHospital(e.target.value)} /></Field>
        <Field label="Amount claimed (₹)" required htmlFor={`${base}-a`}><Input id={`${base}-a`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
      </FormGrid>
      {err && <Note tone="red">{err}</Note>}
      <Muted>Sample turnaround: {CLAIM_TAT.cashless} days for cashless, {CLAIM_TAT.reimbursement} days for reimbursement, counted from today.</Muted>
    </Modal>
  );
}

// ───────────────────────────── statement ─────────────────────────────
function Statement({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const health = planOf(st.benefits.plans, 'health')!;
  const enrolled = st.benefits.enrolments.filter((e) => e.status === 'enrolled' && tierOf(health, e.healthTier));
  const [empId, setEmpId] = useState(enrolled[0]?.employeeId ?? '');
  const en = enrolled.find((e) => e.employeeId === empId);
  const tier = tierOf(health, en?.healthTier);
  const s = en && tier?.sumInsured ? claimsStatement(st.benefits.claims, empId, tier.sumInsured) : null;
  return (
    <Card>
      <CardTitle right={(
        <Select aria-label="Employee for the statement" value={empId} style={{ width: 230 }} onChange={(e) => setEmpId(e.target.value)}>
          {enrolled.map((e) => <option key={e.employeeId} value={e.employeeId}>{fullName(db.employees.find((x) => x.id === e.employeeId)!)}</option>)}
        </Select>
      )}>Statement: claimed against sum insured</CardTitle>
      {!s ? <Muted>Choose an enrolled employee.</Muted> : (
        <div data-testid="claims-statement" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13.5, color: T.dim }}>Family floater of {tier!.label}. One sum insured is shared by the employee and every covered family member.</div>
          <div style={{ height: 14, borderRadius: 8, background: T.raised, overflow: 'hidden', display: 'flex' }} aria-hidden>
            <div style={{ width: `${(s.paid / s.sumInsured) * 100}%`, background: 'var(--info)' }} />
            <div style={{ width: `${(s.inProcess / s.sumInsured) * 100}%`, background: 'var(--warn)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              ['sum', 'Sum insured', inr(s.sumInsured)], ['paid', 'Approved or paid', inr(s.paid)], ['process', 'Claimed, in process', inr(s.inProcess)], ['available', 'Available now', inr(s.availableNow)], ['ifpaid', 'If all in-process claims are paid in full', inr(s.availableIfAllPaid)],
            ].map(([k, l, v]) => (<div key={k}><div style={{ fontSize: 12, color: T.mute }}>{l}</div><div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} data-testid={`stmt-${k}`}>{v}</div></div>))}
          </div>
          <Muted>{s.claims.length} {s.claims.length === 1 ? 'claim' : 'claims'}. Rejected claims use none of the sum insured.</Muted>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────────── tab ─────────────────────────────
interface Row { id: string; c: Claim; emp?: Employee; sla: Sla }

export default function ClaimsTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const all: Row[] = useMemo(() => st.benefits.claims.map((c) => ({ id: c.id, c, emp: db.employees.find((e) => e.id === c.employeeId), sla: claimSla(c, PREVIEW_TODAY) })).sort((a, b) => (a.c.filedOn < b.c.filedOn ? 1 : -1)), [st.benefits.claims, db.employees]);
  const rows = all.filter((r) => (!status || r.c.status === status) && (!kind || r.c.kind === kind) && (!q.trim() || `${r.c.ref} ${r.emp ? fullName(r.emp) : ''} ${r.c.patient} ${r.c.hospital}`.toLowerCase().includes(q.trim().toLowerCase())));
  const open = all.filter((r) => !isClosedClaim(r.c.status));
  const rejected = all.filter((r) => r.c.status === 'rejected');
  const late = open.filter((r) => r.sla.state === 'breached').length;

  const cols: Col<Row>[] = [
    { key: 'ref', label: 'TPA ref', nowrap: true, sortValue: (r) => r.c.ref, render: (r) => <button type="button" onClick={() => setOpenId(r.id)} aria-label={`Open claim ${r.c.ref}`} style={{ border: 0, background: 'transparent', padding: 0, fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: T.info, cursor: 'pointer' }}>{r.c.ref}</button> },
    { key: 'emp', label: 'Employee and patient', sortValue: (r) => (r.emp ? fullName(r.emp).toLowerCase() : ''), render: (r) => (r.emp ? <EmployeeCell e={r.emp} href={false} sub={`Patient: ${r.c.patient}`} /> : '—') },
    { key: 'kind', label: 'Type', nowrap: true, sortValue: (r) => r.c.kind, render: (r) => (r.c.kind === 'cashless' ? 'Cashless' : 'Reimbursement') },
    { key: 'amt', label: 'Claimed', align: 'right', nowrap: true, sortValue: (r) => r.c.claimed, render: (r) => (<div><div>{inr(r.c.claimed)}</div>{r.c.approved != null && <div style={{ fontSize: 12, color: T.mute }}>Approved {inr(r.c.approved)}</div>}</div>) },
    { key: 'filed', label: 'Filed', nowrap: true, sortValue: (r) => r.c.filedOn, render: (r) => fmtDate(r.c.filedOn) },
    { key: 'status', label: 'Status', nowrap: true, sortValue: (r) => r.c.status, render: (r) => <Badge tone={STATUS_TONE[r.c.status]} dot>{CLAIM_STATUS_LABEL[r.c.status]}</Badge> },
    { key: 'sla', label: 'Turnaround', nowrap: true, sortValue: (r) => r.sla.age, render: (r) => <SlaBadge c={r.c} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatGrid min={170}>
        <Stat label="Open claims" value={open.length} hint={`${inr(open.reduce((s, r) => s + r.c.claimed, 0))} claimed`} />
        <Stat label="Over the turnaround" value={late} tone={late ? 'red' : 'ok'} hint="Sample turnaround times" />
        <Stat label="Settled" value={all.filter((r) => r.c.status === 'settled').length} tone="ok" hint={inr(all.filter((r) => r.c.status === 'settled').reduce((s, r) => s + (r.c.approved ?? 0), 0))} />
        <Stat label="Rejected" value={rejected.length} tone={rejected.length ? 'warn' : undefined} hint="Each has a reason on record" />
      </StatGrid>
      <AdvisorNote label="Replace them with the TPA agreement.">Turnaround times are samples: {CLAIM_TAT.cashless} days for cashless and {CLAIM_TAT.reimbursement} days for reimbursement, counted from filing to a decision or payment.</AdvisorNote>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search ref, name, patient or hospital" width={300} />
        <Select aria-label="Filter claims by status" value={status} style={{ width: 160 }} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map((s) => <option key={s} value={s}>{CLAIM_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Filter claims by type" value={kind} style={{ width: 230 }} onChange={(e) => setKind(e.target.value)}>
          <option value="">Cashless and reimbursement</option><option value="cashless">Cashless</option><option value="reimbursement">Reimbursement</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><Button variant="primary" style={{ height: 40 }} onClick={() => setRegistering(true)}>Register a claim</Button></div>
      </Toolbar>
      <div data-testid="claims-table"><DataTable columns={cols} rows={rows} minWidth={940} onRowClick={(r) => setOpenId(r.id)} empty="No claim matches these filters." /></div>

      <Card>
        <CardTitle right={<Badge tone={rejected.length ? 'warn' : 'ok'}>{rejected.length}</Badge>}>Rejected claims and why</CardTitle>
        {rejected.length === 0 ? <Muted>No claim has been rejected.</Muted> : (
          <ul data-testid="rejected-claims" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rejected.map((r, i) => (
              <li key={r.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0, fontSize: 13.5 }}>
                <b>{r.emp ? fullName(r.emp) : '—'}</b>, {r.c.patient}, {inr(r.c.claimed)} ({r.c.ref}). <span style={{ color: T.dim }}>Reason: {r.c.rejectionReason}.</span>{' '}
                <button type="button" onClick={() => setOpenId(r.id)} style={{ border: 0, background: 'transparent', color: T.info, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 13.5 }}>Review</button>
              </li>
            ))}
          </ul>
        )}
        <Muted style={{ marginTop: 8 }}>The employee can reply to a rejection. Reopening a claim with their reply puts it back in review.</Muted>
      </Card>

      <Statement db={db} st={st} />
      {openId && st.benefits.claims.find((c) => c.id === openId) && <ClaimModal db={db} claim={st.benefits.claims.find((c) => c.id === openId)!} onClose={() => setOpenId(null)} />}
      {registering && <RegisterModal db={db} st={st} onClose={() => setRegistering(false)} />}
    </div>
  );
}
