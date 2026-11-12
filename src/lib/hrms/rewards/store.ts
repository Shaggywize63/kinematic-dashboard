'use client';
// The Rewards area store (Assets, Benefits, Compensation) and every action that changes it. Screens read `rewardsStore.use()`
// and change data only through the functions below, so the later swap to API calls touches this file.
// Core people and payroll data stay in the core database: the only writes there are the two clearly labelled ones,
// "Send to payroll" (adjustments tagged `[benefits <month>]`) and "Issue increment" (updateEmployee + issueLetter).

import { useMemo } from 'react';
import { createAreaStore, type AreaStore } from '../areaStore';
import { ACTOR, addAdjustment, remove } from '../actions';
import { getDb } from '../db';
import { isLive } from '../live/store';
import { PREVIEW_TODAY } from '../seed';
import { addDays, fullName } from '../format';
import { uid } from '../types';
import type { Id, ISODate, Month } from '../types';
import { makeRewardsSeed } from './seed';
import {
  getLiveAssets, liveAddAsset, liveBackFromRepair, liveIssueAsset, liveMarkLost, liveRetireAsset, liveReturnAsset,
  liveSendToRepair, liveTransferAsset, useLiveAssetsSnapshot, useLiveSource,
} from './live/assetsSource';
import {
  CLAIM_NEXT, benefitsTag, deductionPreview, enrolmentEligibility, planOf, tierOf, validateBand, validateDependants, validateFlex, validateGuideline,
  windowStatus, nextTag, checkProposal, cycleMembership, baseCtcFor, submitBlockers, addMonthsISO,
} from './engines';
import type {
  Asset, AssetCondition, AssetEvent, AssetEventKind, AssetStatus, AssetType, Band, ClaimStatus, CompaZone, Dependant, Enrolment, LogEntry, PerfBand, RewardsState,
} from './types';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// The Rewards area store. Benefits and compensation always live in this browser-local store (the "saved in this browser only"
// note stays on their pages). The ASSETS slice has a Sample | Live concept (phase 6): in live mode it comes from, and is saved
// to, the server (live/assetsSource.ts), while this local store still holds benefits, compensation and the activity log.
const baseRewardsStore = createAreaStore<RewardsState>('rewards', 1, makeRewardsSeed);

/** The whole Rewards state for the active source: in live mode the assets slice is the server's, the rest is this local store. */
const mergeLive = (base: RewardsState, assets: RewardsState['assets']): RewardsState => ({ ...base, assets });

export const rewardsStore: AreaStore<RewardsState> = {
  name: 'rewards',
  get: () => (isLive() ? mergeLive(baseRewardsStore.get(), getLiveAssets()) : baseRewardsStore.get()),
  // Benefits, compensation and the log always change locally. Asset actions never call mutate in live mode (they are server
  // commands), so the local assets slice is ignored there and the live register is never written to browser storage.
  mutate: (fn) => baseRewardsStore.mutate(fn),
  reset: () => baseRewardsStore.reset(),
  use() {
    const base = baseRewardsStore.use();
    const source = useLiveSource();
    const assets = useLiveAssetsSnapshot();
    return useMemo(() => (base && source === 'live' ? mergeLive(base, assets) : base), [base, source, assets]);
  },
};

const logTo = (d: RewardsState, area: LogEntry['area'], action: string) => {
  d.log.unshift({ on: PREVIEW_TODAY, by: ACTOR, area, action });
  if (d.log.length > 200) d.log.length = 200;
};
const person = (id: Id | undefined): string => {
  const e = getDb().employees.find((x) => x.id === id);
  return e ? fullName(e) : 'someone';
};

// ═══════════════════════════════════ assets ═══════════════════════════════════
export const assetName = (a: Pick<Asset, 'tag' | 'make' | 'model'>): string => `${a.tag} ${a.make} ${a.model}`;

function addEvent(d: RewardsState, a: Asset, kind: AssetEventKind, status: AssetStatus, o: { fromId?: Id; toId?: Id; condition?: AssetCondition; ack?: boolean; note?: string }) {
  const ev: AssetEvent = { id: uid('ev'), assetId: a.id, on: PREVIEW_TODAY, kind, status, by: ACTOR, ...o };
  if (!ev.note) delete ev.note;
  d.assets.events.push(ev);   // append only: no action edits or removes an event
}
const findAsset = (d: RewardsState, id: Id) => d.assets.items.find((x) => x.id === id);
const note = (s?: string) => (s ?? '').trim() || undefined;

