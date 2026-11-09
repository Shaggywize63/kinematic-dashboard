// Contract labour checks. Pure functions: no React, no storage, no network.
//
// The principal employer carries the risk when a contractor does not pay the minimum wage or deposit PF and ESI, so the
// page is about proof. Every check below says what it found in plain words. The risk level is a rule over those
// findings (see assessRisk), not a score. The legal references are tagged `indicative`: confirm them with an advisor.

import type { HrmsDb, ISODate, Month } from '../types';
import { MIN_WAGES, monthEnd, monthStart, type Confidence, type MinWage } from '../rules';
import { diffDays, fmtDate, fmtMonth, fullName, inr } from '../format';
import type { ContractData, Contractor, ContractInvoice, Proof, ProofKind, Skill } from './types';

export const CONTRACT_MONTHS: Month[] = ['2026-09', '2026-10'];
/** Minimum wages are monthly figures. A worker who came for fewer days is held to a pro-rated figure over this many days. */
export const WORKING_DAYS = 26;
export const LICENCE_WARN_DAYS = 60;

export const SKILL_LABEL: Record<Skill, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled' };

export interface ProofSpec { kind: ProofKind; label: string; plain: string; legal: string; serious: boolean }
/** The six proofs a principal employer should hold for each contractor, each month. */
export const PROOF_SPECS: ProofSpec[] = [
  { kind: 'wage_payment', label: 'Wage payment proof', plain: 'Bank transfer statement showing what each worker was paid for the month.', legal: 'If the contractor does not pay wages, the principal employer can be asked to pay them (Code on Wages, contract labour provisions).', serious: false },
  { kind: 'pf_challan', label: 'PF challan and return', plain: 'Proof that the contractor deposited provident fund for these workers.', legal: 'Contractors register and deposit PF for their workers. The principal employer can be asked to cover a default (EPF law).', serious: true },
  { kind: 'esi_challan', label: 'ESI challan', plain: 'Proof that the contractor paid the ESI contribution for the covered workers.', legal: 'Contractors pay ESI for covered workers. The principal employer can be asked to cover a default (ESI law).', serious: true },
  { kind: 'wage_register', label: 'Wage register', plain: "The contractor's register of wages paid, for the month.", legal: 'A wage register is a record the contract labour rules ask for (confirm the exact record with your advisor).', serious: false },
  { kind: 'attendance_register', label: 'Attendance register', plain: 'The register of days each worker came to site.', legal: 'An attendance record is expected for contract workers (confirm the exact record with your advisor).', serious: false },
  { kind: 'licence_copy', label: 'Licence copy', plain: "A copy of the contractor's licence that covers the month.", legal: 'A contractor needs a licence to supply contract labour. The principal employer checks it (contract labour law).', serious: false },
];
export const proofSpec = (k: ProofKind): ProofSpec => PROOF_SPECS.find((p) => p.kind === k)!;

// ───────────────────────────── licence ─────────────────────────────
export function licenceCoverage(c: Pick<Contractor, 'licenceFrom' | 'licenceTo'>, month: Month): { covered: number; total: number } {
  const start = monthStart(month);
  const end = monthEnd(month);
  const total = diffDays(start, end) + 1;
  const from = c.licenceFrom > start ? c.licenceFrom : start;
  const to = c.licenceTo < end ? c.licenceTo : end;
  const covered = to < from ? 0 : diffDays(from, to) + 1;
  return { covered, total };
}

export type LicenceState = 'valid' | 'expiring' | 'expired' | 'not_started';
export function licenceToday(c: Pick<Contractor, 'licenceFrom' | 'licenceTo'>, today: ISODate): { state: LicenceState; days: number } {
  if (today < c.licenceFrom) return { state: 'not_started', days: diffDays(today, c.licenceFrom) };
  if (today > c.licenceTo) return { state: 'expired', days: diffDays(c.licenceTo, today) };
  const left = diffDays(today, c.licenceTo);
  return { state: left <= LICENCE_WARN_DAYS ? 'expiring' : 'valid', days: left };
}

// ───────────────────────────── minimum wage ─────────────────────────────
export function minWageEntry(state: string, skill: Skill): MinWage | undefined {
  return MIN_WAGES.find((m) => m.state === state && m.skill === skill);
}
/** Monthly minimum scaled to the days worked (capped at a full month). */
export function requiredWage(monthly: number, days: number): number {
  return Math.round(monthly * Math.min(1, Math.max(0, days) / WORKING_DAYS));
}

