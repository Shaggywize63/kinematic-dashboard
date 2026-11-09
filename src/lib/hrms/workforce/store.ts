'use client';
// The workforce store and every change the four pages make. Components read `workforceStore.use()` and call these
// functions only. Changes to the core HRMS data (a wage access advance, a cleared joiner) go through
// lib/hrms/actions (`addLoan`, `updateEmployee`). When the backend lands, each function becomes one API call.

import { createAreaStore } from '../areaStore';
import { getDb } from '../db';
import { ACTOR, addLoan, updateEmployee } from '../actions';
import { PREVIEW_TODAY } from '../seed';
import { fullName } from '../format';
import type { EmployeeDocument } from '../types';
import { WORKFORCE_AREA_VERSION, makeWorkforceSeed } from './seed';
import type {
  Contractor, InvoiceDecision, KioskDevice, KioskRules, Proof, ProofKind, PunchDirection, StepKey, VerifyInputs, WagePolicy, WorkforceData,
} from './types';
import { PROOF_SPECS } from './contractEngine';
import { validateAmount, validatePolicy, wageStanding, recoveryMonth } from './wageEngine';
import {
  checkPin, counted, evaluatePunch, exceptionFromPunch, findMissingOuts, fromAbs, kioskPeople, planFor, toAbs, type PinResult, type PunchOutcome,
} from './kioskEngine';
import { readiness, runCheck } from './verifyEngine';

export const workforceStore = createAreaStore<WorkforceData>('workforce', WORKFORCE_AREA_VERSION, makeWorkforceSeed);
export const TODAY = PREVIEW_TODAY;

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const okay = <T,>(value: T): Result<T> => ({ ok: true, value });
const bad = (error: string): Result<never> => ({ ok: false, error });
const nextId = (prefix: string, ids: string[]): string => {
  const max = ids.reduce((m, id) => { const n = Number(id.split('_').pop()); return Number.isFinite(n) ? Math.max(m, n) : m; }, 0);
  return `${prefix}_${max + 1}`;
};

// ═════════════════════════════ contract labour ═════════════════════════════
export function submitProof(contractorId: string, month: string, kind: ProofKind, fileName: string): Result {
  const name = fileName.trim();
  if (name.length < 3) return bad('Enter a file name, for example wage-statement-oct.pdf.');
  if (name.length > 120) return bad('Keep the file name under 120 characters.');
  if (!PROOF_SPECS.some((s) => s.kind === kind)) return bad('Unknown proof.');
  workforceStore.mutate((d) => {
    const list = d.contract.proofs;
    const i = list.findIndex((p) => p.contractorId === contractorId && p.month === month && p.kind === kind);
    const next: Proof = { id: `pr_${contractorId.slice(4)}_${month}_${kind}`, contractorId, month, kind, status: 'received', fileName: name, uploadedOn: TODAY };
    if (i >= 0) list[i] = { ...next, id: list[i]!.id }; else list.push(next);
  });
  return okay(undefined);
}
export function verifyProof(proofId: string): Result {
  let found = false;
  workforceStore.mutate((d) => {
    const p = d.contract.proofs.find((x) => x.id === proofId);
    if (!p || p.status !== 'received') return;
    p.verifiedBy = ACTOR; p.verifiedOn = TODAY; found = true;
  });
  return found ? okay(undefined) : bad('Only a received proof can be verified.');
}
export function rejectProof(proofId: string, reason: string): Result {
  if (reason.trim().length < 5) return bad('Say why it is rejected, in a few words.');
  let found = false;
  workforceStore.mutate((d) => {
    const p = d.contract.proofs.find((x) => x.id === proofId);
    if (!p || p.status === 'missing') return;
    p.status = 'rejected'; p.rejectReason = reason.trim(); p.verifiedBy = undefined; p.verifiedOn = undefined; found = true;
  });
  return found ? okay(undefined) : bad('There is no file to reject.');
}
export function removeProof(proofId: string): void {
  workforceStore.mutate((d) => {
    const p = d.contract.proofs.find((x) => x.id === proofId);
    if (!p) return;
    p.status = 'missing'; p.fileName = undefined; p.uploadedOn = undefined; p.verifiedBy = undefined; p.verifiedOn = undefined; p.rejectReason = undefined;
  });
}
export function setInvoiceHeadcount(invoiceId: string, headcount: number): Result {
  if (!Number.isInteger(headcount) || headcount < 0 || headcount > 500) return bad('Enter a whole number of people, 0 to 500.');
  workforceStore.mutate((d) => { const i = d.contract.invoices.find((x) => x.id === invoiceId); if (i) i.headcount = headcount; });
  return okay(undefined);
}
/**
 * The human decision on an invoice. A hold always needs a reason. So does clearing against advice, so an override is
 * visible later. The engine's advice at the time is stored with the decision.
 */