export interface NewAssetInput { type: AssetType; make: string; model: string; serial: string; purchaseDate: ISODate; cost: number; warrantyMonths: number; condition: AssetCondition }

// Each asset action is a server command in live mode and the local sample flow otherwise. They return a promise so the call
// sites can await the server (sample mode resolves at once). The sample flows below are unchanged.
export function addAsset(input: NewAssetInput): Promise<Result<{ id: Id; tag: string }>> {
  return isLive() ? liveAddAsset(input) : Promise.resolve(addAssetSample(input));
}
function addAssetSample(input: NewAssetInput): Result<{ id: Id; tag: string }> {
  const s = rewardsStore.get();
  if (!input.make.trim() || !input.model.trim()) return fail('Enter the make and the model.');
  if (!input.serial.trim()) return fail('Enter the serial number.');
  if (s.assets.items.some((a) => a.serial.toLowerCase() === input.serial.trim().toLowerCase())) return fail('This serial number is already in the register.');
  if (!(input.cost > 0)) return fail('Enter the purchase cost.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate) || input.purchaseDate > PREVIEW_TODAY) return fail('The purchase date cannot be in the future.');
  const id = uid('ast');
  const tag = nextTag(s.assets.items, input.type);
  rewardsStore.mutate((d) => {
    const a: Asset = {
      id, tag, type: input.type, make: input.make.trim(), model: input.model.trim(), serial: input.serial.trim(), purchaseDate: input.purchaseDate, cost: Math.round(input.cost),
      warrantyEnd: input.warrantyMonths > 0 ? addMonthsISO(input.purchaseDate, input.warrantyMonths) : null,
      condition: input.condition, status: 'in_stock',
    };
    d.assets.items.push(a);
    d.assets.events.push({ id: uid('ev'), assetId: id, on: input.purchaseDate, kind: 'purchased', status: 'in_stock', condition: input.condition, by: ACTOR, note: 'Added to the register.' });
    logTo(d, 'assets', `Added ${tag} ${a.make} ${a.model} to the register`);
  });
  return { ok: true, id, tag };
}

export function issueAsset(i: { assetId: Id; personId: Id; condition: AssetCondition; ack: boolean; note?: string }): Promise<Result> {
  return isLive() ? liveIssueAsset(i) : Promise.resolve(issueAssetSample(i));
}
function issueAssetSample(i: { assetId: Id; personId: Id; condition: AssetCondition; ack: boolean; note?: string }): Result {
  const a = findAsset(rewardsStore.get(), i.assetId);
  if (!a) return fail('That asset is not in the register.');
  if (a.status !== 'in_stock') return fail(`${a.tag} is ${a.status.replace('_', ' ')}, so it cannot be issued.`);
  if (!getDb().employees.some((e) => e.id === i.personId)) return fail('Choose who it is for.');
  if (!i.ack) return fail('The receiver has to acknowledge receipt before it is issued.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, i.assetId)!;
    x.status = 'issued'; x.holderId = i.personId; x.condition = i.condition;
    addEvent(d, x, 'issued', 'issued', { toId: i.personId, condition: i.condition, ack: true, note: note(i.note) });
    logTo(d, 'assets', `Issued ${assetName(x)} to ${person(i.personId)}`);
  });
  return { ok: true };
}

export function returnAsset(i: { assetId: Id; condition: AssetCondition; next: Extract<AssetStatus, 'in_stock' | 'in_repair' | 'retired'>; note?: string }): Promise<Result> {
  return isLive() ? liveReturnAsset(i) : Promise.resolve(returnAssetSample(i));
}
function returnAssetSample(i: { assetId: Id; condition: AssetCondition; next: Extract<AssetStatus, 'in_stock' | 'in_repair' | 'retired'>; note?: string }): Result {
  const a = findAsset(rewardsStore.get(), i.assetId);
  if (!a || a.status !== 'issued') return fail('Only an issued asset can be returned.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, i.assetId)!;
    const from = x.holderId;
    x.status = i.next; x.holderId = undefined; x.condition = i.condition;
    addEvent(d, x, 'returned', i.next, { fromId: from, condition: i.condition, note: note(i.note) });
    logTo(d, 'assets', `${person(from)} returned ${assetName(x)} (${i.condition})`);
  });
  return { ok: true };
}