export interface WorkerLine {
  key: string;
  name: string;
  skill: Skill;
  source: 'contractor' | 'hr';       // contractor's own list, or an employee in the core HR records
  employeeId?: string;
  days: number;
  wagePaid: number;
}

export interface WorkerResult extends WorkerLine {
  minMonthly: number | null;
  required: number | null;
  confidence?: Confidence;
  shortfall: number;
  status: 'ok' | 'below' | 'unknown' | 'absent';
}

/** Workers deployed by a contractor in a month: the contractor's list plus contract workers from the HR records. */
export function workerLines(db: HrmsDb, data: ContractData, contractorId: string, month: Month): WorkerLine[] {
  const own: WorkerLine[] = data.workers.filter((w) => w.contractorId === contractorId).map((w) => ({
    key: w.id, name: w.name, skill: w.skill, source: 'contractor' as const, days: w.days[month] ?? 0, wagePaid: w.wagePaid[month] ?? 0,
  }));
  const core: WorkerLine[] = [];
  for (const a of data.coreAssignments.filter((x) => x.contractorId === contractorId)) {
    const e = db.employees.find((x) => x.id === a.employeeId);
    if (!e || e.employmentType !== 'contract') continue;
    const att = db.attendance.find((x) => x.employeeId === e.id && x.month === month);
    const slip = db.payRuns.filter((r) => r.month === month).flatMap((r) => r.payslips).find((s) => s.employeeId === e.id);
    core.push({ key: e.id, name: fullName(e), skill: a.skill, source: 'hr', employeeId: e.id, days: att?.presentDays ?? 0, wagePaid: slip?.gross ?? 0 });
  }
  return [...own, ...core];
}

export function testWage(w: WorkerLine, state: string): WorkerResult {
  const entry = minWageEntry(state, w.skill);
  if (w.days <= 0) return { ...w, minMonthly: entry?.monthly ?? null, required: null, confidence: entry?.confidence, shortfall: 0, status: 'absent' };
  if (!entry) return { ...w, minMonthly: null, required: null, shortfall: 0, status: 'unknown' };
  const required = requiredWage(entry.monthly, w.days);
  const shortfall = Math.max(0, required - w.wagePaid);
  return { ...w, minMonthly: entry.monthly, required, confidence: entry.confidence, shortfall, status: shortfall > 0 ? 'below' : 'ok' };
}

// ───────────────────────────── checks ─────────────────────────────
export type CheckId = 'licence' | 'licence_today' | 'min_wage' | 'headcount' | 'pf_proof' | 'esi_proof' | 'other_proofs' | 'codes';
export interface CheckResult {
  id: CheckId;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'serious' | 'moderate';
  detail: string;
  confidence?: Confidence;
}

export interface CheckInput {
  contractor: Contractor;
  month: Month;
  today: ISODate;
  workers: WorkerLine[];
  invoice?: Pick<ContractInvoice, 'headcount' | 'amount'>;
  proofs: Proof[];            // this contractor's proofs for this month
}