export function decideInvoice(i: { contractorId: string; month: string; decision: InvoiceDecision['decision']; reason: string; advisory: InvoiceDecision['advisory']; contractorReply?: string }): Result {
  const reason = i.reason.trim();
  const needsReason = i.decision === 'hold' || i.advisory !== 'clear';
  if (needsReason && reason.length < 8) return bad(i.decision === 'hold' ? 'Say why the invoice is on hold, in a few words.' : 'The checks advised against this. Say why you are clearing it, in a few words.');
  workforceStore.mutate((d) => {
    const id = `${i.contractorId}:${i.month}`;
    const rec: InvoiceDecision = {
      id, contractorId: i.contractorId, month: i.month, decision: i.decision, advisory: i.advisory,
      reason: reason || 'All proofs held and every check passes.', contractorReply: i.contractorReply?.trim() || undefined, by: ACTOR, on: TODAY,
    };
    const k = d.contract.decisions.findIndex((x) => x.id === id);
    if (k >= 0) d.contract.decisions[k] = rec; else d.contract.decisions.push(rec);
  });
  return okay(undefined);
}
export function reopenDecision(contractorId: string, month: string): void {
  workforceStore.mutate((d) => { d.contract.decisions = d.contract.decisions.filter((x) => !(x.contractorId === contractorId && x.month === month)); });
}
export function contractorById(d: WorkforceData, id: string): Contractor | undefined { return d.contract.contractors.find((c) => c.id === id); }

// ═════════════════════════════ wage access ═════════════════════════════
export function savePolicy(p: WagePolicy): Result {
  const errs = validatePolicy(p);
  const first = Object.values(errs)[0];
  if (first) return bad(first);
  workforceStore.mutate((d) => { d.wage.policy = { ...p, eligibleTypes: [...p.eligibleTypes] }; });
  return okay(undefined);
}

/** A person asks to draw `amount`. It waits in the inbox as pending. */
export function submitWageRequest(employeeId: string, amount: number, note?: string): Result<string> {
  const data = workforceStore.get();
  const s = wageStanding(getDb(), data.wage.policy, data.wage.requests, employeeId, TODAY);
  if (!s) return bad('This person was not found.');
  const errs = validateAmount(s, data.wage.policy, amount);
  if (errs.length) return bad(errs[0]!);
  let id = '';
  workforceStore.mutate((d) => {
    id = nextId('wa', d.wage.requests.map((r) => r.id));
    d.wage.requests.push({ id, employeeId, month: s.month, amount, fee: d.wage.policy.fee, status: 'pending', requestedOn: TODAY, note: note?.trim() || undefined });
  });
  return okay(id);
}
export function cancelWageRequest(id: string): Result {
  let done = false;
  workforceStore.mutate((d) => { const r = d.wage.requests.find((x) => x.id === id); if (r?.status === 'pending') { r.status = 'cancelled'; r.decidedBy = 'The employee'; r.decidedOn = TODAY; done = true; } });
  return done ? okay(undefined) : bad('Only a waiting request can be cancelled.');
}
export function declineWageRequest(id: string, reason: string): Result {
  if (reason.trim().length < 8) return bad('Give the person a reason, in a few words.');
  let done = false;
  workforceStore.mutate((d) => {
    const r = d.wage.requests.find((x) => x.id === id);
    if (r?.status !== 'pending') return;
    r.status = 'declined'; r.decidedBy = ACTOR; r.decidedOn = TODAY; r.reason = reason.trim(); done = true;
  });
  return done ? okay(undefined) : bad('Only a waiting request can be declined.');
}
/**
 * Approve a waiting request. The engine runs again here, on the data as it is now, so a request can never be approved
 * for more than is available or for someone who is no longer eligible. Approving adds an advance to the core loans;
 * the next payroll recovers it in one deduction.
 */
