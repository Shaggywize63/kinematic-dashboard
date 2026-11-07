// Pure logic for the Employees screens: form drafts, validation, patches, CSV parsing and import validation.
// No React and no storage here, so the same rules run in the New form, the profile edit forms and the CSV import.

import type {
  Employee, EmployeeDocument, EmployeeStatus, EmploymentType, Gender, HrmsDb, Id, PayMode, TaxRegime, UanStatus,
} from '../../../lib/hrms/types';
import { buildBreakup, type Breakup } from '../../../lib/hrms/engine';
import { LWF_RULES } from '../../../lib/hrms/rules';
import {
  checkAadhaar, checkAccount, checkEmail, checkEsic, checkIfsc, checkMobile, checkPan, checkPincode, checkUan, completeness,
} from '../../../lib/hrms/validators';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { diffDays, fullName, inr } from '../../../lib/hrms/format';

// ───────────────────────────── labels and option lists ─────────────────────────────
export type Option<V extends string = string> = { value: V; label: string };

export const EMPLOYMENT_TYPES: Option<EmploymentType>[] = [
  { value: 'permanent', label: 'Permanent' }, { value: 'fixed_term', label: 'Fixed term' }, { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' }, { value: 'daily_wage', label: 'Daily wage' },
];
export const STATUS_OPTIONS: Option<EmployeeStatus>[] = [
  { value: 'onboarding', label: 'Onboarding' }, { value: 'active', label: 'Active' }, { value: 'on_notice', label: 'On notice' }, { value: 'exited', label: 'Exited' },
];
export const GENDERS: Option<Gender>[] = [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }];
export const MARITAL: Option[] = [{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'other', label: 'Other' }];
export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const UAN_STATUSES: Option<UanStatus>[] = [
  { value: 'none', label: 'No UAN yet' }, { value: 'generated', label: 'Generated' }, { value: 'activated', label: 'Activated' }, { value: 'aadhaar_seeded', label: 'Aadhaar-seeded' },
];
export const TAX_REGIMES: Option<TaxRegime>[] = [{ value: 'new', label: 'New regime' }, { value: 'old', label: 'Old regime' }];
export const PAY_MODES: Option<PayMode>[] = [{ value: 'bank', label: 'Bank transfer' }, { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }];
export const DOC_TYPES: Option<EmployeeDocument['type']>[] = [
  { value: 'offer_letter', label: 'Offer letter' }, { value: 'appointment_letter', label: 'Appointment letter' }, { value: 'id_proof', label: 'ID proof' },
  { value: 'address_proof', label: 'Address proof' }, { value: 'pan_card', label: 'PAN card' }, { value: 'aadhaar', label: 'Aadhaar (masked copy)' },
  { value: 'education', label: 'Education certificate' }, { value: 'experience', label: 'Experience letter' }, { value: 'bank_proof', label: 'Bank proof' },
  { value: 'relieving_letter', label: 'Relieving letter' }, { value: 'other', label: 'Other' },
];
export const labelOf = (opts: Option[], v?: string): string => opts.find((o) => o.value === v)?.label ?? (v ? humanize(v) : '—');
export const humanize = (s: string): string => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const TAB_KEYS = ['overview', 'personal', 'employment', 'statutory', 'documents', 'salary', 'leave', 'history'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

// ───────────────────────────── small helpers ─────────────────────────────
export const profileHref = (id: Id, tab?: TabKey): string => `/dashboard/hrms/employees/${id}${tab ? `?tab=${tab}` : ''}`;

export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** Accepts 2026-11-07, 07/11/2026, 7-11-2026 and returns ISO, or null. */
export function parseFlexDate(s: string): string | null {
  const t = s.trim();
  if (isRealDate(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isRealDate(iso) ? iso : null;
}
/** Adds whole months to an ISO date, clamping the day (31 Aug + 6 months = 28 Feb). */
export function addMonthsToDate(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
export function ageOn(dob: string, on: string): number {
  const [y1, m1, d1] = dob.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = on.split('-').map(Number) as [number, number, number];
  let a = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) a -= 1;
  return a;
}
export const normMobile = (v: string): string => v.replace(/[\s-]/g, '').replace(/^\+?91/, '');
export const digitsOnly = (v: string): string => v.replace(/\s+/g, '');
export const cleanUpper = (v: string): string => v.replace(/\s+/g, '').toUpperCase();

export function amountCheck(s: string, label: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
  const t = s.replace(/[₹,\s]/g, '');
  if (!t) return opts.required ? `${label} is required` : undefined;
  if (!/^\d+$/.test(t)) return `${label} must be a whole number of rupees`;
  if (Number(t) > (opts.max ?? 1_000_000_000)) return `${label} is too large`;
  return undefined;
}
export const toAmount = (s: string): number => Number(s.replace(/[₹,\s]/g, '')) || 0;
export const showAmount = (n?: number): string => (n ? String(n) : '');

/** Order-insensitive deep compare that treats undefined and empty string as the same "nothing". */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (v === '' || v === undefined || v === null) return undefined;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const o: Record<string, unknown> = {};
      Object.keys(v as object).sort().forEach((k) => { const n = norm((v as Record<string, unknown>)[k]); if (n !== undefined) o[k] = n; });
      return Object.keys(o).length ? o : undefined;
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// ───────────────────────────── lookups and derived facts ─────────────────────────────
export const hasLwf = (state?: string): boolean => !!state && LWF_RULES.some((r) => r.state === state);

export function breakupFor(db: HrmsDb, e: Employee, asOn: string = PREVIEW_TODAY): Breakup | null {
  const structure = db.structures.find((s) => s.id === e.structureId);
  if (!structure || !e.annualCtc) return null;
  return buildBreakup(structure, e.annualCtc, { asOn, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides });
}
export function statutorySummary(db: HrmsDb, e: Employee) {
  const breakup = breakupFor(db, e);
  const esiApplicable = breakup?.esiApplicable ?? false;
  return { breakup, esiApplicable, comp: completeness(e, esiApplicable) };
}

export function reportingChain(db: HrmsDb, e: Employee): Employee[] {
  const out: Employee[] = [];
  const seen = new Set<Id>([e.id]);
  let cur = e.reportingToId ? db.employees.find((x) => x.id === e.reportingToId) : undefined;
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = cur.reportingToId ? db.employees.find((x) => x.id === cur!.reportingToId) : undefined;
  }
  return out;
}
export const directReports = (db: HrmsDb, e: Employee): Employee[] => db.employees.filter((x) => x.reportingToId === e.id && x.status !== 'exited');
/** True when making `candidateId` the manager of `selfId` would put someone above themselves. */
export function wouldCreateLoop(db: HrmsDb, selfId: Id, candidateId: Id): boolean {
  const seen = new Set<Id>();
  let cur: Id | undefined = candidateId;
  while (cur && !seen.has(cur)) {
    if (cur === selfId) return true;
    seen.add(cur);
    cur = db.employees.find((x) => x.id === cur)?.reportingToId;
  }
  return false;
}

/** The tab that fixes each missing item reported by completeness(). */
export const MISSING_TAB: Record<string, TabKey> = {
  PAN: 'statutory', Aadhaar: 'statutory', UAN: 'statutory', 'UAN not Aadhaar-seeded': 'statutory', 'ESIC number': 'statutory',
  'Bank account': 'statutory', 'Mandatory documents': 'documents', 'Salary structure': 'salary',
};

export interface DateNote { tone: 'red' | 'warn' | 'ok' | 'neutral'; text: string }
/** "in 16 days" / "3 days ago" relative to the preview's today. */
export function relativeDays(date: string, today: string = PREVIEW_TODAY): string {
  const n = diffDays(today, date);
  if (n === 0) return 'today';
  if (n > 0) return n === 1 ? 'tomorrow' : `in ${n} days`;
  return n === -1 ? 'yesterday' : `${-n} days ago`;
}

// ───────────────────────────── the form draft ─────────────────────────────
// Everything is a string (or boolean) because that is what inputs hold. The validators and patch builders below
// turn a draft into the typed Employee fields.
export interface EmployeeDraft {
  firstName: string; lastName: string; email: string; mobile: string; gender: Gender | ''; dob: string;
  fatherName: string; maritalStatus: '' | 'single' | 'married' | 'other'; bloodGroup: string;
  addrLine1: string; addrLine2: string; addrCity: string; addrState: string; addrPincode: string;
  emName: string; emRelation: string; emMobile: string;

  entityId: string; locationId: string; departmentId: string; designationId: string; reportingToId: string;
  employmentType: EmploymentType; status: EmployeeStatus; joinDate: string; confirmationDate: string; lastWorkingDate: string;
  probationMonths: string; noticeDays: string; contractEndDate: string; shiftId: string; costCentre: string;

  pan: string; aadhaar: string; uan: string; uanStatus: UanStatus; pfMember: boolean; pfOnActualWage: boolean; esicIp: string;
  ptApplicable: boolean; lwfApplicable: boolean; taxRegime: TaxRegime; payMode: PayMode;
  bankHolder: string; bankAccount: string; bankIfsc: string; bankName: string; bankType: 'savings' | 'current';
  declSec80C: string; declSec80D: string; declNps: string; declHomeLoan: string; declRent: string; declLandlordPan: string; declOther: string;
  declStatus: Employee['declaration']['status'];

  structureId: string; annualCtc: string;
}

export function blankDraft(): EmployeeDraft {
  return {
    firstName: '', lastName: '', email: '', mobile: '', gender: '', dob: '', fatherName: '', maritalStatus: '', bloodGroup: '',
    addrLine1: '', addrLine2: '', addrCity: '', addrState: '', addrPincode: '', emName: '', emRelation: '', emMobile: '',
    entityId: '', locationId: '', departmentId: '', designationId: '', reportingToId: '', employmentType: 'permanent', status: 'active',
    joinDate: PREVIEW_TODAY, confirmationDate: '', lastWorkingDate: '', probationMonths: '6', noticeDays: '30', contractEndDate: '', shiftId: '', costCentre: '',
    pan: '', aadhaar: '', uan: '', uanStatus: 'none', pfMember: true, pfOnActualWage: false, esicIp: '', ptApplicable: true, lwfApplicable: false,
    taxRegime: 'new', payMode: 'bank', bankHolder: '', bankAccount: '', bankIfsc: '', bankName: '', bankType: 'savings',
    declSec80C: '', declSec80D: '', declNps: '', declHomeLoan: '', declRent: '', declLandlordPan: '', declOther: '', declStatus: 'not_submitted',
    structureId: '', annualCtc: '',
  };
}

/** Existing employee → draft. Aadhaar and the bank account number stay blank: blank means "keep what is on file". */
export function employeeToDraft(e: Employee): EmployeeDraft {
  const d = e.declaration;
  return {
    firstName: e.firstName, lastName: e.lastName, email: e.email, mobile: e.mobile, gender: e.gender, dob: e.dob,
    fatherName: e.fatherName ?? '', maritalStatus: e.maritalStatus ?? '', bloodGroup: e.bloodGroup ?? '',
    addrLine1: e.address.line1 ?? '', addrLine2: e.address.line2 ?? '', addrCity: e.address.city ?? '', addrState: e.address.state ?? '', addrPincode: e.address.pincode ?? '',
    emName: e.emergencyContact?.name ?? '', emRelation: e.emergencyContact?.relation ?? '', emMobile: e.emergencyContact?.mobile ?? '',
    entityId: e.entityId, locationId: e.locationId, departmentId: e.departmentId, designationId: e.designationId, reportingToId: e.reportingToId ?? '',
    employmentType: e.employmentType, status: e.status, joinDate: e.joinDate, confirmationDate: e.confirmationDate ?? '', lastWorkingDate: e.lastWorkingDate ?? '',
    probationMonths: String(e.probationMonths), noticeDays: String(e.noticeDays), contractEndDate: e.contractEndDate ?? '', shiftId: e.shiftId ?? '', costCentre: e.costCentre ?? '',
    pan: e.pan ?? '', aadhaar: '', uan: e.uan ?? '', uanStatus: e.uanStatus, pfMember: e.pfMember, pfOnActualWage: e.pfOnActualWage, esicIp: e.esicIp ?? '',
    ptApplicable: e.ptApplicable, lwfApplicable: e.lwfApplicable, taxRegime: e.taxRegime, payMode: e.payMode,
    bankHolder: e.bank?.accountHolder ?? '', bankAccount: '', bankIfsc: e.bank?.ifsc ?? '', bankName: e.bank?.bankName ?? '', bankType: e.bank?.accountType ?? 'savings',
    declSec80C: showAmount(d.sec80C), declSec80D: showAmount(d.sec80D), declNps: showAmount(d.nps80CCD1B), declHomeLoan: showAmount(d.homeLoanInterest),
    declRent: showAmount(d.rentPaidAnnual), declLandlordPan: d.landlordPan ?? '', declOther: showAmount(d.other), declStatus: d.status,
    structureId: e.structureId ?? '', annualCtc: showAmount(e.annualCtc),
  };
}

export type Errors = Partial<Record<keyof EmployeeDraft | string, string>>;
const put = (errs: Errors, key: string, msg: string | undefined) => { if (msg && !errs[key]) errs[key] = msg; };
const fromCheck = (c: { ok: boolean; message?: string }): string | undefined => (c.ok ? undefined : (c as { message: string }).message);

export function validatePersonal(d: EmployeeDraft, db: HrmsDb, selfId?: Id): Errors {
  const errs: Errors = {};
  if (!d.firstName.trim()) put(errs, 'firstName', 'First name is required');
  put(errs, 'email', fromCheck(checkEmail(d.email)));
  if (!errs.email) {
    const mail = d.email.trim().toLowerCase();
    if (db.employees.some((x) => x.id !== selfId && x.email.toLowerCase() === mail)) put(errs, 'email', 'Another employee already uses this email');
  }
  put(errs, 'mobile', fromCheck(checkMobile(d.mobile)));
  if (!d.gender) put(errs, 'gender', 'Choose a gender');
  if (!d.dob) put(errs, 'dob', 'Date of birth is required');
  else if (!isRealDate(d.dob)) put(errs, 'dob', 'Date of birth is not a valid date');
  else if (d.dob >= PREVIEW_TODAY) put(errs, 'dob', 'Date of birth must be in the past');
  else if (d.joinDate && isRealDate(d.joinDate) && d.dob >= d.joinDate) put(errs, 'dob', 'Date of birth must be before the join date');
  if (d.addrPincode.trim()) put(errs, 'addrPincode', fromCheck(checkPincode(d.addrPincode)));
  if (d.emName.trim() || d.emRelation.trim() || d.emMobile.trim()) {
    if (!d.emName.trim()) put(errs, 'emName', 'Contact name is required');
    put(errs, 'emMobile', fromCheck(checkMobile(d.emMobile)));
  }
  return errs;
}

export function validateEmployment(d: EmployeeDraft, db: HrmsDb, selfId?: Id): Errors {
  const errs: Errors = {};
  if (!d.locationId) put(errs, 'locationId', 'Choose a location');
  else if (!db.locations.some((l) => l.id === d.locationId)) put(errs, 'locationId', 'Unknown location');
  if (!d.departmentId) put(errs, 'departmentId', 'Choose a department');
  else if (!db.departments.some((x) => x.id === d.departmentId)) put(errs, 'departmentId', 'Unknown department');
  if (!d.designationId) put(errs, 'designationId', 'Choose a designation');
  else if (!db.designations.some((x) => x.id === d.designationId)) put(errs, 'designationId', 'Unknown designation');
  if (!EMPLOYMENT_TYPES.some((t) => t.value === d.employmentType)) put(errs, 'employmentType', 'Choose an employment type');
  if (!d.joinDate) put(errs, 'joinDate', 'Join date is required');
  else if (!isRealDate(d.joinDate)) put(errs, 'joinDate', 'Join date is not a valid date');
  const joinOk = isRealDate(d.joinDate);
  if (d.confirmationDate) {
    if (!isRealDate(d.confirmationDate)) put(errs, 'confirmationDate', 'Confirmation date is not a valid date');
    else if (joinOk && d.confirmationDate < d.joinDate) put(errs, 'confirmationDate', 'Confirmation cannot be before the join date');
  }
  if (!/^\d+$/.test(d.probationMonths.trim()) || Number(d.probationMonths) > 24) put(errs, 'probationMonths', 'Probation is 0 to 24 whole months');
  if (!/^\d+$/.test(d.noticeDays.trim()) || Number(d.noticeDays) > 365) put(errs, 'noticeDays', 'Notice period is 0 to 365 whole days');
  if (d.employmentType === 'fixed_term' || d.employmentType === 'contract') {
    if (!d.contractEndDate) put(errs, 'contractEndDate', 'Contract end date is required for this employment type');
  }
  if (d.contractEndDate) {
    if (!isRealDate(d.contractEndDate)) put(errs, 'contractEndDate', 'Contract end date is not a valid date');
    else if (joinOk && d.contractEndDate <= d.joinDate) put(errs, 'contractEndDate', 'Contract must end after the join date');
  }
  if ((d.status === 'on_notice' || d.status === 'exited') && !d.lastWorkingDate) put(errs, 'lastWorkingDate', 'Last working date is required for this status');
  if (d.lastWorkingDate) {
    if (!isRealDate(d.lastWorkingDate)) put(errs, 'lastWorkingDate', 'Last working date is not a valid date');
    else if (joinOk && d.lastWorkingDate < d.joinDate) put(errs, 'lastWorkingDate', 'Last working date cannot be before the join date');
  }
  if (d.reportingToId) {
    if (selfId && d.reportingToId === selfId) put(errs, 'reportingToId', 'An employee cannot report to themselves');
    else if (selfId && wouldCreateLoop(db, selfId, d.reportingToId)) put(errs, 'reportingToId', 'That would create a reporting loop');
    else if (!db.employees.some((x) => x.id === d.reportingToId)) put(errs, 'reportingToId', 'Unknown manager');
  }
  return errs;
}

export function validateStatutory(d: EmployeeDraft, existing?: { hasBank: boolean }): Errors {
  const errs: Errors = {};
  if (d.pan.trim()) put(errs, 'pan', fromCheck(checkPan(d.pan)));
  if (d.aadhaar.trim()) put(errs, 'aadhaar', fromCheck(checkAadhaar(d.aadhaar)));
  if (d.uan.trim()) put(errs, 'uan', fromCheck(checkUan(d.uan)));
  if (!d.uan.trim() && d.uanStatus !== 'none') put(errs, 'uan', 'UAN is required once the status is past "No UAN yet"');
  if (d.uan.trim() && d.uanStatus === 'none') put(errs, 'uanStatus', 'A UAN is entered, so set its status (Generated, Activated or Aadhaar-seeded)');
  if (d.esicIp.trim()) put(errs, 'esicIp', fromCheck(checkEsic(d.esicIp)));
  const anyBank = [d.bankHolder, d.bankAccount, d.bankIfsc, d.bankName].some((v) => v.trim());
  if (anyBank) {
    if (!d.bankHolder.trim()) put(errs, 'bankHolder', 'Account holder name is required');
    put(errs, 'bankIfsc', fromCheck(checkIfsc(d.bankIfsc)));
    if (!d.bankName.trim()) put(errs, 'bankName', 'Bank name is required');
    if (d.bankAccount.trim() || !existing?.hasBank) put(errs, 'bankAccount', fromCheck(checkAccount(d.bankAccount)));
  }
  put(errs, 'declSec80C', amountCheck(d.declSec80C, 'Section 80C'));
  put(errs, 'declSec80D', amountCheck(d.declSec80D, 'Section 80D'));
  put(errs, 'declNps', amountCheck(d.declNps, 'NPS 80CCD(1B)'));
  put(errs, 'declHomeLoan', amountCheck(d.declHomeLoan, 'Home-loan interest'));
  put(errs, 'declRent', amountCheck(d.declRent, 'Rent paid'));
  put(errs, 'declOther', amountCheck(d.declOther, 'Other deductions'));
  if (d.declLandlordPan.trim()) put(errs, 'declLandlordPan', fromCheck(checkPan(d.declLandlordPan)));
  else if (d.taxRegime === 'old' && toAmount(d.declRent) > 100000) put(errs, 'declLandlordPan', 'Landlord PAN is needed when yearly rent is above ₹1,00,000');
  return errs;
}

export function validatePay(d: EmployeeDraft): Errors {
  const errs: Errors = {};
  put(errs, 'annualCtc', amountCheck(d.annualCtc, 'Annual CTC', { max: 500_000_000 }));
  if (!errs.annualCtc) {
    if (toAmount(d.annualCtc) > 0 && !d.structureId) put(errs, 'structureId', 'Choose a salary structure for this CTC');
    if (d.structureId && toAmount(d.annualCtc) <= 0) put(errs, 'annualCtc', 'Enter the annual CTC for this structure');
  }
  return errs;
}

export const validateAll = (d: EmployeeDraft, db: HrmsDb): Errors => ({ ...validatePay(d), ...validateStatutory(d), ...validateEmployment(d, db), ...validatePersonal(d, db) });

// ───────────────────────────── patches (draft → Employee fields) ─────────────────────────────
const opt = (s: string): string | undefined => (s.trim() ? s.trim() : undefined);

export function personalPatch(d: EmployeeDraft): Partial<Employee> {
  const hasEm = !!(d.emName.trim() || d.emRelation.trim() || d.emMobile.trim());
  return {
    firstName: d.firstName.trim(), lastName: d.lastName.trim(), email: d.email.trim(), mobile: normMobile(d.mobile),
    gender: d.gender as Gender, dob: d.dob, fatherName: opt(d.fatherName), maritalStatus: (d.maritalStatus || undefined) as Employee['maritalStatus'],
    bloodGroup: opt(d.bloodGroup),
    address: { line1: opt(d.addrLine1), line2: opt(d.addrLine2), city: opt(d.addrCity), state: opt(d.addrState), pincode: opt(d.addrPincode) },
    emergencyContact: hasEm ? { name: d.emName.trim(), relation: d.emRelation.trim(), mobile: normMobile(d.emMobile) } : undefined,
  };
}

export function employmentPatch(d: EmployeeDraft, db: HrmsDb): Partial<Employee> {
  const loc = db.locations.find((l) => l.id === d.locationId);
  return {
    entityId: loc?.entityId ?? d.entityId, locationId: d.locationId, departmentId: d.departmentId, designationId: d.designationId,
    reportingToId: opt(d.reportingToId), employmentType: d.employmentType, status: d.status, joinDate: d.joinDate,
    confirmationDate: opt(d.confirmationDate), probationMonths: Number(d.probationMonths), noticeDays: Number(d.noticeDays),
    lastWorkingDate: opt(d.lastWorkingDate), shiftId: opt(d.shiftId), costCentre: opt(d.costCentre),
    contractEndDate: d.employmentType === 'fixed_term' || d.employmentType === 'contract' || d.contractEndDate ? opt(d.contractEndDate) : undefined,
  };
}

export function declarationFrom(d: EmployeeDraft, prev?: Employee['declaration']): Employee['declaration'] {
  const submittedOn = d.declStatus === 'not_submitted' ? undefined : prev?.submittedOn ?? PREVIEW_TODAY;
  return {
    sec80C: toAmount(d.declSec80C), sec80D: toAmount(d.declSec80D), nps80CCD1B: toAmount(d.declNps), homeLoanInterest: toAmount(d.declHomeLoan),
    rentPaidAnnual: toAmount(d.declRent), landlordPan: d.declLandlordPan.trim() ? cleanUpper(d.declLandlordPan) : undefined, other: toAmount(d.declOther),
    submittedOn, status: d.declStatus,
  };
}

/** Statutory and bank patch for an existing employee. A blank Aadhaar or account number keeps what is on file. */
export function statutoryPatch(d: EmployeeDraft, e: Employee): Partial<Employee> {
  const anyBank = [d.bankHolder, d.bankAccount, d.bankIfsc, d.bankName].some((v) => v.trim());
  const patch: Partial<Employee> = {
    pan: d.pan.trim() ? cleanUpper(d.pan) : undefined, uan: d.uan.trim() ? digitsOnly(d.uan) : undefined, uanStatus: d.uanStatus,
    pfMember: d.pfMember, pfOnActualWage: d.pfMember ? d.pfOnActualWage : false, esicIp: d.esicIp.trim() ? digitsOnly(d.esicIp) : undefined,
    ptApplicable: d.ptApplicable, lwfApplicable: d.lwfApplicable, taxRegime: d.taxRegime, payMode: d.payMode,
    declaration: declarationFrom(d, e.declaration),
    bank: anyBank ? {
      accountHolder: d.bankHolder.trim(), accountNumber: d.bankAccount.trim() ? digitsOnly(d.bankAccount) : e.bank?.accountNumber ?? '',
      ifsc: cleanUpper(d.bankIfsc), bankName: d.bankName.trim(), accountType: d.bankType,
    } : undefined,
  };
  if (d.pfMember && !e.pfMember) patch.pfJoinDate = e.pfJoinDate ?? e.joinDate;
  if (d.aadhaar.trim()) { patch.aadhaarLast4 = digitsOnly(d.aadhaar).slice(-4); patch.aadhaarVerified = false; }
  return patch;
}

export type NewEmployeeInput = Omit<Employee, 'id' | 'code' | 'history' | 'documents'>;

/** The full record for a new hire. Status is 'active' when the join date is on or before the preview's today, else 'onboarding'. */
export function draftToInput(d: EmployeeDraft, db: HrmsDb): NewEmployeeInput {
  const loc = db.locations.find((l) => l.id === d.locationId);
  const last4 = d.aadhaar.trim() ? digitsOnly(d.aadhaar).slice(-4) : undefined;
  const anyBank = [d.bankHolder, d.bankAccount, d.bankIfsc, d.bankName].some((v) => v.trim());
  const ctc = toAmount(d.annualCtc);
  return {
    ...(personalPatch(d) as Pick<Employee, 'firstName' | 'lastName' | 'email' | 'mobile' | 'gender' | 'dob' | 'address'>),
    fatherName: opt(d.fatherName), maritalStatus: (d.maritalStatus || undefined) as Employee['maritalStatus'], bloodGroup: opt(d.bloodGroup),
    emergencyContact: personalPatch(d).emergencyContact,
    entityId: loc?.entityId ?? d.entityId, locationId: d.locationId, departmentId: d.departmentId, designationId: d.designationId, reportingToId: opt(d.reportingToId),
    employmentType: d.employmentType, status: d.joinDate <= PREVIEW_TODAY ? 'active' : 'onboarding', joinDate: d.joinDate,
    probationMonths: Number(d.probationMonths) || 0, noticeDays: Number(d.noticeDays) || 0, shiftId: opt(d.shiftId), costCentre: opt(d.costCentre),
    contractEndDate: opt(d.contractEndDate),
    pan: d.pan.trim() ? cleanUpper(d.pan) : undefined, aadhaarLast4: last4, aadhaarVerified: last4 ? false : undefined,
    uan: d.uan.trim() ? digitsOnly(d.uan) : undefined, uanStatus: d.uanStatus, pfMember: d.pfMember, pfOnActualWage: d.pfMember ? d.pfOnActualWage : false,
    pfJoinDate: d.pfMember ? d.joinDate : undefined, esicIp: d.esicIp.trim() ? digitsOnly(d.esicIp) : undefined,
    ptApplicable: d.ptApplicable, lwfApplicable: d.lwfApplicable, taxRegime: d.taxRegime, declaration: declarationFrom(d),
    bank: anyBank ? { accountHolder: d.bankHolder.trim(), accountNumber: digitsOnly(d.bankAccount), ifsc: cleanUpper(d.bankIfsc), bankName: d.bankName.trim(), accountType: d.bankType } : undefined,
    payMode: d.payMode, structureId: d.structureId || undefined, annualCtc: ctc > 0 ? ctc : undefined,
  };
}

// ───────────────────────────── change-log display ─────────────────────────────
// updateEmployee() logs raw ids and enum codes ("dep_ops", "on_notice", "1200000"), so resolve them for people.
export function formatHistoryValue(db: HrmsDb, field: string, v?: string): string {
  if (v == null || v === '') return '—';
  const byId = (list: { id: string; name: string }[]) => list.find((x) => x.id === v)?.name ?? v;
  switch (field) {
    case 'Department': return byId(db.departments);
    case 'Designation': return byId(db.designations);
    case 'Location': return byId(db.locations);
    case 'Legal entity': return byId(db.entities);
    case 'Salary structure': return byId(db.structures);
    case 'Shift': return byId(db.shifts);
    case 'Reports to': { const m = db.employees.find((x) => x.id === v); return m ? fullName(m) : v; }
    case 'Annual CTC': return /^\d+$/.test(v) ? inr(Number(v)) : v;
    default: return /^[a-z]+(_[a-z]+)*$/.test(v) ? humanize(v) : v;
  }
}

// ───────────────────────────── CSV ─────────────────────────────
/** RFC 4180 style parser: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): { rows: string[][]; unterminated: boolean } {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let touched = false; // the current field has content or was quoted
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"' && field === '' && !touched) { inQuotes = true; touched = true; }
    else if (ch === ',') { row.push(field); field = ''; touched = false; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; touched = false;
    } else { field += ch; touched = true; }
  }
  const unterminated = inQuotes;
  if (field !== '' || touched || row.length) { row.push(field); rows.push(row); }
  return { rows: rows.filter((r) => !(r.length === 1 && r[0]!.trim() === '')), unterminated };
}

export type ImportKey =
  | 'firstName' | 'lastName' | 'email' | 'mobile' | 'gender' | 'dob' | 'joinDate' | 'employmentType' | 'department' | 'designation' | 'location'
  | 'pan' | 'uan' | 'aadhaar' | 'bankAccount' | 'ifsc' | 'bankName' | 'annualCtc' | 'structure';
export interface ImportField { key: ImportKey; label: string; required: boolean; aliases: string[]; example: (db: HrmsDb) => string }

export const IMPORT_FIELDS: ImportField[] = [
  { key: 'firstName', label: 'First name', required: true, aliases: ['first name', 'firstname', 'given name'], example: () => 'Aarav' },
  { key: 'lastName', label: 'Last name', required: false, aliases: ['last name', 'lastname', 'surname', 'family name'], example: () => 'Mehta' },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'email id', 'work email', 'e-mail'], example: () => 'aarav.mehta@example.com' },
  { key: 'mobile', label: 'Mobile', required: true, aliases: ['mobile', 'mobile number', 'phone', 'contact number'], example: () => '9876543210' },
  { key: 'gender', label: 'Gender', required: true, aliases: ['gender', 'sex'], example: () => 'male' },
  { key: 'dob', label: 'Date of birth', required: true, aliases: ['date of birth', 'dob', 'birth date', 'birthdate'], example: () => '1996-04-18' },
  { key: 'joinDate', label: 'Join date', required: true, aliases: ['join date', 'date of joining', 'doj', 'joining date', 'start date'], example: () => '2026-11-16' },
  { key: 'employmentType', label: 'Employment type', required: false, aliases: ['employment type', 'type', 'emp type'], example: () => 'permanent' },
  { key: 'department', label: 'Department', required: true, aliases: ['department', 'dept'], example: (db) => db.departments[0]?.name ?? '' },
  { key: 'designation', label: 'Designation', required: true, aliases: ['designation', 'title', 'job title', 'role'], example: (db) => db.designations[0]?.name ?? '' },
  { key: 'location', label: 'Location', required: true, aliases: ['location', 'office', 'branch', 'work location'], example: (db) => db.locations[0]?.name ?? '' },
  { key: 'pan', label: 'PAN', required: false, aliases: ['pan', 'pan number', 'pan no'], example: () => 'ABCPM1234F' },
  { key: 'uan', label: 'UAN', required: false, aliases: ['uan', 'uan number', 'pf uan'], example: () => '' },
  { key: 'aadhaar', label: 'Aadhaar (only the last four are kept)', required: false, aliases: ['aadhaar', 'aadhar', 'aadhaar number', 'aadhaar no'], example: () => '' },
  { key: 'bankAccount', label: 'Bank account number', required: false, aliases: ['bank account', 'account number', 'account no', 'bank account number', 'a/c no'], example: () => '' },
  { key: 'ifsc', label: 'IFSC', required: false, aliases: ['ifsc', 'ifsc code'], example: () => '' },
  { key: 'bankName', label: 'Bank name', required: false, aliases: ['bank name', 'bank'], example: () => '' },
  { key: 'annualCtc', label: 'Annual CTC', required: false, aliases: ['annual ctc', 'ctc', 'annual salary'], example: () => '' },
  { key: 'structure', label: 'Salary structure', required: false, aliases: ['salary structure', 'structure', 'pay structure'], example: () => '' },
];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Guess which column is which field from the header text. Each field is used at most once. */
export function autoMap(headers: string[]): (ImportKey | '')[] {
  const used = new Set<ImportKey>();
  return headers.map((h) => {
    const n = norm(h);
    if (!n) return '';
    const f = IMPORT_FIELDS.find((x) => !used.has(x.key) && (norm(x.key) === n || norm(x.label) === n || x.aliases.some((a) => norm(a) === n)));
    if (!f) return '';
    used.add(f.key);
    return f.key;
  });
}

export function templateRows(db: HrmsDb): { header: string[]; rows: string[][] } {
  const header = IMPORT_FIELDS.map((f) => f.label.replace(/ \(.*\)$/, ''));
  const row = IMPORT_FIELDS.map((f) => f.example(db));
  const row2 = row.slice();
  const set = (k: ImportKey, v: string) => { row2[IMPORT_FIELDS.findIndex((f) => f.key === k)] = v; };
  set('firstName', 'Diya'); set('lastName', 'Kapoor'); set('email', 'diya.kapoor@example.com'); set('mobile', '9123456780'); set('gender', 'female'); set('dob', '1999-01-25');
  set('joinDate', '2026-12-01'); set('employmentType', 'contract');
  return { header, rows: [row, row2] };
}

export interface ImportRowResult { line: number; raw: Partial<Record<ImportKey, string>>; errors: string[]; draft?: EmployeeDraft }

const GENDER_WORDS: Record<string, Gender> = { male: 'male', m: 'male', female: 'female', f: 'female', other: 'other', o: 'other', others: 'other' };
const TYPE_WORDS: Record<string, EmploymentType> = { permanent: 'permanent', fixedterm: 'fixed_term', fixed: 'fixed_term', contract: 'contract', contractual: 'contract', intern: 'intern', internship: 'intern', dailywage: 'daily_wage', daily: 'daily_wage' };

/** Validate every data row with the same rules as the New form. `dataRows` excludes the header row, which is line 1. */
export function validateImport(db: HrmsDb, dataRows: string[][], mapping: (ImportKey | '')[]): ImportRowResult[] {
  const seenEmails = new Map<string, number>();
  const out: ImportRowResult[] = [];
  dataRows.forEach((cells, idx) => {
    if (cells.every((c) => !c.trim())) return;
    const line = idx + 2;
    const raw: Partial<Record<ImportKey, string>> = {};
    mapping.forEach((k, ci) => { if (k) raw[k] = (cells[ci] ?? '').trim(); });
    const g = (k: ImportKey) => raw[k] ?? '';
    const errors: string[] = [];

    const d = blankDraft();
    d.firstName = g('firstName'); d.lastName = g('lastName'); d.email = g('email'); d.mobile = g('mobile');
    const gw = GENDER_WORDS[g('gender').toLowerCase()];
    d.gender = gw ?? (g('gender') as Gender);
    if (g('gender') && !gw) errors.push(`Gender "${g('gender')}" is not recognised (use male, female or other)`);
    d.dob = g('dob') ? parseFlexDate(g('dob')) ?? g('dob') : '';
    d.joinDate = g('joinDate') ? parseFlexDate(g('joinDate')) ?? g('joinDate') : '';
    if (g('employmentType')) {
      const tw = TYPE_WORDS[norm(g('employmentType'))];
      if (tw) d.employmentType = tw; else errors.push(`Employment type "${g('employmentType')}" is not recognised (permanent, fixed term, contract, intern, daily wage)`);
    }
    const byName = <T extends { id: string; name: string }>(list: T[], name: string) => list.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
    const dep = byName(db.departments, g('department'));
    const des = byName(db.designations, g('designation'));
    const loc = byName(db.locations, g('location'));
    if (g('department') && !dep) errors.push(`Unknown department "${g('department')}"`);
    if (g('designation') && !des) errors.push(`Unknown designation "${g('designation')}"`);
    if (g('location') && !loc) errors.push(`Unknown location "${g('location')}"`);
    d.departmentId = dep?.id ?? ''; d.designationId = des?.id ?? ''; d.locationId = loc?.id ?? '';
    d.entityId = loc?.entityId ?? '';
    d.lwfApplicable = hasLwf(loc?.state);
    d.pfMember = d.employmentType !== 'intern';
    d.pan = g('pan'); d.uan = g('uan'); d.uanStatus = g('uan') ? 'generated' : 'none'; d.aadhaar = g('aadhaar');
    d.bankAccount = g('bankAccount'); d.bankIfsc = g('ifsc'); d.bankName = g('bankName') || (g('ifsc') ? cleanUpper(g('ifsc')).slice(0, 4) : '');
    d.bankHolder = (g('bankAccount') || g('ifsc')) ? `${d.firstName} ${d.lastName}`.trim() : '';
    d.annualCtc = g('annualCtc');
    if (g('structure')) {
      const st = byName(db.structures, g('structure'));
      if (st) d.structureId = st.id; else errors.push(`Unknown salary structure "${g('structure')}"`);
    }
    if (d.contractEndDate === '' && (d.employmentType === 'fixed_term' || d.employmentType === 'contract')) {
      // The template has no contract-end column, so give fixed-term and contract hires a default the HR user can edit later.
      d.contractEndDate = isRealDate(d.joinDate) ? addMonthsToDate(d.joinDate, 12) : '';
    }

    const v = validateAll(d, db);
    const order: string[] = ['firstName', 'email', 'mobile', 'gender', 'dob', 'joinDate', 'departmentId', 'designationId', 'locationId', 'employmentType', 'pan', 'uan', 'aadhaar', 'bankAccount', 'bankIfsc', 'bankHolder', 'bankName', 'annualCtc', 'structureId', 'contractEndDate', 'probationMonths', 'noticeDays', 'uanStatus'];
    const known = new Set(errors.map((m) => m.toLowerCase()));
    for (const k of order) {
      const msg = v[k];
      if (!msg) continue;
      // Skip "Choose a department" style messages when we already said the name is unknown.
      if ((k === 'departmentId' && g('department')) || (k === 'designationId' && g('designation')) || (k === 'locationId' && g('location'))) continue;
      if (k === 'gender' && g('gender')) continue;
      if (!known.has(msg.toLowerCase())) errors.push(msg);
    }
    const mail = d.email.trim().toLowerCase();
    if (mail && !v.email) {
      const first = seenEmails.get(mail);
      if (first) errors.push(`Email is repeated in this file (first used on line ${first})`);
      else seenEmails.set(mail, line);
    }
    out.push({ line, raw, errors, draft: errors.length ? undefined : d });
  });
  return out;
}

export const nameOf = (e: Pick<Employee, 'firstName' | 'lastName'>): string => fullName(e);
