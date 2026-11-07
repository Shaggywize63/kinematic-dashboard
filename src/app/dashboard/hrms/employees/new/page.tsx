'use client';
// New employee: sectioned form (Personal, Employment, Statutory and bank, Pay). Saves through addEmployee and opens the profile.

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, HrmsPage, Loading, Note, T, useIsCompact } from '../../../../../components/hrms/ui';
import { Section } from '../../../../../components/ui';
import { useHrmsDb } from '../../../../../lib/hrms/db';
import { addEmployee } from '../../../../../lib/hrms/actions';
import { buildBreakup } from '../../../../../lib/hrms/engine';
import { inr } from '../../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../../lib/hrms/seed';
import { DirtyProvider, ErrorSummary, useReportDirty } from '../../../../../components/hrms/employees/shared';
import {
  EmploymentFields, PersonalFields, StatutoryFields, SelectField, TextField, type SetDraft,
} from '../../../../../components/hrms/employees/fields';
import {
  blankDraft, draftToInput, profileHref, toAmount, validateAll, type EmployeeDraft, type Errors,
} from '../../../../../components/hrms/employees/logic';

function NewEmployeeForm() {
  const db = useHrmsDb();
  const router = useRouter();
  const narrow = useIsCompact(900);
  const [d, setD] = useState<EmployeeDraft>(blankDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const pristine = useMemo(() => JSON.stringify(blankDraft()), []);
  const dirty = JSON.stringify(d) !== pristine && !saving;
  useReportDirty('new-employee', dirty);

  const set: SetDraft = useCallback((patch) => {
    setD((prev) => ({ ...prev, ...patch }));
  }, []);

  // Once the person has tried to save, re-check on every edit so errors clear as they are fixed.
  const live = useMemo(() => (db && tried ? validateAll(d, db) : null), [db, d, tried]);
  const shown: Errors = live ?? errors;

  if (!db) return <Loading />;

  const structure = db.structures.find((s) => s.id === d.structureId);
  const ctc = toAmount(d.annualCtc);
  const breakup = structure && ctc > 0 ? buildBreakup(structure, ctc, { asOn: PREVIEW_TODAY, pfMember: d.pfMember, pfOnActual: d.pfOnActualWage }) : null;
  const joinsLater = d.joinDate > PREVIEW_TODAY;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!db || saving) return;
    const errs = validateAll(d, db);
    setTried(true);
    setErrors(errs);
    if (Object.keys(errs).length) {
      // Move to the first problem so a long form does not hide why nothing happened.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    const created = addEmployee(draftToInput(d, db));
    router.push(profileHref(created.id));
  }

  return (
    <HrmsPage
      title="Add employee"
      description="Creates the record on the sample data in this browser. Nothing is sent to a server."
      actions={<Button href="/dashboard/hrms/employees">Back to employees</Button>}
      maxWidth={1040}
    >
      <form onSubmit={submit} noValidate aria-label="New employee">
        <Card>
          <Section eyebrow="1. Personal" hint="Contact details and who to call in an emergency." first>
            <PersonalFields d={d} set={set} errors={shown} narrow={narrow} p="new" />
          </Section>
          <Section eyebrow="2. Employment" hint="Where this person sits and when they start.">
            <EmploymentFields d={d} set={set} errors={shown} narrow={narrow} p="new" db={db} />
            <Note tone={joinsLater ? 'info' : 'ok'}>
              {joinsLater ? 'This join date is after today, so the employee will be created as Onboarding.' : 'This join date is today or earlier, so the employee will be created as Active.'}
            </Note>
          </Section>
          <Section eyebrow="3. Statutory and bank" hint="All optional on day one. Anything missing shows on the profile as incomplete statutory data.">
            <StatutoryFields d={d} set={set} errors={shown} narrow={narrow} p="new" mode="create" />
          </Section>
          <Section eyebrow="4. Pay" hint="Pick a structure and an annual CTC to see the monthly split. You can change both later on the Salary tab.">
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '16px 20px' }}>
              <SelectField id="new-structure" label="Salary structure" value={d.structureId} onChange={(v) => set({ structureId: v })} options={db.structures.map((s) => ({ value: s.id, label: s.name }))} placeholder="No structure yet" error={shown.structureId} />
              <TextField id="new-ctc" label="Annual CTC (₹)" inputMode="numeric" value={d.annualCtc} onChange={(v) => set({ annualCtc: v })} error={shown.annualCtc}
                hint={breakup ? `${inr(breakup.monthlyCtc)} a month. Monthly gross ${inr(breakup.monthlyGross)}. ESI ${breakup.esiApplicable ? 'applies' : 'does not apply'} at this gross.` : 'Whole rupees, for example 600000'} />
            </div>
          </Section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
            {tried && <ErrorSummary errors={shown} />}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button href="/dashboard/hrms/employees">Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving} style={{ minHeight: 44, padding: '0 20px' }}>{saving ? 'Saving' : 'Create employee'}</Button>
            </div>
          </div>
        </Card>
      </form>
    </HrmsPage>
  );
}

export default function NewEmployeePage() {
  return <DirtyProvider><NewEmployeeForm /></DirtyProvider>;
}
