// Pure helpers for the Integrity checks page. No React, no storage. The flags come from the field engines; the
// decisions people make about them come from the field store. This file merges the two, filters and counts them, and
// builds the small pieces of evidence each kind of flag shows next to its sentences.
//
// Ethics baked in: flags are advisory, they never change pay or attendance, the employee can reply before anything is
// decided, and nothing here ranks people or scores them. Counts are by flag, never by person.

import type { Id } from '../types';
import { INTEGRITY_RULES, dayEvidence } from '../field/engines';
import { haversineKm, toMin } from '../field/evidence';
import type { ExpenseClaim, FieldEvidence, FlagType, IntegrityFlag, Punch, Severity, Visit } from '../field/types';
import type { FlagReview, FlagStatus } from '../field/store';

export interface FlagRow extends IntegrityFlag {
  status: FlagStatus;
  review?: FlagReview;
  /** True when the employee's reply is on record. */
  replied: boolean;
}

export const FLAG_STATUSES: FlagStatus[] = ['open', 'cleared', 'confirmed', 'escalated'];
export const STATUS_LABEL: Record<FlagStatus, string> = { open: 'Open', cleared: 'Cleared', confirmed: 'Confirmed', escalated: 'Escalated' };
export const SEVERITIES: Severity[] = ['high', 'warning', 'info'];

/** The engine writes "emp_20" in its sentences. People read names, so swap each id for the person's name. */
export function humanise(text: string, nameOf: (id: Id) => string): string {
  return text.replace(/\bemp_\d+\b/g, (id) => nameOf(id));
}

export function mergeFlags(flags: IntegrityFlag[], reviews: Record<string, FlagReview>, nameOf?: (id: Id) => string): FlagRow[] {
  const h = (t: string) => (nameOf ? humanise(t, nameOf) : t);
  return flags.map((f) => {
    const review = reviews[f.id];
    return { ...f, title: h(f.title), evidence: f.evidence.map(h), suggestion: h(f.suggestion), status: review?.status ?? 'open', review, replied: !!review?.reply?.text };
  });
}

export interface FlagFilters { type: string; severity: string; status: string; person: string; q: string }
export const NO_FILTERS: FlagFilters = { type: 'all', severity: 'all', status: 'all', person: 'all', q: '' };

export function filterFlags(rows: FlagRow[], f: FlagFilters, nameOf: (id: Id) => string): FlagRow[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.severity !== 'all' && r.severity !== f.severity) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.person !== 'all' && !r.involves.includes(f.person)) return false;
    if (needle && !`${r.title} ${r.evidence.join(' ')} ${r.involves.map(nameOf).join(' ')}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function flagStats(rows: FlagRow[]) {
  const bySeverity: Record<Severity, number> = { high: 0, warning: 0, info: 0 };
  const byStatus: Record<FlagStatus, number> = { open: 0, cleared: 0, confirmed: 0, escalated: 0 };
  for (const r of rows) { bySeverity[r.severity]++; byStatus[r.status]++; }
  return { total: rows.length, bySeverity, byStatus };
}

// ───────────────────────────── the right of reply ─────────────────────────────
export const NO_REPLY_DAYS = 2;
/**
 * A flag cannot be confirmed (decided against the person) until the person has had the chance to reply: either the
 * reply is on record, or the reviewer says they asked and heard nothing for two working days.
 */
export function confirmGate(row: { replied: boolean }, ackNoReply: boolean): { allowed: boolean; reason: string } {
  if (row.replied) return { allowed: true, reason: 'The employee has replied, so the reply is on record.' };
  if (ackNoReply) return { allowed: true, reason: `You have said the employee was asked and did not reply within ${NO_REPLY_DAYS} working days.` };
  return { allowed: false, reason: `Confirm is off until the employee's reply is on record, or you tick that they were asked and did not reply within ${NO_REPLY_DAYS} working days.` };
}
export const NO_REPLY_NOTE = `Reviewer confirms the employee was asked and did not reply within ${NO_REPLY_DAYS} working days.`;

