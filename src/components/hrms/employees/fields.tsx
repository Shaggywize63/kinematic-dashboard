'use client';
// Form controls and the field groups that the New form and the profile edit forms share, so a rule changes in one place.

import type { ReactNode } from 'react';
import { Field, FormGrid, Input, Select, Textarea, T } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import {
  BLOOD_GROUPS, EMPLOYMENT_TYPES, GENDERS, MARITAL, PAY_MODES, STATES, STATUS_OPTIONS, TAX_REGIMES, UAN_STATUSES, hasLwf,
  type EmployeeDraft, type Errors, type Option,
} from './logic';

export type SetDraft = (patch: Partial<EmployeeDraft>) => void;

export function TextField({ id, label, value, onChange, error, required, hint, type = 'text', inputMode, placeholder, disabled, maxLength, autoComplete, readOnly }: {
  id: string; label: ReactNode; value: string; onChange: (v: string) => void; error?: string; required?: boolean; hint?: ReactNode; type?: string;
  inputMode?: 'numeric' | 'tel' | 'email' | 'text'; placeholder?: string; disabled?: boolean; maxLength?: number; autoComplete?: string; readOnly?: boolean;
}) {
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={id}>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} aria-invalid={!!error || undefined}
        inputMode={inputMode} placeholder={placeholder} disabled={disabled} maxLength={maxLength} autoComplete={autoComplete ?? 'off'} readOnly={readOnly} />
    </Field>
  );
}

export function SelectField({ id, label, value, onChange, options, error, required, hint, placeholder = 'Select', disabled }: {
  id: string; label: ReactNode; value: string; onChange: (v: string) => void; options: Option[]; error?: string; required?: boolean; hint?: ReactNode; placeholder?: string | null; disabled?: boolean;
}) {
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} aria-invalid={!!error || undefined} disabled={disabled}>
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function CheckField({ id, label, checked, onChange, hint, disabled }: { id: string; label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, fontSize: 14, color: disabled ? T.mute : T.text, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--red)', flexShrink: 0 }} />
        <span>{label}</span>
      </label>
      {hint && <div style={{ fontSize: 12, color: T.mute, marginLeft: 28 }}>{hint}</div>}
    </div>
  );
}

export function TextAreaField({ id, label, value, onChange, error, required, hint, rows = 3 }: { id: string; label: ReactNode; value: string; onChange: (v: string) => void; error?: string; required?: boolean; hint?: ReactNode; rows?: number }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={id}>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} aria-invalid={!!error || undefined} />
    </Field>
  );
}

interface GroupProps { d: EmployeeDraft; set: SetDraft; errors: Errors; narrow: boolean; p: string }

// ───────────────────────────── personal ─────────────────────────────
export function PersonalFields({ d, set, errors, narrow, p }: GroupProps) {
  return (
    <>
      <FormGrid narrow={narrow}>
        <TextField id={`${p}-firstName`} label="First name" required value={d.firstName} onChange={(v) => set({ firstName: v })} error={errors.firstName} autoComplete="given-name" />
        <TextField id={`${p}-lastName`} label="Last name" value={d.lastName} onChange={(v) => set({ lastName: v })} error={errors.lastName} hint="Leave blank for a single name" autoComplete="family-name" />
        <TextField id={`${p}-email`} label="Work email" required type="email" inputMode="email" value={d.email} onChange={(v) => set({ email: v })} error={errors.email} />
        <TextField id={`${p}-mobile`} label="Mobile" required type="tel" inputMode="tel" value={d.mobile} onChange={(v) => set({ mobile: v })} error={errors.mobile} hint="10 digits, +91 is fine" />
        <SelectField id={`${p}-gender`} label="Gender" required value={d.gender} onChange={(v) => set({ gender: v as EmployeeDraft['gender'] })} options={GENDERS} error={errors.gender} />
        <TextField id={`${p}-dob`} label="Date of birth" required type="date" value={d.dob} onChange={(v) => set({ dob: v })} error={errors.dob} />
        <TextField id={`${p}-fatherName`} label="Father's name" value={d.fatherName} onChange={(v) => set({ fatherName: v })} />
        <SelectField id={`${p}-marital`} label="Marital status" value={d.maritalStatus} onChange={(v) => set({ maritalStatus: v as EmployeeDraft['maritalStatus'] })} options={MARITAL} placeholder="Not stated" />
        <SelectField id={`${p}-blood`} label="Blood group" value={d.bloodGroup} onChange={(v) => set({ bloodGroup: v })} options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))} placeholder="Not stated" />
      </FormGrid>
      <SubHead>Address</SubHead>
      <FormGrid narrow={narrow}>
        <TextField id={`${p}-addr1`} label="Address line 1" value={d.addrLine1} onChange={(v) => set({ addrLine1: v })} autoComplete="address-line1" />
        <TextField id={`${p}-addr2`} label="Address line 2" value={d.addrLine2} onChange={(v) => set({ addrLine2: v })} autoComplete="address-line2" />
        <TextField id={`${p}-city`} label="City" value={d.addrCity} onChange={(v) => set({ addrCity: v })} autoComplete="address-level2" />
        <SelectField id={`${p}-state`} label="State" value={d.addrState} onChange={(v) => set({ addrState: v })} options={STATES.map((s) => ({ value: s, label: s }))} placeholder="Select state" />
        <TextField id={`${p}-pin`} label="Pincode" inputMode="numeric" maxLength={6} value={d.addrPincode} onChange={(v) => set({ addrPincode: v })} error={errors.addrPincode} />
      </FormGrid>
      <SubHead>Emergency contact</SubHead>
      <FormGrid narrow={narrow} columns={3}>
        <TextField id={`${p}-emName`} label="Name" value={d.emName} onChange={(v) => set({ emName: v })} error={errors.emName} />
        <TextField id={`${p}-emRel`} label="Relation" value={d.emRelation} onChange={(v) => set({ emRelation: v })} />
        <TextField id={`${p}-emMobile`} label="Mobile" type="tel" inputMode="tel" value={d.emMobile} onChange={(v) => set({ emMobile: v })} error={errors.emMobile} />
      </FormGrid>
    </>
  );
}

