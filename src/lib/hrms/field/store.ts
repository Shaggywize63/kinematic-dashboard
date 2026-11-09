'use client';
// Decisions people make about the field evidence: regularisations, flag reviews, disputes, incentive approvals.
// The evidence itself (evidence.ts) is read-only and never stored. Pages read `fieldStore.use()` and change it
// only through the actions below, so the later API swap touches this file.

import { createAreaStore } from '../areaStore';
import { mutate as mutateDb, getDb } from '../db';
import { PREVIEW_TODAY } from '../seed';
import { uid } from '../types';
import type { Adjustment, Id, ISODate, Month } from '../types';
import { ACTOR } from '../actions';
import { computeIncentives, computeTravelAllowance } from './engines';
import { getFieldEvidence } from './evidence';

export type RegDecision = { status: 'approved' | 'rejected' | 'info_requested'; by: string; at: string; note?: string; in?: string; out?: string };
export type FlagStatus = 'open' | 'cleared' | 'confirmed' | 'escalated';
export interface FlagReview {
  status: FlagStatus; by: string; at: string; note?: string;
  /** The employee's side. A flag should never be decided before the person has had the chance to reply. */
  reply?: { text: string; at: string };
}
export interface DisputeMessage { at: string; by: string; role: 'employee' | 'hr'; text: string }
export interface Dispute {
  id: Id; employeeId: Id; kind: 'travel' | 'attendance' | 'incentive' | 'flag';
  ref: string;                               // a date, a month or a flag id, depending on kind
  raisedOn: ISODate; title: string;
  systemValue?: number; claimedValue?: number; unit?: 'km' | '₹' | 'days';
  status: 'open' | 'accepted' | 'partly_accepted' | 'rejected';
  decidedValue?: number; decisionNote?: string;
  messages: DisputeMessage[];
}
export type RunStatus = 'draft' | 'approved' | 'in_payroll';
export interface IncentiveRunState {
  status: RunStatus; approvedBy?: string; approvedAt?: string;
  holds: Record<Id, string>;                  // employeeId → reason it is held back this month
}
export interface FieldState {
  version: number;
  regularisations: Record<string, RegDecision>;   // `${employeeId}|${date}`
  flagReviews: Record<string, FlagReview>;         // by flag id
  disputes: Dispute[];
  incentiveRuns: Record<Month, IncentiveRunState>;
  travelOverrides: Record<string, { km: number; by: string; at: string; note: string }>; // `${employeeId}|${date}` → km decided in a dispute
  log: { at: string; by: string; action: string }[];
}

const nowISO = () => new Date().toISOString();
const emptyRun = (): IncentiveRunState => ({ status: 'draft', holds: {} });

function seedState(): FieldState {
  return {
    version: 1,
    regularisations: {},
    flagReviews: {
      // One already settled, one waiting on a reply, so the review screens do not start empty or all-open.
      'punch_visit_mismatch:emp_4:2026-10-29': { status: 'cleared', by: 'Tanvi Kapoor', at: '2026-10-30T10:12:00.000Z', note: 'Late punch. Start time regularised to 09:55.' },
      'device_shared:emp_19:2026-10-06': { status: 'open', by: ACTOR, at: '2026-11-04T09:30:00.000Z', reply: { text: 'My phone was at the service centre that week and Farhan and I were at the same site. I should have raised a device change.', at: '2026-11-05T08:10:00.000Z' } },
    },
    disputes: [{
      id: 'disp_seed_1', employeeId: 'emp_8', kind: 'travel', ref: '2026-10-16', raisedOn: '2026-11-03', title: 'Travel distance on 16 Oct looks too low',
      systemValue: undefined, claimedValue: undefined, unit: 'km', status: 'open',
      messages: [{ at: '2026-11-03T07:45:00.000Z', by: 'Karthik Subramanian', role: 'employee', text: 'My phone died around 1 pm and I covered two beats that day. Odometer photos at 9:20 and 19:05 are attached. The trail only shows part of it.' }],
    }],
    incentiveRuns: {},
    travelOverrides: {},
    log: [],
  };
}

