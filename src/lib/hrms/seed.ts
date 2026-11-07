// Sample organisation for the HRMS preview. Fictional company, fictional people, format-valid but made-up
// identifiers (PAN, UAN, Aadhaar last four, IFSC). Deterministic, so screenshots and tests are stable.

import type {
  Adjustment, AttendanceSummary, ComplianceTask, Employee, EmploymentType, HrmsDb, LeaveBalance, LeaveType, LegalEntity, Location,
  PayRun, RosterRow, SalaryComponent, SalaryStructure, EmployeeStatus, Gender,
} from './types';
import { computePayRunPayslips } from './engine';
import { addDays, daysInMonth } from './format';
import { LAW_VERSION } from './rules';

export const SEED_VERSION = 3;
export const PREVIEW_TODAY = '2026-11-07'; // the preview's "today", so sample data lines up with the dates in the design

// ───────────────────────────── org ─────────────────────────────
const ENT_RETAIL = 'ent_retail';
const ENT_LOGI = 'ent_logistics';

const entities: LegalEntity[] = [
  {
    id: ENT_RETAIL, name: 'Meridian Retail Pvt Ltd', pan: 'AABCM4821K', tan: 'DELM12345B', cin: 'U52100DL2016PTC301234', gstin: '07AABCM4821K1Z5',
    address: { line1: '14 Okhla Industrial Estate', city: 'New Delhi', state: 'Delhi', pincode: '110020' },
    signatory: { name: 'Ritu Malhotra', designation: 'Director, People' },
    registrations: [
      { id: 'reg_pf1', type: 'pf', number: 'DLCPM1234567000', validFrom: '2017-04-01' },
      { id: 'reg_esi1', type: 'esi', number: '11000123450000999', validFrom: '2017-04-01' },
      { id: 'reg_pt_ka', type: 'pt', state: 'Karnataka', number: 'PT/KA/0456712', validFrom: '2019-06-01' },
      { id: 'reg_lwf_ka', type: 'lwf', state: 'Karnataka', number: 'LWF/KA/2204', validFrom: '2019-06-01' },
      { id: 'reg_shops_dl', type: 'shops', state: 'Delhi', number: 'SE/DL/2016/88213', validFrom: '2016-09-01', validTo: '2026-12-31', notes: 'Renewal due' },
    ],
  },
  {
    id: ENT_LOGI, name: 'Meridian Logistics LLP', pan: 'AAGFM7712Q', tan: 'MUMM98765D', gstin: '27AAGFM7712Q1Z2',
    address: { line1: 'Unit 7, Bhiwandi Logistics Park', city: 'Mumbai', state: 'Maharashtra', pincode: '421302' },
    signatory: { name: 'Sanjay Kulkarni', designation: 'Partner' },
    registrations: [
      { id: 'reg_pf2', type: 'pf', number: 'MHBAN5544332000', validFrom: '2020-01-01' },
      { id: 'reg_esi2', type: 'esi', number: '31000554433000123', validFrom: '2020-01-01' },
      { id: 'reg_pt_mh', type: 'pt', state: 'Maharashtra', number: '27230500671P', validFrom: '2020-01-01' },
      { id: 'reg_clra', type: 'clra', state: 'Maharashtra', number: 'CLRA/MH/2021/0112', validFrom: '2021-05-01', validTo: '2026-04-30', notes: 'Licence expired, renewal pending' },
    ],
  },
];

const locations: Location[] = [
  { id: 'loc_del', name: 'Delhi HQ', entityId: ENT_RETAIL, state: 'Delhi', city: 'New Delhi', metro: true, holidayListId: 'hol_dl' },
  { id: 'loc_blr', name: 'Bengaluru Office', entityId: ENT_RETAIL, state: 'Karnataka', city: 'Bengaluru', metro: true, holidayListId: 'hol_ka' },
  { id: 'loc_mum', name: 'Bhiwandi Warehouse', entityId: ENT_LOGI, state: 'Maharashtra', city: 'Mumbai', metro: true, holidayListId: 'hol_mh' },
];

const departments = [
  { id: 'dep_sales', name: 'Sales & Field' }, { id: 'dep_ops', name: 'Operations' }, { id: 'dep_fin', name: 'Finance' },
  { id: 'dep_hr', name: 'People' }, { id: 'dep_wh', name: 'Warehouse' }, { id: 'dep_tech', name: 'Technology' },
];
const designations = [
  { id: 'des_mgr', name: 'Regional Manager', grade: 'M3' }, { id: 'des_tl', name: 'Team Lead', grade: 'M1' },
  { id: 'des_ase', name: 'Area Sales Executive', grade: 'E2' }, { id: 'des_fe', name: 'Field Executive', grade: 'E1' },
  { id: 'des_acc', name: 'Accounts Executive', grade: 'E2' }, { id: 'des_hr', name: 'HR Executive', grade: 'E2' },
  { id: 'des_ops', name: 'Operations Associate', grade: 'E1' }, { id: 'des_wh', name: 'Warehouse Associate', grade: 'W1' },
  { id: 'des_dev', name: 'Software Engineer', grade: 'E3' },
];

