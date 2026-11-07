'use client';
// Payroll hub, Full and final tab: settlement cases, a settlement sheet computed by the engine, and a printable statement.

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, KeyValue, Modal, Note, StatusBadge, Toolbar, useIsCompact, T, type Col } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import type { Employee, FnfCase, HrmsDb } from '../../../lib/hrms/types';
import { uid } from '../../../lib/hrms/types';
import { addWorkingDays, computeFnf, employeesForRun, type FnfResult } from '../../../lib/hrms/engine';
import { saveFnf } from '../../../lib/hrms/actions';
import { approveFnf, deleteFnf, markFnfPaid } from '../../../lib/hrms/payrollActions';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { LABOUR_CODES } from '../../../lib/hrms/rules';
import { diffDays, fmtDate, fmtMonth, fullName, inr, inrWords } from '../../../lib/hrms/format';
import { defaultFnfDraft, elBalance, fnfCandidates, fnfIsOverdue, validateFnf, type FnfDraft } from './logic';
import { ConfirmModal, PrintStyle, report } from './shared';

type Row = FnfCase & { who?: Employee; result: FnfResult | null; overdue: boolean };

export default function FnfTab({ db }: { db: HrmsDb }) {
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<FnfCase | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => db.fnfCases
    .map((c) => ({ ...c, who: db.employees.find((e) => e.id === c.employeeId), result: computeFnf(db, c), overdue: fnfIsOverdue(c) }))
    .filter((c) => status === 'all' || c.status === status || (status === 'overdue' && c.overdue)), [db, status]);
  const open = db.fnfCases.find((c) => c.id === openId);
  const candidates = fnfCandidates(db);

  const cols: Col<Row>[] = [
    { key: 'emp', label: 'Employee', render: (r) => (r.who ? <EmployeeCell e={r.who} href={false} /> : '—'), sortValue: (r) => (r.who ? fullName(r.who) : '') },
    { key: 'lwd', label: 'Last working day', render: (r) => fmtDate(r.lastWorkingDate), sortValue: (r) => r.lastWorkingDate, nowrap: true },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
    { key: 'net', label: 'Net payable', align: 'right', render: (r) => (r.result ? <b style={{ color: r.result.net < 0 ? T.red : T.text }}>{inr(r.result.net)}</b> : '—'), sortValue: (r) => r.result?.net ?? 0, nowrap: true },
    { key: 'due', label: 'Due by', render: (r) => (
      <span>{fmtDate(r.dueBy)} {r.overdue && <Badge tone="red" dot style={{ marginLeft: 6 }}>Overdue {diffDays(r.dueBy, PREVIEW_TODAY)} day{diffDays(r.dueBy, PREVIEW_TODAY) === 1 ? '' : 's'}</Badge>}</span>
    ), sortValue: (r) => r.dueBy, nowrap: true },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span>, align: 'right', render: (r) => (
      <Button size="sm" aria-label={`Open the settlement of ${r.who ? fullName(r.who) : 'employee'}`} onClick={() => setOpenId(r.id)}>Open sheet</Button>
    ) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toolbar>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 170 }}>
          <option value="all">All settlements</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="overdue">Overdue</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="primary" style={{ height: 40 }} onClick={() => setEditing('new')} disabled={!candidates.length}
            title={candidates.length ? undefined : 'Every employee on notice or exited already has a settlement'}>New settlement</Button>
        </div>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={820} onRowClick={(r) => setOpenId(r.id)}
        empty={db.fnfCases.length ? 'No settlement matches this filter.' : 'No settlement yet. Settlements are created for employees who are on notice or have left.'} />
      <Note>
        Settlements are due within {LABOUR_CODES.settlementWorkingDays} working days of the last working day (Sundays do not count). &quot;Today&quot; in this preview is {fmtDate(PREVIEW_TODAY)}.
        Gratuity, leave encashment and tax follow the rules in this preview and are not confirmed for live use.
      </Note>
      {open && <FnfSheet db={db} c={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
      {editing && <FnfForm db={db} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={(id) => setOpenId(id)} />}
    </div>
  );
}