export const fieldStore = createAreaStore<FieldState>('field', 1, () => {
  const s = seedState();
  // Fill the seeded dispute with the numbers the engine actually computes, so the story and the screen agree.
  const ev = getFieldEvidence();
  const day = computeTravelAllowance(ev, 'emp_8', '2026-10').days.find((d) => d.date === '2026-10-16');
  if (day) { s.disputes[0]!.systemValue = day.payableKm; s.disputes[0]!.claimedValue = day.odometerKm; }
  return s;
});

const addLog = (d: FieldState, action: string) => { d.log.unshift({ at: nowISO(), by: ACTOR, action }); };

// ───────────────────────────── attendance regularisation ─────────────────────────────
export function decideRegularisation(employeeId: Id, date: ISODate, status: RegDecision['status'], opts: { note?: string; in?: string; out?: string } = {}): void {
  fieldStore.mutate((d) => {
    d.regularisations[`${employeeId}|${date}`] = { status, by: ACTOR, at: nowISO(), ...opts };
    addLog(d, `Regularisation ${status.replace('_', ' ')}: ${employeeId} on ${date}`);
  });
}
export function undoRegularisation(employeeId: Id, date: ISODate): void {
  fieldStore.mutate((d) => { delete d.regularisations[`${employeeId}|${date}`]; addLog(d, `Regularisation reopened: ${employeeId} on ${date}`); });
}

// ───────────────────────────── integrity flags ─────────────────────────────
export function reviewFlag(flagId: string, status: FlagStatus, note?: string): void {
  fieldStore.mutate((d) => {
    const prev = d.flagReviews[flagId];
    d.flagReviews[flagId] = { status, by: ACTOR, at: nowISO(), note, reply: prev?.reply };
    addLog(d, `Flag ${status}: ${flagId}`);
  });
}
/** Record the employee's side of a flag (in the live product the employee writes this from their own app). */
export function replyToFlag(flagId: string, text: string): void {
  fieldStore.mutate((d) => {
    const prev = d.flagReviews[flagId];
    d.flagReviews[flagId] = { status: prev?.status ?? 'open', by: prev?.by ?? ACTOR, at: prev?.at ?? nowISO(), note: prev?.note, reply: { text, at: nowISO() } };
    addLog(d, `Employee reply recorded on ${flagId}`);
  });
}

// ───────────────────────────── disputes ─────────────────────────────
export function raiseDispute(x: Omit<Dispute, 'id' | 'raisedOn' | 'status' | 'messages'> & { message: string; by: string }): Dispute {
  const item: Dispute = {
    id: uid('disp'), employeeId: x.employeeId, kind: x.kind, ref: x.ref, raisedOn: PREVIEW_TODAY, title: x.title,
    systemValue: x.systemValue, claimedValue: x.claimedValue, unit: x.unit, status: 'open',
    messages: [{ at: nowISO(), by: x.by, role: 'employee', text: x.message }],
  };
  fieldStore.mutate((d) => { d.disputes.unshift(item); addLog(d, `Dispute raised: ${x.title}`); });
  return item;
}
export function replyToDispute(id: Id, role: 'employee' | 'hr', by: string, text: string): void {
  fieldStore.mutate((d) => { d.disputes.find((x) => x.id === id)?.messages.push({ at: nowISO(), by, role, text }); });
}
export function decideDispute(id: Id, status: 'accepted' | 'partly_accepted' | 'rejected', decidedValue: number | undefined, note: string): void {
  fieldStore.mutate((d) => {
    const x = d.disputes.find((y) => y.id === id);
    if (!x) return;
    x.status = status; x.decidedValue = decidedValue; x.decisionNote = note;
    x.messages.push({ at: nowISO(), by: ACTOR, role: 'hr', text: `Decision: ${status.replace('_', ' ')}${decidedValue != null ? ` (${decidedValue}${x.unit ? ` ${x.unit}` : ''})` : ''}. ${note}` });
    if (x.kind === 'travel' && decidedValue != null && status !== 'rejected') d.travelOverrides[`${x.employeeId}|${x.ref}`] = { km: decidedValue, by: ACTOR, at: nowISO(), note };
    addLog(d, `Dispute ${status.replace('_', ' ')}: ${x.title}`);
  });
}

