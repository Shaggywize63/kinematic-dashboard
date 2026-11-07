'use client';
// Payroll hub, Adjustments tab: one-off pay and deductions by month. Also exports the add/edit form, which the run page reuses.

import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, EmployeeCell, Modal, Note, SearchBox, Toolbar, monthOptions, useIsCompact, T, type Col } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import type { Adjustment, AdjustmentKind, Employee, HrmsDb } from '../../../lib/hrms/types';
import { fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { deleteAdjustment, saveAdjustment } from '../../../lib/hrms/payrollActions';
import {
  ADJUSTMENT_KINDS, PREVIEW_MONTH, adjustmentInfo, adjustmentLock, validateAdjustment, type AdjustmentDraft,
} from './logic';
import { ConfirmModal, report } from './shared';

// ───────────────────────────── add / edit form ─────────────────────────────
export function AdjustmentForm({ db, initial, defaultMonth, employees, lockMonth, onClose, onSaved }: {
  db: HrmsDb; initial?: Adjustment; defaultMonth: string; employees: Employee[]; lockMonth?: boolean; onClose: () => void; onSaved?: () => void;
}) {
  const narrow = useIsCompact(700);
  const [d, setD] = useState<AdjustmentDraft>(initial
    ? { employeeId: initial.employeeId, month: initial.month, kind: initial.kind, amount: String(initial.amount), taxable: initial.taxable, note: initial.note ?? '' }
    : { employeeId: '', month: defaultMonth, kind: 'bonus', amount: '', taxable: true, note: '' });
  const [touched, setTouched] = useState(false);
  const info = adjustmentInfo(d.kind);
  const originalLock = initial ? adjustmentLock(db, initial) : undefined;
  const errors = validateAdjustment(db, d, initial?.id, originalLock);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const set = <K extends keyof AdjustmentDraft>(k: K, v: AdjustmentDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    const ok = report(saveAdjustment({ id: initial?.id, employeeId: d.employeeId, month: d.month, kind: d.kind, amount: Number(d.amount), taxable: info.effect === 'earning' ? d.taxable : false, note: d.note.trim() || undefined }),
      initial ? 'Adjustment updated' : 'Adjustment added');
    if (ok) { onSaved?.(); onClose(); }
  };

  return (
    <Modal title={initial ? 'Edit adjustment' : 'Add adjustment'} onClose={onClose} width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" style={{ height: 40 }} onClick={submit}>{initial ? 'Save changes' : 'Add adjustment'}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGrid narrow={narrow}>
          <Field label="Employee" required htmlFor="adj-emp" error={show('employeeId')}>
            <Select id="adj-emp" value={d.employeeId} invalid={!!show('employeeId')} onChange={(e) => set('employeeId', e.target.value)}>
              <option value="">Select an employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
            </Select>
          </Field>
          <Field label="Month" required htmlFor="adj-month" error={show('month')}>
            <Select id="adj-month" value={d.month} invalid={!!show('month')} disabled={lockMonth} onChange={(e) => set('month', e.target.value)}>
              {monthOptions(PREVIEW_MONTH, 6, 2).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Kind" required htmlFor="adj-kind" hint={info.effect === 'earning' ? 'Added to gross pay' : info.effect === 'reimbursement' ? 'Added to net pay, outside gross' : 'Taken from net pay'}>
            <Select id="adj-kind" value={d.kind} onChange={(e) => { const k = e.target.value as AdjustmentKind; setD((x) => ({ ...x, kind: k, taxable: adjustmentInfo(k).taxable })); }}>
              {ADJUSTMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹)" required htmlFor="adj-amount" error={show('amount')}>
            <Input id="adj-amount" inputMode="numeric" value={d.amount} invalid={!!show('amount')} onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
          </Field>
        </FormGrid>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 14, color: info.effect === 'earning' ? T.text : T.mute }}>
          <input type="checkbox" checked={info.effect === 'earning' ? d.taxable : false} disabled={info.effect !== 'earning'} onChange={(e) => set('taxable', e.target.checked)} style={{ width: 18, height: 18 }} />
          Taxable{info.effect !== 'earning' && <span style={{ fontSize: 12.5 }}>(only earnings are taxed in the engine)</span>}
        </label>
        <Field label="Note" htmlFor="adj-note" error={show('note')} hint="Shown on the payslip next to the line.">
          <Input id="adj-note" value={d.note} invalid={!!show('note')} onChange={(e) => set('note', e.target.value)} placeholder="For example, Diwali bonus" maxLength={100} />
        </Field>
        {(d.kind === 'loan_emi' || d.kind === 'advance_recovery') && (
          <Note tone="warn">Loans and advances on the Loans tab are recovered automatically every run. Add a manual recovery only for an EMI that is not listed there, or it will be taken twice.</Note>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ───────────────────────────── tab ─────────────────────────────
type Row = Adjustment & { who: Employee | undefined; lockedBy?: { month: string; status: string } };

export default function AdjustmentsTab({ db }: { db: HrmsDb }) {
  const [month, setMonth] = useState(PREVIEW_MONTH);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Adjustment | 'new' | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  const months = useMemo(() => Array.from(new Set([PREVIEW_MONTH, ...db.adjustments.map((a) => a.month)])).sort().reverse(), [db.adjustments]);
  const rows: Row[] = useMemo(() => db.adjustments
    .map((a) => ({ ...a, who: db.employees.find((e) => e.id === a.employeeId), lockedBy: adjustmentLock(db, a) }))
    .filter((a) => (month === 'all' || a.month === month) && (kind === 'all' || a.kind === kind)
      && (!q.trim() || `${a.who ? fullName(a.who) : ''} ${a.who?.code ?? ''} ${a.note ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [db, month, kind, q]);

  const pay = rows.filter((r) => adjustmentInfo(r.kind).effect !== 'deduction').reduce((s, r) => s + r.amount, 0);
  const ded = rows.filter((r) => adjustmentInfo(r.kind).effect === 'deduction').reduce((s, r) => s + r.amount, 0);
  const payable = db.employees.filter((e) => e.status !== 'onboarding');

  const cols: Col<Row>[] = [
    { key: 'month', label: 'Month', render: (r) => fmtMonth(r.month), sortValue: (r) => r.month, nowrap: true },
    { key: 'emp', label: 'Employee', render: (r) => (r.who ? <EmployeeCell e={r.who} href={false} /> : '—'), sortValue: (r) => (r.who ? fullName(r.who) : '') },
    { key: 'kind', label: 'Kind', render: (r) => adjustmentInfo(r.kind).label, sortValue: (r) => r.kind, nowrap: true },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span style={{ color: adjustmentInfo(r.kind).effect === 'deduction' ? T.red : T.text }}>{adjustmentInfo(r.kind).effect === 'deduction' ? '-' : ''}{inr(r.amount)}</span>, sortValue: (r) => r.amount, nowrap: true },
    { key: 'tax', label: 'Taxable', render: (r) => (adjustmentInfo(r.kind).effect === 'earning' ? (r.taxable ? 'Yes' : 'No') : '—') },
    { key: 'note', label: 'Note', render: (r) => <span style={{ color: T.dim }}>{r.note ?? '—'}</span> },
    { key: 'state', label: 'Run', render: (r) => (r.lockedBy ? <Badge tone="neutral" dot>Locked ({r.lockedBy.status})</Badge> : <Badge tone="ok" dot>Open</Badge>), sortValue: (r) => (r.lockedBy ? 1 : 0), nowrap: true },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span>, align: 'right', render: (r) => (
      <div style={{ display: 'inline-flex', gap: 6 }}>
        <Button size="sm" disabled={!!r.lockedBy} title={r.lockedBy ? `The ${fmtMonth(r.month)} run is ${r.lockedBy.status}` : undefined} aria-label={`Edit adjustment for ${r.who ? fullName(r.who) : 'employee'}`} onClick={() => setEditing(r)}>Edit</Button>
        <Button size="sm" variant="danger" disabled={!!r.lockedBy} title={r.lockedBy ? `The ${fmtMonth(r.month)} run is ${r.lockedBy.status}` : undefined} aria-label={`Delete adjustment for ${r.who ? fullName(r.who) : 'employee'}`} onClick={() => setRemoving(r)}>Delete</Button>
      </div>
    ) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toolbar>
        <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </Select>
        <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 210 }}>
          <option value="all">All kinds</option>
          {ADJUSTMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <SearchBox value={q} onChange={setQ} placeholder="Search employee or note" />
        <div style={{ marginLeft: 'auto' }}><Button variant="primary" style={{ height: 40 }} onClick={() => setEditing('new')}>Add adjustment</Button></div>
      </Toolbar>
      <DataTable columns={cols} rows={rows} minWidth={920}
        empty={db.adjustments.length ? 'No adjustment matches these filters.' : 'No adjustments yet. Add arrears, bonuses, incentives, reimbursements or one-time deductions.'} />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13.5, color: T.dim }} data-testid="adj-summary">
        <span>{rows.length} shown</span>
        <span>Payments and reimbursements <b style={{ color: T.text }}>{inr(pay)}</b></span>
        <span>Deductions <b style={{ color: T.text }}>{inr(ded)}</b></span>
      </div>
      <Note>An adjustment is paid in the run for its month. Once that run is frozen or paid the adjustment is locked, and a correction goes into the next open month as an arrear or a deduction.</Note>
      {editing && <AdjustmentForm db={db} initial={editing === 'new' ? undefined : editing} defaultMonth={month === 'all' ? PREVIEW_MONTH : month} employees={payable} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal title="Delete adjustment" danger confirmLabel="Delete adjustment" onClose={() => setRemoving(null)}
          onConfirm={() => { if (report(deleteAdjustment(removing.id), 'Adjustment deleted')) setRemoving(null); }}>
          Delete the {adjustmentInfo(removing.kind).label.toLowerCase()} of {inr(removing.amount)} for {removing.who ? fullName(removing.who) : 'this employee'} in {fmtMonth(removing.month)}?
        </ConfirmModal>
      )}
    </div>
  );
}