export function approveWageRequest(id: string, remark?: string): Result<string> {
  const data = workforceStore.get();
  const r = data.wage.requests.find((x) => x.id === id);
  if (!r || r.status !== 'pending') return bad('Only a waiting request can be approved.');
  const db = getDb();
  // Check it as if this request did not exist yet: its own pending entry must not count as a used request or a draw.
  const s = wageStanding(db, data.wage.policy, data.wage.requests.filter((x) => x.id !== id), r.employeeId, TODAY);
  if (!s) return bad('This person was not found.');
  const errs = validateAmount(s, data.wage.policy, r.amount);
  if (errs.length) return bad(errs[0]!);
  const recoverIn = recoveryMonth(db, r.employeeId, TODAY);
  const before = new Set(db.loans.map((l) => l.id));
  const principal = r.amount + r.fee;
  addLoan({ employeeId: r.employeeId, kind: 'advance', principal, emi: principal, startMonth: recoverIn, note: `Wage access ${r.id}: ${r.amount}${r.fee ? ` plus fee ${r.fee}` : ''}` });
  const created = getDb().loans.find((l) => !before.has(l.id));
  workforceStore.mutate((d) => {
    const x = d.wage.requests.find((q) => q.id === id);
    if (!x) return;
    x.status = 'approved'; x.decidedBy = ACTOR; x.decidedOn = TODAY; x.loanId = created?.id; x.recoverIn = recoverIn; x.reason = remark?.trim() || undefined;
  });
  return okay(created?.id ?? '');
}

// ═════════════════════════════ site kiosk ═════════════════════════════
export function setClock(min: number): void {
  workforceStore.mutate((d) => { d.kiosk.clockMin = Math.max(0, Math.min(1439, Math.round(min))); });
}
export function saveKioskRules(r: KioskRules): Result {
  if (![r.duplicateWindowMin, r.maxPinTries, r.lockoutMin, r.earlyWindowMin, r.lateWindowMin].every((n) => Number.isInteger(n) && n >= 1 && n <= 600)) return bad('Use whole numbers from 1 to 600.');
  workforceStore.mutate((d) => { d.kiosk.rules = { ...r }; });
  return okay(undefined);
}

/** Check a PIN. The attempt count and any lockout are stored, so reloading the page does not reset them. */
export function attemptPin(employeeId: string, entered: string, nowMin: number): PinResult {
  const d = workforceStore.get();
  const res = checkPin(d.kiosk.locks[employeeId], d.kiosk.rules, toAbs(TODAY, nowMin), entered, d.kiosk.pins[employeeId]);
  workforceStore.mutate((x) => { x.kiosk.locks[employeeId] = res.lock; });
  return res;
}
export function setPin(employeeId: string, pin: string): Result {
  if (!/^[0-9]{4}$/.test(pin)) return bad('A PIN is exactly 4 digits.');
  workforceStore.mutate((d) => { d.kiosk.pins[employeeId] = pin; d.kiosk.locks[employeeId] = { tries: 0 }; });
  return okay(undefined);
}
export function unlockPerson(employeeId: string): void {
  workforceStore.mutate((d) => { d.kiosk.locks[employeeId] = { tries: 0 }; });
}

/** Record a punch from the kiosk. The outcome says what happened, in words for the person at the gate. */
export function recordPunch(i: { employeeId: string; direction: PunchDirection; deviceId: string; nowMin: number }): Result<PunchOutcome> {
  const db = getDb();
  const e = db.employees.find((x) => x.id === i.employeeId);
  if (!e) return bad('This person was not found.');
  const d = workforceStore.get();
  const dev = d.kiosk.devices.find((x) => x.id === i.deviceId);
  if (!dev || dev.status !== 'active') return bad('This tablet is disabled. Ask HR.');
  const plan = planFor(db, e, TODAY);
  const mine = counted(d.kiosk.punches.filter((p) => p.employeeId === e.id));
  const last = mine[mine.length - 1];
  // Closing an open IN is always fine, even on a day the roster has the person off (the night shift runs past midnight).
  const closing = i.direction === 'out' && last?.direction === 'in';
  const outcome = evaluatePunch({
    rules: d.kiosk.rules, now: { date: TODAY, minute: i.nowMin }, direction: i.direction, shift: plan.shift,
    rosterOff: plan.off && !closing, last: last ? { date: last.date, minute: last.minute, direction: last.direction } : undefined,
  });
  workforceStore.mutate((x) => {
    const id = nextId('pn', x.kiosk.punches.map((p) => p.id));
    const p = {
      id, employeeId: e.id, date: TODAY, minute: i.nowMin, direction: i.direction, deviceId: i.deviceId, result: outcome.result, flags: outcome.flags, source: 'kiosk' as const,
      note: outcome.result === 'ignored' ? 'Double tap, ignored' : undefined,
    };
    x.kiosk.punches.push(p);
    const ex = outcome.result === 'flagged' ? exceptionFromPunch(p, fullName(e)) : null;
    if (ex && !x.kiosk.exceptions.some((q) => q.key === ex.key)) x.kiosk.exceptions.push({ ...ex, id: nextId('kx', x.kiosk.exceptions.map((q) => q.id)) });
    const device = x.kiosk.devices.find((q) => q.id === i.deviceId);
    if (device) { device.lastSeenDate = TODAY; device.lastSeenMin = i.nowMin; }
    x.kiosk.clockMin = Math.max(x.kiosk.clockMin, i.nowMin);
  });
  return okay(outcome);
}

