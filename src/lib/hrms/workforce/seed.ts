// Deterministic sample data for the workforce area. Fictional contractors, fictional workers, made-up identifiers.
// No Math.random, Date.now or new Date(): screenshots and tests must be stable. "Today" is PREVIEW_TODAY (7 Nov 2026).

import { sampleAadhaar } from '../validators';
import { PREVIEW_TODAY } from '../seed';
import { PROOF_SPECS, CONTRACT_MONTHS } from './contractEngine';
import { DEFAULT_POLICY } from './wageEngine';
import { DEFAULT_RULES } from './kioskEngine';
import { emptySteps } from './verifyEngine';
import type {
  ContractData, ContractInvoice, ContractWorker, Contractor, InvoiceDecision, KioskData, KioskDevice, KioskException, Proof, ProofKind, ProofStatus, Punch,
  VerifyCase, WageData, WageRequest, WorkforceData,
} from './types';

export const WORKFORCE_AREA_VERSION = 1;
const T0 = PREVIEW_TODAY;
const [SEP, OCT] = CONTRACT_MONTHS as [string, string];

// ───────────────────────────── contract labour ─────────────────────────────
const contractors: Contractor[] = [
  { id: 'ctr_sai', name: 'Sai Manpower Services', licenceNo: 'BHW-CL-2024-0457', licenceFrom: '2025-04-01', licenceTo: '2027-03-31', site: 'Bhiwandi Warehouse, loading dock', locationId: 'loc_mum', state: 'Maharashtra', pfCode: 'MHBAN0098765000', esiCode: '31000778899000101', monthlyInvoice: 342000, contact: 'Prakash Jadhav' },
  { id: 'ctr_ganesh', name: 'Ganesh Facility and Loading Co', licenceNo: 'BHW-CL-2023-0311', licenceFrom: '2023-11-01', licenceTo: '2026-10-31', site: 'Bhiwandi Warehouse, outbound yard', locationId: 'loc_mum', state: 'Maharashtra', pfCode: 'MHBAN0045612000', esiCode: '31000445566000102', monthlyInvoice: 215000, contact: 'Ganesh Pawar' },
  { id: 'ctr_kalyan', name: 'Kalyan Skilled Workforce LLP', licenceNo: 'BHW-CL-2025-0620', licenceFrom: '2025-08-01', licenceTo: '2027-07-31', site: 'Bhiwandi Warehouse, MHE and maintenance', locationId: 'loc_mum', state: 'Maharashtra', pfCode: 'MHBAN0111223000', esiCode: '31000998877000103', monthlyInvoice: 268000, contact: 'Anjali Rane' },
];

type W = [name: string, skill: ContractWorker['skill'], sepDays: number, sepPaid: number, octDays: number, octPaid: number];
const workerRows: Record<string, W[]> = {
  ctr_sai: [
    ['Ramesh Gawande', 'unskilled', 26, 15800, 26, 15500],
    ['Sunil Mhatre', 'unskilled', 24, 14600, 26, 15900],
    ['Pravin Shinde', 'unskilled', 26, 15900, 26, 15900],
    ['Ajay Bhoir', 'unskilled', 25, 15400, 26, 15700],
    ['Nitin Kadu', 'unskilled', 22, 13300, 0, 0],
    ['Dilip Sawant', 'unskilled', 26, 16000, 26, 16000],
  ],
  ctr_ganesh: [
    ['Mahesh Chavan', 'unskilled', 26, 15600, 26, 15600],
    ['Rohan Pawar', 'unskilled', 26, 15500, 25, 14200],
    ['Sagar Dalvi', 'unskilled', 24, 14500, 26, 13900],
    ['Kiran Patil', 'unskilled', 26, 15900, 26, 15900],
    ['Vijay Tandel', 'unskilled', 20, 12000, 22, 13000],
  ],
  ctr_kalyan: [
    ['Sameer Kulkarni', 'skilled', 26, 21000, 26, 21000],
    ['Yogesh Thakur', 'skilled', 26, 19500, 26, 19500],
    ['Prasad Naik', 'skilled', 26, 18800, 25, 18500],
    ['Mukesh Yadav', 'skilled', 26, 18500, 26, 20000],
  ],
};
const workers: ContractWorker[] = Object.entries(workerRows).flatMap(([cid, rows]) => rows.map(([name, skill, sd, sp, od, op], i) => ({
  id: `cw_${cid.slice(4)}_${i + 1}`, contractorId: cid, name, skill, days: { [SEP]: sd, [OCT]: od }, wagePaid: { [SEP]: sp, [OCT]: op },
})));