// ───────────────────────────── settlement sheet ─────────────────────────────
function FnfSheet({ db, c, onClose, onEdit }: { db: HrmsDb; c: FnfCase; onClose: () => void; onEdit: () => void }) {
  const narrow = useIsCompact(900);
  const e = db.employees.find((x) => x.id === c.employeeId);
  const result = computeFnf(db, c);
  const [confirm, setConfirm] = useState<'approve' | 'pay' | 'delete' | null>(null);
  const entity = db.entities.find((x) => x.id === e?.entityId);
  const overdue = fnfIsOverdue(c);
  const lwdMonth = c.lastWorkingDate.slice(0, 7);
  const overlap = !!e && c.status !== 'paid' && employeesForRun(db, lwdMonth, e.entityId).some((x) => x.id === e.id);
  const dept = db.departments.find((d) => d.id === e?.departmentId)?.name;
  const desig = db.designations.find((d) => d.id === e?.designationId)?.name;

  if (!e || !result) {
    return <Card><CardTitle right={<Button size="sm" onClick={onClose}>Close</Button>}>Settlement</CardTitle><Note tone="red">This settlement cannot be computed: the employee needs a salary structure, a CTC and a location.</Note></Card>;
  }
  const pay = result.lines.filter((l) => l.kind === 'payment');
  const rec = result.lines.filter((l) => l.kind === 'recovery');

  return (
    <div data-testid="fnf-sheet"><Card>
      <CardTitle right={
        <div className="hr-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {c.status === 'draft' && <Button size="sm" onClick={onEdit}>Edit inputs</Button>}
          <Button size="sm" onClick={() => window.print()}>Print statement</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }>Settlement sheet, {fullName(e)}</CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={c.status} />
          {overdue && <Badge tone="red" dot>Overdue by {diffDays(c.dueBy, PREVIEW_TODAY)} day{diffDays(c.dueBy, PREVIEW_TODAY) === 1 ? '' : 's'}</Badge>}
          {!overdue && c.status !== 'paid' && <Badge tone="info" dot>Due {fmtDate(c.dueBy)}</Badge>}
        </div>
        <KeyValue columns={4} rows={[
          { label: 'Employee', value: `${fullName(e)} (${e.code})` },
          { label: 'Last working day', value: fmtDate(c.lastWorkingDate) },
          { label: 'Notice served', value: `${c.noticeDaysServed} of ${e.noticeDays} days` },
          { label: 'Due by', value: `${fmtDate(result.dueBy)} (${LABOUR_CODES.settlementWorkingDays} working days after the last day)` },
        ]} />

        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 16 }}>
          <LinesTable title="Payments" lines={pay} total={result.payable} />
          <LinesTable title="Recoveries" lines={rec} total={result.recoverable} negative />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '14px 16px', borderRadius: T.radius.md, background: T.raised }}>
          <div>
            <div style={{ fontSize: 12.5, color: T.dim }}>{result.net >= 0 ? 'Net payable to the employee' : 'Net recoverable from the employee'}</div>
            <div style={{ fontSize: 12.5, color: T.mute }}>Payments {inr(result.payable)} minus recoveries {inr(result.recoverable)} (includes TDS {inr(result.tds)})</div>
          </div>
          <div data-testid="fnf-net" style={{ fontFamily: T.heading, fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: result.net < 0 ? T.red : T.text }}>{inr(result.net)}</div>
        </div>

        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <b style={{ fontSize: 13.5 }}>Gratuity</b>
            <Badge tone={result.gratuity.eligible ? 'ok' : 'neutral'} dot>{result.gratuity.eligible ? 'Eligible' : 'Not eligible'}</Badge>
            <Badge tone="warn">Reported, confirm</Badge>
          </div>
          <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>
            {result.gratuity.reason}.{' '}
            {result.gratuity.eligible
              ? `Amount ${inr(result.gratuity.amount)} = ${LABOUR_CODES.gratuity.rate} × wages × ${result.gratuity.years} years, capped at ${inr(LABOUR_CODES.gratuity.cap)}.`
              : `Permanent staff need ${LABOUR_CODES.gratuity.permanentYears} years; fixed-term employees ${LABOUR_CODES.gratuity.fixedTermYears} year (as reported).`}
          </div>
        </div>

        {overlap && (
          <Note tone="warn">
            The {fmtMonth(lwdMonth)} regular run for {entity?.name ?? 'this entity'} also includes {fullName(e)} for the same month. This sheet already counts salary for the days worked and any outstanding loan,
            so pay those in one place only: leave this employee out of the run, or take the salary line out of the settlement.
          </Note>
        )}
        {c.status === 'paid' && <Note>This settlement is paid. The sheet is recomputed from the data as it stands today, so it can differ from what was actually paid if pay, loans or rules changed since.</Note>}

        <div className="hr-noprint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {c.status === 'draft' && <Button variant="primary" style={{ height: 40 }} onClick={() => setConfirm('approve')}>Approve settlement</Button>}
          {c.status === 'approved' && <Button variant="primary" style={{ height: 40 }} onClick={() => setConfirm('pay')}>Mark as paid</Button>}
          {c.status === 'draft' && <Button variant="danger" style={{ height: 40 }} onClick={() => setConfirm('delete')}>Delete draft</Button>}
        </div>

        <FnfStatement company={entity?.name ?? ''} address={[entity?.address.line1, entity?.address.city, entity?.address.state].filter(Boolean).join(', ')} e={e} desig={desig} dept={dept} c={c} result={result} />
      </div>
      {confirm === 'approve' && (
        <ConfirmModal title="Approve settlement" confirmLabel="Approve" onClose={() => setConfirm(null)} onConfirm={() => { if (report(approveFnf(c.id), 'Settlement approved')) setConfirm(null); }}>
          Approve the settlement of <b>{inr(result.net)}</b> for {fullName(e)}? After approval the inputs can no longer be edited.
        </ConfirmModal>
      )}
      {confirm === 'pay' && (
        <ConfirmModal title="Mark settlement as paid" confirmLabel="Mark as paid" onClose={() => setConfirm(null)} onConfirm={() => { if (report(markFnfPaid(c.id), 'Settlement marked paid')) setConfirm(null); }}>
          Confirm that <b>{inr(result.net)}</b> has been paid to {fullName(e)}. This preview records the status only; it does not move money.
        </ConfirmModal>
      )}
      {confirm === 'delete' && (
        <ConfirmModal title="Delete draft settlement" danger confirmLabel="Delete" onClose={() => setConfirm(null)} onConfirm={() => { if (report(deleteFnf(c.id), 'Draft deleted')) { setConfirm(null); onClose(); } }}>
          Delete the draft settlement for {fullName(e)}? You can create it again from the employee.
        </ConfirmModal>
      )}
    </Card></div>
  );
}