export function touchDevice(deviceId: string, nowMin: number): void {
  workforceStore.mutate((d) => {
    const dev = d.kiosk.devices.find((x) => x.id === deviceId);
    if (dev) { dev.lastSeenDate = TODAY; dev.lastSeenMin = nowMin; }
  });
}
export function addDevice(name: string, location: string): Result<string> {
  const n = name.trim();
  const l = location.trim();
  if (n.length < 3) return bad('Give the tablet a name, at least 3 characters.');
  if (workforceStore.get().kiosk.devices.some((x) => x.name.toLowerCase() === n.toLowerCase())) return bad('A tablet with this name already exists.');
  if (l.length < 3) return bad('Say where the tablet is, for example the main gate.');
  let id = '';
  workforceStore.mutate((d) => {
    id = nextId('dev', d.kiosk.devices.map((x) => x.id));
    const dev: KioskDevice = { id, name: n, location: l, status: 'active', lastSeenDate: TODAY, lastSeenMin: d.kiosk.clockMin, addedOn: TODAY };
    d.kiosk.devices.push(dev);
  });
  return okay(id);
}
export function setDeviceStatus(deviceId: string, status: KioskDevice['status']): void {
  workforceStore.mutate((d) => { const dev = d.kiosk.devices.find((x) => x.id === deviceId); if (dev) dev.status = status; });
}

/** Raise an exception for every person whose OUT is overdue. Safe to call again and again: each one is raised once. */
export function sweepMissingOuts(): number {
  const d = workforceStore.get();
  const found = findMissingOuts(getDb(), d.kiosk, toAbs(TODAY, d.kiosk.clockMin)).filter((m) => !d.kiosk.exceptions.some((x) => x.key === m.key));
  if (!found.length) return 0;
  workforceStore.mutate((x) => {
    for (const m of found) {
      if (x.kiosk.exceptions.some((q) => q.key === m.key)) continue;
      x.kiosk.exceptions.push({ id: nextId('kx', x.kiosk.exceptions.map((q) => q.id)), key: m.key, kind: 'missing_out', employeeId: m.employeeId, date: m.date, detail: m.detail, punchId: m.punchId, status: 'open' });
    }
  });
  return found.length;
}

/** Close an exception with a note. For a missing OUT, HR can also enter the real OUT time, which adds a correction punch. */
export function resolveException(id: string, note: string, correctedOutMin?: number): Result {
  if (note.trim().length < 8) return bad('Write what you found, in a few words.');
  const d = workforceStore.get();
  const ex = d.kiosk.exceptions.find((x) => x.id === id);
  if (!ex || ex.status !== 'open') return bad('This exception is already closed.');
  workforceStore.mutate((x) => {
    const e = x.kiosk.exceptions.find((q) => q.id === id)!;
    e.status = 'resolved'; e.resolvedBy = ACTOR; e.resolvedOn = TODAY; e.resolution = note.trim();
    if (correctedOutMin != null && e.kind === 'missing_out') {
      const orig = x.kiosk.punches.find((p) => p.id === e.punchId);
      // A night shift's OUT falls on the morning after the IN.
      const inAbs = orig ? toAbs(orig.date, orig.minute) : 0;
      const sameDay = toAbs(orig?.date ?? TODAY, correctedOutMin);
      const abs = sameDay > inAbs ? sameDay : sameDay + 1440;
      const at = fromAbs(abs);
      x.kiosk.punches.push({
        id: nextId('pn', x.kiosk.punches.map((p) => p.id)), employeeId: e.employeeId, date: at.date, minute: at.minute, direction: 'out',
        deviceId: orig?.deviceId ?? 'dev_gate', result: 'accepted', flags: [], source: 'correction', note: `Added by HR: ${note.trim()}`,
      });
    }
  });
  return okay(undefined);
}

export function peopleForKiosk() { return kioskPeople(getDb()); }