const invoices: ContractInvoice[] = [
  { id: 'inv_sai_sep', contractorId: 'ctr_sai', month: SEP, amount: 342000, headcount: 7, reference: 'SMS/0926' },
  { id: 'inv_sai_oct', contractorId: 'ctr_sai', month: OCT, amount: 342000, headcount: 8, reference: 'SMS/1026' },
  { id: 'inv_ganesh_sep', contractorId: 'ctr_ganesh', month: SEP, amount: 215000, headcount: 5, reference: 'GFL/0926' },
  { id: 'inv_ganesh_oct', contractorId: 'ctr_ganesh', month: OCT, amount: 215000, headcount: 5, reference: 'GFL/1026' },
  { id: 'inv_kalyan_sep', contractorId: 'ctr_kalyan', month: SEP, amount: 268000, headcount: 4, reference: 'KSW/0926' },
  { id: 'inv_kalyan_oct', contractorId: 'ctr_kalyan', month: OCT, amount: 268000, headcount: 4, reference: 'KSW/1026' },
];

const FILE_STEM: Record<ProofKind, string> = {
  wage_payment: 'bank-statement', pf_challan: 'pf-challan', esi_challan: 'esi-challan', wage_register: 'wage-register', attendance_register: 'attendance-register', licence_copy: 'licence',
};
const VERIFIED_BY = 'Neha Bansal (Finance)';

/** Every contractor and month gets all six proofs; `except` says which are not simply "received". */
function proofsFor(cid: string, month: string, verifiedKinds: ProofKind[], except: Partial<Record<ProofKind, { status: ProofStatus; reason?: string }>> = {}): Proof[] {
  const uploaded = month === SEP ? '2026-10-08' : '2026-11-04';
  const verifiedOn = month === SEP ? '2026-10-12' : '2026-11-06';
  const short = cid.slice(4);
  return PROOF_SPECS.map((s): Proof => {
    const ex = except[s.kind];
    const base = { id: `pr_${short}_${month}_${s.kind}`, contractorId: cid, month, kind: s.kind };
    if (ex?.status === 'missing') return { ...base, status: 'missing' };
    if (ex?.status === 'rejected') return { ...base, status: 'rejected', fileName: `${short}-${FILE_STEM[s.kind]}-${month}.pdf`, uploadedOn: uploaded, rejectReason: ex.reason };
    const p: Proof = { ...base, status: 'received', fileName: `${short}-${FILE_STEM[s.kind]}-${month}.pdf`, uploadedOn: uploaded };
    if (verifiedKinds.includes(s.kind)) { p.verifiedBy = VERIFIED_BY; p.verifiedOn = verifiedOn; }
    return p;
  });
}
const ALL_KINDS = PROOF_SPECS.map((s) => s.kind);

const proofs: Proof[] = [
  ...proofsFor('ctr_sai', SEP, ALL_KINDS),
  ...proofsFor('ctr_sai', OCT, ['wage_payment', 'pf_challan', 'licence_copy'], { esi_challan: { status: 'missing' } }),
  ...proofsFor('ctr_ganesh', SEP, ['wage_payment', 'pf_challan', 'esi_challan'], { wage_register: { status: 'rejected', reason: 'Pages for the last week are missing' } }),
  ...proofsFor('ctr_ganesh', OCT, ['wage_payment'], { pf_challan: { status: 'missing' } }),
  ...proofsFor('ctr_kalyan', SEP, ALL_KINDS),
  ...proofsFor('ctr_kalyan', OCT, ALL_KINDS),
];