export function SubHead({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: '6px 0 0', fontFamily: T.heading, fontSize: 13, fontWeight: 700, color: T.text }}>{children}</h3>;
}

// ───────────────────────────── employment ─────────────────────────────
export function EmploymentFields({ d, set, errors, narrow, p, db, selfId, showStatus }: GroupProps & { db: HrmsDb; selfId?: string; showStatus?: boolean }) {
  const locations = db.locations.map((l) => ({ value: l.id, label: `${l.name} (${db.entities.find((e) => e.id === l.entityId)?.name ?? ''})` }));
  const loc = db.locations.find((l) => l.id === d.locationId);
  const entityName = db.entities.find((e) => e.id === loc?.entityId)?.name;
  const managers = db.employees.filter((e) => e.id !== selfId && e.status !== 'exited').map((e) => ({ value: e.id, label: `${fullName(e)} (${e.code})` }));
  const needsEnd = d.employmentType === 'fixed_term' || d.employmentType === 'contract';
  return (
    <>
      <FormGrid narrow={narrow}>
        <SelectField id={`${p}-location`} label="Location" required value={d.locationId} options={locations} error={errors.locationId}
          onChange={(v) => {
            const l = db.locations.find((x) => x.id === v);
            // New hires get the labour welfare fund flag from the state the moment a location is chosen; it stays editable.
            set(selfId ? { locationId: v, entityId: l?.entityId ?? '' } : { locationId: v, entityId: l?.entityId ?? '', lwfApplicable: hasLwf(l?.state) });
          }} />
        <Field label="Legal entity" hint="Follows the location">
          <Input value={entityName ?? '—'} readOnly aria-label="Legal entity" tabIndex={-1} />
        </Field>
        <SelectField id={`${p}-dept`} label="Department" required value={d.departmentId} onChange={(v) => set({ departmentId: v })} options={db.departments.map((x) => ({ value: x.id, label: x.name }))} error={errors.departmentId} />
        <SelectField id={`${p}-desig`} label="Designation" required value={d.designationId} onChange={(v) => set({ designationId: v })} options={db.designations.map((x) => ({ value: x.id, label: x.grade ? `${x.name} (${x.grade})` : x.name }))} error={errors.designationId} />
        <SelectField id={`${p}-mgr`} label="Reports to" value={d.reportingToId} onChange={(v) => set({ reportingToId: v })} options={managers} placeholder="No manager" error={errors.reportingToId} />
        <SelectField id={`${p}-type`} label="Employment type" required value={d.employmentType} onChange={(v) => set({ employmentType: v as EmployeeDraft['employmentType'] })} options={EMPLOYMENT_TYPES} placeholder={null} error={errors.employmentType} />
        <TextField id={`${p}-join`} label="Join date" required type="date" value={d.joinDate} onChange={(v) => set({ joinDate: v })} error={errors.joinDate}
          hint={!selfId ? `A date on or before ${fmtDate(PREVIEW_TODAY)} makes the employee Active, a later date keeps them in Onboarding` : undefined} />
        {showStatus && <SelectField id={`${p}-status`} label="Status" required value={d.status} onChange={(v) => set({ status: v as EmployeeDraft['status'] })} options={STATUS_OPTIONS} placeholder={null} error={errors.status} />}
        {showStatus && <TextField id={`${p}-confirm`} label="Confirmation date" type="date" value={d.confirmationDate} onChange={(v) => set({ confirmationDate: v })} error={errors.confirmationDate} />}
        <TextField id={`${p}-prob`} label="Probation (months)" inputMode="numeric" value={d.probationMonths} onChange={(v) => set({ probationMonths: v })} error={errors.probationMonths} />
        <TextField id={`${p}-notice`} label="Notice period (days)" inputMode="numeric" value={d.noticeDays} onChange={(v) => set({ noticeDays: v })} error={errors.noticeDays} />
        {(needsEnd || d.contractEndDate) && <TextField id={`${p}-contractEnd`} label="Contract end date" required={needsEnd} type="date" value={d.contractEndDate} onChange={(v) => set({ contractEndDate: v })} error={errors.contractEndDate} />}
        {showStatus && <TextField id={`${p}-lwd`} label="Last working date" required={d.status === 'on_notice' || d.status === 'exited'} type="date" value={d.lastWorkingDate} onChange={(v) => set({ lastWorkingDate: v })} error={errors.lastWorkingDate} />}
        <SelectField id={`${p}-shift`} label="Shift" value={d.shiftId} onChange={(v) => set({ shiftId: v })} options={db.shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.start}-${s.end})` }))} placeholder="No shift" />
        <TextField id={`${p}-cc`} label="Cost centre" value={d.costCentre} onChange={(v) => set({ costCentre: v })} />
      </FormGrid>
    </>
  );
}

// ───────────────────────────── statutory + bank ─────────────────────────────
export function StatutoryFields({ d, set, errors, narrow, p, mode, hasAadhaar, hasBank }: GroupProps & { mode: 'create' | 'edit'; hasAadhaar?: boolean; hasBank?: boolean }) {
  const edit = mode === 'edit';
  return (
    <>
      <FormGrid narrow={narrow}>
        <TextField id={`${p}-pan`} label="PAN" value={d.pan} onChange={(v) => set({ pan: v.toUpperCase() })} error={errors.pan} maxLength={10} hint="Format ABCDE1234F. Without a PAN, TDS goes at the higher rate." />
        <TextField id={`${p}-aadhaar`} label={edit && hasAadhaar ? 'Replace Aadhaar number' : 'Aadhaar number'} inputMode="numeric" maxLength={14} value={d.aadhaar} onChange={(v) => set({ aadhaar: v })} error={errors.aadhaar}
          hint={edit && hasAadhaar ? 'Leave blank to keep what is on file. Only the last four digits are stored.' : 'We check the 12 digits and their checksum, then keep only the last four (DPDP). The full number is not stored. Marked not verified until checked.'} />
        <TextField id={`${p}-uan`} label="UAN" inputMode="numeric" maxLength={14} value={d.uan} onChange={(v) => set({ uan: v })} error={errors.uan} hint="12 digits" />
        <SelectField id={`${p}-uanStatus`} label="UAN status" value={d.uanStatus} onChange={(v) => set({ uanStatus: v as EmployeeDraft['uanStatus'] })} options={UAN_STATUSES} placeholder={null} error={errors.uanStatus}
          hint="The PF return (ECR) skips anyone whose UAN is not Aadhaar-seeded" />
        <TextField id={`${p}-esic`} label="ESIC number" inputMode="numeric" maxLength={17} value={d.esicIp} onChange={(v) => set({ esicIp: v })} error={errors.esicIp} hint="10 digits (17 for older numbers). Needed only when ESI applies at the gross." />
        <SelectField id={`${p}-regime`} label="Tax regime" value={d.taxRegime} onChange={(v) => set({ taxRegime: v as EmployeeDraft['taxRegime'] })} options={TAX_REGIMES} placeholder={null} />
      </FormGrid>
      <FormGrid narrow={narrow}>
        <CheckField id={`${p}-pf`} label="PF member" checked={d.pfMember} onChange={(v) => set({ pfMember: v, pfOnActualWage: v ? d.pfOnActualWage : false })} />
        <CheckField id={`${p}-pfActual`} label="Contribute PF on actual wage" checked={d.pfOnActualWage} disabled={!d.pfMember} onChange={(v) => set({ pfOnActualWage: v })} hint="Above the PF wage ceiling, instead of capping at it" />
        <CheckField id={`${p}-pt`} label="Professional tax applies" checked={d.ptApplicable} onChange={(v) => set({ ptApplicable: v })} />
        <CheckField id={`${p}-lwf`} label="Labour welfare fund applies" checked={d.lwfApplicable} onChange={(v) => set({ lwfApplicable: v })} />
      </FormGrid>
      <SubHead>Bank account</SubHead>
      <FormGrid narrow={narrow}>
        <TextField id={`${p}-bankHolder`} label="Account holder" value={d.bankHolder} onChange={(v) => set({ bankHolder: v })} error={errors.bankHolder} />
        <TextField id={`${p}-bankAccount`} label={edit && hasBank ? 'Replace account number' : 'Account number'} inputMode="numeric" maxLength={18} value={d.bankAccount} onChange={(v) => set({ bankAccount: v })} error={errors.bankAccount}
          hint={edit && hasBank ? 'Leave blank to keep the account on file' : '9 to 18 digits'} />
        <TextField id={`${p}-ifsc`} label="IFSC" maxLength={11} value={d.bankIfsc} onChange={(v) => set({ bankIfsc: v.toUpperCase() })} error={errors.bankIfsc} hint="Like HDFC0001234" />
        <TextField id={`${p}-bankName`} label="Bank name" value={d.bankName} onChange={(v) => set({ bankName: v })} error={errors.bankName} />
        <SelectField id={`${p}-bankType`} label="Account type" value={d.bankType} onChange={(v) => set({ bankType: v as 'savings' | 'current' })} options={[{ value: 'savings', label: 'Savings' }, { value: 'current', label: 'Current' }]} placeholder={null} />
        <SelectField id={`${p}-payMode`} label="Pay mode" value={d.payMode} onChange={(v) => set({ payMode: v as EmployeeDraft['payMode'] })} options={PAY_MODES} placeholder={null}
          hint={d.payMode === 'bank' && ![d.bankAccount, d.bankIfsc].some((x) => x.trim()) && !hasBank ? 'Bank transfer needs an account before the first pay run' : undefined} />
      </FormGrid>
    </>
  );
}

export function DeclarationFields({ d, set, errors, narrow, p }: GroupProps) {
  return (
    <FormGrid narrow={narrow}>
      <SelectField id={`${p}-declStatus`} label="Declaration status" value={d.declStatus} onChange={(v) => set({ declStatus: v as EmployeeDraft['declStatus'] })}
        options={[{ value: 'not_submitted', label: 'Not submitted' }, { value: 'submitted', label: 'Submitted' }, { value: 'verified', label: 'Verified' }]} placeholder={null} />
      <TextField id={`${p}-d80c`} label="Section 80C (yearly)" inputMode="numeric" value={d.declSec80C} onChange={(v) => set({ declSec80C: v })} error={errors.declSec80C} />
      <TextField id={`${p}-d80d`} label="Section 80D health insurance (yearly)" inputMode="numeric" value={d.declSec80D} onChange={(v) => set({ declSec80D: v })} error={errors.declSec80D} />
      <TextField id={`${p}-dnps`} label="NPS 80CCD(1B) (yearly)" inputMode="numeric" value={d.declNps} onChange={(v) => set({ declNps: v })} error={errors.declNps} />
      <TextField id={`${p}-dloan`} label="Home-loan interest (yearly)" inputMode="numeric" value={d.declHomeLoan} onChange={(v) => set({ declHomeLoan: v })} error={errors.declHomeLoan} />
      <TextField id={`${p}-drent`} label="Rent paid (yearly)" inputMode="numeric" value={d.declRent} onChange={(v) => set({ declRent: v })} error={errors.declRent} />
      <TextField id={`${p}-dpan`} label="Landlord PAN" value={d.declLandlordPan} onChange={(v) => set({ declLandlordPan: v.toUpperCase() })} error={errors.declLandlordPan} maxLength={10} />
      <TextField id={`${p}-dother`} label="Other deductions (yearly)" inputMode="numeric" value={d.declOther} onChange={(v) => set({ declOther: v })} error={errors.declOther} />
    </FormGrid>
  );
}
