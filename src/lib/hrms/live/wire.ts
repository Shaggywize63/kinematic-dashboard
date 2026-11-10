// The one place where the dashboard's own shapes (camelCase, optional fields) meet the HRMS API's (snake_case top-level
// keys, null for "nothing"). Nested objects (address, declaration, bank, registrations ...) pass through in the dashboard's
// camelCase shape, as the API contract says. Nothing else in the app should know the wire names.
//
// Sensitive values (PAN, bank account number) arrive masked and are write-only: a mask is never sent back, and a
// sensitive field is sent only when it holds a new full value.

import type {
  Address, BankDetails, ChangeLogEntry, Department, Designation, Employee, EmployeeDocument, LegalEntity, Location, Registration, TaxDeclaration,
} from '../types';
import { looksMaskedAccount, looksMaskedPan } from './masking';

export type Row = Record<string, unknown>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ───────────────────────────── small helpers ─────────────────────────────
const isNil = (v: unknown): v is null | undefined => v === null || v === undefined;
const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown): number | undefined => {
  if (isNil(v) || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const arr = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** A copy of a flat object without null, undefined and empty-string values (the dashboard uses `undefined` for "none"). */
function clean<T extends object>(v: unknown): T {
  const out: Row = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (!isNil(x) && x !== '') out[k] = x;
  return out as T;
}
/** Same, but drops only undefined (what JSON would drop anyway), keeping null so a clear is explicit. */
const dropUndefined = <T extends object>(v: T): T => {
  const out: Row = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = x;
  return out as T;
};

/** Stable JSON for comparing two values: keys sorted, null / undefined / '' all mean "nothing" and are dropped. */
export function norm(v: unknown): unknown {
  if (isNil(v) || v === '') return undefined;
  if (Array.isArray(v)) return v.map((x) => norm(x) ?? null);
  if (isObj(v)) {
    const o: Row = {};
    for (const k of Object.keys(v).sort()) { const n = norm(v[k]); if (n !== undefined) o[k] = n; }
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

// ───────────────────────────── field specs ─────────────────────────────
interface Spec {
  local: string; wire: string;
  /** A cleared value is sent as null (the column allows it). */
  nullable: boolean;
  /** An empty string is a real value for this column (a single-name person has an empty last name), sent on update. */
  emptyOk?: boolean;
  out?: (v: unknown) => unknown;
}

/** Blank text means "none": the API stores null for it. */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const objectOut = (v: unknown) => (isObj(v) ? dropUndefined(v) : v);

/**
 * Without `prev` this is a create body: every field that holds something. With `prev` it is a partial update: only the
 * fields that changed, where a field that became empty is sent as null (when its column allows it) so the server clears it.
 * `keys` lists the dashboard-side names of the fields included (rollback needs them).
 */
function bodyFor(specs: Spec[], next: Row, prev?: Row): { body: Row; keys: string[] } {
  const body: Row = {};
  const keys: string[] = [];
  for (const s of specs) {
    const after = next[s.local];
    if (prev && same(prev[s.local], after)) continue;
    let value: unknown = s.out ? s.out(after) : after;
    if (value === '' && s.emptyOk && prev) { /* send the empty string */ }
    else if (isNil(value) || value === '') {
      if (!prev || !s.nullable) continue;
      value = null;
    }
    keys.push(s.local);
    body[s.wire] = value;
  }
  return { body, keys };
}

// ───────────────────────────── legal entities ─────────────────────────────
const regOut = (v: unknown) => (Array.isArray(v) ? v.map((r) => dropUndefined(r as Row)) : v);
const signatoryOut = (v: unknown) => (isObj(v) && (str(v.name) || str(v.designation)) ? { name: str(v.name) ?? '', designation: str(v.designation) ?? '' } : null);

const ENTITY_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'pan', wire: 'pan', nullable: true, out: blankToNull },
  { local: 'tan', wire: 'tan', nullable: true, out: blankToNull },
  { local: 'cin', wire: 'cin', nullable: true, out: blankToNull },
  { local: 'gstin', wire: 'gstin', nullable: true, out: blankToNull },
  { local: 'address', wire: 'address', nullable: false, out: objectOut },
  { local: 'registrations', wire: 'registrations', nullable: false, out: regOut },
  { local: 'signatory', wire: 'signatory', nullable: true, out: signatoryOut },
];

function registrationFromWire(r: Row): Registration {
  return { ...clean<Registration>(r), id: String(r.id ?? ''), type: r.type as Registration['type'], number: String(r.number ?? '') };
}
export function entityFromWire(r: Row): LegalEntity {
  const sig = isObj(r.signatory) ? r.signatory : null;
  return {
    id: String(r.id), name: String(r.name ?? ''), pan: str(r.pan) ?? '', tan: str(r.tan) ?? '', cin: str(r.cin), gstin: str(r.gstin),
    address: clean<Address>(r.address), registrations: arr(r.registrations).map(registrationFromWire),
    signatory: sig && (str(sig.name) || str(sig.designation)) ? { name: str(sig.name) ?? '', designation: str(sig.designation) ?? '' } : undefined,
  };
}
export const entityCreateBody = (e: LegalEntity): Row => ({ id: e.id, ...bodyFor(ENTITY_SPECS, e as unknown as Row).body });
export const entityPatch = (prev: LegalEntity, next: LegalEntity) => bodyFor(ENTITY_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── locations, departments, designations ─────────────────────────────
const LOCATION_SPECS: Spec[] = [
  { local: 'entityId', wire: 'entity_id', nullable: false },
  { local: 'name', wire: 'name', nullable: false },
  { local: 'state', wire: 'state', nullable: false },
  { local: 'city', wire: 'city', nullable: false },
  { local: 'address', wire: 'address', nullable: true, out: blankToNull },
  { local: 'metro', wire: 'metro', nullable: false },
  { local: 'holidayListId', wire: 'holiday_list_id', nullable: true, out: blankToNull },
];
export function locationFromWire(r: Row): Location {
  return {
    id: String(r.id), name: String(r.name ?? ''), entityId: String(r.entity_id ?? ''), state: String(r.state ?? ''), city: String(r.city ?? ''),
    address: str(r.address), metro: bool(r.metro), holidayListId: str(r.holiday_list_id),
  };
}
export const locationCreateBody = (l: Location): Row => ({ id: l.id, ...bodyFor(LOCATION_SPECS, l as unknown as Row).body });
export const locationPatch = (prev: Location, next: Location) => bodyFor(LOCATION_SPECS, next as unknown as Row, prev as unknown as Row);

const DEPARTMENT_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'headId', wire: 'head_id', nullable: true, out: blankToNull },
];
export const departmentFromWire = (r: Row): Department => ({ id: String(r.id), name: String(r.name ?? ''), headId: str(r.head_id) });
export const departmentCreateBody = (d: Department): Row => ({ id: d.id, ...bodyFor(DEPARTMENT_SPECS, d as unknown as Row).body });
export const departmentPatch = (prev: Department, next: Department) => bodyFor(DEPARTMENT_SPECS, next as unknown as Row, prev as unknown as Row);

const DESIGNATION_SPECS: Spec[] = [
  { local: 'name', wire: 'name', nullable: false },
  { local: 'grade', wire: 'grade', nullable: true, out: blankToNull },
];
export const designationFromWire = (r: Row): Designation => ({ id: String(r.id), name: String(r.name ?? ''), grade: str(r.grade) });
export const designationCreateBody = (d: Designation): Row => ({ id: d.id, ...bodyFor(DESIGNATION_SPECS, d as unknown as Row).body });
export const designationPatch = (prev: Designation, next: Designation) => bodyFor(DESIGNATION_SPECS, next as unknown as Row, prev as unknown as Row);

// ───────────────────────────── documents and change log ─────────────────────────────
const DOC_SPECS: Spec[] = [
  { local: 'type', wire: 'type', nullable: false },
  { local: 'name', wire: 'name', nullable: false },
  { local: 'uploadedOn', wire: 'uploaded_on', nullable: false },
  { local: 'status', wire: 'status', nullable: false },
  { local: 'mandatory', wire: 'mandatory', nullable: false, out: (v) => !!v },
  { local: 'fileName', wire: 'file_name', nullable: true, out: blankToNull },
];
export function documentFromWire(r: Row): EmployeeDocument {
  return {
    id: String(r.id), type: r.type as EmployeeDocument['type'], name: String(r.name ?? ''), uploadedOn: str(r.uploaded_on) ?? '',
    status: (r.status as EmployeeDocument['status']) ?? 'pending', mandatory: bool(r.mandatory), fileName: str(r.file_name),
  };
}
/** The body to add a document. The id is sent only when it is a UUID (the API refuses any other spelling). */
export const documentCreateBody = (d: EmployeeDocument): Row => ({ ...(UUID_RE.test(d.id) ? { id: d.id } : {}), ...bodyFor(DOC_SPECS, d as unknown as Row).body });
export const documentPatch = (prev: EmployeeDocument, next: EmployeeDocument) => bodyFor(DOC_SPECS, next as unknown as Row, prev as unknown as Row);

export const historyFromWire = (r: Row): ChangeLogEntry => ({
  id: String(r.id), at: String(r.at ?? ''), by: str(r.by_name) ?? 'Unknown', field: String(r.field ?? ''), from: str(r.from_value), to: str(r.to_value),
});

// ───────────────────────────── employees ─────────────────────────────
const objOut = (v: unknown) => (isObj(v) ? dropUndefined(v) : v);
const emergencyOut = (v: unknown) => (isObj(v) && (str(v.name) || str(v.relation) || str(v.mobile)) ? dropUndefined(v) : null);

/** Everything that is a plain column. PAN and bank are handled separately below because they are write-only. */
const EMPLOYEE_SPECS: Spec[] = [
  { local: 'firstName', wire: 'first_name', nullable: false },
  { local: 'lastName', wire: 'last_name', nullable: false, emptyOk: true, out: (v) => (typeof v === 'string' ? v : '') },
  { local: 'email', wire: 'email', nullable: false },
  { local: 'mobile', wire: 'mobile', nullable: false },
  { local: 'gender', wire: 'gender', nullable: false },
  { local: 'dob', wire: 'dob', nullable: false },
  { local: 'fatherName', wire: 'father_name', nullable: true, out: blankToNull },
  { local: 'maritalStatus', wire: 'marital_status', nullable: true, out: blankToNull },
  { local: 'bloodGroup', wire: 'blood_group', nullable: true, out: blankToNull },
  { local: 'address', wire: 'address', nullable: false, out: objOut },
  { local: 'emergencyContact', wire: 'emergency_contact', nullable: true, out: emergencyOut },
  { local: 'entityId', wire: 'entity_id', nullable: false },
  { local: 'locationId', wire: 'location_id', nullable: false },
  { local: 'departmentId', wire: 'department_id', nullable: false },
  { local: 'designationId', wire: 'designation_id', nullable: false },
  { local: 'reportingToId', wire: 'reporting_to_id', nullable: true, out: blankToNull },
  { local: 'employmentType', wire: 'employment_type', nullable: false },
  { local: 'status', wire: 'status', nullable: false },
  { local: 'joinDate', wire: 'join_date', nullable: false },
  { local: 'confirmationDate', wire: 'confirmation_date', nullable: true, out: blankToNull },
  { local: 'probationMonths', wire: 'probation_months', nullable: false },
  { local: 'noticeDays', wire: 'notice_days', nullable: false },
  { local: 'lastWorkingDate', wire: 'last_working_date', nullable: true, out: blankToNull },
  { local: 'shiftId', wire: 'shift_id', nullable: true, out: blankToNull },
  { local: 'costCentre', wire: 'cost_centre', nullable: true, out: blankToNull },
  { local: 'contractEndDate', wire: 'contract_end_date', nullable: true, out: blankToNull },
  { local: 'aadhaarLast4', wire: 'aadhaar_last4', nullable: true, out: blankToNull },
  { local: 'aadhaarVerified', wire: 'aadhaar_verified', nullable: false },
  { local: 'uan', wire: 'uan', nullable: true, out: blankToNull },
  { local: 'uanStatus', wire: 'uan_status', nullable: false },
  { local: 'pfMember', wire: 'pf_member', nullable: false },
  { local: 'pfOnActualWage', wire: 'pf_on_actual_wage', nullable: false },
  { local: 'pfJoinDate', wire: 'pf_join_date', nullable: true, out: blankToNull },
  { local: 'esicIp', wire: 'esic_ip', nullable: true, out: blankToNull },
  { local: 'ptApplicable', wire: 'pt_applicable', nullable: false },
  { local: 'lwfApplicable', wire: 'lwf_applicable', nullable: false },
  { local: 'taxRegime', wire: 'tax_regime', nullable: false },
  { local: 'declaration', wire: 'declaration', nullable: false, out: objOut },
  { local: 'payMode', wire: 'pay_mode', nullable: false },
  { local: 'structureId', wire: 'structure_id', nullable: true, out: blankToNull },
  { local: 'annualCtc', wire: 'annual_ctc', nullable: true },
  { local: 'structureOverrides', wire: 'structure_overrides', nullable: true, out: (v) => (isObj(v) && Object.keys(v).length ? v : null) },
];

/** The local keys that map to plain columns (used by the diff and by rollback). */
export const EMPLOYEE_KEYS: string[] = EMPLOYEE_SPECS.map((s) => s.local);

function bankFromWire(v: unknown): BankDetails | undefined {
  if (!isObj(v)) return undefined;
  return {
    accountHolder: String(v.accountHolder ?? ''), accountNumber: String(v.accountNumber ?? ''), ifsc: String(v.ifsc ?? ''), bankName: String(v.bankName ?? ''),
    accountType: v.accountType === 'current' ? 'current' : 'savings',
  };
}

function declarationFromWire(v: unknown): TaxDeclaration {
  const d = clean<Row>(v);
  const n = (k: string) => num(d[k]) ?? 0;
  return {
    sec80C: n('sec80C'), sec80D: n('sec80D'), nps80CCD1B: n('nps80CCD1B'), homeLoanInterest: n('homeLoanInterest'), rentPaidAnnual: n('rentPaidAnnual'), other: n('other'),
    landlordPan: str(d.landlordPan), submittedOn: str(d.submittedOn),
    status: d.status === 'submitted' || d.status === 'verified' ? d.status : 'not_submitted',
  };
}

function overridesFromWire(v: unknown): Record<string, number> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) { const n = num(x); if (n !== undefined) out[k] = n; }
  return Object.keys(out).length ? out : undefined;
}

