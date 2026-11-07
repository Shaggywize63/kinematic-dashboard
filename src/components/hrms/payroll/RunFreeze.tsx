'use client';
// Run steps 4 and 5: Review (is the run ready?) and Freeze (lock it, with an audit trail and a reasoned unfreeze).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, DataTable, EmptyState, KeyValue, Modal, Note, T, type Col } from '../ui';
import { Field, Textarea } from '../../ui';
import type { HrmsDb, PayRun } from '../../../lib/hrms/types';
import { employeesForRun, runTotals } from '../../../lib/hrms/engine';
import { CALENDAR_RULES } from '../../../lib/hrms/rules';
import { addMonths, fmtDate, fmtDateTime, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { freezeRunSafe, unfreezeRunSafe } from '../../../lib/hrms/payrollActions';
import { CHANGE_THRESHOLD_PCT, acknowledgedBlockers, comparePayslips, runIsStale } from './logic';
import { blockerCount } from './RunChecks';
import { ConfirmModal, bigBtn, report } from './shared';
import type { Step } from './RunStepper';

function NotComputed({ go, what }: { go: (s: Step) => void; what: string }) {
  return (
    <Card>
      <EmptyState title="Compute the run first" description={`${what} work on the computed payslips, and this run has none yet.`}
        action={<Button variant="primary" style={bigBtn} onClick={() => go('compute')}>Go to Compute</Button>} />
    </Card>
  );
}

// ───────────────────────────── review ─────────────────────────────
export function RunReview({ db, run, go }: { db: HrmsDb; run: PayRun; go: (s: Step) => void }) {
  const totals = runTotals(run);
  const stale = runIsStale(db, run);
  const blockers = blockerCount(db, run);
  const acked = acknowledgedBlockers(run);
  const { prevRun, changes } = useMemo(() => comparePayslips(db, run), [db, run]);
  const missing = employeesForRun(db, run.month, run.entityId).filter((e) => !run.payslips.some((s) => s.employeeId === e.id));
  if (!run.payslips.length) return <NotComputed go={go} what="Review and freezing" />;

  const negative = run.payslips.filter((s) => s.net < 0);
  const flagged = Array.from(changes.values()).filter((c) => c.flagged);
  const nameOf = (id: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : '—'; };
  const slipOf = (id: string) => run.payslips.find((s) => s.employeeId === id);
  const warnings = run.payslips.flatMap((s) => s.warnings.map((w, i) => ({ key: `${s.id}-${i}`, who: nameOf(s.employeeId), text: w })));

  const checks: { ok: boolean; label: string; detail: string }[] = [
    { ok: !stale, label: 'Payslips match the current inputs', detail: stale ? 'Inputs changed since the last compute. Recompute before freezing.' : 'Nothing changed since the last compute.' },
    { ok: blockers === 0 || acked >= blockers, label: 'Blockers from the checks', detail: blockers === 0 ? 'No blockers.' : acked >= blockers ? `${blockers} blocker${blockers === 1 ? '' : 's'} confirmed as accepted.` : `${blockers} blocker${blockers === 1 ? '' : 's'} not confirmed.` },
    { ok: negative.length === 0, label: 'No negative net pay', detail: negative.length ? `Negative for ${negative.map((s) => nameOf(s.employeeId)).join(', ')}.` : 'Every net pay is zero or more.' },
    { ok: missing.length === 0, label: 'Everyone in scope has a payslip', detail: missing.length ? `${missing.map((e) => fullName(e)).join(', ')} got none.` : `${run.payslips.length} of ${run.payslips.length}.` },
    { ok: flagged.length === 0, label: `Month-on-month change over ${CHANGE_THRESHOLD_PCT}%`, detail: !prevRun ? 'No earlier run to compare with.' : flagged.length ? `${flagged.length} payslip${flagged.length === 1 ? '' : 's'} moved; reasons below.` : 'No payslip moved by more than that.' },
  ];

  const dueFor = (law: 'PF' | 'ESI' | 'PT' | 'TDS') => {
    const r = CALENDAR_RULES.find((x) => x.law === law);
    return r ? fmtDate(`${addMonths(run.month, 1)}-${String(r.dayOfMonth).padStart(2, '0')}`) : '—';
  };
  const pay = [
    { id: 'pf', law: 'PF', what: 'Employee and employer share (EPF, EPS)', amount: totals.pfEmployee + totals.pfEmployer, due: dueFor('PF') },
    { id: 'esi', law: 'ESI', what: 'Employee and employer share', amount: totals.esi, due: dueFor('ESI') },
    { id: 'pt', law: 'PT', what: 'Professional tax (due date differs by state)', amount: totals.pt, due: dueFor('PT') },
    { id: 'tds', law: 'TDS', what: 'Tax deducted at source on salary', amount: totals.tds, due: dueFor('TDS') },
  ];
  const payCols: Col<(typeof pay)[number]>[] = [
    { key: 'law', label: 'Law', render: (r) => <b>{r.law}</b> },
    { key: 'what', label: 'What', render: (r) => <span style={{ color: T.dim }}>{r.what}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount) },
    { key: 'due', label: 'Due by', render: (r) => r.due, nowrap: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <CardTitle>Readiness</CardTitle>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="readiness">
          {checks.map((c) => (
            <li key={c.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
              <Badge tone={c.ok ? 'ok' : 'warn'} dot style={{ marginTop: 1 }}>{c.ok ? 'Ready' : 'Look at this'}</Badge>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.label}</div><div style={{ fontSize: 13, color: T.dim }}>{c.detail}</div></div>
            </li>
          ))}
        </ul>
      </Card>

      {flagged.length > 0 && (
        <Card>
          <CardTitle>Payslips that moved by more than {CHANGE_THRESHOLD_PCT}%</CardTitle>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {flagged.map((c) => (
              <li key={c.employeeId} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>{nameOf(c.employeeId)}</b>
                  <span style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{c.pct != null ? `${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(1)}%` : 'New'} ({c.delta >= 0 ? '+' : ''}{inr(c.delta)})</span>
                </div>
                <div style={{ fontSize: 13, color: T.dim }}>{c.reasons.join('; ')}</div>
                {slipOf(c.employeeId) && <Link href={`/dashboard/hrms/payslips/${slipOf(c.employeeId)!.id}`} style={{ fontSize: 13, color: T.info }}>Open payslip</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card>
          <CardTitle right={<Badge tone="warn">{warnings.length}</Badge>}>Payslip warnings</CardTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.dim, lineHeight: 1.7 }}>
            {warnings.slice(0, 12).map((w) => <li key={w.key}><b style={{ color: T.text }}>{w.who}</b>: {w.text}</li>)}
          </ul>
          {warnings.length > 12 && <div style={{ fontSize: 12.5, color: T.mute, marginTop: 6 }}>And {warnings.length - 12} more. Filter the Compute step by &quot;With warnings&quot; to see them all.</div>}
        </Card>
      )}

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, fontFamily: T.heading }}>Statutory amounts this run creates</div>
        <DataTable columns={payCols} rows={pay} minWidth={560} />
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Due dates come from the sample compliance calendar. Confirm each against the current notification before relying on it.</div>
      </div>

      <div><Button variant="primary" style={bigBtn} onClick={() => go('freeze')}>Continue to freeze</Button></div>
    </div>
  );
}

// ───────────────────────────── freeze ─────────────────────────────
export function RunFreeze({ db, run, go }: { db: HrmsDb; run: PayRun; go: (s: Step) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [unfreeze, setUnfreeze] = useState(false);
  const stale = runIsStale(db, run);
  const totals = runTotals(run);
  const emiTotal = run.payslips.reduce((s, p) => s + p.deductions.filter((d) => d.code === 'LOAN').reduce((t, d) => t + d.amount, 0), 0);

  const audit = useMemo(() => [...run.audit].map((a, i) => ({ ...a, id: String(i) })).reverse(), [run.audit]);
  const auditCols: Col<(typeof audit)[number]>[] = [
    { key: 'at', label: 'When', render: (a) => fmtDateTime(a.at), nowrap: true },
    { key: 'by', label: 'Who', render: (a) => a.by, nowrap: true },
    { key: 'action', label: 'What happened', render: (a) => a.action },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {!run.payslips.length && <NotComputed go={go} what="Freezing" />}
      {run.payslips.length > 0 && (
        <Card>
          <CardTitle right={<Badge tone={run.status === 'paid' ? 'ok' : run.status === 'frozen' ? 'warn' : 'info'} dot>{run.status[0]!.toUpperCase() + run.status.slice(1)}</Badge>}>Freeze the run</CardTitle>
          {run.status === 'computed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.6 }}>
                Freezing makes the {totals.headcount} payslips final. It locks the attendance of these employees for {fmtMonth(run.month)}, closes the month&apos;s adjustments,
                recovers {inr(emiTotal)} of loan and advance EMIs, and releases the payslips in My HR. After that the run can only change by an unfreeze with a reason, which is written to the audit trail.
              </div>
              {stale ? <Note tone="red">The payslips no longer match the inputs. Recompute before you freeze, so what is frozen is what you reviewed.</Note> : null}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" style={bigBtn} disabled={stale} onClick={() => setConfirm(true)}>Freeze run</Button>
                {stale && <Button style={bigBtn} onClick={() => go('compute')}>Go to Compute</Button>}
              </div>
            </div>
          )}
          {run.status === 'frozen' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <KeyValue columns={3} rows={[
                { label: 'Frozen on', value: fmtDateTime(run.frozenAt) }, { label: 'Frozen by', value: run.frozenBy },
                { label: 'Net pay locked', value: inr(totals.net) },
              ]} />
              <div style={{ fontSize: 13.5, color: T.dim }}>Inputs are locked. Continue to Pay to download the bank file and the ECR, or unfreeze if something has to change.</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" style={bigBtn} onClick={() => go('pay')}>Continue to pay</Button>
                <Button variant="danger" style={bigBtn} onClick={() => setUnfreeze(true)}>Unfreeze</Button>
              </div>
            </div>
          )}
          {run.status === 'paid' && <Note tone="ok">This run was paid on {fmtDateTime(run.paidAt)} and is closed. A paid run cannot be unfrozen; correct it with an arrear or a deduction in the next open month.</Note>}
        </Card>
      )}

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, fontFamily: T.heading }}>Audit trail</div>
        <DataTable columns={auditCols} rows={audit} minWidth={560} empty="Nothing recorded yet." />
      </div>

      {confirm && (
        <ConfirmModal title="Freeze this run?" confirmLabel="Freeze run" onClose={() => setConfirm(false)}
          onConfirm={() => { if (report(freezeRunSafe(run.id), `${fmtMonth(run.month)} run frozen`)) { setConfirm(false); go('pay'); } }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>You are about to freeze <b>{totals.headcount} payslips</b> for {fmtMonth(run.month)} with a net pay of <b>{inr(totals.net)}</b>.</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: T.dim, fontSize: 13.5, lineHeight: 1.6 }}>
              <li>Attendance and adjustments for these employees are locked.</li>
              <li>{inr(emiTotal)} of loan and advance EMIs is marked as recovered.</li>
              <li>Payslips become visible in My HR.</li>
            </ul>
          </div>
        </ConfirmModal>
      )}
      {unfreeze && <UnfreezeModal run={run} onClose={() => setUnfreeze(false)} />}
    </div>
  );
}

function UnfreezeModal({ run, onClose }: { run: PayRun; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const error = reason.trim().length < 5 ? 'Give a reason of at least a few words' : '';
  const submit = () => {
    setTouched(true);
    if (error) return;
    if (report(unfreezeRunSafe(run.id, reason), `${fmtMonth(run.month)} run unfrozen`)) onClose();
  };
  return (
    <Modal title="Unfreeze this run" onClose={onClose} width={500}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" style={{ height: 40 }} onClick={submit}>Unfreeze run</Button></>}>
      <Note tone="warn">Unfreezing unlocks the inputs again and gives back the loan EMIs recovered at freeze. Payslips stay as computed until you recompute.</Note>
      <Field label="Reason" required htmlFor="unfreeze-reason" error={touched ? error : undefined} hint="Recorded in the audit trail with your name and the time.">
        <Textarea id="unfreeze-reason" autoFocus value={reason} invalid={touched && !!error} onChange={(e) => setReason(e.target.value)} placeholder="For example, an incentive was missed for the Delhi sales team" />
      </Field>
    </Modal>
  );
}
