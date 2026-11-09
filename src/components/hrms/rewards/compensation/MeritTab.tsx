'use client';
// Merit cycle: budget, guidelines, proposals by the manager, HR approval, the finance view, and issuing approved increments.
// Guidance is advisory. A person decides every number, can see the evidence, and the employee can reply to their rating.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, EmployeeCell, Modal, Note, ProgressBar, T, useIsCompact, type Col } from '../../ui';
import { Field, Input, Select, Textarea } from '../../../ui';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { PF, rowOn } from '../../../../lib/hrms/rules';
import { fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import {
  PERF_LABEL, PERF_ORDER, ZONES, ZONE_LABEL, baseCtcFor, checkProposal, compaRatio, cycleMembership, financeSummary, meritTotals, pfImpact, validatePct, zoneOf, type PfImpact,
} from '../../../../lib/hrms/rewards/engines';
import {
  cycleBlockers, decideCycle, reopenCycle, setBudgetPct, setEffectiveOn, setGuideline, setPerf, setPerfReply, setProposal, submitCycle,
} from '../../../../lib/hrms/rewards/store';
import type { PerfBand, RewardsState } from '../../../../lib/hrms/rewards/types';
import { ActivityLog, AdvisorNote, CommitNumber, CommitText, ConfirmModal, Muted, report } from '../common';
import { applyIncrement, previewIncrement, type IncrementPreview } from './apply';

const STATUS_LABEL = { draft: 'Draft, with managers', submitted: 'With HR for approval', approved: 'Approved', returned: 'Returned to managers' } as const;
const STATUS_TONE = { draft: 'neutral', submitted: 'info', approved: 'ok', returned: 'warn' } as const;

function PerfModal({ db, st, employeeId, locked, onClose }: { db: HrmsDb; st: RewardsState; employeeId: string; locked: boolean; onClose: () => void }) {
  const e = db.employees.find((x) => x.id === employeeId);
  const note = st.comp.perfNotes[employeeId];
  const [reply, setReply] = useState(note?.reply ?? '');
  if (!e) return null;
  return (
    <Modal title={`Rating details: ${fullName(e)}`} onClose={onClose} width={560}
      footer={<><Button style={{ height: 40 }} onClick={onClose}>Close</Button><Button variant="primary" style={{ height: 40 }} disabled={reply.trim() === (note?.reply ?? '')} onClick={() => { setPerfReply(employeeId, reply); toast.success('Reply recorded.'); onClose(); }}>Save reply</Button></>}>
      <div style={{ fontSize: 14 }}>Performance band: <b>{PERF_LABEL[st.comp.perf[employeeId] ?? 'unrated']}</b> <Badge tone="info">Sample, entered here</Badge></div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 4 }}>Evidence on record</div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{note?.evidence ?? 'No evidence recorded. A rating without evidence should not drive pay.'}</div>
      </div>
      <Field label="Employee's reply" htmlFor="perf-reply" hint={locked ? 'The cycle is locked, but a reply can still be recorded.' : 'The employee can reply to their rating before pay is final.'}>
        <Textarea id="perf-reply" rows={3} value={reply} onChange={(ev) => setReply(ev.target.value)} />
      </Field>
      <Muted>The performance module is not connected in this preview. The band is a sample kept in this area. Guidance from it is advice; a manager and HR decide each increment.</Muted>
    </Modal>
  );
}

function DecideModal({ kind, over, onClose }: { kind: 'approve' | 'return'; over: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const needs = kind === 'return' || over;
  function go() {
    const r = decideCycle(kind, text, over);
    if (!r.ok) { setErr(r.error); return; }
    report(r, kind === 'approve' ? 'Merit cycle approved.' : 'Merit cycle returned to managers.');
    onClose();
  }
  return (
    <Modal title={kind === 'approve' ? 'Approve the merit cycle' : 'Return to managers'} onClose={onClose} width={500}
      footer={<><Button style={{ height: 40 }} onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={go}>{kind === 'approve' ? 'Approve' : 'Return'}</Button></>}>
      {kind === 'approve' && over && <Note tone="warn">The proposed total is over the budget. Say why you are approving it anyway.</Note>}
      <Field label={kind === 'approve' ? (over ? 'Reason for approving over budget' : 'Note (optional)') : 'What should managers change'} required={needs} htmlFor="decide-note" error={err}>
        <Textarea id="decide-note" rows={3} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} />
      </Field>
      <Muted>This is a human decision. It is recorded with your name and today&apos;s date.</Muted>
    </Modal>
  );
}