export function employeeFromWire(r: Row): Employee {
  const ec = isObj(r.emergency_contact) ? r.emergency_contact : null;
  return {
    id: String(r.id), code: String(r.code ?? ''), firstName: String(r.first_name ?? ''), lastName: String(r.last_name ?? ''),
    email: String(r.email ?? ''), mobile: String(r.mobile ?? ''), gender: r.gender as Employee['gender'], dob: str(r.dob) ?? '',
    fatherName: str(r.father_name), maritalStatus: str(r.marital_status) as Employee['maritalStatus'], bloodGroup: str(r.blood_group),
    address: clean<Address>(r.address),
    emergencyContact: ec && (str(ec.name) || str(ec.relation) || str(ec.mobile)) ? { name: str(ec.name) ?? '', relation: str(ec.relation) ?? '', mobile: str(ec.mobile) ?? '' } : undefined,
    entityId: String(r.entity_id ?? ''), locationId: String(r.location_id ?? ''), departmentId: String(r.department_id ?? ''), designationId: String(r.designation_id ?? ''),
    reportingToId: str(r.reporting_to_id), employmentType: r.employment_type as Employee['employmentType'], status: r.status as Employee['status'],
    joinDate: str(r.join_date) ?? '', confirmationDate: str(r.confirmation_date), probationMonths: num(r.probation_months) ?? 0, noticeDays: num(r.notice_days) ?? 0,
    lastWorkingDate: str(r.last_working_date), shiftId: str(r.shift_id), costCentre: str(r.cost_centre), contractEndDate: str(r.contract_end_date),
    pan: str(r.pan), aadhaarLast4: str(r.aadhaar_last4), aadhaarVerified: bool(r.aadhaar_verified), uan: str(r.uan),
    uanStatus: (str(r.uan_status) as Employee['uanStatus']) ?? 'none', pfMember: bool(r.pf_member), pfOnActualWage: bool(r.pf_on_actual_wage),
    pfJoinDate: str(r.pf_join_date), esicIp: str(r.esic_ip), ptApplicable: bool(r.pt_applicable), lwfApplicable: bool(r.lwf_applicable),
    taxRegime: (str(r.tax_regime) as Employee['taxRegime']) ?? 'new', declaration: declarationFromWire(r.declaration), bank: bankFromWire(r.bank),
    payMode: (str(r.pay_mode) as Employee['payMode']) ?? 'bank', structureId: str(r.structure_id), annualCtc: num(r.annual_ctc),
    structureOverrides: overridesFromWire(r.structure_overrides),
    documents: arr(r.documents).map(documentFromWire), history: arr(r.history).map(historyFromWire),
  };
}

