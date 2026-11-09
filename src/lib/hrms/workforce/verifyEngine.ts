// Verified onboarding: pre-joining checks. EVERY external check here is a SIMULATION.
//
// Nothing leaves the browser. The format checks are real (PAN shape, Aadhaar checksum, IFSC, account number, UAN). The
// "registry response" after that is a small canned book keyed off the value typed in, so the same input always gives
// the same answer. A live version would call PAN, Aadhaar, bank, EPFO, university and employer services behind a consent
// flow and a vendor contract. Pure functions: no React, no storage, no network.

import { checkAadhaar, checkAccount, checkIfsc, checkPan, checkUan, sampleAadhaar } from '../validators';
import { fmtDate } from '../format';
import type { StepKey, StepRecord, StepStatus, VerifyCase, VerifyInputs } from './types';

export const SIMULATION_LABEL = 'Simulated response. No data leaves your browser.';

export const STEP_ORDER: StepKey[] = ['pan', 'aadhaar', 'bank', 'uan', 'education', 'employer'];
/** These four must be verified (or accepted with a reason) before a person is cleared to join. */
export const MANDATORY: StepKey[] = ['pan', 'aadhaar', 'bank', 'uan'];

export interface StepMeta { label: string; short: string; check: string; why: string; keep: string }
export const STEP_META: Record<StepKey, StepMeta> = {
  pan: { label: 'PAN check', short: 'PAN', check: 'that the PAN is well formed and that the name on it matches your offer letter', why: 'to deduct income tax at the right rate', keep: 'with your employee file while you work here; deleted within 30 days if you do not join' },
  aadhaar: { label: 'Aadhaar check', short: 'Aadhaar', check: 'that the Aadhaar number is well formed and active', why: 'to link your UAN and to confirm who you are', keep: 'as its last four digits only, with your employee file. The full number is never stored' },
  bank: { label: 'Bank account check', short: 'Bank', check: 'that the account number and IFSC are valid and the account holder name matches yours', why: 'to pay your salary into the right account', keep: 'with your employee file while you work here; deleted within 30 days if you do not join' },
  uan: { label: 'UAN lookup or generation', short: 'UAN', check: 'whether you already have a provident fund UAN, or to create one', why: 'to deposit your provident fund', keep: 'with your employee file for the statutory period' },
  education: { label: 'Education check', short: 'Education', check: 'that the institution confirms your degree and year', why: 'because the role asks for it', keep: 'for one year if you do not join, or with your file if you do (indicative)' },
  employer: { label: 'Previous employer check', short: 'Employer', check: 'that your last employer confirms your role and dates of service', why: 'because the role asks for experience', keep: 'for one year if you do not join, or with your file if you do (indicative)' },
};
export const consentLine = (k: StepKey): string => {
  const m = STEP_META[k];
  return `We check ${m.check}, ${m.why}. We keep the result ${m.keep}.`;
};