// ───────────────────────────── salary structures ─────────────────────────────
const comp = (id: string, code: string, name: string, kind: SalaryComponent['kind'], type: SalaryComponent['calc']['type'], value: number, o: Partial<SalaryComponent> = {}): SalaryComponent => ({
  id, code, name, kind, calc: { type, value },
  isWage: false, taxable: kind === 'earning', pfApplicable: false, esiApplicable: kind === 'earning', prorate: kind === 'earning', showInPayslip: true, ...o,
});

const structures: SalaryStructure[] = [
  {
    id: 'str_std', name: 'Office staff', description: 'Basic 50% of CTC, HRA 50% of basic, balance in special allowance.', effectiveFrom: '2026-04-01',
    components: [
      comp('c_basic', 'BASIC', 'Basic', 'earning', 'pct_ctc', 50, { isWage: true, pfApplicable: true }),
      comp('c_hra', 'HRA', 'House Rent Allowance', 'earning', 'pct_basic', 50),
      comp('c_conv', 'CONV', 'Conveyance Allowance', 'earning', 'fixed', 1600),
      comp('c_spl', 'SPECIAL', 'Special Allowance', 'earning', 'balance', 0),
      comp('c_pf', 'PF_ER', 'Employer PF', 'employer', 'pf_employer', 12, { taxable: false, esiApplicable: false, prorate: false }),
      comp('c_esi', 'ESI_ER', 'Employer ESI', 'employer', 'esi_employer', 3.25, { taxable: false, esiApplicable: false, prorate: false }),
      comp('c_grat', 'GRATUITY', 'Gratuity provision', 'employer', 'gratuity_provision', 4.81, { taxable: false, esiApplicable: false, prorate: false }),
    ],
  },
  {
    id: 'str_field', name: 'Field sales', description: 'Lower basic with a travel allowance. Fails the 50% rule on purpose: it shows the add-back.', effectiveFrom: '2026-04-01',
    components: [
      comp('f_basic', 'BASIC', 'Basic', 'earning', 'pct_ctc', 35, { isWage: true, pfApplicable: true }),
      comp('f_hra', 'HRA', 'House Rent Allowance', 'earning', 'pct_basic', 40),
      comp('f_travel', 'TRAVEL', 'Travel Allowance', 'earning', 'fixed', 5000),
      comp('f_phone', 'PHONE', 'Phone & Internet', 'earning', 'fixed', 1000),
      comp('f_spl', 'SPECIAL', 'Special Allowance', 'earning', 'balance', 0),
      comp('f_pf', 'PF_ER', 'Employer PF', 'employer', 'pf_employer', 12, { taxable: false, esiApplicable: false, prorate: false }),
      comp('f_esi', 'ESI_ER', 'Employer ESI', 'employer', 'esi_employer', 3.25, { taxable: false, esiApplicable: false, prorate: false }),
    ],
  },
  {
    id: 'str_wh', name: 'Warehouse & contract', description: 'Basic 60% of CTC, no HRA, overtime applies.', effectiveFrom: '2026-04-01',
    components: [
      comp('w_basic', 'BASIC', 'Basic', 'earning', 'pct_ctc', 60, { isWage: true, pfApplicable: true }),
      comp('w_da', 'DA', 'Dearness Allowance', 'earning', 'pct_ctc', 5, { isWage: true, pfApplicable: true }),
      comp('w_spl', 'SPECIAL', 'Special Allowance', 'earning', 'balance', 0),
      comp('w_pf', 'PF_ER', 'Employer PF', 'employer', 'pf_employer', 12, { taxable: false, esiApplicable: false, prorate: false }),
      comp('w_esi', 'ESI_ER', 'Employer ESI', 'employer', 'esi_employer', 3.25, { taxable: false, esiApplicable: false, prorate: false }),
    ],
  },
];