/** The bank object to send. The account number goes only when it is a new full number; with none the server keeps the one on file. */
function bankOut(b: BankDetails): Row {
  const o: Row = { accountHolder: b.accountHolder, ifsc: b.ifsc, bankName: b.bankName, accountType: b.accountType };
  if (b.accountNumber && !looksMaskedAccount(b.accountNumber)) o.accountNumber = b.accountNumber;
  return o;
}

/** Body for POST /employees. `id` is the client-made UUID; the code is the server's job and is never sent. */
export function employeeCreateBody(e: Employee): Row {
  const body: Row = { id: e.id, ...bodyFor(EMPLOYEE_SPECS, e as unknown as Row).body };
  if (e.pan && !looksMaskedPan(e.pan)) body.pan = e.pan;
  if (e.bank && e.bank.accountNumber && !looksMaskedAccount(e.bank.accountNumber)) body.bank = bankOut(e.bank);
  body.documents = e.documents.map((d) => documentCreateBody(d));
  return body;
}

/**
 * Body for PUT /employees/:id: only the keys that changed. `keys` names the local fields (for rollback).
 * PAN and bank are included only when they really changed, and never as a mask.
 */
export function employeePatch(prev: Employee, next: Employee): { body: Row; keys: string[] } {
  const { body, keys } = bodyFor(EMPLOYEE_SPECS, next as unknown as Row, prev as unknown as Row);
  if (!same(prev.pan, next.pan) && !looksMaskedPan(next.pan)) {
    keys.push('pan');
    body.pan = next.pan ? next.pan : null;
  }
  if (!same(prev.bank, next.bank)) {
    if (!next.bank) {
      keys.push('bank');
      body.bank = null;
    } else {
      keys.push('bank');
      body.bank = bankOut(next.bank);
    }
  }
  return { body, keys };
}