function LinesTable({ title, lines, total, negative }: { title: string; lines: FnfResult['lines']; total: number; negative?: boolean }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, background: T.panel }}>{title}</div>
      {lines.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: T.mute }}>None.</div> : lines.map((l, i) => (
        <div key={`${l.label}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: `1px solid ${T.border}`, fontSize: 13.5 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: T.text }}>{l.label}</div>
            {l.note && <div style={{ fontSize: 12, color: T.mute }}>{l.note}</div>}
          </div>
          <div style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{negative ? '-' : ''}{inr(l.amount)}</div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: `1px solid ${T.border}`, fontWeight: 700, fontSize: 13.5 }}>
        <span>Total {title.toLowerCase()}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{negative ? '-' : ''}{inr(total)}</span>
      </div>
    </div>
  );
}

/** The statement that prints. Paper stays white and black whatever the theme, like the payslip. */
function FnfStatement({ company, address, e, desig, dept, c, result }: { company: string; address: string; e: Employee; desig?: string; dept?: string; c: FnfCase; result: FnfResult }) {
  const INK = '#1f2328', DIM = '#6b7280', LINE = '#d1d5db';
  const row = (l: FnfResult['lines'][number], i: number) => (
    <tr key={`${l.label}-${i}`}>
      <td style={{ padding: '5px 6px', borderBottom: `1px solid ${LINE}`, fontSize: 12 }}>{l.label}</td>
      <td style={{ padding: '5px 6px', borderBottom: `1px solid ${LINE}`, fontSize: 12, textAlign: 'right' }}>{l.kind === 'payment' ? inr(l.amount) : ''}</td>
      <td style={{ padding: '5px 6px', borderBottom: `1px solid ${LINE}`, fontSize: 12, textAlign: 'right' }}>{l.kind === 'recovery' ? inr(l.amount) : ''}</td>
    </tr>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <PrintStyle rootClass="fnf-print" />
      <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 8 }} className="hr-noprint">Printable statement</div>
      <div className="fnf-print" style={{ background: '#fff', color: INK, maxWidth: 760, minWidth: 560, margin: '0 auto', padding: '28px 32px', boxSizing: 'border-box', borderRadius: 6, boxShadow: '0 1px 8px rgba(0,0,0,.18)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{company}</div>
          <div style={{ fontSize: 11.5, color: DIM }}>{address}</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 10 }}>FULL AND FINAL SETTLEMENT STATEMENT</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12, margin: '16px 0' }}>
          <div>Employee: <b>{fullName(e)}</b></div><div>Employee code: <b>{e.code}</b></div>
          <div>Designation: <b>{desig ?? '—'}</b></div><div>Department: <b>{dept ?? '—'}</b></div>
          <div>Date of joining: <b>{fmtDate(e.joinDate)}</b></div><div>Last working day: <b>{fmtDate(c.lastWorkingDate)}</b></div>
          <div>Notice served: <b>{c.noticeDaysServed} of {e.noticeDays} days</b></div><div>Settlement due by: <b>{fmtDate(result.dueBy)}</b></div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Particulars', 'Payment', 'Recovery'].map((h, i) => (
                <td key={h} role="columnheader" style={{ padding: '6px', fontSize: 11, fontWeight: 700, background: '#f3f4f6', borderBottom: `1px solid ${LINE}`, textAlign: i ? 'right' : 'left' }}>{h}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.lines.map(row)}
            <tr>
              <td style={{ padding: '7px 6px', fontSize: 12.5, fontWeight: 700 }}>Total</td>
              <td style={{ padding: '7px 6px', fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{inr(result.payable)}</td>
              <td style={{ padding: '7px 6px', fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{inr(result.recoverable)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 14, padding: '10px 12px', background: '#f3f4f6', display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
          <span>{result.net >= 0 ? 'Net payable' : 'Net recoverable'}</span><span>{inr(Math.abs(result.net))}</span>
        </div>
        <div style={{ fontSize: 12, fontStyle: 'italic', marginTop: 6 }}>{inrWords(Math.abs(result.net))}</div>
        <div style={{ fontSize: 11, color: DIM, marginTop: 10 }}>Gratuity: {result.gratuity.reason}. Computed under the preview rules on sample data; not for live use.</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 44, fontSize: 11, color: DIM }}>
          <div style={{ borderTop: `1px solid ${DIM}`, paddingTop: 6, width: 190, textAlign: 'center' }}>Employee signature</div>
          <div style={{ borderTop: `1px solid ${DIM}`, paddingTop: 6, width: 190, textAlign: 'center' }}>Authorised signatory</div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── create / edit ─────────────────────────────
function FnfForm({ db, initial, onClose, onSaved }: { db: HrmsDb; initial?: FnfCase; onClose: () => void; onSaved: (id: string) => void }) {
  const narrow = useIsCompact(700);
  const candidates = fnfCandidates(db);
  const startEmp = initial ? db.employees.find((e) => e.id === initial.employeeId) : candidates[0];
  const [d, setD] = useState<FnfDraft>(initial
    ? { employeeId: initial.employeeId, lastWorkingDate: initial.lastWorkingDate, resignationDate: initial.resignationDate ?? '', noticeDaysServed: String(initial.noticeDaysServed), leaveEncashDays: String(initial.leaveEncashDays), otherRecoveries: String(initial.otherRecoveries), otherPayments: String(initial.otherPayments) }
    : startEmp ? defaultFnfDraft(db, startEmp) : { employeeId: '', lastWorkingDate: '', resignationDate: '', noticeDaysServed: '0', leaveEncashDays: '0', otherRecoveries: '0', otherPayments: '0' });
  const [touched, setTouched] = useState(false);
  const errors = validateFnf(db, d);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof FnfDraft>(k: K, v: FnfDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const emp = db.employees.find((e) => e.id === d.employeeId);
  const el = emp ? elBalance(db, emp.id) : { days: 0 };
  const valid = Object.keys(errors).length === 0;
  const dueBy = valid ? addWorkingDays(d.lastWorkingDate, LABOUR_CODES.settlementWorkingDays) : '';
  const toCase = (): Omit<FnfCase, 'id'> & { id?: string } => ({
    id: initial?.id, employeeId: d.employeeId, lastWorkingDate: d.lastWorkingDate, resignationDate: d.resignationDate || undefined,
    noticeDaysServed: Number(d.noticeDaysServed), leaveEncashDays: Number(d.leaveEncashDays), otherRecoveries: Math.round(Number(d.otherRecoveries)), otherPayments: Math.round(Number(d.otherPayments)),
    status: initial?.status ?? 'draft', dueBy,
  });
  const live = valid ? computeFnf(db, { ...toCase(), id: initial?.id ?? 'preview' } as FnfCase) : null;

  const pick = (id: string) => { const e = db.employees.find((x) => x.id === id); if (e) setD(defaultFnfDraft(db, e)); else set('employeeId', ''); };
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const id = initial?.id ?? uid('fnf');
    saveFnf({ ...toCase(), id });
    report({ ok: true }, initial ? 'Settlement updated' : 'Settlement created');
    onSaved(id);
    onClose();
  };
  const numField = (k: keyof FnfDraft, label: string, hint?: string) => (
    <Field label={label} htmlFor={`fnf-${k}`} error={show(k)} hint={hint}>
      <Input id={`fnf-${k}`} inputMode="decimal" value={d[k]} invalid={!!show(k)} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ''))} />
    </Field>
  );
  return (
    <Modal title={initial ? 'Edit settlement inputs' : 'New settlement'} onClose={onClose} width={680}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={submit}>{initial ? 'Save changes' : 'Create settlement'}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <Field label="Employee" required htmlFor="fnf-emp" error={show('employeeId')} hint="People on notice or who have left, without a settlement yet.">
            <Select id="fnf-emp" value={d.employeeId} disabled={!!initial} invalid={!!show('employeeId')} onChange={(e) => pick(e.target.value)}>
              {!initial && <option value="">Select an employee</option>}
              {(initial ? (startEmp ? [startEmp] : []) : candidates).map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code}, {e.status.replace('_', ' ')})</option>)}
            </Select>
          </Field>
          <Field label="Last working day" required htmlFor="fnf-lwd" error={show('lastWorkingDate')} hint={dueBy ? `Due by ${fmtDate(dueBy)}` : undefined}>
            <Input id="fnf-lwd" type="date" value={d.lastWorkingDate} invalid={!!show('lastWorkingDate')} onChange={(e) => set('lastWorkingDate', e.target.value)} />
          </Field>
          <Field label="Resignation date" htmlFor="fnf-res" error={show('resignationDate')}>
            <Input id="fnf-res" type="date" value={d.resignationDate} invalid={!!show('resignationDate')} onChange={(e) => set('resignationDate', e.target.value)} />
          </Field>
          {numField('noticeDaysServed', 'Notice days served', emp ? `Notice period is ${emp.noticeDays} days; a shortfall is recovered.` : undefined)}
          {numField('leaveEncashDays', 'Leave days to encash', emp ? `${el.days} days of earned leave available.` : undefined)}
          {numField('otherRecoveries', 'Other recoveries (₹)', 'Assets not returned, advances outside payroll')}
          {numField('otherPayments', 'Other payments (₹)', 'Reimbursements, retention or notice pay')}
        </FormGrid>
        {live && (
          <Note>With these inputs the net payable is <b>{inr(live.net)}</b> (payments {inr(live.payable)}, recoveries {inr(live.recoverable)}). Gratuity: {live.gratuity.eligible ? inr(live.gratuity.amount) : 'not eligible'}.</Note>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