export function transferAsset(i: { assetId: Id; toId: Id; condition: AssetCondition; ack: boolean; note?: string }): Promise<Result> {
  return isLive() ? liveTransferAsset(i) : Promise.resolve(transferAssetSample(i));
}
function transferAssetSample(i: { assetId: Id; toId: Id; condition: AssetCondition; ack: boolean; note?: string }): Result {
  const a = findAsset(rewardsStore.get(), i.assetId);
  if (!a || a.status !== 'issued') return fail('Only an issued asset can be transferred.');
  if (a.holderId === i.toId) return fail('It is already with this person.');
  if (!getDb().employees.some((e) => e.id === i.toId)) return fail('Choose who receives it.');
  if (!i.ack) return fail('The new holder has to acknowledge receipt before it is transferred.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, i.assetId)!;
    const from = x.holderId;
    x.holderId = i.toId; x.condition = i.condition;
    addEvent(d, x, 'transferred', 'issued', { fromId: from, toId: i.toId, condition: i.condition, ack: true, note: note(i.note) });
    logTo(d, 'assets', `Transferred ${assetName(x)} from ${person(from)} to ${person(i.toId)}`);
  });
  return { ok: true };
}

export function sendToRepair(assetId: Id, text?: string): Promise<Result> {
  return isLive() ? liveSendToRepair(assetId, text) : Promise.resolve(sendToRepairSample(assetId, text));
}
function sendToRepairSample(assetId: Id, text?: string): Result {
  const a = findAsset(rewardsStore.get(), assetId);
  if (!a || (a.status !== 'in_stock' && a.status !== 'issued')) return fail('Only an asset in stock or issued can go for repair.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, assetId)!;
    const from = x.holderId;
    x.status = 'in_repair'; x.holderId = undefined;
    addEvent(d, x, 'repair_out', 'in_repair', { fromId: from, note: note(text) });
    logTo(d, 'assets', `Sent ${assetName(x)} for repair`);
  });
  return { ok: true };
}

export function backFromRepair(assetId: Id, condition: AssetCondition, text?: string): Promise<Result> {
  return isLive() ? liveBackFromRepair(assetId, condition, text) : Promise.resolve(backFromRepairSample(assetId, condition, text));
}
function backFromRepairSample(assetId: Id, condition: AssetCondition, text?: string): Result {
  const a = findAsset(rewardsStore.get(), assetId);
  if (!a || a.status !== 'in_repair') return fail('Only an asset in repair can come back from repair.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, assetId)!;
    x.status = 'in_stock'; x.condition = condition;
    addEvent(d, x, 'repair_back', 'in_stock', { condition, note: note(text) });
    logTo(d, 'assets', `${assetName(x)} is back from repair`);
  });
  return { ok: true };
}

export function markLost(assetId: Id, text?: string): Promise<Result> {
  return isLive() ? liveMarkLost(assetId, text) : Promise.resolve(markLostSample(assetId, text));
}
function markLostSample(assetId: Id, text?: string): Result {
  const a = findAsset(rewardsStore.get(), assetId);
  if (!a || (a.status !== 'in_stock' && a.status !== 'issued')) return fail('Only an asset in stock or issued can be marked lost.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, assetId)!;
    const from = x.holderId;
    x.status = 'lost'; x.holderId = undefined;
    addEvent(d, x, 'lost', 'lost', { fromId: from, note: note(text) });
    logTo(d, 'assets', `Marked ${assetName(x)} lost`);
  });
  return { ok: true };
}