// ───────────────────────────── people ─────────────────────────────
interface P { f: string; l: string; g: Gender; dep: string; des: string; loc: string; ctc: number; str: string; et?: EmploymentType; st?: EmployeeStatus; join: string; dob: string; gaps?: string[]; regime?: 'new' | 'old'; lwd?: string; shift?: string }
const ALL: P[] = [
  { f: 'Ritu', l: 'Malhotra', g: 'female', dep: 'dep_hr', des: 'des_mgr', loc: 'loc_del', ctc: 2400000, str: 'str_std', join: '2017-04-10', dob: '1986-03-12' },
  { f: 'Arvind', l: 'Nair', g: 'male', dep: 'dep_sales', des: 'des_mgr', loc: 'loc_blr', ctc: 2100000, str: 'str_std', join: '2018-07-02', dob: '1984-11-02', regime: 'old' },
  { f: 'Neha', l: 'Bansal', g: 'female', dep: 'dep_fin', des: 'des_acc', loc: 'loc_del', ctc: 720000, str: 'str_std', join: '2021-01-18', dob: '1993-08-21', regime: 'old' },
  { f: 'Rohit', l: 'Chauhan', g: 'male', dep: 'dep_sales', des: 'des_tl', loc: 'loc_del', ctc: 960000, str: 'str_field', join: '2020-03-02', dob: '1990-01-30' },
  { f: 'Divya', l: 'Menon', g: 'female', dep: 'dep_tech', des: 'des_dev', loc: 'loc_blr', ctc: 1800000, str: 'str_std', join: '2022-06-13', dob: '1996-05-09' },
  { f: 'Imran', l: 'Sheikh', g: 'male', dep: 'dep_sales', des: 'des_ase', loc: 'loc_del', ctc: 540000, str: 'str_field', join: '2023-02-06', dob: '1995-09-14' },
  { f: 'Pooja', l: 'Verma', g: 'female', dep: 'dep_sales', des: 'des_fe', loc: 'loc_del', ctc: 330000, str: 'str_field', join: '2024-05-20', dob: '1999-12-01', gaps: ['uan'] },
  { f: 'Karthik', l: 'Subramanian', g: 'male', dep: 'dep_sales', des: 'des_ase', loc: 'loc_blr', ctc: 600000, str: 'str_field', join: '2022-11-14', dob: '1994-02-27' },
  { f: 'Sana', l: 'Qureshi', g: 'female', dep: 'dep_sales', des: 'des_fe', loc: 'loc_blr', ctc: 300000, str: 'str_field', join: '2025-01-06', dob: '2000-07-19', gaps: ['bank'] },
  { f: 'Vikram', l: 'Joshi', g: 'male', dep: 'dep_ops', des: 'des_ops', loc: 'loc_del', ctc: 360000, str: 'str_std', join: '2023-08-21', dob: '1997-04-03' },
  { f: 'Anita', l: 'Desai', g: 'female', dep: 'dep_ops', des: 'des_ops', loc: 'loc_mum', ctc: 340000, str: 'str_std', join: '2022-09-05', dob: '1996-10-25' },
  { f: 'Manoj', l: 'Patil', g: 'male', dep: 'dep_wh', des: 'des_wh', loc: 'loc_mum', ctc: 252000, str: 'str_wh', et: 'permanent', join: '2021-04-12', dob: '1991-06-15', shift: 'sh_early' },
  { f: 'Santosh', l: 'Gaikwad', g: 'male', dep: 'dep_wh', des: 'des_wh', loc: 'loc_mum', ctc: 228000, str: 'str_wh', join: '2022-02-21', dob: '1993-03-08', shift: 'sh_early' },
  { f: 'Rekha', l: 'More', g: 'female', dep: 'dep_wh', des: 'des_wh', loc: 'loc_mum', ctc: 222000, str: 'str_wh', join: '2023-06-19', dob: '1995-11-11', shift: 'sh_night', gaps: ['pan'] },
  { f: 'Dinesh', l: 'Kamble', g: 'male', dep: 'dep_wh', des: 'des_wh', loc: 'loc_mum', ctc: 216000, str: 'str_wh', et: 'contract', join: '2025-08-04', dob: '1998-01-22', shift: 'sh_night' },
  { f: 'Lakshmi', l: 'Iyer', g: 'female', dep: 'dep_fin', des: 'des_acc', loc: 'loc_blr', ctc: 660000, str: 'str_std', join: '2020-12-01', dob: '1992-02-14', regime: 'old' },
  { f: 'Harish', l: 'Reddy', g: 'male', dep: 'dep_tech', des: 'des_dev', loc: 'loc_blr', ctc: 1500000, str: 'str_std', join: '2023-01-09', dob: '1997-08-30' },
  { f: 'Tanvi', l: 'Kapoor', g: 'female', dep: 'dep_hr', des: 'des_hr', loc: 'loc_del', ctc: 540000, str: 'str_std', join: '2022-04-04', dob: '1995-06-06' },
  { f: 'Gaurav', l: 'Saxena', g: 'male', dep: 'dep_sales', des: 'des_ase', loc: 'loc_del', ctc: 576000, str: 'str_field', join: '2021-09-13', dob: '1992-12-12' },
  { f: 'Farhan', l: 'Ali', g: 'male', dep: 'dep_sales', des: 'des_fe', loc: 'loc_del', ctc: 312000, str: 'str_field', join: '2024-10-14', dob: '2001-03-17' },
  { f: 'Meenal', l: 'Shah', g: 'female', dep: 'dep_ops', des: 'des_ops', loc: 'loc_del', ctc: 330000, str: 'str_std', et: 'fixed_term', join: '2025-11-24', dob: '1999-09-09' },
  { f: 'Yash', l: 'Rathore', g: 'male', dep: 'dep_sales', des: 'des_fe', loc: 'loc_del', ctc: 288000, str: 'str_field', st: 'on_notice', join: '2023-05-08', dob: '1998-10-10', lwd: '2026-11-30' },
  { f: 'Deepa', l: 'Pillai', g: 'female', dep: 'dep_ops', des: 'des_ops', loc: 'loc_blr', ctc: 324000, str: 'str_std', st: 'exited', join: '2022-07-18', dob: '1996-04-20', lwd: '2026-09-30' },
  { f: 'Aditya', l: 'Bhat', g: 'male', dep: 'dep_tech', des: 'des_dev', loc: 'loc_blr', ctc: 0, str: '', st: 'onboarding', join: '2026-11-16', dob: '2000-02-02' },
  { f: 'Shreya', l: 'Banerjee', g: 'female', dep: 'dep_fin', des: 'des_acc', loc: 'loc_del', ctc: 0, str: '', st: 'onboarding', join: '2026-11-23', dob: '1999-05-28' },
];