const held = (p?: Proof) => p?.status === 'received';
const proofFor = (proofs: Proof[], kind: ProofKind) => proofs.find((p) => p.kind === kind);
const names = (list: string[], max = 3) => (list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} and ${list.length - max} more`);

export function attendanceHeadcount(workers: WorkerLine[]): number { return workers.filter((w) => w.days > 0).length; }

export function runChecks(i: CheckInput): CheckResult[] {
  const { contractor: c, month, today } = i;
  const out: CheckResult[] = [];

  // 1. Licence covers the month.
  const cov = licenceCoverage(c, month);
  out.push(cov.covered === cov.total
    ? { id: 'licence', label: 'Licence covers the month', status: 'pass', severity: 'serious', detail: `Licence ${c.licenceNo} is valid for all ${cov.total} days of ${fmtMonth(month)} (${fmtDate(c.licenceFrom)} to ${fmtDate(c.licenceTo)}).` }
    : { id: 'licence', label: 'Licence covers the month', status: 'fail', severity: 'serious', detail: `Licence ${c.licenceNo} covers ${cov.covered} of ${cov.total} days of ${fmtMonth(month)} (valid ${fmtDate(c.licenceFrom)} to ${fmtDate(c.licenceTo)}).` });

  // 2. Licence today (the contractor is still on site).
  const lt = licenceToday(c, today);
  if (lt.state === 'expired') out.push({ id: 'licence_today', label: 'Licence valid today', status: 'fail', severity: 'serious', detail: `The licence expired on ${fmtDate(c.licenceTo)}, ${lt.days} ${lt.days === 1 ? 'day' : 'days'} ago, and workers are still deployed.` });
  else if (lt.state === 'not_started') out.push({ id: 'licence_today', label: 'Licence valid today', status: 'fail', severity: 'serious', detail: `The licence starts on ${fmtDate(c.licenceFrom)}, in ${lt.days} days.` });
  else if (lt.state === 'expiring') out.push({ id: 'licence_today', label: 'Licence valid today', status: 'warn', severity: 'moderate', detail: `The licence runs out on ${fmtDate(c.licenceTo)}, in ${lt.days} days. Ask for the renewal.` });
  else out.push({ id: 'licence_today', label: 'Licence valid today', status: 'pass', severity: 'moderate', detail: `Valid until ${fmtDate(c.licenceTo)} (${lt.days} days left).` });

  // 3. Minimum wage.
  const results = i.workers.map((w) => testWage(w, c.state));
  const below = results.filter((r) => r.status === 'below');
  const unknown = results.filter((r) => r.status === 'unknown');
  const tested = results.filter((r) => r.status === 'ok' || r.status === 'below');
  const conf: Confidence | undefined = results.find((r) => r.confidence)?.confidence;
  if (below.length) {
    out.push({
      id: 'min_wage', label: 'Wages at or above the minimum', status: 'fail', severity: 'serious', confidence: conf,
      detail: `${below.length} of ${tested.length} ${tested.length === 1 ? 'worker was' : 'workers were'} paid under the sample minimum: ${names(below.map((r) => `${r.name} (${inr(r.wagePaid)} paid, ${inr(r.required)} needed)`))}.`,
    });
  } else if (unknown.length) {
    out.push({ id: 'min_wage', label: 'Wages at or above the minimum', status: 'warn', severity: 'moderate', confidence: conf, detail: `There is no sample minimum for ${names(unknown.map((r) => `${r.name} (${SKILL_LABEL[r.skill].toLowerCase()}, ${c.state})`))}, so those wages could not be tested.` });
  } else if (!tested.length) {
    out.push({ id: 'min_wage', label: 'Wages at or above the minimum', status: 'warn', severity: 'moderate', detail: 'No worker has attendance this month, so there is nothing to test.' });
  } else {
    out.push({ id: 'min_wage', label: 'Wages at or above the minimum', status: 'pass', severity: 'serious', confidence: conf, detail: `All ${tested.length} ${tested.length === 1 ? 'worker was' : 'workers were'} paid at or above the sample minimum for ${c.state}.` });
  }

  // 4. Headcount billed vs headcount on attendance.
  const onAtt = attendanceHeadcount(i.workers);
  if (!i.invoice) out.push({ id: 'headcount', label: 'Invoice headcount matches attendance', status: 'warn', severity: 'moderate', detail: `No invoice is recorded for ${fmtMonth(month)}. Attendance shows ${onAtt} ${onAtt === 1 ? 'person' : 'people'}.` });
  else if (i.invoice.headcount === onAtt) out.push({ id: 'headcount', label: 'Invoice headcount matches attendance', status: 'pass', severity: 'moderate', detail: `The invoice bills ${i.invoice.headcount} ${i.invoice.headcount === 1 ? 'person' : 'people'} and attendance shows the same.` });
  else if (i.invoice.headcount > onAtt) out.push({ id: 'headcount', label: 'Invoice headcount matches attendance', status: 'fail', severity: 'moderate', detail: `The invoice bills ${i.invoice.headcount} people but attendance shows ${onAtt}. That is ${i.invoice.headcount - onAtt} more than came to site.` });
  else out.push({ id: 'headcount', label: 'Invoice headcount matches attendance', status: 'warn', severity: 'moderate', detail: `Attendance shows ${onAtt} people but the invoice bills ${i.invoice.headcount}. ${onAtt - i.invoice.headcount} on site may not be on the invoice (or on the PF and ESI returns).` });

  // 5 and 6. PF and ESI proof present for the month.
  for (const [kind, id, label] of [['pf_challan', 'pf_proof', 'PF proof for the month'], ['esi_challan', 'esi_proof', 'ESI proof for the month']] as const) {
    const p = proofFor(i.proofs, kind);
    const spec = proofSpec(kind);
    if (held(p)) out.push({ id, label, status: 'pass', severity: 'serious', detail: `${spec.label} received${p?.fileName ? ` (${p.fileName})` : ''}${p?.verifiedBy ? `, verified by ${p.verifiedBy}` : ', not yet verified'}.` });
    else if (p?.status === 'rejected') out.push({ id, label, status: 'fail', severity: 'serious', detail: `${spec.label} was rejected${p.rejectReason ? `: ${p.rejectReason}` : ''}. Ask the contractor for a correct copy.` });
    else out.push({ id, label, status: 'fail', severity: 'serious', detail: `${spec.label} for ${fmtMonth(month)} has not been received.` });
  }

  // 7. The other four proofs.
  const others = PROOF_SPECS.filter((s) => s.kind !== 'pf_challan' && s.kind !== 'esi_challan');
  const lacking = others.filter((s) => !held(proofFor(i.proofs, s.kind)));
  out.push(lacking.length
    ? { id: 'other_proofs', label: 'Other proofs held', status: 'fail', severity: 'moderate', detail: `${lacking.length} of ${others.length} other proofs are not held: ${lacking.map((s) => s.label.toLowerCase()).join(', ')}.` }
    : { id: 'other_proofs', label: 'Other proofs held', status: 'pass', severity: 'moderate', detail: `All ${others.length} other proofs are held.` });

  // 8. PF and ESI codes known.
  const noCode = [!c.pfCode.trim() && 'PF code', !c.esiCode.trim() && 'ESI code'].filter(Boolean) as string[];
  out.push(noCode.length
    ? { id: 'codes', label: 'PF and ESI codes on file', status: 'fail', severity: 'moderate', detail: `Missing: ${noCode.join(' and ')}. Without them the challans cannot be matched to the contractor.` }
    : { id: 'codes', label: 'PF and ESI codes on file', status: 'pass', severity: 'moderate', detail: `PF ${c.pfCode}, ESI ${c.esiCode}.` });

  return out;
}

// ───────────────────────────── risk and advice ─────────────────────────────
export type RiskLevel = 'low' | 'medium' | 'high';
export interface RiskReason { id: CheckId; severity: 'serious' | 'moderate'; text: string }
export interface Risk { level: RiskLevel; reasons: RiskReason[]; serious: number; moderate: number }

/**
 * The rule, in words: HIGH when two or more serious findings exist, or one serious finding together with two or more
 * moderate ones. MEDIUM when there is one serious finding or any moderate finding. LOW when everything passes.
 * Serious means a finding that can put the principal employer on the hook: licence, minimum wage, PF or ESI proof.
 */
export function assessRisk(checks: CheckResult[]): Risk {
  const bad = checks.filter((c) => c.status !== 'pass');
  const serious = bad.filter((c) => c.severity === 'serious');
  const moderate = bad.filter((c) => c.severity === 'moderate');
  const level: RiskLevel = serious.length >= 2 || (serious.length >= 1 && moderate.length >= 2) ? 'high' : serious.length === 1 || moderate.length >= 1 ? 'medium' : 'low';
  return { level, serious: serious.length, moderate: moderate.length, reasons: [...serious, ...moderate].map((c) => ({ id: c.id, severity: c.severity, text: c.detail })) };
}

export interface Advice { advice: 'hold' | 'review' | 'clear'; missing: ProofSpec[]; headline: string; detail: string }
/** Advisory only. A person decides; the decision and the reason are stored with what was advised. */
export function adviseInvoice(checks: CheckResult[], proofs: Proof[], month: Month): Advice {
  const missing = PROOF_SPECS.filter((s) => !held(proofFor(proofs, s.kind)));
  const seriousFails = checks.filter((c) => c.status !== 'pass' && c.severity === 'serious');
  if (missing.length || seriousFails.length) {
    const parts: string[] = [];
    if (missing.length) parts.push(`${missing.length} ${missing.length === 1 ? 'proof is' : 'proofs are'} missing or rejected (${missing.map((m) => m.label.toLowerCase()).join(', ')})`);
    for (const f of seriousFails) if (f.id === 'min_wage' || f.id === 'licence' || f.id === 'licence_today') parts.push(f.label.toLowerCase() + ' failed');
    return { advice: 'hold', missing, headline: 'Hold recommended', detail: `For ${fmtMonth(month)}: ${parts.join('; ')}. Pay once they are sorted out. This is advice, you decide.` };
  }
  const moderate = checks.filter((c) => c.status !== 'pass');
  if (moderate.length) return { advice: 'review', missing, headline: 'Review before paying', detail: `All proofs are held, but ${moderate.length} ${moderate.length === 1 ? 'check needs' : 'checks need'} a look: ${moderate.map((m) => m.label.toLowerCase()).join(', ')}.` };
  return { advice: 'clear', missing, headline: 'Looks clear to pay', detail: `All proofs for ${fmtMonth(month)} are held and every check passes.` };
}

// ───────────────────────────── one contractor, one month ─────────────────────────────
export interface ContractorMonth {
  contractor: Contractor;
  month: Month;
  workers: WorkerResult[];
  invoice?: ContractInvoice;
  proofs: Proof[];
  checks: CheckResult[];
  risk: Risk;
  advice: Advice;
  attendance: number;
  decision?: ContractData['decisions'][number];
  proofsHeld: number;
}

export function assessContractor(db: HrmsDb, data: ContractData, contractorId: string, month: Month, today: ISODate): ContractorMonth | null {
  const contractor = data.contractors.find((c) => c.id === contractorId);
  if (!contractor) return null;
  const lines = workerLines(db, data, contractorId, month);
  const invoice = data.invoices.find((x) => x.contractorId === contractorId && x.month === month);
  const proofs = data.proofs.filter((p) => p.contractorId === contractorId && p.month === month);
  const checks = runChecks({ contractor, month, today, workers: lines, invoice, proofs });
  return {
    contractor, month, invoice, proofs, checks,
    workers: lines.map((w) => testWage(w, contractor.state)),
    risk: assessRisk(checks),
    advice: adviseInvoice(checks, proofs, month),
    attendance: attendanceHeadcount(lines),
    decision: data.decisions.find((d) => d.contractorId === contractorId && d.month === month),
    proofsHeld: PROOF_SPECS.filter((s) => held(proofFor(proofs, s.kind))).length,
  };
}

// ───────────────────────────── registration blockers ─────────────────────────────
export interface RegistrationBlocker { entityId: string; entityName: string; number?: string; validTo?: ISODate; daysAgo?: number; kind: 'expired' | 'missing'; sites: string[] }

/** The legal entity at each contractor's site must hold a current contract labour registration. */
export function registrationBlockers(db: HrmsDb, contractors: Contractor[], today: ISODate): RegistrationBlocker[] {
  const out: RegistrationBlocker[] = [];
  const byEntity = new Map<string, string[]>();
  for (const c of contractors) {
    const loc = db.locations.find((l) => l.id === c.locationId);
    if (!loc) continue;
    byEntity.set(loc.entityId, [...(byEntity.get(loc.entityId) ?? []), c.name]);
  }
  for (const [entityId, sites] of byEntity) {
    const ent = db.entities.find((e) => e.id === entityId);
    if (!ent) continue;
    const regs = ent.registrations.filter((r) => r.type === 'clra');
    if (!regs.length) { out.push({ entityId, entityName: ent.name, kind: 'missing', sites }); continue; }
    const current = regs.find((r) => !r.validTo || r.validTo >= today);
    if (!current) {
      const latest = [...regs].sort((a, b) => (b.validTo ?? '').localeCompare(a.validTo ?? ''))[0]!;
      out.push({ entityId, entityName: ent.name, number: latest.number, validTo: latest.validTo, daysAgo: latest.validTo ? diffDays(latest.validTo, today) : undefined, kind: 'expired', sites });
    }
  }
  return out;
}

// ───────────────────────────── portfolio numbers ─────────────────────────────
export interface PortfolioStats { contractors: number; workers: number; proofGaps: number; high: number; onHold: number; invoiceTotal: number }
export function portfolio(rows: ContractorMonth[]): PortfolioStats {
  return {
    contractors: rows.length,
    workers: rows.reduce((s, r) => s + r.attendance, 0),
    proofGaps: rows.reduce((s, r) => s + (PROOF_SPECS.length - r.proofsHeld), 0),
    high: rows.filter((r) => r.risk.level === 'high').length,
    onHold: rows.filter((r) => r.decision?.decision === 'hold').length,
    invoiceTotal: rows.reduce((s, r) => s + (r.invoice?.amount ?? 0), 0),
  };
}
