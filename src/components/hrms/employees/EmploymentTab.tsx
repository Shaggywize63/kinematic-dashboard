'use client';
// Employment: read view, and an Edit / Save / Cancel form. Marking someone as exited asks first.

import { useState } from 'react';
import { Card, CardTitle, KeyValue, StatusBadge, T, useIsCompact } from '../ui';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import { EMPLOYMENT_TYPES, employmentPatch, labelOf, validateEmployment } from './logic';
import { EmploymentFields } from './fields';
import { ConfirmDialog, EditBar, ErrorSummary } from './shared';
import { useEditForm } from './useEditForm';

export default function EmploymentTab({ e, db }: { e: Employee; db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const [confirmExit, setConfirmExit] = useState(false);
  const f = useEditForm({ key: 'employment', e, validate: (d) => validateEmployment(d, db, e.id), toPatch: (d) => employmentPatch(d, db) });
  const manager = e.reportingToId ? db.employees.find((x) => x.id === e.reportingToId) : undefined;
  const shift = db.shifts.find((s) => s.id === e.shiftId);

  const onSave = () => {
    if (!f.check()) return;
    if (f.d.status === 'exited' && e.status !== 'exited') setConfirmExit(true);
    else f.commit();
  };

  return (
    <Card>
      <CardTitle right={<EditBar editing={f.editing} onEdit={f.start} onSave={onSave} onCancel={f.cancel} flash={f.flash} />}>Employment</CardTitle>
      {f.editing ? (
        <form onSubmit={(ev) => { ev.preventDefault(); onSave(); }} noValidate aria-label="Edit employment" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ErrorSummary errors={f.errors} />
          <EmploymentFields d={f.d} set={f.set} errors={f.errors} narrow={narrow} p="ee" db={db} selfId={e.id} showStatus />
        </form>
      ) : (
        <KeyValue rows={[
          { label: 'Status', value: <StatusBadge status={e.status} /> },
          { label: 'Employment type', value: labelOf(EMPLOYMENT_TYPES, e.employmentType) },
          { label: 'Legal entity', value: db.entities.find((x) => x.id === e.entityId)?.name },
          { label: 'Location', value: db.locations.find((x) => x.id === e.locationId)?.name },
          { label: 'Department', value: db.departments.find((x) => x.id === e.departmentId)?.name },
          { label: 'Designation', value: db.designations.find((x) => x.id === e.designationId)?.name },
          { label: 'Reports to', value: manager ? fullName(manager) : 'No manager' },
          { label: 'Join date', value: fmtDate(e.joinDate) },
          { label: 'Probation', value: `${e.probationMonths} months` },
          { label: 'Confirmation date', value: fmtDate(e.confirmationDate) },
          { label: 'Notice period', value: `${e.noticeDays} days` },
          { label: 'Contract end date', value: e.contractEndDate ? fmtDate(e.contractEndDate) : undefined },
          { label: 'Last working date', value: e.lastWorkingDate ? fmtDate(e.lastWorkingDate) : undefined },
          { label: 'Shift', value: shift ? `${shift.name} (${shift.start}-${shift.end})` : undefined },
          { label: 'Cost centre', value: e.costCentre },
        ]} />
      )}
      {f.dialog}
      {confirmExit && (
        <ConfirmDialog title="Mark this employee as exited?" confirmLabel="Mark as exited" danger onClose={() => setConfirmExit(false)}
          onConfirm={() => { setConfirmExit(false); f.commit(); }}>
          {fullName(e)} will be shown as Exited with a last working date of {fmtDate(f.d.lastWorkingDate)}. Payroll stops after that date and full and final settlement falls due. You can change the status back here if this was a mistake.
        </ConfirmDialog>
      )}
      <div style={{ marginTop: 14, fontSize: 12.5, color: T.mute }}>Starting the formal exit process (clearance, interview, settlement) lives under Lifecycle.</div>
    </Card>
  );
}