const decisions: InvoiceDecision[] = [
  { id: `ctr_sai:${SEP}`, contractorId: 'ctr_sai', month: SEP, decision: 'cleared', reason: 'All six proofs verified and headcount matches.', by: 'Neha Bansal (Finance)', on: '2026-10-13', advisory: 'clear' },
  { id: `ctr_kalyan:${SEP}`, contractorId: 'ctr_kalyan', month: SEP, decision: 'cleared', reason: 'All six proofs verified and wages are above the minimum.', by: 'Neha Bansal (Finance)', on: '2026-10-13', advisory: 'clear' },
  { id: `ctr_ganesh:${SEP}`, contractorId: 'ctr_ganesh', month: SEP, decision: 'hold', reason: 'Wage register is incomplete. Asked for the missing pages.', contractorReply: 'Will send the last week by Monday.', by: 'Tanvi Kapoor (HR)', on: '2026-10-14', advisory: 'hold' },
];

const contract: ContractData = {
  contractors, workers, invoices, proofs, decisions,
  coreAssignments: [{ employeeId: 'emp_15', contractorId: 'ctr_sai', skill: 'unskilled' }],
};

// ───────────────────────────── wage access ─────────────────────────────
const req = (id: string, employeeId: string, month: string, amount: number, status: WageRequest['status'], requestedOn: string, o: Partial<WageRequest> = {}): WageRequest =>
  ({ id, employeeId, month, amount, fee: 0, status, requestedOn, ...o });
const wage: WageData = {
  policy: { ...DEFAULT_POLICY },
  requests: [
    req('wa_1', 'emp_3', '2026-11', 5000, 'pending', '2026-11-06', { note: 'Medical bill for a family member' }),
    req('wa_2', 'emp_10', '2026-11', 2000, 'pending', '2026-11-06', { note: 'Rent deposit' }),
    req('wa_3', 'emp_21', '2026-11', 2500, 'pending', '2026-11-07'),
    req('wa_4', 'emp_6', '2026-11', 4000, 'declined', '2026-11-03', { decidedBy: 'Tanvi Kapoor (HR)', decidedOn: '2026-11-03', reason: 'Only about 2,000 was available on the 3rd. Asked to request again later in the month.' }),
    req('wa_5', 'emp_4', '2026-10', 6000, 'settled', '2026-10-12', { decidedBy: 'Tanvi Kapoor (HR)', decidedOn: '2026-10-12', recoverIn: '2026-10', note: 'Recovered in the October payroll' }),
    req('wa_6', 'emp_19', '2026-10', 4000, 'settled', '2026-10-15', { decidedBy: 'Tanvi Kapoor (HR)', decidedOn: '2026-10-15', recoverIn: '2026-10', note: 'Recovered in the October payroll' }),
    req('wa_7', 'emp_11', '2026-10', 2000, 'settled', '2026-10-09', { decidedBy: 'Tanvi Kapoor (HR)', decidedOn: '2026-10-09', recoverIn: '2026-10', note: 'Recovered in the October payroll' }),
    req('wa_8', 'emp_20', '2026-09', 3000, 'settled', '2026-09-17', { decidedBy: 'Tanvi Kapoor (HR)', decidedOn: '2026-09-17', recoverIn: '2026-09', note: 'Recovered in the September payroll' }),
  ],
};