// ───────────────────────────── bootstrap and import responses ─────────────────────────────
export interface ServerData {
  entities: LegalEntity[]; locations: Location[]; departments: Department[]; designations: Designation[]; employees: Employee[];
  settings: Record<string, unknown>; serverTime?: string;
}

export function bootstrapFromWire(data: Row): ServerData {
  return {
    entities: arr(data.entities).map(entityFromWire),
    locations: arr(data.locations).map(locationFromWire),
    departments: arr(data.departments).map(departmentFromWire),
    designations: arr(data.designations).map(designationFromWire),
    employees: arr(data.employees).map(employeeFromWire),
    settings: isObj(data.settings) ? data.settings : {},
    serverTime: str(data.server_time),
  };
}

export interface ImportOutcome {
  dryRun: boolean; total: number; valid: number; created: number; existing: number; failed: number;
  errors: { row: number; error: string }[]; employees: Employee[];
}
export function importFromWire(data: Row): ImportOutcome {
  return {
    dryRun: bool(data.dry_run), total: num(data.total) ?? 0, valid: num(data.valid) ?? 0, created: num(data.created) ?? 0, existing: num(data.existing) ?? 0,
    failed: num(data.failed) ?? 0,
    errors: arr(data.errors).map((e) => ({ row: num(e.row) ?? 0, error: String(e.error ?? 'Could not be saved') })),
    employees: arr(data.employees).map(employeeFromWire),
  };
}

/** A row for POST /employees/import: the create body without the documents (the server adds those through their own endpoint). */
export function importRowBody(e: Employee): Row {
  const body = employeeCreateBody(e);
  delete body.documents;
  return body;
}