// ───────────────────────────── incentive runs ─────────────────────────────
export function holdIncentive(month: Month, employeeId: Id, reason: string): void {
  fieldStore.mutate((d) => { (d.incentiveRuns[month] ??= emptyRun()).holds[employeeId] = reason; addLog(d, `Incentive held: ${employeeId} ${month}`); });
}
export function releaseIncentive(month: Month, employeeId: Id): void {
  fieldStore.mutate((d) => { const r = (d.incentiveRuns[month] ??= emptyRun()); delete r.holds[employeeId]; addLog(d, `Incentive released: ${employeeId} ${month}`); });
}
export function approveIncentiveRun(month: Month): void {
  fieldStore.mutate((d) => {
    const r = (d.incentiveRuns[month] ??= emptyRun());
    if (r.status === 'in_payroll') return;
    r.status = 'approved'; r.approvedBy = ACTOR; r.approvedAt = nowISO();
    addLog(d, `Incentive run approved: ${month}`);
  });
}

/**
 * Hand the approved incentive (net of any allowed clawback, minus holds) and travel allowance to payroll as adjustments.
 * Safe to run twice: it replaces the rows it made before. The pay-run screen then picks them up like any other adjustment.
 */
export function pushFieldPayToPayroll(month: Month): { incentives: number; travel: number; people: number } {
  const ev = getFieldEvidence();
  const run = fieldStore.get().incentiveRuns[month] ?? emptyRun();
  const tag = `[field ${month}]`;
  let inc = 0, trv = 0, people = 0;
  mutateDb((db) => {
    db.adjustments = db.adjustments.filter((a) => !(a.note ?? '').startsWith(tag));
    for (const rep of ev.reps) {
      if (!db.employees.some((e) => e.id === rep.employeeId)) continue;
      const i = computeIncentives(ev, rep.employeeId, month);
      const held = run.holds[rep.employeeId];
      const incAmt = held ? 0 : Math.max(0, i.net);
      const t = computeTravelAllowance(ev, rep.employeeId, month);
      const overrides = fieldStore.get().travelOverrides;
      const extraKm = t.days.reduce((s, d) => { const o = overrides[`${rep.employeeId}|${d.date}`]; return s + (o ? Math.max(0, o.km - d.payableKm) : 0); }, 0);
      const trvAmt = t.amount + Math.round(extraKm * (rep.vehicle === 'public' ? 0 : ev.travel.ratePerKm[rep.vehicle]));
      if (incAmt > 0) { db.adjustments.push({ id: uid('adj'), employeeId: rep.employeeId, month, kind: 'incentive', amount: incAmt, taxable: true, note: `${tag} Sales incentive` } satisfies Adjustment); inc += incAmt; }
      if (trvAmt > 0) { db.adjustments.push({ id: uid('adj'), employeeId: rep.employeeId, month, kind: 'reimbursement', amount: trvAmt, taxable: false, note: `${tag} Travel allowance from GPS trail` } satisfies Adjustment); trv += trvAmt; }
      if (incAmt > 0 || trvAmt > 0) people++;
    }
  });
  fieldStore.mutate((d) => { const r = (d.incentiveRuns[month] ??= emptyRun()); r.status = 'in_payroll'; addLog(d, `Pushed ${month} incentives and travel to payroll`); });
  return { incentives: inc, travel: trv, people };
}

export const employeeLabel = (id: Id): string => {
  const e = getDb().employees.find((x) => x.id === id);
  return e ? `${e.firstName} ${e.lastName}` : id;
};