const PAN_L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const mkPan = (i: number, surname: string) => `${PAN_L[(i * 3) % 24]}${PAN_L[(i * 5 + 1) % 24]}${PAN_L[(i * 7 + 2) % 24]}P${surname[0]!.toUpperCase()}${String(1000 + ((i * 937) % 8999)).padStart(4, '0')}${PAN_L[(i * 11 + 3) % 24]}`;
const IFSC = [['HDFC0000123', 'HDFC Bank'], ['ICIC0000456', 'ICICI Bank'], ['SBIN0001234', 'State Bank of India'], ['UTIB0000789', 'Axis Bank'], ['KKBK0000321', 'Kotak Mahindra Bank']];

function declaration(old: boolean, i: number): Employee['declaration'] {
  return old
    ? { sec80C: 90000 + (i % 3) * 20000, sec80D: 15000, nps80CCD1B: 0, homeLoanInterest: i % 2 ? 120000 : 0, rentPaidAnnual: 180000 + (i % 4) * 24000, landlordPan: 'BCDPS1234E', other: 0, submittedOn: '2026-04-20', status: 'verified' }
    : { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' };
}

function buildEmployee(p: P, i: number): Employee {
  const code = `MER-${String(1001 + i).padStart(4, '0')}`;
  const loc = locations.find((l) => l.id === p.loc)!;
  const gaps = p.gaps ?? [];
  const bankIdx = i % IFSC.length;
  const onboarding = p.st === 'onboarding';
  const pfMember = p.et !== 'intern' && !onboarding;
  const e: Employee = {
    id: `emp_${i + 1}`, code, firstName: p.f, lastName: p.l,
    email: `${p.f.toLowerCase()}.${p.l.toLowerCase()}@meridian.example`, mobile: `9${String(810000000 + i * 3719317).slice(0, 9)}`,
    gender: p.g, dob: p.dob, fatherName: undefined, maritalStatus: i % 3 === 0 ? 'single' : 'married', bloodGroup: ['A+', 'B+', 'O+', 'AB+', 'O-'][i % 5],
    address: { line1: `${12 + i} Sample Nagar`, city: loc.city, state: loc.state, pincode: loc.city === 'New Delhi' ? '110017' : loc.city === 'Bengaluru' ? '560034' : '421302' },
    emergencyContact: { name: 'Family contact', relation: 'Spouse', mobile: `98${String(10000000 + i * 91357).slice(0, 8)}` },
    entityId: loc.entityId, locationId: loc.id, departmentId: p.dep, designationId: p.des, reportingToId: i > 1 && p.dep === 'dep_sales' ? 'emp_4' : undefined,
    employmentType: p.et ?? 'permanent', status: p.st ?? 'active', joinDate: p.join,
    confirmationDate: onboarding ? undefined : addDays(p.join, 180), probationMonths: 6, noticeDays: p.des === 'des_mgr' ? 90 : 30,
    lastWorkingDate: p.lwd, shiftId: p.shift ?? 'sh_gen', costCentre: p.dep.replace('dep_', '').toUpperCase(),
    contractEndDate: p.et === 'fixed_term' ? '2026-11-23' : p.et === 'contract' ? '2026-12-31' : undefined,
    pan: gaps.includes('pan') || onboarding ? undefined : mkPan(i + 1, p.l),
    aadhaarLast4: onboarding ? undefined : String(1000 + ((i * 7919) % 8999)).slice(0, 4), aadhaarVerified: !onboarding,
    uan: gaps.includes('uan') || onboarding ? undefined : String(100200300400 + i * 1117),
    uanStatus: gaps.includes('uan') ? 'none' : onboarding ? 'none' : i === 8 ? 'activated' : 'aadhaar_seeded',
    pfMember, pfOnActualWage: p.des === 'des_mgr', pfJoinDate: pfMember ? p.join : undefined,
    esicIp: p.ctc > 0 && p.ctc <= 330000 && !onboarding ? String(1100123450 + i * 13) : undefined,
    ptApplicable: true, lwfApplicable: loc.state === 'Maharashtra' || loc.state === 'Karnataka',
    taxRegime: p.regime ?? 'new', declaration: declaration((p.regime ?? 'new') === 'old', i),
    bank: gaps.includes('bank') || onboarding ? undefined : { accountHolder: `${p.f} ${p.l}`, accountNumber: String(50100000000000 + i * 7770011).slice(0, 14), ifsc: IFSC[bankIdx]![0]!, bankName: IFSC[bankIdx]![1]!, accountType: 'savings' },
    payMode: 'bank',
    structureId: p.str || undefined, annualCtc: p.ctc || undefined,
    documents: [
      { id: `d_${i}_1`, type: 'appointment_letter', name: 'Appointment letter', uploadedOn: p.join, status: onboarding ? 'pending' : 'verified', mandatory: true, fileName: 'appointment.pdf' },
      { id: `d_${i}_2`, type: 'pan_card', name: 'PAN card', uploadedOn: p.join, status: gaps.includes('pan') || onboarding ? 'pending' : 'verified', mandatory: true },
      { id: `d_${i}_3`, type: 'aadhaar', name: 'Aadhaar (masked copy)', uploadedOn: p.join, status: onboarding ? 'pending' : 'verified', mandatory: true },
      { id: `d_${i}_4`, type: 'bank_proof', name: 'Cancelled cheque', uploadedOn: p.join, status: gaps.includes('bank') || onboarding ? 'pending' : 'uploaded', mandatory: true },
    ],
    history: onboarding ? [] : [
      { id: `h_${i}_1`, at: `${p.join}T10:00:00.000Z`, by: 'HR Admin', field: 'Status', from: 'Onboarding', to: 'Active' },
      ...(i % 4 === 0 ? [{ id: `h_${i}_2`, at: '2026-04-01T09:00:00.000Z', by: 'HR Admin', field: 'Annual CTC', from: String(Math.round(p.ctc * 0.9)), to: String(p.ctc) }] : []),
    ],
  };
  return e;
}

const employees: Employee[] = ALL.map(buildEmployee);

// ───────────────────────────── time + leave ─────────────────────────────
const shifts = [
  { id: 'sh_gen', name: 'General', start: '09:30', end: '18:30', breakMinutes: 60, graceMinutes: 15, fullDayHours: 8, halfDayHours: 4, isNight: false, color: '#3E9EFF' },
  { id: 'sh_early', name: 'Early', start: '07:00', end: '16:00', breakMinutes: 60, graceMinutes: 10, fullDayHours: 8, halfDayHours: 4, isNight: false, color: '#00C9B1' },
  { id: 'sh_retail', name: 'Retail floor', start: '10:00', end: '20:00', breakMinutes: 90, graceMinutes: 10, fullDayHours: 8.5, halfDayHours: 4, isNight: false, color: '#FFB800' },
  { id: 'sh_night', name: 'Night', start: '22:00', end: '06:00', breakMinutes: 45, graceMinutes: 10, fullDayHours: 8, halfDayHours: 4, isNight: true, color: '#9B6EFF' },
];

const weekStart = '2026-11-02'; // Monday of the preview week
const roster: RosterRow[] = employees.filter((e) => e.status === 'active').slice(0, 14).map((e, i) => ({
  employeeId: e.id, weekStart,
  days: Array.from({ length: 7 }, (_, d) => (d === 6 || (i % 3 === 0 && d === 2 && e.shiftId === 'sh_night') ? 'off' : e.shiftId ?? 'sh_gen')),
}));

const overtimeRules = [
  { id: 'ot_std', name: 'Standard overtime', rateMultiplier: 2, quarterlyCapHours: 144, requiresConsent: true, minMinutes: 30, rateDivisor: 26 as const, womenNightConsent: true, appliesTo: ['permanent', 'contract', 'daily_wage', 'fixed_term'] as EmploymentType[] },
];

const leaveTypes: LeaveType[] = [
  { id: 'lv_cl', name: 'Casual Leave', code: 'CL', paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 }, carryForward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, maxConsecutiveDays: 3, probationEligible: true, includeWeeklyOffs: false },
  { id: 'lv_sl', name: 'Sick Leave', code: 'SL', paid: true, audience: 'all', accrual: { mode: 'yearly', days: 8, afterMonths: 0 }, carryForward: { allowed: true, maxDays: 8, expiryMonths: 12 }, encashment: { allowed: false, maxDays: 0, onExit: false }, documentAfterDays: 2, probationEligible: true, includeWeeklyOffs: true },
  { id: 'lv_el', name: 'Earned Leave', code: 'EL', paid: true, audience: 'all', accrual: { mode: 'monthly', days: 1.25, afterMonths: 6 }, carryForward: { allowed: true, maxDays: 30, expiryMonths: 24 }, encashment: { allowed: true, maxDays: 30, onExit: true }, probationEligible: false, includeWeeklyOffs: false },
  { id: 'lv_ml', name: 'Maternity Leave', code: 'ML', paid: true, audience: 'female', accrual: { mode: 'on_joining', days: 182, afterMonths: 3 }, carryForward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, documentAfterDays: 1, probationEligible: false, includeWeeklyOffs: true, description: '26 weeks under the Maternity Benefit Act; needs 80 days of work in the 12 months before delivery.' },
  { id: 'lv_co', name: 'Compensatory Off', code: 'CO', paid: true, audience: 'all', accrual: { mode: 'none', days: 0, afterMonths: 0 }, carryForward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, probationEligible: true, includeWeeklyOffs: false, description: 'Earned by working on a weekly off or holiday. Lapses after 60 days.' },
  { id: 'lv_lop', name: 'Leave Without Pay', code: 'LWP', paid: false, audience: 'all', accrual: { mode: 'none', days: 0, afterMonths: 0 }, carryForward: { allowed: false, maxDays: 0, expiryMonths: 0 }, encashment: { allowed: false, maxDays: 0, onExit: false }, probationEligible: true, includeWeeklyOffs: true },
];