export function retireAsset(assetId: Id, text?: string): Promise<Result> {
  return isLive() ? liveRetireAsset(assetId, text) : Promise.resolve(retireAssetSample(assetId, text));
}
function retireAssetSample(assetId: Id, text?: string): Result {
  const a = findAsset(rewardsStore.get(), assetId);
  if (!a || (a.status !== 'in_stock' && a.status !== 'in_repair')) return fail('Only an asset in stock or in repair can be retired.');
  rewardsStore.mutate((d) => {
    const x = findAsset(d, assetId)!;
    x.status = 'retired';
    addEvent(d, x, 'retired', 'retired', { note: note(text) });
    logTo(d, 'assets', `Retired ${assetName(x)}`);
  });
  return { ok: true };
}

// ═══════════════════════════════════ benefits ═══════════════════════════════════
export interface EnrolInput {
  employeeId: Id; status: 'enrolled' | 'waived'; healthTier?: string; dependants: Dependant[]; mealTier?: string; npsTier?: string; flex: Record<string, number>;
}
/** Saves one person's enrolment. Checked here as well as on the form, so the rules cannot be skipped. */
export function submitEnrolment(i: EnrolInput): Result {
  const s = rewardsStore.get();
  const emp = getDb().employees.find((e) => e.id === i.employeeId);
  const health = planOf(s.benefits.plans, 'health');
  const flex = planOf(s.benefits.plans, 'flex');
  if (!emp || !health) return fail('Choose an employee.');
  const elig = enrolmentEligibility(emp, health.coverStart);
  if (!elig.eligible) return fail(elig.reason ?? 'This person cannot enrol.');
  if (windowStatus(s.benefits.window, PREVIEW_TODAY).state !== 'open') return fail('The enrolment window is closed. HR can extend it.');
  if (i.status === 'enrolled') {
    if (!tierOf(health, i.healthTier)) return fail('Choose a health cover amount, or choose to opt out.');
    const errs = health.dependants ? validateDependants(health.dependants, i.dependants, health.coverStart) : [];
    if (errs.length) return fail(errs[0]!);
    if (flex) { const fe = validateFlex(flex, i.flex); if (fe.length) return fail(fe[0]!); }
  }
  rewardsStore.mutate((d) => {
    const en: Enrolment = {
      employeeId: i.employeeId, status: i.status, submittedOn: PREVIEW_TODAY, by: ACTOR,
      healthTier: i.status === 'enrolled' ? i.healthTier : undefined,
      dependants: i.status === 'enrolled' ? i.dependants.map((x) => ({ id: x.id, name: x.name.trim(), relation: x.relation, dob: x.dob })) : [],
      mealTier: i.status === 'enrolled' ? i.mealTier : undefined, npsTier: i.status === 'enrolled' ? i.npsTier : undefined,
      flex: i.status === 'enrolled' ? Object.fromEntries(Object.entries(i.flex).filter(([, v]) => v > 0)) : {},
    };
    const idx = d.benefits.enrolments.findIndex((x) => x.employeeId === i.employeeId);
    if (idx >= 0) d.benefits.enrolments[idx] = en; else d.benefits.enrolments.push(en);
    delete d.benefits.reminders[i.employeeId];
    logTo(d, 'benefits', `${i.status === 'enrolled' ? 'Enrolled' : 'Recorded an opt-out for'} ${person(i.employeeId)}`);
  });
  return { ok: true };
}

export function extendWindow(days: number, reason: string): Result {
  if (!Number.isInteger(days) || days < 1 || days > 30) return fail('Extend by 1 to 30 days.');
  if (!reason.trim()) return fail('Write a short reason for the extension.');
  rewardsStore.mutate((d) => {
    const w = d.benefits.window;
    const base = w.closesOn > PREVIEW_TODAY ? w.closesOn : PREVIEW_TODAY;
    w.closesOn = addDays(base, days);
    w.extensions.push({ on: PREVIEW_TODAY, days, reason: reason.trim(), by: ACTOR });
    logTo(d, 'benefits', `Extended the enrolment window by ${days} days to ${w.closesOn}`);
  });
  return { ok: true };
}

/** Records that a reminder was queued. This is a simulation: nothing is sent. */
export function logReminders(ids: Id[]): Result<{ count: number }> {
  if (!ids.length) return fail('Nobody is waiting to enrol.');
  rewardsStore.mutate((d) => {
    ids.forEach((id) => { d.benefits.reminders[id] = PREVIEW_TODAY; });
    logTo(d, 'benefits', `Logged a reminder for ${ids.length} ${ids.length === 1 ? 'person' : 'people'} (simulation, nothing sent)`);
  });
  return { ok: true, count: ids.length };
}

