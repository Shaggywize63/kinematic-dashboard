'use client';
// "New joiner": creates a draft employee (status onboarding, minimal fields) and its onboarding case with the
// standard checklist. Validates every field and shows the error beside it.

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button, T, useIsCompact } from '../ui';
import { Field, FormGrid, Input, Select } from '../../ui';
import { Dialog } from './common';
import { isIsoDate } from './common';
import { EMPLOYMENT_TYPES, startOnboarding } from '../../../lib/hrms/lifecycleActions';
import { TODAY } from '../overview/insights';
import { addDays, diffDays } from '../../../lib/hrms/format';
import { checkEmail, checkMobile } from '../../../lib/hrms/validators';
import type { EmploymentType, Gender, HrmsDb } from '../../../lib/hrms/types';

interface Form {
  firstName: string; lastName: string; gender: '' | Gender; dob: string; email: string; mobile: string;
  locationId: string; departmentId: string; designationId: string; employmentType: EmploymentType; joinDate: string;
  probationMonths: string; noticeDays: string; annualCtc: string; contractEndDate: string;
}
type Errors = Partial<Record<keyof Form, string>>;

const NAME = /^[A-Za-z][A-Za-z .'-]*$/;

export function validateJoiner(f: Form, db: HrmsDb): Errors {
  const e: Errors = {};
  if (!f.firstName.trim()) e.firstName = 'First name is required';
  else if (!NAME.test(f.firstName.trim()) || f.firstName.trim().length > 60) e.firstName = 'Use letters only, up to 60 characters';
  if (!f.lastName.trim()) e.lastName = 'Last name is required';
  else if (!NAME.test(f.lastName.trim()) || f.lastName.trim().length > 60) e.lastName = 'Use letters only, up to 60 characters';
  if (!f.gender) e.gender = 'Choose a gender';

  if (!f.joinDate) e.joinDate = 'Join date is required';
  else if (!isIsoDate(f.joinDate)) e.joinDate = 'Enter a valid date';
  else if (diffDays(TODAY, f.joinDate) > 366 || diffDays(f.joinDate, TODAY) > 366) e.joinDate = 'Join date should be within a year of today';

  if (!f.dob) e.dob = 'Date of birth is required';
  else if (!isIsoDate(f.dob)) e.dob = 'Enter a valid date';
  else if (f.dob >= TODAY) e.dob = 'Date of birth must be in the past';
  else if (isIsoDate(f.joinDate) && diffDays(f.dob, f.joinDate) < 15 * 365) e.dob = 'The person must be at least 15 on the join date';
  else if (diffDays(f.dob, TODAY) > 100 * 366) e.dob = 'Check the year of birth';

  const em = checkEmail(f.email);
  if (!em.ok) e.email = em.message;
  else if (db.employees.some((x) => x.email.toLowerCase() === f.email.trim().toLowerCase())) e.email = 'An employee with this email already exists';
  const mo = checkMobile(f.mobile);
  if (!mo.ok) e.mobile = mo.message;

  if (!f.locationId) e.locationId = 'Choose a location';
  if (!f.departmentId) e.departmentId = 'Choose a department';
  if (!f.designationId) e.designationId = 'Choose a designation';

  const prob = Number(f.probationMonths);
  if (f.probationMonths.trim() === '' || !Number.isInteger(prob) || prob < 0 || prob > 12) e.probationMonths = 'Whole months, 0 to 12';
  const notice = Number(f.noticeDays);
  if (f.noticeDays.trim() === '' || !Number.isInteger(notice) || notice < 0 || notice > 180) e.noticeDays = 'Whole days, 0 to 180';
  if (f.annualCtc.trim() !== '') {
    const ctc = Number(f.annualCtc.replace(/,/g, ''));
    if (!Number.isFinite(ctc) || ctc <= 0) e.annualCtc = 'Enter a positive amount in rupees';
    else if (ctc > 100_000_000) e.annualCtc = 'That is above ₹10 crore, check the amount';
  }
  if (f.employmentType === 'fixed_term' || f.employmentType === 'contract') {
    if (!f.contractEndDate) e.contractEndDate = 'Contract end date is required for this type';
    else if (!isIsoDate(f.contractEndDate)) e.contractEndDate = 'Enter a valid date';
    else if (isIsoDate(f.joinDate) && f.contractEndDate <= f.joinDate) e.contractEndDate = 'The contract must end after the join date';
  }
  return e;
}

export default function NewJoinerModal({ db, onClose, onCreated }: { db: HrmsDb; onClose: () => void; onCreated: (caseId: string) => void }) {
  const narrow = useIsCompact(700);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [f, setF] = useState<Form>({
    firstName: '', lastName: '', gender: '', dob: '', email: '', mobile: '',
    locationId: db.locations[0]?.id ?? '', departmentId: '', designationId: '', employmentType: 'permanent', joinDate: addDays(TODAY, 14),
    probationMonths: '6', noticeDays: '30', annualCtc: '', contractEndDate: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    const next = { ...f, [k]: v };
    setF(next);
    if (submitted) setErrors(validateJoiner(next, db));   // keep errors honest while the person fixes them
  };
  const typed = (k: keyof Form) => ({
    id: id(k), value: f[k], invalid: !!errors[k], 'aria-invalid': !!errors[k] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });
  const needsEnd = f.employmentType === 'fixed_term' || f.employmentType === 'contract';

  function submit() {
    const errs = validateJoiner(f, db);
    setErrors(errs);
    setSubmitted(true);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]!;
      document.getElementById(id(first))?.focus();
      return;
    }
    const { employee, onboarding } = startOnboarding({
      firstName: f.firstName, lastName: f.lastName, gender: f.gender as Gender, dob: f.dob, email: f.email, mobile: f.mobile,
      locationId: f.locationId, departmentId: f.departmentId, designationId: f.designationId, employmentType: f.employmentType, joinDate: f.joinDate,
      probationMonths: Number(f.probationMonths), noticeDays: Number(f.noticeDays),
      annualCtc: f.annualCtc.trim() ? Number(f.annualCtc.replace(/,/g, '')) : undefined,
      contractEndDate: needsEnd ? f.contractEndDate : undefined,
    });
    toast.success(`${employee.firstName} ${employee.lastName} added to onboarding with ${onboarding.tasks.length} tasks.`);
    onCreated(onboarding.id);
  }

  return (
    <Dialog title="New joiner" width={720} onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} style={{ height: 44 }}>Cancel</Button>
          <Button variant="primary" onClick={submit} style={{ height: 44 }}>Create joiner</Button>
        </>
      )}>
      <p style={{ margin: 0, fontSize: 13, color: T.dim }}>
        This creates a draft employee with status Onboarding and the standard joining checklist. PAN, bank and statutory details are completed later on the employee profile.
      </p>
      <FormGrid narrow={narrow}>
        <Field label="First name" required htmlFor={id('firstName')} error={errors.firstName}><Input {...typed('firstName')} autoComplete="off" /></Field>
        <Field label="Last name" required htmlFor={id('lastName')} error={errors.lastName}><Input {...typed('lastName')} autoComplete="off" /></Field>
        <Field label="Gender" required htmlFor={id('gender')} error={errors.gender}>
          <Select {...typed('gender')}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
        </Field>
        <Field label="Date of birth" required htmlFor={id('dob')} error={errors.dob}><Input type="date" {...typed('dob')} /></Field>
        <Field label="Work email" required htmlFor={id('email')} error={errors.email}><Input type="email" {...typed('email')} autoComplete="off" /></Field>
        <Field label="Mobile" required htmlFor={id('mobile')} error={errors.mobile} hint="10 digits, or with +91"><Input type="tel" {...typed('mobile')} autoComplete="off" /></Field>
        <Field label="Designation" required htmlFor={id('designationId')} error={errors.designationId}>
          <Select {...typed('designationId')}><option value="">Select</option>{db.designations.map((d) => <option key={d.id} value={d.id}>{d.name}{d.grade ? ` (${d.grade})` : ''}</option>)}</Select>
        </Field>
        <Field label="Department" required htmlFor={id('departmentId')} error={errors.departmentId}>
          <Select {...typed('departmentId')}><option value="">Select</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </Field>
        <Field label="Location" required htmlFor={id('locationId')} error={errors.locationId} hint="The location decides the legal entity">
          <Select {...typed('locationId')}><option value="">Select</option>{db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}, {l.city}</option>)}</Select>
        </Field>
        <Field label="Employment type" required htmlFor={id('employmentType')}>
          <Select {...typed('employmentType')}>{EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
        </Field>
        <Field label="Join date" required htmlFor={id('joinDate')} error={errors.joinDate}><Input type="date" {...typed('joinDate')} /></Field>
        {needsEnd && <Field label="Contract end date" required htmlFor={id('contractEndDate')} error={errors.contractEndDate}><Input type="date" {...typed('contractEndDate')} /></Field>}
        <Field label="Probation (months)" required htmlFor={id('probationMonths')} error={errors.probationMonths}><Input inputMode="numeric" {...typed('probationMonths')} /></Field>
        <Field label="Notice period (days)" required htmlFor={id('noticeDays')} error={errors.noticeDays}><Input inputMode="numeric" {...typed('noticeDays')} /></Field>
        <Field label="Annual CTC (₹)" htmlFor={id('annualCtc')} error={errors.annualCtc} hint="Optional now. The salary structure is assigned on the profile.">
          <Input inputMode="numeric" placeholder="e.g. 900000" {...typed('annualCtc')} />
        </Field>
      </FormGrid>
    </Dialog>
  );
}