// ───────────────────────────── name matching ─────────────────────────────
const HONORIFICS = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'SHRI', 'SMT', 'SRI', 'KUMARI']);
export function nameTokens(s: string): string[] {
  return s.toUpperCase().replace(/[.,'()]/g, ' ').split(/\s+/).filter((t) => t && !HONORIFICS.has(t));
}
export function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

export type NameMatch = 'match' | 'close' | 'different';
/**
 * Same words in any order is a match. Spelling a letter or two apart, or initials in place of first names, is close.
 * Anything else is different. The caller shows both names either way, and a person decides.
 */
export function compareNames(a: string, b: string): NameMatch {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 'different';
  const key = (t: string[]) => [...t].sort().join(' ');
  if (key(ta) === key(tb)) return 'match';
  if (levenshtein(key(ta).replace(/ /g, ''), key(tb).replace(/ /g, '')) <= 2) return 'close';
  // Initials: the family name is the same word, and each other word on one side starts with an initial on the other.
  const full = (t: string[]) => t.filter((x) => x.length > 1);
  const initials = (t: string[]) => t.filter((x) => x.length === 1);
  const fa = full(ta);
  const fb = full(tb);
  if (fa.some((t) => fb.includes(t))) {
    const restA = fa.filter((t) => !fb.includes(t));
    const restB = fb.filter((t) => !fa.includes(t));
    const coveredB = restB.every((t) => initials(ta).some((i) => t.startsWith(i)));
    const coveredA = restA.every((t) => initials(tb).some((i) => t.startsWith(i)));
    if (coveredA && coveredB) return 'close';
  }
  return 'different';
}

// ───────────────────────────── the canned registries ─────────────────────────────
/** PAN to the holder name the simulated registry returns. A planted case: Shreya's PAN carries a different spelling. */
export const PAN_BOOK: Record<string, string> = {
  AJRPB4412K: 'ADITYA BHAT',
  BQMPB7781L: 'SHREYA BANERJI',
  CKTPD3390H: 'RAHUL DESHMUKH',
};
/** Aadhaar numbers that the simulated registry reports as deactivated. */
export const AADHAAR_DEACTIVATED: string[] = [sampleAadhaar(99)];
export const BANK_NAMES: Record<string, string> = { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank' };
/** Account number to the holder name the bank returns. A planted case: Rahul's account is in initials. */
export const BANK_BOOK: Record<string, string> = { '50100234567890': 'R S DESHMUKH' };
export const UAN_BOOK: Record<string, { name: string; seeded: boolean; employer: string }> = {
  '100412345678': { name: 'RAHUL DESHMUKH', seeded: true, employer: 'Sahyadri Auto Components' },
  '100987654321': { name: 'ADITYA BHAT', seeded: false, employer: 'Lumen Software Pvt Ltd' },
};
export const INSTITUTIONS = ['VISVESVARAYA TECHNOLOGICAL UNIVERSITY', 'UNIVERSITY OF CALCUTTA', 'SAVITRIBAI PHULE PUNE UNIVERSITY', 'UNIVERSITY OF DELHI', 'UNIVERSITY OF MUMBAI'];
export const EMPLOYER_BOOK: Record<string, { from: string; to: string }> = {
  'LUMEN SOFTWARE PVT LTD': { from: '2022-07-01', to: '2026-10-31' },
  'KAPOOR AND ASSOCIATES': { from: '2023-02-01', to: '2026-09-30' },
  'SAHYADRI AUTO COMPONENTS': { from: '2020-06-01', to: '2026-10-15' },
};
const normOrg = (s: string) => s.toUpperCase().replace(/&/g, ' AND ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/** A repeatable, made-up UAN for the "generate" path: the same person always gets the same one. */
export function generateUan(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const body = String(h).padStart(10, '0').slice(-10);
  return `10${body}`;
}

// ───────────────────────────── running a check ─────────────────────────────
export interface RunRequest {
  key: StepKey;
  name: string;               // name on the offer letter
  inputs: VerifyInputs;
  aadhaar?: string;           // typed once, used for the check, never stored
  runsSoFar: number;
}
export interface RunResult {
  status: StepStatus;
  evidence: string;
  compare?: StepRecord['compare'];
  aadhaarLast4?: string;
  results?: Partial<VerifyCase['results']>;
}

const fail = (evidence: string): RunResult => ({ status: 'failed', evidence });
const nameResult = (label: string, ours: string, theirs: string, okText: string): RunResult => {
  const m = compareNames(ours, theirs);
  if (m === 'match') return { status: 'verified', evidence: okText };
  return {
    status: 'mismatch',
    evidence: m === 'close' ? `${label} is close but not the same: "${theirs}" against "${ours}".` : `${label} is different: "${theirs}" against "${ours}".`,
    compare: { label, ours, theirs },
  };
};

export function runCheck(r: RunRequest): RunResult {
  const i = r.inputs;
  switch (r.key) {
    case 'pan': {
      const pan = i.pan.replace(/\s+/g, '').toUpperCase();
      const v = checkPan(pan);
      if (!v.ok) return fail(`PAN format is wrong: ${v.message}`);
      if (pan[3] !== 'P') return fail(`${pan} is not an individual's PAN (the fourth letter is ${pan[3]}).`);
      const holder = PAN_BOOK[pan];
      if (!holder) return fail(`${pan} was not found in the simulated registry.`);
      return nameResult('Name on PAN', r.name, holder, `PAN ${pan} is active. Name on PAN, ${holder}, matches the offer letter.`);
    }
    case 'aadhaar': {
      const full = (r.aadhaar ?? '').replace(/\s+/g, '');
      const v = checkAadhaar(full);
      if (!v.ok) return fail(`Aadhaar number not accepted: ${v.message}`);
      const last4 = full.slice(-4);
      if (AADHAAR_DEACTIVATED.includes(full)) return { status: 'failed', evidence: `The number ending ${last4} is reported as deactivated.`, aadhaarLast4: last4 };
      return { status: 'verified', evidence: `The number passes its checksum and is active. Only the last four digits (${last4}) are kept.`, aadhaarLast4: last4 };
    }
    case 'bank': {
      const ifsc = i.ifsc.replace(/\s+/g, '').toUpperCase();
      const acct = i.bankAccount.replace(/\s+/g, '');
      const a = checkAccount(acct);
      if (!a.ok) return fail(`Account number not accepted: ${a.message}`);
      const f = checkIfsc(ifsc);
      if (!f.ok) return fail(`IFSC not accepted: ${f.message}`);
      const bankName = BANK_NAMES[ifsc.slice(0, 4)];
      if (!bankName) return fail(`IFSC ${ifsc} was not found in the simulated bank list.`);
      if (acct.endsWith('0000')) return fail(`The account ending ${acct.slice(-4)} is reported as closed.`);
      const holder = BANK_BOOK[acct] ?? i.accountHolder.toUpperCase();
      const res = nameResult('Account holder', r.name, holder, `Penny-drop (simulated) reached ${bankName}, account ending ${acct.slice(-4)}. Holder, ${holder}, matches.`);
      return { ...res, results: { bankName } };
    }
    case 'uan': {
      const uan = i.uan.replace(/\s+/g, '');
      if (!uan) {
        const made = generateUan(`${r.name}|${i.pan}`);
        return { status: 'verified', evidence: `No earlier UAN. A sample UAN, ${made}, was generated. A real UAN is issued by EPFO when the person is registered.`, results: { uan: made, uanStatus: 'generated' } };
      }
      const v = checkUan(uan);
      if (!v.ok) return fail(`UAN not accepted: ${v.message}`);
      const hit = UAN_BOOK[uan];
      if (!hit) return fail(`UAN ${uan} was not found in the simulated registry. Check the number or leave it blank to generate one.`);
      const m = compareNames(r.name, hit.name);
      if (m !== 'match') return { status: 'mismatch', evidence: `The name on the UAN, ${hit.name}, differs from the offer letter.`, compare: { label: 'Name on UAN', ours: r.name, theirs: hit.name }, results: { uan, uanStatus: hit.seeded ? 'aadhaar_seeded' : 'activated' } };
      return { status: 'verified', evidence: `UAN ${uan} is active, last employer ${hit.employer}. ${hit.seeded ? 'It is linked to Aadhaar.' : 'It is not yet linked to Aadhaar: seed it before the first PF return.'}`, results: { uan, uanStatus: hit.seeded ? 'aadhaar_seeded' : 'activated' } };
    }
    case 'education': {
      const inst = i.institution.trim();
      const year = Number(i.gradYear);
      if (!i.degree.trim() || !inst) return fail('Enter the degree and the institution first.');
      if (!Number.isInteger(year) || year < 1980 || year > 2026) return fail('Enter a graduation year between 1980 and 2026.');
      if (r.runsSoFar < 1) return { status: 'in_progress', evidence: `Request sent to ${inst} (simulated). Real replies take days; check again to see this one.` };
      if (!INSTITUTIONS.includes(inst.toUpperCase())) return fail(`${inst} is not in the simulated list, so the degree could not be confirmed.`);
      return { status: 'verified', evidence: `${inst} confirmed ${i.degree.trim()}, ${year} (simulated).` };
    }
    case 'employer': {
      const org = normOrg(i.employerName);
      if (!org) return fail('Enter the previous employer first.');
      if (!i.employerFrom || !i.employerTo) return fail('Enter the dates of service first.');
      if (r.runsSoFar < 1) return { status: 'in_progress', evidence: `Request sent to ${i.employerName.trim()} (simulated). Real replies take days; check again to see this one.` };
      const hit = EMPLOYER_BOOK[org];
      if (!hit) return fail(`${i.employerName.trim()} did not reply in the simulation, so the service could not be confirmed.`);
      const off = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
      if (off(hit.from, i.employerFrom) > 31 || off(hit.to, i.employerTo) > 31) {
        return {
          status: 'mismatch', evidence: `Service dates differ. The person says ${fmtDate(i.employerFrom)} to ${fmtDate(i.employerTo)}; the employer says ${fmtDate(hit.from)} to ${fmtDate(hit.to)}.`,
          compare: { label: 'Service dates', ours: `${fmtDate(i.employerFrom)} to ${fmtDate(i.employerTo)}`, theirs: `${fmtDate(hit.from)} to ${fmtDate(hit.to)}` },
        };
      }
      return { status: 'verified', evidence: `${i.employerName.trim()} confirmed service from ${fmtDate(hit.from)} to ${fmtDate(hit.to)} (simulated).` };
    }
  }
}

// ───────────────────────────── readiness ─────────────────────────────
/** A step counts as done when it is verified, or a mismatch that HR accepted with a reason. */
export const stepDone = (s: StepRecord): boolean => s.status === 'verified' || (s.status === 'mismatch' && !!s.accepted);

export interface Blocker { key: StepKey; label: string; why: string }
export interface Readiness {
  pct: number;                  // share of mandatory steps done
  mandatoryDone: number;
  mandatoryTotal: number;
  doneCount: number;            // of all six
  blocking: Blocker[];          // mandatory steps not done
  optionalPending: Blocker[];   // education and employer, not blocking
  canClear: boolean;
}

function blockerFor(key: StepKey, s: StepRecord): Blocker {
  const label = STEP_META[key].label;
  switch (s.status) {
    case 'not_started': return { key, label, why: 'Not started.' };
    case 'in_progress': return { key, label, why: 'Waiting for the reply. Check again.' };
    case 'mismatch': return { key, label, why: s.correction ? `Mismatch. Correction requested on ${fmtDate(s.correction.on)}; re-run once it arrives.` : `Mismatch (${s.compare?.label ?? 'a detail'}). Accept it with a reason or request a correction.` };
    case 'failed': return { key, label, why: `Failed. ${s.evidence ?? ''}`.trim() };
    default: return { key, label, why: '' };
  }
}

export function readiness(c: Pick<VerifyCase, 'steps'>): Readiness {
  const mandatoryDone = MANDATORY.filter((k) => stepDone(c.steps[k])).length;
  const blocking = MANDATORY.filter((k) => !stepDone(c.steps[k])).map((k) => blockerFor(k, c.steps[k]));
  const optionalPending = STEP_ORDER.filter((k) => !MANDATORY.includes(k) && !stepDone(c.steps[k])).map((k) => blockerFor(k, c.steps[k]));
  return {
    pct: Math.round((mandatoryDone / MANDATORY.length) * 100), mandatoryDone, mandatoryTotal: MANDATORY.length,
    doneCount: STEP_ORDER.filter((k) => stepDone(c.steps[k])).length, blocking, optionalPending, canClear: blocking.length === 0,
  };
}

export const emptyStep = (): StepRecord => ({ status: 'not_started', runs: 0 });
export const emptySteps = (): Record<StepKey, StepRecord> => ({ pan: emptyStep(), aadhaar: emptyStep(), bank: emptyStep(), uan: emptyStep(), education: emptyStep(), employer: emptyStep() });

/** Show an Aadhaar as the last four only. */
export const aadhaarShown = (last4?: string): string => (last4 ? `XXXX XXXX ${last4}` : 'Not collected');

export const STATUS_LABEL: Record<StepStatus, string> = { not_started: 'Not started', in_progress: 'In progress', verified: 'Verified', mismatch: 'Mismatch', failed: 'Failed' };