/** Note text to store with a decision. A confirm made without a reply carries the reviewer's statement. */
export function decisionNote(note: string, usedNoReplyTick: boolean): string | undefined {
  const text = note.trim();
  const parts = [text, usedNoReplyTick ? NO_REPLY_NOTE : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

// ───────────────────────────── the thresholds, in words ─────────────────────────────
export function ruleRows(ev: FieldEvidence): { type: FlagType; looksAt: string; thresholds: { label: string; value: string }[] }[] {
  const R = INTEGRITY_RULES, T = ev.travel;
  return [
    { type: 'impossible_travel', looksAt: 'Two verified check-ins on one day that are too far apart for the time between them.',
      thresholds: [{ label: 'Speed limit, straight line', value: `${R.maxSpeedKmh} km/h` }] },
    { type: 'punch_visit_mismatch', looksAt: 'Punched in and out, but nothing shows work (no verified visit and almost no movement). Or work that began long before the punch-in.',
      thresholds: [{ label: 'Almost no movement', value: `under ${R.idleTrailKm} km` }, { label: 'Work before punch-in', value: `more than ${R.visitOutsidePunchMin} min` }] },
    { type: 'fuel_route_mismatch', looksAt: "A fuel claim far above what the day's GPS distance could burn.",
      thresholds: [{ label: 'Allowed', value: `${R.fuelToleranceFactor} times the expected fuel plus ₹${R.fuelToleranceRupees}` }, { label: 'Sample fuel rate', value: `₹${T.fuelRatePerKm.bike}/km bike, ₹${T.fuelRatePerKm.car}/km car` }] },
    { type: 'receipt_reuse', looksAt: 'The same receipt image on two claims, by one person or two.',
      thresholds: [{ label: 'Match', value: 'same receipt fingerprint' }] },
    { type: 'odometer_mismatch', looksAt: "The odometer photos show far more distance than the GPS trail, on a day the phone had signal all day.",
      thresholds: [{ label: 'Odometer above trail by', value: `${R.odometerOverTrailFactor} times plus ${R.odometerMinExtraKm} km` }, { label: 'A GPS gap of', value: `${R.gapExplainsMin} min or more explains it` }] },
    { type: 'device_shared', looksAt: "A punch made from a phone that is registered to someone else.",
      thresholds: [{ label: 'Match', value: 'device id belongs to another person' }] },
  ];
}

// ───────────────────────────── the evidence behind each kind of flag ─────────────────────────────
/** impossible_travel: the two check-ins that are too far apart. */
export function travelPair(ev: FieldEvidence, f: Pick<IntegrityFlag, 'employeeId' | 'date'>): { a: Visit; b: Visit; km: number; mins: number; kmh: number } | null {
  const d = dayEvidence(ev, f.employeeId, f.date);
  for (let i = 1; i < d.verifiedVisits.length; i++) {
    const a = d.verifiedVisits[i - 1]!, b = d.verifiedVisits[i]!;
    const km = haversineKm(a.pos, b.pos);
    const mins = Math.max(1, toMin(b.start) - toMin(a.end));
    const kmh = (km / mins) * 60;
    if (kmh > INTEGRITY_RULES.maxSpeedKmh) return { a, b, km, mins, kmh };
  }
  return null;
}

/** receipt_reuse: every claim that carries the fingerprint in the flag id. */
export function claimsForReceipt(ev: FieldEvidence, flagId: string): ExpenseClaim[] {
  const hash = flagId.split(':')[1];
  return ev.claims.filter((c) => c.receiptHash === hash).sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
}

/** device_shared: the punches on that day made from the shared device, with the device id and its registered owner. */
export function devicePunches(ev: FieldEvidence, f: Pick<IntegrityFlag, 'involves' | 'date' | 'employeeId'>): { punches: Punch[]; deviceId?: string; ownerId?: Id } {
  const owner = f.involves.find((id) => id !== f.employeeId);
  const punches = ev.punches.filter((p) => p.date === f.date && f.involves.includes(p.employeeId));
  const mine = punches.find((p) => p.employeeId === f.employeeId);
  return { punches, deviceId: mine?.deviceId, ownerId: owner };
}

/** fuel_route_mismatch and odometer_mismatch: the day's numbers side by side. */
export function dayNumbers(ev: FieldEvidence, f: Pick<IntegrityFlag, 'employeeId' | 'date'>) {
  const d = dayEvidence(ev, f.employeeId, f.date);
  const rep = ev.reps.find((r) => r.employeeId === f.employeeId);
  const odo = ev.odometer.find((o) => o.employeeId === f.employeeId && o.date === f.date);
  const rate = rep && rep.vehicle !== 'public' ? ev.travel.fuelRatePerKm[rep.vehicle] : 0;
  const claimed = d.claims.filter((c) => c.category === 'fuel').reduce((s, c) => s + c.amount, 0);
  return {
    vehicle: rep?.vehicle ?? 'public', trailKm: d.trailKm, gapMin: d.trailGapMin, odometerKm: d.odometerKm, startKm: odo?.startKm, endKm: odo?.endKm,
    fuelClaimed: claimed, fuelExpected: Math.round(d.trailKm * rate), fuelRate: rate,
  };
}
