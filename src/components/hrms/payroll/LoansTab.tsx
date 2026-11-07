'use client';
// Payroll hub, Loans and advances tab: what was lent, what payroll has recovered, and the EMIs still to come.

import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmployeeCell, Modal, Note, ProgressBar, SearchBox, Toolbar, monthOptions, useIsCompact, T, type Col } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import type { HrmsDb, Loan } from '../../../lib/hrms/types';
import { addLoan } from '../../../lib/hrms/actions';
import { deleteLoan } from '../../../lib/hrms/payrollActions';
import { fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { PREVIEW_MONTH, loanOutstanding, nextDeductionMonth, remainingSchedule, validateLoan, type LoanDraft } from './logic';
import { ConfirmModal, report } from './shared';

type Row = Loan & { who?: HrmsDb['employees'][number]; outstanding: number };

function ScheduleTable({ rows }: { rows: ReturnType<typeof remainingSchedule> }) {
  if (!rows.length) return <div style={{ fontSize: 13, color: T.mute }}>Nothing left to recover.</div>;
  const th = { textAlign: 'right' as const, padding: '8px 10px', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` };
  const td = { padding: '8px 10px', fontSize: 13, borderBottom: `1px solid ${T.border}`, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };
  return (
    <div style={{ maxHeight: 280, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
        <thead style={{ position: 'sticky', top: 0, background: T.panel }}>
          <tr><th style={{ ...th, textAlign: 'left' }}>EMI</th><th style={{ ...th, textAlign: 'left' }}>Month</th><th style={th}>Balance before</th><th style={th}>Deducted</th><th style={th}>Balance after</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td style={{ ...td, textAlign: 'left' }}>{r.n}{r.next && <Badge tone="info" style={{ marginLeft: 8 }}>Next</Badge>}</td>
              <td style={{ ...td, textAlign: 'left' }}>{fmtMonth(r.month)}</td>
              <td style={td}>{inr(r.opening)}</td><td style={td}>{inr(r.emi)}</td><td style={td}>{inr(r.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LoansTab({ db }: { db: HrmsDb }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<'all' | 'active' | 'closed'>('all');
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  const rows: Row[] = useMemo(() => db.loans
    .map((l) => ({ ...l, who: db.employees.find((e) => e.id === l.employeeId), outstanding: loanOutstanding(l) }))
    .filter((l) => (state === 'all' || (state === 'active' ? l.outstanding > 0 : l.outstanding === 0))
      && (!q.trim() || `${l.who ? fullName(l.who) : ''} ${l.who?.code ?? ''} ${l.note ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [db, q, state]);

  const cols: Col<Row>[] = [
    { key: 'emp', label: 'Employee', render: (r) => (r.who ? <EmployeeCell e={r.who} href={false} /> : '—'), sortValue: (r) => (r.who ? fullName(r.who) : '') },
    { key: 'kind', label: 'Kind', render: (r) => (r.kind === 'loan' ? 'Loan' : 'Advance'), nowrap: true },
    { key: 'principal', label: 'Amount lent', align: 'right', render: (r) => inr(r.principal), sortValue: (r) => r.principal, nowrap: true },
    { key: 'emi', label: 'EMI', align: 'right', render: (r) => inr(r.emi), sortValue: (r) => r.emi, nowrap: true },
    { key: 'start', label: 'Starts', render: (r) => fmtMonth(r.startMonth), sortValue: (r) => r.startMonth, nowrap: true },
    { key: 'recovered', label: 'Recovered', align: 'right', render: (r) => inr(r.recovered), sortValue: (r) => r.recovered, nowrap: true },
    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => <b>{inr(r.outstanding)}</b>, sortValue: (r) => r.outstanding, nowrap: true },
    { key: 'progress', label: 'Progress', width: 120, render: (r) => <ProgressBar pct={(r.recovered / r.principal) * 100} tone={r.outstanding === 0 ? 'ok' : 'info'} /> },
    { key: 'status', label: 'Status', render: (r) => (r.outstanding === 0 ? <Badge tone="ok" dot>Closed</Badge> : <Badge tone="info" dot>Recovering</Badge>), nowrap: true },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span>, align: 'right', render: (r) => (
      <div style={{ display: 'inline-flex', gap: 6 }}>
        <Button size="sm" aria-label={`View EMI schedule for ${r.who ? fullName(r.who) : 'employee'}`} onClick={() => setViewing(r)}>Schedule</Button>
        <Button size="sm" variant="danger" aria-label={`Delete loan of ${r.who ? fullName(r.who) : 'employee'}`} disabled={r.recovered > 0} title={r.recovered > 0 ? 'Part of it has been recovered through payroll' : undefined} onClick={() => setRemoving(r)}>Delete</Button>
      </div>
    ) },
  ];

  const totalOut = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search employee or note" />
        <Select aria-label="Status" value={state} onChange={(e) => setState(e.target.value as typeof state)} style={{ width: 160 }}>
          <option value="all">All loans</option><option value="active">Still recovering</option><option value="closed">Closed</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><Button variant="primary" style={{ height: 40 }} onClick={() => setAdding(true)}>Add loan or advance</Button></div>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={1040} empty={db.loans.length ? 'No loan matches these filters.' : 'No loans or advances yet.'} />
      <div style={{ fontSize: 13.5, color: T.dim }} data-testid="loan-summary">{rows.length} shown · outstanding <b style={{ color: T.text }}>{inr(totalOut)}</b></div>
      <Note>Payroll recovers the EMI automatically each run until the balance is nil, and the recovered amount moves when a run is frozen. Loans here are interest-free: the preview engine does not compute interest or the tax perquisite on concessional loans.</Note>
      {adding && <LoanForm db={db} onClose={() => setAdding(false)} />}
      {viewing && (
        <Modal title={`EMI schedule, ${viewing.who ? fullName(viewing.who) : ''}`} onClose={() => setViewing(null)} width={620} footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
          <div style={{ fontSize: 13.5, color: T.dim }}>
            {viewing.kind === 'loan' ? 'Loan' : 'Advance'} of {inr(viewing.principal)}, EMI {inr(viewing.emi)}. Recovered so far {inr(viewing.recovered)} ({viewing.emi ? Math.floor(viewing.recovered / viewing.emi) : 0} EMIs), outstanding {inr(viewing.outstanding)}.
          </div>
          <ScheduleTable rows={remainingSchedule(viewing.principal, viewing.emi, viewing.recovered, nextDeductionMonth(db, viewing), viewing.emi ? Math.floor(viewing.recovered / viewing.emi) : 0)} />
          <div style={{ fontSize: 12.5, color: T.mute }}>Months start after the entity&apos;s latest frozen or paid run. Each EMI is deducted when its month&apos;s run is frozen.</div>
        </Modal>
      )}
      {removing && (
        <ConfirmModal title="Delete loan" danger confirmLabel="Delete" onClose={() => setRemoving(null)}
          onConfirm={() => { if (report(deleteLoan(removing.id), 'Loan deleted')) setRemoving(null); }}>
          Delete the {removing.kind} of {inr(removing.principal)} for {removing.who ? fullName(removing.who) : 'this employee'}? Nothing has been recovered yet.
        </ConfirmModal>
      )}
    </div>
  );
}

