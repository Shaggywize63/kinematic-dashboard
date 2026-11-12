'use client';
// "Start exit": pick an active employee, a reason and the resignation date. The last working date is the
// resignation date plus the employee's notice days, or the resignation date itself when notice is waived.

import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, T, useIsCompact } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import { Dialog, CheckRow, isIsoDate } from './common';
import { EXIT_REASONS, startExit } from '../../../lib/hrms/lifecycleActions';
import { whenSynced } from '../../../lib/hrms/live/store';
import { TODAY } from '../overview/insights';
import { addDays, diffDays, fmtDate, fullName } from '../../../lib/hrms/format';
import type { ExitCase, HrmsDb } from '../../../lib/hrms/types';

export default function StartExitModal({ db, onClose, onStarted }: { db: HrmsDb; onClose: () => void; onStarted: (exitId: string) => void }) {
  const narrow = useIsCompact(700);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  const eligible = useMemo(() => db.employees
    .filter((e) => e.status === 'active' && !db.exits.some((x) => x.employeeId === e.id && x.stage !== 'closed'))
    .sort((a, b) => fullName(a).localeCompare(fullName(b))), [db.employees, db.exits]);

  const [employeeId, setEmployeeId] = useState('');
  const [reason, setReason] = useState<ExitCase['reason']>('resignation');
  const [resignationDate, setResignationDate] = useState<string>(TODAY);
  const [waived, setWaived] = useState(false);
  const [lwdOverride, setLwdOverride] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const emp = eligible.find((e) => e.id === employeeId);
  const validResignation = isIsoDate(resignationDate);
  const computed = validResignation ? (waived ? resignationDate : addDays(resignationDate, emp?.noticeDays ?? 0)) : '';
  const lwd = lwdOverride ?? computed;
  const shortBy = emp && !waived && validResignation && isIsoDate(lwd) ? Math.max(0, emp.noticeDays - diffDays(resignationDate, lwd)) : 0;

  function submit() {
    const e: Record<string, string> = {};
    if (!emp) e.employeeId = 'Choose an employee';
    if (!validResignation) e.resignationDate = 'Enter a valid date';
    else if (emp && resignationDate < emp.joinDate) e.resignationDate = `This is before the join date, ${fmtDate(emp.joinDate)}`;
    else if (diffDays(TODAY, resignationDate) > 90) e.resignationDate = 'Resignation date is more than 90 days away';
    if (!isIsoDate(lwd)) e.lwd = 'Enter a valid date';
    else if (validResignation && lwd < resignationDate) e.lwd = 'The last working date cannot be before the resignation date';
    setErrors(e);
    if (Object.keys(e).length) { document.getElementById(id(Object.keys(e)[0]!))?.focus(); return; }
    const c = startExit({ employeeId: emp!.id, reason, resignationDate, noticeWaived: waived, lastWorkingDate: lwd });
    // Live data: the exit case is saved on the server; the success message waits for it (a refused case is taken out again).
    whenSynced((ok) => { if (ok) toast.success(`Exit started for ${fullName(emp!)}. Last working day ${fmtDate(lwd)}.`); });
    onStarted(c.id);
  }

  return (
    <Dialog title="Start exit" width={620} onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} style={{ height: 44 }}>Cancel</Button>
          <Button variant="primary" onClick={submit} style={{ height: 44 }}>Start exit</Button>
        </>
      )}>
      <p style={{ margin: 0, fontSize: 13, color: T.dim }}>
        The employee goes on notice with the last working date below, and the standard clearance list is created. Only active employees without an open exit are listed.
      </p>
      <FormGrid narrow={narrow}>
        <Field label="Employee" required htmlFor={id('employeeId')} error={errors.employeeId} style={{ gridColumn: narrow ? undefined : 'span 2' }}
          hint={eligible.length === 0 ? 'Every active employee already has an open exit.' : undefined}>
          <Select id={id('employeeId')} value={employeeId} aria-invalid={!!errors.employeeId || undefined} invalid={!!errors.employeeId}
            onChange={(e) => { setEmployeeId(e.target.value); setLwdOverride(null); }}>
            <option value="">Select an employee</option>
            {eligible.map((e) => <option key={e.id} value={e.id}>{fullName(e)} ({e.code})</option>)}
          </Select>
        </Field>
        <Field label="Reason" required htmlFor={id('reason')}>
          <Select id={id('reason')} value={reason} onChange={(e) => setReason(e.target.value as ExitCase['reason'])}>
            {EXIT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Resignation date" required htmlFor={id('resignationDate')} error={errors.resignationDate}>
          <Input id={id('resignationDate')} type="date" value={resignationDate} invalid={!!errors.resignationDate} aria-invalid={!!errors.resignationDate || undefined}
            onChange={(e) => { setResignationDate(e.target.value); setLwdOverride(null); }} />
        </Field>
        <div style={{ gridColumn: narrow ? undefined : 'span 2' }}>
          <CheckRow checked={waived} onChange={(v) => { setWaived(v); setLwdOverride(null); }}>Notice is waived (the company releases the employee without serving notice)</CheckRow>
        </div>
        <Field label="Last working date" required htmlFor={id('lwd')} error={errors.lwd}
          hint={waived ? 'Notice waived: this defaults to the resignation date.' : emp ? `Resignation date plus the notice period of ${emp.noticeDays} days. You can change it.` : 'Resignation date plus the notice period. Choose an employee first.'}>
          <Input id={id('lwd')} type="date" value={lwd} invalid={!!errors.lwd} aria-invalid={!!errors.lwd || undefined} onChange={(e) => setLwdOverride(e.target.value)} />
        </Field>
      </FormGrid>
      {shortBy > 0 && (
        <div role="status" style={{ fontSize: 13, color: T.warn }}>
          This is {shortBy} {shortBy === 1 ? 'day' : 'days'} short of the {emp!.noticeDays}-day notice period. The shortfall is recovered in the full and final settlement.
        </div>
      )}
    </Dialog>
  );
}
