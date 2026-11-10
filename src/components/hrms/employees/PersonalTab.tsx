'use client';
// Personal details: read view, and an Edit / Save / Cancel form that writes through saveEmployee (change log included).

import { Card, CardTitle, KeyValue, T, useIsCompact } from '../ui';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate } from '../../../lib/hrms/format';
import { isLive } from '../../../lib/hrms/live/store';
import { ageOn, labelOf, personalPatch, validatePersonal, GENDERS, MARITAL } from './logic';
import { PersonalFields } from './fields';
import { EditBar, ErrorSummary } from './shared';
import { useEditForm } from './useEditForm';

export default function PersonalTab({ e, db }: { e: Employee; db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const f = useEditForm({ key: 'personal', e, validate: (d) => validatePersonal(d, db, e.id), toPatch: personalPatch });
  const addr = [e.address.line1, e.address.line2, e.address.city, e.address.state, e.address.pincode].filter(Boolean).join(', ');

  return (
    <Card>
      <CardTitle right={<EditBar editing={f.editing} onEdit={f.start} onSave={f.save} onCancel={f.cancel} flash={f.flash} />}>Personal details</CardTitle>
      {f.editing ? (
        <form onSubmit={(ev) => { ev.preventDefault(); f.save(); }} noValidate aria-label="Edit personal details" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ErrorSummary errors={f.errors} />
          <PersonalFields d={f.d} set={f.set} errors={f.errors} narrow={narrow} p="pe" />
        </form>
      ) : (
        <KeyValue rows={[
          { label: 'Full name', value: `${e.firstName} ${e.lastName}`.trim() },
          { label: 'Date of birth', value: e.dob ? `${fmtDate(e.dob)} (age ${ageOn(e.dob, PREVIEW_TODAY)})` : undefined },
          { label: 'Gender', value: labelOf(GENDERS, e.gender) },
          { label: "Father's name", value: e.fatherName },
          { label: 'Marital status', value: e.maritalStatus ? labelOf(MARITAL, e.maritalStatus) : undefined },
          { label: 'Blood group', value: e.bloodGroup },
          { label: 'Work email', value: e.email },
          { label: 'Mobile', value: e.mobile },
          { label: 'Address', value: addr },
          { label: 'Emergency contact', value: e.emergencyContact ? `${e.emergencyContact.name}${e.emergencyContact.relation ? ` (${e.emergencyContact.relation})` : ''}, ${e.emergencyContact.mobile}` : undefined },
        ]} />
      )}
      {f.dialog}
      <div style={{ marginTop: 14, fontSize: 12.5, color: T.mute }}>
        {isLive()
          ? 'Edits are saved on the server, which writes them to the change log with the old and new value and your name.'
          : <>Edits are written to the change log with the old and new value, under &quot;You (HR admin)&quot; in this preview.</>}
      </div>
    </Card>
  );
}
