'use client';
// Run step 1, Inputs: the month's attendance summary per employee and the month's adjustments.

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Note, SearchBox, Stat, StatGrid, Toolbar, T, type Col } from '../ui';
import { Select } from '../../ui';
import type { Adjustment, Employee, HrmsDb, PayRun } from '../../../lib/hrms/types';
import { attendanceFor, employeesForRun } from '../../../lib/hrms/engine';
import { fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { setAttendance } from '../../../lib/hrms/payrollActions';
import { deleteAdjustment } from '../../../lib/hrms/payrollActions';
import { ADJUSTMENT_KINDS, adjustmentInfo, adjustmentLock, isLocked } from './logic';
import { AdjustmentForm } from './AdjustmentsTab';
import { ConfirmModal, NumberCell, report } from './shared';

type AttRow = { id: string; e: Employee; days: number; present: number | null; lop: number; ot: number; locked: boolean; hasSummary: boolean };

export default function RunInputs({ db, run }: { db: HrmsDb; run: PayRun }) {
  const locked = isLocked(run);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const [editing, setEditing] = useState<Adjustment | 'new' | null>(null);
  const [removing, setRemoving] = useState<Adjustment | null>(null);

  const emps = useMemo(() => employeesForRun(db, run.month, run.entityId), [db, run.month, run.entityId]);
  const rows: AttRow[] = useMemo(() => emps.map((e) => {
    const a = attendanceFor(db, e.id, run.month);
    return { id: e.id, e, days: a?.daysInMonth ?? new Date(Date.UTC(Number(run.month.slice(0, 4)), Number(run.month.slice(5, 7)), 0)).getUTCDate(), present: a?.presentDays ?? null, lop: a?.lopDays ?? 0, ot: a?.overtimeHours ?? 0, locked: !!a?.locked, hasSummary: !!a };
  }).filter((r) => (only === 'all' || (only === 'lop' ? r.lop > 0 : only === 'ot' ? r.ot > 0 : !r.hasSummary))
    && (!q.trim() || `${fullName(r.e)} ${r.e.code}`.toLowerCase().includes(q.trim().toLowerCase()))), [db, emps, run.month, only, q]);

  const adjustments = db.adjustments.filter((a) => a.month === run.month && emps.some((e) => e.id === a.employeeId));
  const loanRows = emps.flatMap((e) => db.loans
    .filter((l) => l.employeeId === e.id && l.startMonth <= run.month && l.recovered < l.principal)
    .map((l) => ({ id: l.id, e, kind: l.kind, emi: Math.min(l.emi, l.principal - l.recovered), after: l.principal - l.recovered - Math.min(l.emi, l.principal - l.recovered) })));

  const totalLop = rows.reduce((s, r) => s + r.lop, 0);
  const totalOt = rows.reduce((s, r) => s + r.ot, 0);
  const missing = emps.filter((e) => !attendanceFor(db, e.id, run.month)).length;

  const commit = (r: AttRow, patch: { lopDays?: number; overtimeHours?: number }): string | null => {
    const res = setAttendance(r.e.id, run.month, patch);
    return res.ok ? null : res.error;
  };

  const cols: Col<AttRow>[] = [
    { key: 'emp', label: 'Employee', render: (r) => <EmployeeCell e={r.e} href={false} />, sortValue: (r) => fullName(r.e) },
    { key: 'days', label: 'Days in month', align: 'right', render: (r) => r.days, sortValue: (r) => r.days },
    { key: 'present', label: 'Present', align: 'right', render: (r) => r.present ?? '—', sortValue: (r) => r.present ?? -1 },
    { key: 'paid', label: 'Paid days', align: 'right', render: (r) => (
      <NumberCell label={`Paid days for ${fullName(r.e)}`} value={r.days - r.lop} disabled={locked || r.locked} onCommit={(n) => (n < 0 || n > r.days ? `0 to ${r.days} days` : commit(r, { lopDays: r.days - n }))} />
    ), sortValue: (r) => r.days - r.lop },
    { key: 'lop', label: 'LOP days', align: 'right', render: (r) => (
      <NumberCell label={`Loss of pay days for ${fullName(r.e)}`} value={r.lop} disabled={locked || r.locked} onCommit={(n) => commit(r, { lopDays: n })} />
    ), sortValue: (r) => r.lop },
    { key: 'ot', label: 'Overtime hours', align: 'right', render: (r) => (
      <NumberCell label={`Overtime hours for ${fullName(r.e)}`} value={r.ot} disabled={locked || r.locked} onCommit={(n) => commit(r, { overtimeHours: n })} />
    ), sortValue: (r) => r.ot },
    { key: 'state', label: 'Attendance', render: (r) => (!r.hasSummary ? <Badge tone="warn" dot>No summary</Badge> : r.locked ? <Badge tone="neutral" dot>Locked</Badge> : <Badge tone="ok" dot>Open</Badge>), nowrap: true },
  ];

  const adjCols: Col<Adjustment & { id: string }>[] = [
    { key: 'emp', label: 'Employee', render: (a) => { const e = db.employees.find((x) => x.id === a.employeeId); return e ? <EmployeeCell e={e} href={false} /> : '—'; } },
    { key: 'kind', label: 'Kind', render: (a) => adjustmentInfo(a.kind).label, nowrap: true },
    { key: 'amount', label: 'Amount', align: 'right', render: (a) => `${adjustmentInfo(a.kind).effect === 'deduction' ? '-' : ''}${inr(a.amount)}`, nowrap: true },
    { key: 'tax', label: 'Taxable', render: (a) => (adjustmentInfo(a.kind).effect === 'earning' ? (a.taxable ? 'Yes' : 'No') : '—') },
    { key: 'note', label: 'Note', render: (a) => <span style={{ color: T.dim }}>{a.note ?? '—'}</span> },
    { key: 'act', label: <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Actions</span>, align: 'right', render: (a) => (
      <div style={{ display: 'inline-flex', gap: 6 }}>
        <Button size="sm" disabled={locked || !!adjustmentLock(db, a)} aria-label="Edit adjustment" onClick={() => setEditing(a)}>Edit</Button>
        <Button size="sm" variant="danger" disabled={locked || !!adjustmentLock(db, a)} aria-label="Delete adjustment" onClick={() => setRemoving(a)}>Delete</Button>
      </div>
    ) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {locked && <Note tone="warn">This run is {run.status}, so its inputs are locked. {run.status === 'frozen' ? 'Unfreeze it from the Freeze step if something has to change.' : 'A paid run is closed.'}</Note>}
      <StatGrid>
        <Stat label="Employees in this run" value={emps.length} hint={`${fmtMonth(run.month)}, ${db.entities.find((e) => e.id === run.entityId)?.name ?? ''}`} />
        <Stat label="Loss of pay days" value={totalLop} tone={totalLop ? 'warn' : undefined} hint="Across the employees listed" />
        <Stat label="Overtime hours" value={totalOt} hint="Paid at the overtime rule's multiple" />
        <Stat label="No attendance summary" value={missing} tone={missing ? 'warn' : 'ok'} hint={missing ? 'A full month is assumed for them' : 'Everyone has a summary'} />
      </StatGrid>

      <Card>
        <CardTitle>Attendance summary for {fmtMonth(run.month)}</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Search employee" />
            <Select aria-label="Show" value={only} onChange={(e) => setOnly(e.target.value)} style={{ width: 200 }}>
              <option value="all">Everyone</option><option value="lop">With loss of pay</option><option value="ot">With overtime</option><option value="none">Without a summary</option>
            </Select>
          </Toolbar>
          <DataTable columns={cols} rows={rows} minWidth={860} empty={emps.length ? 'No employee matches this filter.' : 'No employee is in scope for this month and entity.'} />
          <div style={{ fontSize: 12.5, color: T.mute }}>
            Paid days and loss-of-pay days move together (paid days = days in month minus loss of pay). Changes are saved when you leave the field or press Enter.
            Weekly offs and holidays are already paid, so only unpaid absence goes in as loss of pay.
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle right={<Button variant="primary" style={{ height: 40 }} disabled={locked} onClick={() => setEditing('new')}>Add adjustment</Button>}>Adjustments for {fmtMonth(run.month)}</CardTitle>
        <DataTable columns={adjCols} rows={adjustments} minWidth={720} empty="No adjustments for this month. Add arrears, bonuses, incentives, reimbursements or one-time deductions." />
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 10 }}>Kinds: {ADJUSTMENT_KINDS.map((k) => k.label).join(', ')}. The full list across months is on the Adjustments tab of the payroll hub.</div>
      </Card>

      <div data-testid="run-loans"><Card>
        <CardTitle>Loan and advance recoveries in this run</CardTitle>
        {loanRows.length === 0 ? <div style={{ fontSize: 13.5, color: T.mute }}>No loan or advance is being recovered this month.</div> : (
          <DataTable columns={[
            { key: 'emp', label: 'Employee', render: (r: typeof loanRows[number]) => <EmployeeCell e={r.e} href={false} /> },
            { key: 'kind', label: 'Kind', render: (r) => (r.kind === 'loan' ? 'Loan' : 'Advance') },
            { key: 'emi', label: 'Deducted this month', align: 'right', render: (r) => inr(r.emi) },
            { key: 'after', label: 'Balance after', align: 'right', render: (r) => inr(r.after) },
          ]} rows={loanRows} minWidth={520} />
        )}
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 10 }}>These come from the Loans tab. They are deducted automatically, and the recovered amount moves when the run is frozen.</div>
      </Card></div>

      {editing && <AdjustmentForm db={db} initial={editing === 'new' ? undefined : editing} defaultMonth={run.month} lockMonth employees={emps} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal title="Delete adjustment" danger confirmLabel="Delete adjustment" onClose={() => setRemoving(null)}
          onConfirm={() => { if (report(deleteAdjustment(removing.id), 'Adjustment deleted')) setRemoving(null); }}>
          Delete the {adjustmentInfo(removing.kind).label.toLowerCase()} of {inr(removing.amount)} for {fullName(db.employees.find((e) => e.id === removing.employeeId) ?? { firstName: 'this', lastName: 'employee' })}?
        </ConfirmModal>
      )}
    </div>
  );
}