// ───────────────────────────── site kiosk ─────────────────────────────
const devices: KioskDevice[] = [
  { id: 'dev_gate', name: 'Gate 1 tablet', location: 'Bhiwandi Warehouse, main gate', status: 'active', lastSeenDate: T0, lastSeenMin: 9 * 60 + 48, addedOn: '2026-03-02' },
  { id: 'dev_dock', name: 'Dock office tablet', location: 'Bhiwandi Warehouse, dock office', status: 'active', lastSeenDate: '2026-11-05', lastSeenMin: 22 * 60 + 10, addedOn: '2026-06-18' },
];
const hm = (h: number, m: number) => h * 60 + m;
const punch = (id: string, employeeId: string, date: string, minute: number, direction: Punch['direction'], o: Partial<Punch> = {}): Punch =>
  ({ id, employeeId, date, minute, direction, deviceId: 'dev_gate', result: 'accepted', flags: [], source: 'kiosk', ...o });
const punches: Punch[] = [
  punch('pn_1', 'emp_12', '2026-11-06', hm(6, 55), 'in'),
  punch('pn_2', 'emp_13', '2026-11-06', hm(6, 58), 'in'),
  punch('pn_3', 'emp_11', '2026-11-06', hm(9, 28), 'in'),
  punch('pn_4', 'emp_12', '2026-11-06', hm(16, 4), 'out'),
  punch('pn_5', 'emp_13', '2026-11-06', hm(16, 6), 'out', { result: 'flagged', flags: ['out_without_in'], note: 'OUT with no IN before it' }),
  punch('pn_6', 'emp_11', '2026-11-06', hm(18, 34), 'out'),
  punch('pn_7', 'emp_14', '2026-11-06', hm(21, 55), 'in'),
  punch('pn_8', 'emp_15', '2026-11-06', hm(21, 58), 'in'),
  punch('pn_9', 'emp_14', T0, hm(6, 5), 'out'),
  punch('pn_10', 'emp_12', T0, hm(6, 52), 'in'),
  punch('pn_11', 'emp_12', T0, hm(6, 53), 'in', { result: 'ignored', flags: ['duplicate'], note: 'Double tap, ignored' }),
  punch('pn_12', 'emp_13', T0, hm(7, 14), 'in', { flags: ['late'] }),
];
const exceptions: KioskException[] = [
  { id: 'kx_1', key: `missing_out:emp_15:2026-11-06`, kind: 'missing_out', employeeId: 'emp_15', date: '2026-11-06', detail: 'Dinesh Kamble: IN at 21:58 on 6 Nov 2026 and no OUT by the shift end (06:00 on 7 Nov 2026).', punchId: 'pn_8', status: 'open' },
  { id: 'kx_2', key: `out_without_in:emp_13:2026-11-06:${hm(16, 6)}`, kind: 'out_without_in', employeeId: 'emp_13', date: '2026-11-06', detail: 'Santosh Gaikwad: OUT at 16:06 with no IN before it.', punchId: 'pn_5', status: 'open' },
  { id: 'kx_3', key: `outside_shift:emp_11:2026-11-04:${hm(13, 10)}`, kind: 'outside_shift', employeeId: 'emp_11', date: '2026-11-04', detail: 'Anita Desai: IN at 13:10 is outside the shift window.', status: 'resolved', resolvedBy: 'Tanvi Kapoor (HR)', resolvedOn: '2026-11-05', resolution: 'Came in for a half day after a hospital visit. Supervisor agreed.' },
];
const kiosk: KioskData = {
  clockMin: hm(9, 50),
  rules: { ...DEFAULT_RULES },
  devices,
  pins: { emp_11: '4821', emp_12: '1357', emp_13: '2468', emp_14: '9035', emp_15: '7712' },
  locks: {},
  punches,
  exceptions,
};