function LoanForm({ db, onClose }: { db: HrmsDb; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const [d, setD] = useState<LoanDraft>({ employeeId: '', kind: 'advance', principal: '', emi: '', startMonth: PREVIEW_MONTH, note: '' });
  const [touched, setTouched] = useState(false);
  const { errors, warnings } = validateLoan(db, d);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof LoanDraft>(k: K, v: LoanDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const preview = !errors.principal && !errors.emi && !errors.startMonth ? remainingSchedule(Number(d.principal), Number(d.emi), 0, d.startMonth) : [];

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    addLoan({ employeeId: d.employeeId, kind: d.kind, principal: Math.round(Number(d.principal)), emi: Math.round(Number(d.emi)), startMonth: d.startMonth, note: d.note.trim() || undefined });
    report({ ok: true }, d.kind === 'loan' ? 'Loan added' : 'Advance added');
    onClose();
  };
  return (
    <Modal title="Add loan or advance" onClose={onClose} width={640}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={submit}>Add</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <Field label="Employee" required htmlFor="ln-emp" error={show('employeeId')}>
            <Select id="ln-emp" value={d.employeeId} invalid={!!show('employeeId')} onChange={(e) => set('employeeId', e.target.value)}>
              <option value="">Choose an employee</option>
              {db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice').map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
            </Select>
          </Field>
          <Field label="Kind" required htmlFor="ln-kind">
            <Select id="ln-kind" value={d.kind} onChange={(e) => set('kind', e.target.value as Loan['kind'])}>
              <option value="advance">Salary advance</option><option value="loan">Loan</option>
            </Select>
          </Field>
          <Field label="Amount lent (₹)" required htmlFor="ln-principal" error={show('principal')}>
            <Input id="ln-principal" inputMode="numeric" value={d.principal} invalid={!!show('principal')} onChange={(e) => set('principal', e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field label="Monthly EMI (₹)" required htmlFor="ln-emi" error={show('emi')}>
            <Input id="ln-emi" inputMode="numeric" value={d.emi} invalid={!!show('emi')} onChange={(e) => set('emi', e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field label="First recovery month" required htmlFor="ln-start" error={show('startMonth')}>
            <Select id="ln-start" value={d.startMonth} invalid={!!show('startMonth')} onChange={(e) => set('startMonth', e.target.value)}>
              {monthOptions(PREVIEW_MONTH, 2, 6).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Note" htmlFor="ln-note" error={show('note')}>
            <Input id="ln-note" value={d.note} invalid={!!show('note')} onChange={(e) => set('note', e.target.value)} maxLength={100} />
          </Field>
        </FormGrid>
        {warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginBottom: 6 }}>EMI schedule preview</div>
          {preview.length ? <ScheduleTable rows={preview} /> : <div style={{ fontSize: 13, color: T.mute }}>Enter the amount and EMI to see the schedule.</div>}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