export interface NewClaimInput { employeeId: Id; patient: string; relation: 'self' | 'spouse' | 'child' | 'parent'; kind: 'cashless' | 'reimbursement'; hospital: string; claimed: number }
export function registerClaim(i: NewClaimInput): Result<{ id: Id; ref: string }> {
  const s = rewardsStore.get();
  const en = s.benefits.enrolments.find((e) => e.employeeId === i.employeeId);
  if (!en || en.status !== 'enrolled') return fail('Only an enrolled employee can claim.');
  if (!i.hospital.trim()) return fail('Enter the hospital or clinic.');
  if (!(i.claimed > 0)) return fail('Enter the amount claimed.');
  const covered = i.relation === 'self' || en.dependants.some((x) => x.name === i.patient && x.relation === i.relation);
  if (!covered) return fail('The patient is not covered under this enrolment.');
  const id = uid('clm');
  const ref = `TPA-26-${String(4100 + s.benefits.claims.length * 37 + 41).padStart(5, '0')}`;
  rewardsStore.mutate((d) => {
    d.benefits.claims.push({
      id, ref, employeeId: i.employeeId, patient: i.relation === 'self' ? 'Self' : i.patient, relation: i.relation, kind: i.kind, hospital: i.hospital.trim(), claimed: Math.round(i.claimed),
      filedOn: PREVIEW_TODAY, status: 'submitted', trail: [{ on: PREVIEW_TODAY, status: 'submitted', note: 'Claim registered.', by: ACTOR }],
    });
    logTo(d, 'benefits', `Registered claim ${ref} for ${person(i.employeeId)}`);
  });
  return { ok: true, id, ref };
}

export function moveClaim(id: Id, to: ClaimStatus, o: { note?: string; approved?: number; reason?: string } = {}): Result {
  const c = rewardsStore.get().benefits.claims.find((x) => x.id === id);
  if (!c) return fail('That claim is not in the tracker.');
  if (!CLAIM_NEXT[c.status].includes(to)) return fail(`A claim that is ${c.status.replace('_', ' ')} cannot move to ${to.replace('_', ' ')}.`);
  if (to === 'approved' && !(o.approved != null && o.approved > 0 && o.approved <= c.claimed)) return fail('Enter an approved amount that is more than 0 and not more than the amount claimed.');
  if (to === 'rejected' && !(o.reason ?? '').trim()) return fail('A rejection needs a reason, so the employee can reply.');
  if (c.status === 'rejected' && !(o.note ?? '').trim()) return fail("Write the employee's reply or the reason for the review.");
  rewardsStore.mutate((d) => {
    const x = d.benefits.claims.find((y) => y.id === id)!;
    x.status = to;
    if (to === 'approved') x.approved = Math.round(o.approved!);
    if (to === 'settled' || to === 'rejected') x.closedOn = PREVIEW_TODAY;
    if (to === 'rejected') { x.rejectionReason = o.reason!.trim(); x.approved = undefined; }
    if (to === 'in_review' && x.closedOn) { x.closedOn = undefined; x.rejectionReason = undefined; }
    x.trail.push({ on: PREVIEW_TODAY, status: to, note: note(o.note), by: ACTOR });
    logTo(d, 'benefits', `Claim ${x.ref} moved to ${to.replace('_', ' ')}`);
  });
  return { ok: true };
}