// ───────────────────────────── verified onboarding ─────────────────────────────
const HR = 'Tanvi Kapoor (HR)';
function newCase(id: string, name: string, role: string, joinDate: string, inputs: Partial<VerifyCase['inputs']>, employeeId?: string): VerifyCase {
  return {
    id, employeeId, name, role, joinDate,
    inputs: { pan: '', bankAccount: '', ifsc: '', accountHolder: name, uan: '', degree: '', institution: '', gradYear: '', employerName: '', employerFrom: '', employerTo: '', employerEmail: '', ...inputs },
    steps: emptySteps(), results: {},
  };
}
const aditya = newCase('vc_aditya', 'Aditya Bhat', 'Software Engineer', '2026-11-16', {
  pan: 'AJRPB4412K', bankAccount: '50100456123498', ifsc: 'HDFC0000123', accountHolder: 'Aditya Bhat', uan: '100987654321',
  degree: 'B.E. Computer Science', institution: 'Visvesvaraya Technological University', gradYear: '2022',
  employerName: 'Lumen Software Pvt Ltd', employerFrom: '2022-07-01', employerTo: '2026-10-31', employerEmail: 'hr@lumen.example',
}, 'emp_24');
aditya.aadhaarLast4 = sampleAadhaar(24).slice(-4);
aditya.steps.pan = { status: 'verified', runs: 1, ranAt: '2026-11-05', ranBy: HR, consentAt: '2026-11-05', evidence: 'PAN AJRPB4412K is active. Name on PAN, ADITYA BHAT, matches the offer letter.' };
aditya.steps.aadhaar = { status: 'verified', runs: 1, ranAt: '2026-11-05', ranBy: HR, consentAt: '2026-11-05', evidence: `The number passes its checksum and is active. Only the last four digits (${aditya.aadhaarLast4}) are kept.` };
aditya.steps.education = { status: 'in_progress', runs: 1, ranAt: '2026-11-06', ranBy: HR, consentAt: '2026-11-06', evidence: 'Request sent to Visvesvaraya Technological University (simulated). Real replies take days; check again to see this one.' };

const shreya = newCase('vc_shreya', 'Shreya Banerjee', 'Accounts Executive', '2026-11-23', {
  pan: 'BQMPB7781L', bankAccount: '50100778899123', ifsc: 'ICIC0000456', accountHolder: 'Shreya Banerjee', uan: '',
  degree: 'B.Com', institution: 'University of Calcutta', gradYear: '2021',
  employerName: 'Kapoor and Associates', employerFrom: '2023-02-01', employerTo: '2026-09-30', employerEmail: 'accounts@kapoor.example',
}, 'emp_25');
shreya.steps.pan = {
  status: 'mismatch', runs: 1, ranAt: '2026-11-06', ranBy: HR, consentAt: '2026-11-06',
  evidence: 'Name on PAN is close but not the same: "SHREYA BANERJI" against "Shreya Banerjee".',
  compare: { label: 'Name on PAN', ours: 'Shreya Banerjee', theirs: 'SHREYA BANERJI' },
};
shreya.steps.bank = { status: 'verified', runs: 1, ranAt: '2026-11-06', ranBy: HR, consentAt: '2026-11-06', evidence: 'Penny-drop (simulated) reached ICICI Bank, account ending 9123. Holder, SHREYA BANERJEE, matches.' };
shreya.results.bankName = 'ICICI Bank';

const rahul = newCase('vc_rahul', 'Rahul Deshmukh', 'Warehouse Supervisor', '2026-12-01', {
  pan: 'CKTPD3390H', bankAccount: '50100234567890', ifsc: 'SBIN0001234', accountHolder: 'Rahul Deshmukh', uan: '100412345678',
  degree: 'B.Com', institution: 'Savitribai Phule Pune University', gradYear: '2016',
  employerName: 'Sahyadri Auto Components', employerFrom: '2020-06-01', employerTo: '2026-10-15', employerEmail: 'hr@sahyadri.example',
});
rahul.steps.pan = { status: 'verified', runs: 1, ranAt: '2026-11-06', ranBy: HR, consentAt: '2026-11-06', evidence: 'PAN CKTPD3390H is active. Name on PAN, RAHUL DESHMUKH, matches the offer letter.' };

const verify = { cases: [aditya, shreya, rahul] };

// ───────────────────────────── the whole thing ─────────────────────────────
export function makeWorkforceSeed(): WorkforceData {
  return structuredClone({ contract, wage, kiosk, verify });
}