const hol = (id: string, name: string, state: string, items: [string, string, boolean?][]) => ({ id, name, state, year: 2026, holidays: items.map(([date, n, optional]) => ({ date, name: n, optional: !!optional })) });
const holidayLists = [
  hol('hol_dl', 'Delhi 2026', 'Delhi', [['2026-01-26', 'Republic Day'], ['2026-03-04', 'Holi'], ['2026-08-15', 'Independence Day'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra'], ['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas'], ['2026-11-05', 'Guru Nanak Jayanti', true]]),
  hol('hol_ka', 'Karnataka 2026', 'Karnataka', [['2026-01-26', 'Republic Day'], ['2026-05-01', 'Labour Day'], ['2026-08-15', 'Independence Day'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-11-01', 'Kannada Rajyotsava'], ['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas']]),
  hol('hol_mh', 'Maharashtra 2026', 'Maharashtra', [['2026-01-26', 'Republic Day'], ['2026-05-01', 'Maharashtra Day'], ['2026-08-15', 'Independence Day'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra'], ['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas']]),
];

const leaveBalances: LeaveBalance[] = employees.filter((e) => e.status === 'active' || e.status === 'on_notice').flatMap((e, i) => [
  { employeeId: e.id, leaveTypeId: 'lv_cl', opening: 8, accrued: 0, taken: i % 4, encashed: 0, lapsed: 0 },
  { employeeId: e.id, leaveTypeId: 'lv_sl', opening: 8 + (i % 3), accrued: 0, taken: i % 3, encashed: 0, lapsed: 0 },
  { employeeId: e.id, leaveTypeId: 'lv_el', opening: 6 + (i % 10), accrued: 10, taken: i % 5, encashed: 0, lapsed: 0 },
]);

// attendance rollups for Sep, Oct (locked) and Nov (still open)
function attendanceFor(month: string, locked: boolean): AttendanceSummary[] {
  const days = daysInMonth(month);
  const mo = Number(month.slice(5, 7));
  return employees.filter((e) => e.status !== 'onboarding' && e.joinDate <= `${month}-28`).map((e, i) => {
    const lop = (i * 7 + mo) % 11 === 0 ? 2 : (i + mo) % 9 === 0 ? 1 : 0;
    const wo = month === '2026-11' ? 4 : 4;
    const holidays = month === '2026-10' ? 2 : month === '2026-11' ? 1 : 0;
    const ot = e.shiftId === 'sh_early' || e.shiftId === 'sh_night' ? ((i * 3) % 18) : 0;
    const open = month === '2026-11';
    const present = open ? 5 : days - wo - holidays - lop - ((i + mo) % 4 === 0 ? 1 : 0);
    return { employeeId: e.id, month, daysInMonth: days, presentDays: present, paidLeaveDays: open ? 0 : (i + mo) % 4 === 0 ? 1 : 0, weeklyOffs: wo, holidays, lopDays: open ? 0 : lop, overtimeHours: open ? 0 : ot, locked };
  });
}
const attendance: AttendanceSummary[] = [...attendanceFor('2026-09', true), ...attendanceFor('2026-10', true), ...attendanceFor('2026-11', false)];

const adjustments: Adjustment[] = [
  { id: 'adj_1', employeeId: 'emp_4', month: '2026-10', kind: 'incentive', amount: 18000, taxable: true, note: 'Q2 sales incentive' },
  { id: 'adj_2', employeeId: 'emp_6', month: '2026-10', kind: 'incentive', amount: 9500, taxable: true, note: 'Q2 sales incentive' },
  { id: 'adj_3', employeeId: 'emp_10', month: '2026-11', kind: 'bonus', amount: 12000, taxable: true, note: 'Diwali bonus' },
  { id: 'adj_4', employeeId: 'emp_19', month: '2026-11', kind: 'arrear', amount: 4200, taxable: true, note: 'Increment arrears, Oct' },
  { id: 'adj_5', employeeId: 'emp_6', month: '2026-11', kind: 'reimbursement', amount: 2400, taxable: false, note: 'Client visit travel' },
];
const loans = [
  { id: 'loan_1', employeeId: 'emp_7', kind: 'advance' as const, principal: 20000, emi: 2000, startMonth: '2026-08', recovered: 8000, note: 'Salary advance' },
  { id: 'loan_2', employeeId: 'emp_10', kind: 'loan' as const, principal: 60000, emi: 5000, startMonth: '2026-06', recovered: 25000, note: 'Personal loan' },
];

// ───────────────────────────── lifecycle ─────────────────────────────
const task = (id: string, label: string, owner: string, done: boolean) => ({ id, label, owner, done });
const onboarding = [
  { id: 'onb_1', employeeId: 'emp_24', name: 'Aditya Bhat', role: 'Software Engineer', joinDate: '2026-11-16', stage: 'registration' as const, tasks: [
    task('t1', 'Offer accepted and e-signed', 'HR', true), task('t2', 'Upload PAN, Aadhaar, bank proof', 'Employee', false), task('t3', 'Previous employer UAN and relieving letter', 'Employee', false),
    task('t4', 'Generate UAN or link existing', 'HR', false), task('t5', 'ESIC registration (if applicable)', 'HR', false), task('t6', 'Laptop and access', 'IT', true), task('t7', 'Induction schedule', 'Manager', false) ] },
  { id: 'onb_2', employeeId: 'emp_25', name: 'Shreya Banerjee', role: 'Accounts Executive', joinDate: '2026-11-23', stage: 'documents' as const, tasks: [
    task('t1', 'Offer accepted and e-signed', 'HR', true), task('t2', 'Upload PAN, Aadhaar, bank proof', 'Employee', false), task('t3', 'Previous employer UAN and relieving letter', 'Employee', false),
    task('t4', 'Generate UAN or link existing', 'HR', false), task('t6', 'Laptop and access', 'IT', false), task('t7', 'Induction schedule', 'Manager', false) ] },
];
const exits = [
  { id: 'exit_1', employeeId: 'emp_22', reason: 'resignation' as const, resignationDate: '2026-10-30', lastWorkingDate: '2026-11-30', noticeWaived: false, stage: 'notice' as const,
    clearance: [ { id: 'c1', department: 'Reporting manager', owner: 'Rohit Chauhan', done: true, remarks: 'Handover done' }, { id: 'c2', department: 'IT', owner: 'IT desk', done: false }, { id: 'c3', department: 'Finance', owner: 'Neha Bansal', done: false }, { id: 'c4', department: 'HR', owner: 'Tanvi Kapoor', done: false } ],
    assets: [ { id: 'a1', name: 'Android phone (IMEI ending 4471)', returned: false }, { id: 'a2', name: 'Company ID card', returned: false } ], interviewDone: false },
];
const fnfCases = [ { id: 'fnf_1', employeeId: 'emp_23', lastWorkingDate: '2026-09-30', resignationDate: '2026-08-28', noticeDaysServed: 30, leaveEncashDays: 6, otherRecoveries: 0, otherPayments: 0, status: 'paid' as const, dueBy: '2026-10-03' } ];

const letterTemplates = [
  { id: 'lt_offer', type: 'offer' as const, name: 'Offer letter', body: 'Dear {{employee_name}},\n\nWe are pleased to offer you the position of {{designation}} at {{company}}, with an annual cost to company of {{ctc}}. Your proposed date of joining is {{join_date}}.\n\nThis offer is subject to verification of your documents and references.\n\nSincerely,\n{{signatory}}' },
  { id: 'lt_appt', type: 'appointment' as const, name: 'Appointment letter', body: 'Dear {{employee_name}},\n\nFurther to your acceptance, you are appointed as {{designation}} in the {{department}} department at {{location}} with effect from {{join_date}}.\n\nYour annual CTC is {{ctc}}, as set out in the annexure. Your probation is {{probation_months}} months and the notice period is {{notice_days}} days.\n\nThis letter is issued under the Occupational Safety, Health and Working Conditions Code.\n\nSincerely,\n{{signatory}}' },
  { id: 'lt_conf', type: 'confirmation' as const, name: 'Confirmation letter', body: 'Dear {{employee_name}},\n\nWe are happy to confirm your employment as {{designation}} with effect from {{confirmation_date}}, on successful completion of your probation.\n\nSincerely,\n{{signatory}}' },
  { id: 'lt_inc', type: 'increment' as const, name: 'Increment letter', body: 'Dear {{employee_name}},\n\nIn recognition of your contribution, your annual CTC is revised to {{ctc}} with effect from {{effective_date}}.\n\nSincerely,\n{{signatory}}' },
  { id: 'lt_rel', type: 'relieving' as const, name: 'Relieving letter', body: 'To whom it may concern,\n\n{{employee_name}} ({{employee_code}}) worked with {{company}} as {{designation}} from {{join_date}} to {{last_working_date}} and has been relieved of all duties. Their full and final settlement has been completed.\n\nSincerely,\n{{signatory}}' },
  { id: 'lt_exp', type: 'experience' as const, name: 'Experience letter', body: 'To whom it may concern,\n\nThis is to certify that {{employee_name}} was employed with {{company}} as {{designation}} from {{join_date}} to {{last_working_date}}.\n\nSincerely,\n{{signatory}}' },
];

// ───────────────────────────── compliance + DPDP ─────────────────────────────
const due = (id: string, name: string, law: ComplianceTask['law'], dueOn: string, entityId: string, status: ComplianceTask['status'], state?: string, filedOn?: string): ComplianceTask => ({ id, name, law, dueOn, entityId, status, state, filedOn, reference: filedOn ? `CHL-${id.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase()}` : undefined });
const compliance: ComplianceTask[] = [
  due('cmp_tds_oct', 'TDS deposit for October', 'TDS', '2026-11-07', ENT_RETAIL, 'due_soon'),
  due('cmp_pf_oct', 'PF contribution and ECR for October', 'PF', '2026-11-15', ENT_RETAIL, 'upcoming'),
  due('cmp_esi_oct', 'ESI contribution for October', 'ESI', '2026-11-15', ENT_RETAIL, 'upcoming'),
  due('cmp_pt_ka', 'Professional tax, Karnataka, October', 'PT', '2026-11-20', ENT_RETAIL, 'upcoming', 'Karnataka'),
  due('cmp_pf_oct2', 'PF contribution and ECR for October', 'PF', '2026-11-15', ENT_LOGI, 'upcoming'),
  due('cmp_pt_mh', 'Professional tax, Maharashtra, October', 'PT', '2026-11-30', ENT_LOGI, 'upcoming', 'Maharashtra'),
  due('cmp_tds_sep', 'TDS deposit for September', 'TDS', '2026-10-07', ENT_RETAIL, 'filed', undefined, '2026-10-06'),
  due('cmp_pf_sep', 'PF contribution and ECR for September', 'PF', '2026-10-15', ENT_RETAIL, 'filed', undefined, '2026-10-14'),
  due('cmp_24q', 'Form 138 (TDS return) for Q2', 'TDS', '2026-10-31', ENT_RETAIL, 'filed', undefined, '2026-10-29'),
  due('cmp_lwf', 'Labour welfare fund, Karnataka', 'LWF', '2026-12-31', ENT_RETAIL, 'upcoming', 'Karnataka'),
  due('cmp_shops', 'Shops & Establishments renewal, Delhi', 'Shops', '2026-12-31', ENT_RETAIL, 'upcoming', 'Delhi'),
  due('cmp_clra', 'CLRA licence renewal, Maharashtra', 'CLRA', '2026-05-15', ENT_LOGI, 'overdue', 'Maharashtra'),
  due('cmp_posh', 'POSH annual report to the district officer', 'POSH', '2026-12-31', ENT_RETAIL, 'upcoming'),
];

const consents = employees.filter((e) => e.status === 'active').slice(0, 10).flatMap((e, i) => [
  { id: `cs_${i}_1`, employeeId: e.id, purpose: 'Location during duty hours', noticeVersion: 'v2 (Apr 2026)', grantedAt: `${e.joinDate}T09:00:00.000Z` },
  { id: `cs_${i}_2`, employeeId: e.id, purpose: 'Face match for attendance', noticeVersion: 'v1 (Jan 2026)', grantedAt: '2026-01-15T09:00:00.000Z', withdrawnAt: i === 3 ? '2026-09-02T11:00:00.000Z' : undefined },
]);
const accessLog = [
  { id: 'al_1', at: '2026-11-06T10:12:00.000Z', byUser: 'Tanvi Kapoor (HR)', employeeId: 'emp_7', field: 'Bank account', reason: 'Fix IFSC before payroll' },
  { id: 'al_2', at: '2026-11-05T15:40:00.000Z', byUser: 'Neha Bansal (Finance)', employeeId: 'emp_4', field: 'Salary structure', reason: 'Incentive review' },
  { id: 'al_3', at: '2026-11-04T09:05:00.000Z', byUser: 'Ritu Malhotra', employeeId: 'emp_2', field: 'Aadhaar last four', reason: 'Verification' },
];
const retention = [
  { id: 'rt_1', dataset: 'Salary registers and payslips', keepYears: 8, basis: 'Income-tax and labour record rules (confirm with counsel)', action: 'anonymise' as const },
  { id: 'rt_2', dataset: 'Attendance and muster rolls', keepYears: 5, basis: 'Labour Codes registers retained five years (as reported)', action: 'anonymise' as const },
  { id: 'rt_3', dataset: 'Location trail', keepYears: 0.25, basis: 'Needed for travel allowance disputes only; 90 days', action: 'delete' as const },
  { id: 'rt_4', dataset: 'Face templates', keepYears: 0.08, basis: 'Delete 30 days after exit', action: 'delete' as const },
  { id: 'rt_5', dataset: 'Candidate data (not hired)', keepYears: 1, basis: 'Consent for future roles', action: 'delete' as const },
];

// ───────────────────────────── assemble ─────────────────────────────
export function makeSeed(): HrmsDb {
  const db: HrmsDb = {
    version: SEED_VERSION,
    company: { name: 'Meridian Retail', currency: 'INR', fyStartMonth: 4 },
    entities, locations, departments, designations, employees, shifts, roster, overtimeRules, leaveTypes, holidayLists, leaveBalances,
    attendance, structures, adjustments, loans, payRuns: [], fnfCases, onboarding, exits, letterTemplates, letters: [], compliance, consents, accessLog, retention,
  };
  // Two closed runs per entity so reports, YTD and Form 16 style views have history.
  for (const month of ['2026-09', '2026-10']) {
    for (const ent of entities) {
      const id = `run_${month}_${ent.id}`;
      const payslips = computePayRunPayslips(db, month, ent.id, id);
      if (!payslips.length) continue;
      const run: PayRun = {
        id, month, entityId: ent.id, type: 'regular', status: 'paid', lawVersion: LAW_VERSION, createdAt: `${month}-26T09:00:00.000Z`, computedAt: `${month}-27T09:00:00.000Z`,
        frozenAt: `${month}-28T12:00:00.000Z`, frozenBy: 'Neha Bansal', paidAt: `${month}-30T16:00:00.000Z`, payslips,
        audit: [ { at: `${month}-27T09:00:00.000Z`, by: 'Neha Bansal', action: 'Computed' }, { at: `${month}-28T12:00:00.000Z`, by: 'Neha Bansal', action: 'Frozen' }, { at: `${month}-30T16:00:00.000Z`, by: 'Neha Bansal', action: 'Marked paid' } ],
      };
      db.payRuns.push(run);
    }
  }
  return db;
}