export default function MeritTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const narrow = useIsCompact(700);
  const cycle = st.comp.cycle;
  const open = cycle.status === 'draft' || cycle.status === 'returned';
  const [perfFor, setPerfFor] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<IncrementPreview | null>(null);
  const [decide, setDecide] = useState<'approve' | 'return' | null>(null);
  const [lastIssued, setLastIssued] = useState<{ id: string; name: string; before: number; after: number } | null>(null);

  const members = useMemo(() => cycleMembership(db, cycle), [db, cycle]);
  const rows = useMemo(() => members.filter((m) => m.included).flatMap((m) => {
    const e = m.employee;
    const grade = db.designations.find((d) => d.id === e.designationId)?.grade;
    const band = st.comp.bands.find((b) => b.grade === grade);
    if (!band || !grade) return [];
    const base = baseCtcFor(e, cycle);
    const p = cycle.proposals[e.id];
    const perf = st.comp.perf[e.id];
    const chk = checkProposal(base, band, perf, cycle.guidelines, p);
    return [{ id: e.id, e, grade, band, base, compa: compaRatio(base, band.mid), p, perf, chk, applied: cycle.applied[e.id] }];
  }), [members, db.designations, st.comp, cycle]);
  const notIn = members.filter((m) => !m.included);

  const totals = meritTotals(rows.map((r) => ({ base: r.base, delta: r.p ? r.chk.delta : 0, hasProposal: !!r.p })), cycle.budgetPct);
  const impacts: (PfImpact | null)[] = rows.filter((r) => r.p && r.chk.delta > 0).map((r) => pfImpact(db, r.e, r.base, r.chk.newCtc, cycle.effectiveOn));
  const fin = financeSummary(impacts, rows.filter((r) => r.p).map((r) => r.chk.delta));
  const atCeiling = impacts.filter((i) => i?.atCeiling).length;
  const ceilingRow = rowOn(PF.ceiling, cycle.effectiveOn);
  const blockers = cycleBlockers(st);
  const missing = rows.filter((r) => r.chk.needsReason).length;

  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'emp', label: 'Employee', sortValue: (r) => fullName(r.e).toLowerCase(), render: (r) => <EmployeeCell e={r.e} href={false} sub={`${r.grade} · ${db.designations.find((d) => d.id === r.e.designationId)?.name ?? ''}`} /> },
    { key: 'ctc', label: 'CTC now and compa-ratio', align: 'right', nowrap: true, sortValue: (r) => r.base, render: (r) => (<div><div>{inr(r.base)}</div><div style={{ fontSize: 12, color: T.mute }}>Compa {r.compa.toFixed(2)} · {ZONE_LABEL[zoneOf(r.compa)].split(',')[0]}</div></div>) },
    {
      key: 'perf', label: 'Performance band', sortValue: (r) => r.perf ?? 'unrated',
      render: (r) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Select aria-label={`Performance band for ${fullName(r.e)}`} value={r.perf ?? 'unrated'} disabled={!open} style={{ width: 120 }} onChange={(ev) => setPerf(r.id, ev.target.value as PerfBand)}>
            {PERF_ORDER.map((p) => <option key={p} value={p}>{PERF_LABEL[p]}</option>)}
          </Select>
          <button type="button" aria-label={`Rating details for ${fullName(r.e)}`} onClick={() => setPerfFor(r.id)} style={{ border: 0, background: 'transparent', color: T.info, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', padding: 4 }}>Details</button>
        </div>
      ),
    },
    {
      key: 'pct', label: 'Proposed and suggested', align: 'right', sortValue: (r) => r.p?.pct ?? -1,
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <CommitNumber label={`Proposed increment for ${fullName(r.e)}`} testId={`pct-${r.id}`} value={r.p?.pct ?? null} suffix="%" width={72} disabled={!open || !!r.applied}
            invalid={!!r.p && r.chk.needsReason}
            onCommit={(_v, raw) => {
              if (raw === '') { setProposal(r.id, null); return; }
              const ok = validatePct(raw);
              if (!ok.ok) { toast.error(ok.error); return; }
              const res = setProposal(r.id, ok.value, r.p?.reason);
              if (!res.ok) toast.error(res.error);
            }} />
          <span style={{ fontSize: 12, color: T.mute, whiteSpace: 'nowrap' }}>Suggested <span data-testid={`guide-${r.id}`}>{r.chk.guide.min === r.chk.guide.max ? `${r.chk.guide.min}%` : `${r.chk.guide.min} to ${r.chk.guide.max}%`}</span></span>
        </div>
      ),
    },
    { key: 'new', label: 'New CTC', align: 'right', nowrap: true, sortValue: (r) => (r.p ? r.chk.newCtc : 0), render: (r) => (r.p ? (<div><div>{inr(r.chk.newCtc)}</div><div style={{ fontSize: 12, color: T.mute }}>+{inr(r.chk.delta)} a year</div></div>) : <span style={{ color: T.mute }}>—</span>) },
    {
      key: 'check', label: 'Check', width: 230,
      render: (r) => {
        if (!r.p) return <span style={{ color: T.mute }}>No proposal</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
            {r.chk.outside ? <Badge tone="warn" dot>Outside guidance</Badge> : <Badge tone="ok" dot>Within guidance</Badge>}
            {r.chk.outside && (
              <CommitText label={`Reason for ${fullName(r.e)}`} testId={`reason-${r.id}`} placeholder="Reason (required)" value={r.p.reason ?? ''} invalid={r.chk.needsReason} disabled={!open || !!r.applied}
                onCommit={(v) => { const res = setProposal(r.id, r.p!.pct, v); if (!res.ok) toast.error(res.error); }} />
            )}
            {r.chk.needsReason && <span style={{ fontSize: 12, color: T.red }}>A reason is needed.</span>}
            {r.chk.aboveMax && <span style={{ fontSize: 12, color: T.dim }}>Takes pay above the band maximum ({inr(r.band.max)}).</span>}
          </div>
        );
      },
    },
    {
      key: 'issue', label: 'Issue', align: 'right', nowrap: true,
      render: (r) => {
        if (r.applied) return <Badge tone="ok" dot>Issued {fmtDate(r.applied.on)}</Badge>;
        if (!r.p || r.chk.delta <= 0) return <span style={{ color: T.mute }}>—</span>;
        if (cycle.status !== 'approved') return <span style={{ color: T.mute, fontSize: 12.5 }}>After approval</span>;
        return <Button size="sm" variant="primary" aria-label={`Issue increment to ${fullName(r.e)}`} onClick={() => { const pv = previewIncrement(r.id); if ('error' in pv) toast.error(pv.error); else setIssuing(pv); }}>Issue increment</Button>;
      },
    },
  ];

  function doIssue() {
    if (!issuing) return;
    const r = applyIncrement(issuing.employeeId);
    if (!r.ok) { toast.error(r.error); return; }
    setLastIssued({ id: issuing.employeeId, name: issuing.name, before: r.before, after: r.after });
    toast.success(`Increment issued to ${issuing.name}. The letter is in the register.`);
    setIssuing(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 16 }}>{cycle.name}</h2>
            <div style={{ fontSize: 13, color: T.dim, marginTop: 2 }}>Effective {fmtDate(cycle.effectiveOn)} · {rows.length} people in the cycle</div>
          </div>
          <Badge tone={STATUS_TONE[cycle.status]} dot><span data-testid="cycle-status">{STATUS_LABEL[cycle.status]}</span></Badge>
        </div>
        {cycle.decision && <div style={{ fontSize: 13, color: T.dim, marginTop: 8 }} data-testid="cycle-decision">{cycle.status === 'approved' ? 'Approved' : 'Returned'} by {cycle.decision.by} on {fmtDate(cycle.decision.on)}{cycle.decision.note ? `: ${cycle.decision.note}` : '.'}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Budget, percent of payroll" htmlFor="budget-pct" style={{ width: 170 }}>
              <CommitNumber label="Budget as percent of payroll" testId="budget-pct" value={cycle.budgetPct} suffix="%" width={90} disabled={!open}
                onCommit={(v) => { if (v == null) { toast.error('Enter a budget percent.'); return; } const r = setBudgetPct(v); if (!r.ok) toast.error(r.error); }} />
            </Field>
            <Field label="Effective date" htmlFor="eff-date" style={{ width: 170 }}>
              <Input id="eff-date" type="date" value={cycle.effectiveOn} min={PREVIEW_TODAY} disabled={!open} onChange={(e) => { if (e.target.value) { const r = setEffectiveOn(e.target.value); if (!r.ok) toast.error(r.error); } }} />
            </Field>
          </div>
          <div data-testid="merit-totals" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
              <span>Payroll in the cycle <b>{inr(totals.payroll)}</b></span>
              <span>Budget <b data-testid="total-budget">{inr(totals.budget)}</b></span>
              <span>Proposed <b data-testid="total-proposed">{inr(totals.proposed)}</b> ({totals.avgPct}%)</span>
            </div>
            <ProgressBar pct={totals.usedPct} tone={totals.over ? 'red' : totals.usedPct > 90 ? 'warn' : 'ok'} height={10} />
            <div style={{ fontSize: 13, color: totals.over ? T.red : T.dim }} data-testid="total-remaining">
              {totals.over ? `Over budget by ${inr(-totals.remaining)}` : `${inr(totals.remaining)} left in the budget`} · {totals.withProposal} of {totals.people} people have a proposal
            </div>
          </div>
        </div>
      </Card>

      {lastIssued && (
        <Note tone="ok">
          <span data-testid="issued-banner">Increment issued to {lastIssued.name}: CTC {inr(lastIssued.before)} to {inr(lastIssued.after)}. The letter is in the register.</span>{' '}
          <Link href={`/dashboard/hrms/employees/${lastIssued.id}?tab=salary`} style={{ color: 'inherit', fontWeight: 700 }}>Open salary</Link>{' · '}
          <Link href="/dashboard/hrms/lifecycle?tab=letters" style={{ color: 'inherit', fontWeight: 700 }}>Open letters</Link>
        </Note>
      )}

      <Card>
        <CardTitle right={<ConfidenceBadge level="indicative" />}>Guidelines: performance band by compa-ratio zone</CardTitle>
        <Muted style={{ marginBottom: 10 }}>Suggested increment range, in percent. These are sample ranges. Edit them until they match your policy. They guide the manager; they do not decide.</Muted>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="guideline-matrix" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: 13.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>Band</th>
                {ZONES.map((z) => <th key={z} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{ZONE_LABEL[z]}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERF_ORDER.map((p) => (
                <tr key={p}>
                  <td style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, fontWeight: 600 }}>{PERF_LABEL[p]}</td>
                  {ZONES.map((z) => {
                    const g = cycle.guidelines[p][z];
                    const save = (min: number | null, max: number | null) => { const r = setGuideline(p, z, min ?? g.min, max ?? g.max); if (!r.ok) toast.error(r.error); };
                    return (
                      <td key={z} style={{ padding: '6px 10px', borderTop: `1px solid ${T.border}` }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <CommitNumber label={`${PERF_LABEL[p]}, ${z} zone, lowest percent`} value={g.min} width={54} disabled={!open} onCommit={(v) => save(v, null)} />
                          <span style={{ color: T.mute }}>to</span>
                          <CommitNumber label={`${PERF_LABEL[p]}, ${z} zone, highest percent`} value={g.max} width={54} disabled={!open} suffix="%" onCommit={(v) => save(null, v)} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Muted style={{ marginTop: 8 }}>Compa-ratio zones: under 0.90 is low, 0.90 to 1.10 is middle, over 1.10 is high. People with no rating use the &quot;Not rated&quot; row.</Muted>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15 }}>Proposals by managers</h2>
        <Note tone="info">Enter the percent for each person. A proposal outside the suggested range needs a written reason. Ratings are sample bands kept here, with the evidence and the employee&apos;s reply under <b>Details</b>. Managers propose; HR and the manager decide.</Note>
        <div data-testid="merit-table"><DataTable columns={cols} rows={rows} minWidth={980} empty="Nobody is in this cycle." /></div>
        {notIn.length > 0 && (
          <details data-testid="not-in-cycle" style={{ fontSize: 13.5 }}>
            <summary style={{ cursor: 'pointer', color: T.dim }}>Not in this cycle ({notIn.length})</summary>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: T.dim }}>{notIn.map((m) => <li key={m.employee.id}>{fullName(m.employee)}: {m.reason}</li>)}</ul>
          </details>
        )}
      </div>

      <Card>
        <CardTitle>Approval</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ol style={{ display: 'flex', gap: 8, flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
            <li><Badge tone={open ? 'info' : 'ok'} dot>1 Managers propose</Badge></li>
            <li><Badge tone={cycle.status === 'submitted' ? 'info' : cycle.status === 'approved' ? 'ok' : 'neutral'} dot>2 HR approves</Badge></li>
            <li><Badge tone={Object.keys(cycle.applied).length ? 'ok' : cycle.status === 'approved' ? 'info' : 'neutral'} dot>3 Increments issued ({Object.keys(cycle.applied).length})</Badge></li>
          </ol>
          {open && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" style={{ height: 40 }} disabled={blockers.length > 0} onClick={() => report(submitCycle(), 'Submitted to HR for approval.')}>Submit to HR for approval</Button>
              {blockers.length > 0 && <span data-testid="submit-blockers" style={{ fontSize: 13, color: T.dim }}>{blockers.join(' ')}{missing > 0 ? ' Fill them in the Check column.' : ''}</span>}
            </div>
          )}
          {cycle.status === 'submitted' && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" style={{ height: 40 }} onClick={() => setDecide('approve')}>Approve as HR</Button>
              <Button style={{ height: 40 }} onClick={() => setDecide('return')}>Return to managers</Button>
              <span style={{ fontSize: 13, color: T.dim }}>{totals.over ? 'The total is over budget, so approving needs a reason.' : 'The total is within budget.'}</span>
            </div>
          )}
          {cycle.status === 'approved' && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5 }}>Approved. Use <b>Issue increment</b> on each row. Each person can be issued once in this cycle.</span>
              <Button style={{ height: 40 }} disabled={Object.keys(cycle.applied).length > 0} title={Object.keys(cycle.applied).length ? 'Some increments are issued already' : undefined} onClick={() => report(reopenCycle(), 'Cycle reopened for changes.')}>Reopen for changes</Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle right={<ConfidenceBadge level={ceilingRow.confidence} />}>Finance view: extra cost of the proposals</CardTitle>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="finance-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 13.5 }}>
            <thead>
              <tr>{['', 'A month', 'A year'].map((h, i) => <th key={i} style={{ textAlign: i ? 'right' : 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {[
                ['Increase in CTC (the pool)', fin.ctcAnnual, false, 'fin-ctc'],
                ['of which employer PF, already inside CTC', fin.epfAnnual, true, 'fin-epf'],
                ['Extra EDLI and PF admin charges, outside CTC', fin.offCtcAnnual, false, 'fin-off'],
              ].map(([l, annual, sub, tid]) => (
                <tr key={String(l)}>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, paddingLeft: sub ? 28 : 10, color: sub ? T.dim : T.text }}>{l}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(Math.round(Number(annual) / 12))}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-testid={String(tid)}>{inr(Number(annual))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '10px', borderTop: `2px solid ${T.border}`, fontWeight: 700 }}>Total extra employer cost</td>
                <td style={{ padding: '10px', borderTop: `2px solid ${T.border}`, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} data-testid="fin-total-monthly">{inr(fin.totalMonthly)}</td>
                <td style={{ padding: '10px', borderTop: `2px solid ${T.border}`, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} data-testid="fin-total-annual">{inr(fin.totalAnnual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 13.5, marginTop: 10 }}>
          {fin.people} {fin.people === 1 ? 'person' : 'people'} with an increase. PF wage ceiling in force on {fmtDate(cycle.effectiveOn)} is {inr(rowOn(PF.ceiling, cycle.effectiveOn).value)} a month. {atCeiling} of {fin.people} are already at it, so their increase adds no PF.
        </div>
        <details style={{ marginTop: 10, fontSize: 13, color: T.dim }}>
          <summary style={{ cursor: 'pointer' }}>How this is worked out</summary>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
            <li>New CTC = CTC x (1 + percent), rounded to the nearest 100 rupees. The increase is new CTC minus CTC now.</li>
            <li>The salary structure of each person is rebuilt at the old and new CTC with the payroll engine. The 50% wage rule can lift PF wage.</li>
            <li>Employer PF = 12% of PF wage. PF wage is capped at the ceiling unless the person contributes on actual wages. It sits inside CTC.</li>
            <li>EDLI (0.5%) and PF admin charges (0.5%) apply to PF wage up to the ceiling and are not in CTC, so a change adds to cost.</li>
            <li>ESI and the gratuity provision are not recomputed here. Confirm the ceiling and rates with your advisor.</li>
          </ol>
        </details>
        {fin.noStructure > 0 && <Muted style={{ marginTop: 8 }}>{fin.noStructure} proposals are for people with no salary structure, so their PF effect is not included.</Muted>}
      </Card>

      <ActivityLog log={st.log} area="compensation" />
      <AdvisorNote label="Check the rules before paying.">Pay bands, benchmarks and guideline ranges on this page are samples. PF rates and the ceiling come from the payroll rules in the system with their own confidence tag.</AdvisorNote>

      {perfFor && <PerfModal db={db} st={st} employeeId={perfFor} locked={!open} onClose={() => setPerfFor(null)} />}
      {decide && <DecideModal kind={decide} over={totals.over} onClose={() => setDecide(null)} />}
      {issuing && (
        <ConfirmModal title={`Issue increment to ${issuing.name}`} confirmLabel="Issue increment" width={600} onClose={() => setIssuing(null)} onConfirm={doIssue}
          disabled={issuing.blockers.length > 0} disabledReason={issuing.blockers[0]}>
          <div data-testid="issue-preview" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div><div style={{ fontSize: 12, color: T.mute }}>CTC before</div><div style={{ fontSize: 17, fontWeight: 700 }}>{inr(issuing.before)}</div></div>
            <div><div style={{ fontSize: 12, color: T.mute }}>CTC after ({issuing.pct}%)</div><div style={{ fontSize: 17, fontWeight: 700 }}>{inr(issuing.after)}</div></div>
            <div><div style={{ fontSize: 12, color: T.mute }}>Effective date</div><div style={{ fontSize: 17, fontWeight: 700 }}>{fmtDate(issuing.effectiveOn)}</div></div>
          </div>
          <Note tone="warn">The core record keeps one CTC per person, so this changes it now. A payroll computed after this uses the new figure. Issue it on or just before the effective date.</Note>
          <div>It also issues an increment letter through the Lifecycle letter flow, unsigned, and adds a row to the change log. This is done once per person for this cycle.</div>
          {issuing.letterText && (
            <details>
              <summary style={{ cursor: 'pointer', color: T.dim, fontSize: 13 }}>Letter text</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: T.dim, margin: '8px 0 0' }}>{issuing.letterText}</pre>
            </details>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}