/** Sends the monthly deduction preview to payroll as one-time deductions tagged `[benefits <month>]`, replacing any earlier send for that month. */
export function sendToPayroll(month: Month): Result<{ removed: number; added: number; total: number }> {
  const db = getDb();
  const s = rewardsStore.get();
  const health = planOf(s.benefits.plans, 'health');
  if (!health) return fail('No health plan is set up.');
  if (db.payRuns.some((r) => r.month === month && (r.status === 'frozen' || r.status === 'paid'))) return fail(`The payroll run for ${month} is frozen or paid, so its adjustments are locked.`);
  const tag = benefitsTag(month);
  const rows = deductionPreview(db, s.benefits.plans, s.benefits.enrolments, PREVIEW_TODAY, health.coverStart).filter((r) => r.total > 0);
  const old = db.adjustments.filter((a) => a.month === month && (a.note ?? '').startsWith(tag));
  old.forEach((a) => remove('adjustments', a.id));
  rows.forEach((r) => addAdjustment({ employeeId: r.employeeId, month, kind: 'one_time_deduction', amount: r.total, taxable: false, note: `${tag} ${r.note}` }));
  const total = rows.reduce((t, r) => t + r.total, 0);
  rewardsStore.mutate((d) => {
    d.benefits.sent[month] = { on: PREVIEW_TODAY, rows: rows.length, total, by: ACTOR };
    logTo(d, 'benefits', `Sent ${rows.length} deductions (${total} a month) to payroll for ${month}, replacing ${old.length} earlier rows`);
  });
  return { ok: true, removed: old.length, added: rows.length, total };
}

// ═══════════════════════════════════ compensation ═══════════════════════════════════
const cycleOpen = (s: RewardsState) => s.comp.cycle.status === 'draft' || s.comp.cycle.status === 'returned';

export function saveBand(grade: string, patch: Pick<Band, 'min' | 'mid' | 'max' | 'market'>): Result {
  const err = validateBand(patch);
  if (err) return fail(err);
  rewardsStore.mutate((d) => {
    const b = d.comp.bands.find((x) => x.grade === grade);
    if (!b) return;
    Object.assign(b, { min: Math.round(patch.min), mid: Math.round(patch.mid), max: Math.round(patch.max), market: Math.round(patch.market) });
    logTo(d, 'compensation', `Changed the ${grade} pay band`);
  });
  return { ok: true };
}
export function setPublished(grade: string, published: boolean): void {
  rewardsStore.mutate((d) => {
    const b = d.comp.bands.find((x) => x.grade === grade);
    if (!b) return;
    b.published = published;
    logTo(d, 'compensation', `${published ? 'Published' : 'Unpublished'} the ${grade} band for employees`);
  });
}
export function setPerf(employeeId: Id, band: PerfBand): void {
  rewardsStore.mutate((d) => { d.comp.perf[employeeId] = band; logTo(d, 'compensation', `Set the performance band for ${person(employeeId)} to ${band}`); });
}
export function setPerfReply(employeeId: Id, reply: string): void {
  rewardsStore.mutate((d) => {
    const n = d.comp.perfNotes[employeeId] ?? { evidence: 'No evidence recorded.' };
    n.reply = reply.trim() || undefined;
    d.comp.perfNotes[employeeId] = n;
    logTo(d, 'compensation', `Recorded ${person(employeeId)}'s reply to the rating`);
  });
}

export function setBudgetPct(pct: number): Result {
  if (!cycleOpen(rewardsStore.get())) return fail('The cycle is locked. Return it to managers or reopen it first.');
  if (!Number.isFinite(pct) || pct < 0 || pct > 30) return fail('Use a budget from 0 to 30 percent.');
  rewardsStore.mutate((d) => { d.comp.cycle.budgetPct = Math.round(pct * 100) / 100; logTo(d, 'compensation', `Set the merit budget to ${d.comp.cycle.budgetPct}% of payroll`); });
  return { ok: true };
}
export function setEffectiveOn(date: ISODate): Result {
  if (!cycleOpen(rewardsStore.get())) return fail('The cycle is locked.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < PREVIEW_TODAY) return fail('Choose a date that is today or later.');
  rewardsStore.mutate((d) => { d.comp.cycle.effectiveOn = date; logTo(d, 'compensation', `Set the increment effective date to ${date}`); });
  return { ok: true };
}
export function setGuideline(perf: PerfBand, zone: CompaZone, min: number, max: number): Result {
  if (!cycleOpen(rewardsStore.get())) return fail('The cycle is locked.');
  const err = validateGuideline(min, max);
  if (err) return fail(err);
  rewardsStore.mutate((d) => { d.comp.cycle.guidelines[perf][zone] = { min, max }; logTo(d, 'compensation', `Changed the guideline for ${perf} / ${zone}`); });
  return { ok: true };
}
/** Enter, change or clear (pct = null) one proposal. A reason is kept as typed; whether one is required is decided by the guidance. */
export function setProposal(employeeId: Id, pct: number | null, reason?: string): Result {
  if (!cycleOpen(rewardsStore.get())) return fail('Proposals are locked while the cycle is with HR or approved.');
  if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 50)) return fail('Use 0 to 50 percent.');
  rewardsStore.mutate((d) => {
    if (pct == null) delete d.comp.cycle.proposals[employeeId];
    else d.comp.cycle.proposals[employeeId] = { pct, reason: (reason ?? '').trim() || undefined, by: 'Reporting manager', on: PREVIEW_TODAY };
  });
  return { ok: true };
}