// ═════════════════════════════ verified onboarding ═════════════════════════════
/** Run one simulated check. `consent` must be true: the person has agreed to this check. */
export function runVerifyStep(i: { caseId: string; key: StepKey; inputs?: Partial<VerifyInputs>; aadhaar?: string; consent: boolean }): Result<{ status: string; evidence: string }> {
  if (!i.consent) return bad('Tick the consent box first. The check runs only with the person’s consent.');
  const c0 = workforceStore.get().verify.cases.find((x) => x.id === i.caseId);
  if (!c0) return bad('This case was not found.');
  if (c0.cleared) return bad('This person is already cleared to join.');
  const inputs: VerifyInputs = { ...c0.inputs, ...(i.inputs ?? {}) };
  const res = runCheck({ key: i.key, name: c0.name, inputs, aadhaar: i.aadhaar, runsSoFar: c0.steps[i.key].runs });
  workforceStore.mutate((d) => {
    const c = d.verify.cases.find((x) => x.id === i.caseId)!;
    c.inputs = inputs;
    c.steps[i.key] = {
      status: res.status, evidence: res.evidence, compare: res.compare, ranAt: TODAY, ranBy: ACTOR, runs: c.steps[i.key].runs + 1, consentAt: TODAY,
    };
    if (res.aadhaarLast4) c.aadhaarLast4 = res.aadhaarLast4;
    if (res.results) c.results = { ...c.results, ...res.results };
  });
  return okay({ status: res.status, evidence: res.evidence });
}
export function acceptMismatch(caseId: string, key: StepKey, reason: string): Result {
  if (reason.trim().length < 10) return bad('Give a reason of at least 10 characters. It is kept on the record.');
  let done = false;
  workforceStore.mutate((d) => {
    const s = d.verify.cases.find((x) => x.id === caseId)?.steps[key];
    if (!s || s.status !== 'mismatch') return;
    s.accepted = { reason: reason.trim(), by: ACTOR, on: TODAY }; done = true;
  });
  return done ? okay(undefined) : bad('Only a mismatch can be accepted.');
}
export function requestCorrection(caseId: string, key: StepKey, note: string): Result {
  if (note.trim().length < 5) return bad('Say what needs correcting.');
  let done = false;
  workforceStore.mutate((d) => {
    const s = d.verify.cases.find((x) => x.id === caseId)?.steps[key];
    if (!s || s.status !== 'mismatch') return;
    s.correction = { note: note.trim(), by: ACTOR, on: TODAY }; s.accepted = undefined; done = true;
  });
  return done ? okay(undefined) : bad('Only a mismatch can have a correction requested.');
}

/**
 * Clear a person to join once every mandatory check is done. When the person already has an employee record, the verified
 * details are written to it, so the Employees page and the statutory completeness figure reflect them.
 */
export function clearToJoin(caseId: string): Result<{ wroteToEmployee: boolean }> {
  const c = workforceStore.get().verify.cases.find((x) => x.id === caseId);
  if (!c) return bad('This case was not found.');
  if (c.cleared) return bad('Already cleared.');
  const r = readiness(c);
  if (!r.canClear) return bad(`Not ready: ${r.blocking.map((b) => b.label).join(', ')} still open.`);
  let wrote = false;
  const emp = c.employeeId ? getDb().employees.find((e) => e.id === c.employeeId) : undefined;
  if (emp) {
    const proofTypes: EmployeeDocument['type'][] = ['pan_card', 'aadhaar', 'bank_proof'];
    updateEmployee(emp.id, {
      pan: c.inputs.pan.replace(/\s+/g, '').toUpperCase(),
      aadhaarLast4: c.aadhaarLast4,
      aadhaarVerified: true,
      uan: c.results.uan ?? emp.uan,
      uanStatus: c.results.uanStatus ?? emp.uanStatus,
      bank: { accountHolder: c.inputs.accountHolder.trim() || c.name, accountNumber: c.inputs.bankAccount.replace(/\s+/g, ''), ifsc: c.inputs.ifsc.replace(/\s+/g, '').toUpperCase(), bankName: c.results.bankName ?? '', accountType: 'savings' },
      documents: emp.documents.map((doc) => (proofTypes.includes(doc.type) ? { ...doc, status: 'verified' as const, uploadedOn: TODAY } : doc)),
    });
    wrote = true;
  }
  workforceStore.mutate((d) => {
    const x = d.verify.cases.find((q) => q.id === caseId);
    if (x) x.cleared = { by: ACTOR, on: TODAY, wroteToEmployee: wrote };
  });
  return okay({ wroteToEmployee: wrote });
}