/** What stops the cycle going to HR, worked out from the live data. */
export function cycleBlockers(s: RewardsState): string[] {
  const db = getDb();
  const members = cycleMembership(db, s.comp.cycle).filter((m) => m.included);
  let withProposal = 0; let missing = 0;
  for (const m of members) {
    const p = s.comp.cycle.proposals[m.employee.id];
    if (!p) continue;
    withProposal += 1;
    const grade = db.designations.find((x) => x.id === m.employee.designationId)?.grade;
    const band = s.comp.bands.find((b) => b.grade === grade);
    if (!band) continue;
    if (checkProposal(baseCtcFor(m.employee, s.comp.cycle), band, s.comp.perf[m.employee.id], s.comp.cycle.guidelines, p).needsReason) missing += 1;
  }
  return submitBlockers({ withProposal, missingReasons: missing });
}

export function submitCycle(): Result {
  const s = rewardsStore.get();
  if (!cycleOpen(s)) return fail('The cycle is already with HR or approved.');
  const b = cycleBlockers(s);
  if (b.length) return fail(b[0]!);
  rewardsStore.mutate((d) => { d.comp.cycle.status = 'submitted'; d.comp.cycle.decision = undefined; logTo(d, 'compensation', 'Submitted the merit cycle to HR for approval'); });
  return { ok: true };
}
export function decideCycle(decision: 'approve' | 'return', text: string, overBudget: boolean): Result {
  const s = rewardsStore.get();
  if (s.comp.cycle.status !== 'submitted') return fail('Only a submitted cycle can be decided.');
  if (decision === 'return' && !text.trim()) return fail('Tell the managers what to change.');
  if (decision === 'approve' && overBudget && !text.trim()) return fail('The total is over budget. Write why you are approving it.');
  if (decision === 'approve') { const b = cycleBlockers(s); if (b.length) return fail(b[0]!); }
  rewardsStore.mutate((d) => {
    d.comp.cycle.status = decision === 'approve' ? 'approved' : 'returned';
    d.comp.cycle.decision = { by: ACTOR, on: PREVIEW_TODAY, note: text.trim() || undefined };
    logTo(d, 'compensation', decision === 'approve' ? 'HR approved the merit cycle' : 'HR returned the merit cycle to managers');
  });
  return { ok: true };
}
export function reopenCycle(): Result {
  const s = rewardsStore.get();
  if (s.comp.cycle.status !== 'approved') return fail('Only an approved cycle can be reopened.');
  if (Object.keys(s.comp.cycle.applied).length) return fail('Some increments are already issued, so the cycle cannot be reopened.');
  rewardsStore.mutate((d) => { d.comp.cycle.status = 'draft'; d.comp.cycle.decision = undefined; logTo(d, 'compensation', 'Reopened the approved merit cycle'); });
  return { ok: true };
}

/** Called by the apply flow after the core employee and the letter were written. One record per person per cycle. */
export function recordIncrementApplied(employeeId: Id, info: { from: number; to: number; letterId: Id }): Result {
  const s = rewardsStore.get();
  if (s.comp.cycle.applied[employeeId]) return fail('An increment was already issued to this person in this cycle.');
  rewardsStore.mutate((d) => {
    d.comp.cycle.applied[employeeId] = { on: PREVIEW_TODAY, from: info.from, to: info.to, letterId: info.letterId, by: ACTOR };
    logTo(d, 'compensation', `Issued an increment to ${person(employeeId)}: ${info.from} to ${info.to}, effective ${d.comp.cycle.effectiveOn}`);
  });
  return { ok: true };
}

