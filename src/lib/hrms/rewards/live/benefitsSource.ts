'use client';
// Live data source for the BENEFITS slice of the Rewards area (phase 7). Sample mode never touches this file: the rewards
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch the rest of the module
// uses, read through live/store.ts). It extends the phase-6 assets source; compensation (the third Rewards slice) stays local.
//
// In live mode the benefits data is loaded from GET /benefits/bootstrap and held in memory only — it is never written to
// browser storage. The actions become server calls:
//  - plans / enrolments / window / reminders are simple records: the call returns the updated record (or config), which is
//    merged into the slice held here;
//  - claims (register + move) and send-to-payroll are commands: the server's answer ({ claim } / { removed, added, total })
//    replaces the local row / updates the sent map.
// A refusal carries the server's plain reason and nothing changes locally.

import { useSyncExternalStore } from 'react';
import { getStatus, isLiveReady, randomUuid, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { ACTOR } from '../../actions';
import { PREVIEW_TODAY } from '../../seed';
import { makeRewardsSeed } from '../seed';
import { benefitsApi } from './benefitsClient';
import {
  claimCreateBody, enrolmentBody, extendWindowBody, moveClaimBody, planCreateBody, remindersBody, sendToPayrollBody, setWindowBody,
} from './benefitsWire';
import type { Id, ISODate, Month } from '../../types';
import type { BenefitsState, BenefitsWindow, Claim, ClaimStatus, Enrolment, Plan } from '../types';
import type { EnrolInput, NewClaimInput, Result } from '../store';

// ───────────────────────────── status and state ─────────────────────────────
export type BenefitsPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface BenefitsLiveStatus { source: Source; phase: BenefitsPhase; message: string }

const EMPTY_BENEFITS: BenefitsState = { plans: [], window: { opensOn: '', closesOn: '', extensions: [] }, enrolments: [], reminders: {}, claims: [], sent: {} };
const SAMPLE_STATUS: BenefitsLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let liveBenefits: BenefitsState | null = null;
let phase: BenefitsPhase = 'idle';
let message = '';
let statusSnap: BenefitsLiveStatus = SAMPLE_STATUS;

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refreshStatusSnapshot(): void {
  const source = getStatus().source;
  if (statusSnap.source !== source || statusSnap.phase !== phase || statusSnap.message !== message) {
    statusSnap = { source, phase, message };
  }
}
function setPhase(next: BenefitsPhase, msg = ''): void {
  phase = next; message = msg;
  refreshStatusSnapshot();
  emit();
}

// ───────────────────────────── reads ─────────────────────────────
/** The live benefits data, or an empty one before it has loaded. Held in memory only. */
export const getLiveBenefits = (): BenefitsState => liveBenefits ?? EMPTY_BENEFITS;

function getStatusSnapshot(): BenefitsLiveStatus { refreshStatusSnapshot(); return statusSnap; }

/** The live benefits slice as a stable snapshot (for the merged rewards store). Empty during server render and first paint. */
export function useLiveBenefitsSnapshot(): BenefitsState {
  return useSyncExternalStore(subscribe, getLiveBenefits, () => EMPTY_BENEFITS);
}
/** The benefits source and its load phase, for the Benefits page's own loading / not-ready / error / empty states. */
export function useLiveBenefitsStatus(): BenefitsLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}

// ───────────────────────────── applying the server's answer ─────────────────────────────
const current = (): BenefitsState => (liveBenefits ? { ...liveBenefits } : { ...EMPTY_BENEFITS, window: { ...EMPTY_BENEFITS.window }, plans: [], enrolments: [], claims: [], reminders: {}, sent: {} });

function appendPlan(plan: Plan): void {
  if (!plan.id) return;
  const next = current();
  next.plans = next.plans.some((p) => p.id === plan.id) ? next.plans.map((p) => (p.id === plan.id ? plan : p)) : [...next.plans, plan];
  liveBenefits = next;
  setPhase('ok');
}

function applyEnrolment(en: Enrolment): void {
  if (!en.employeeId) return;
  const next = current();
  const i = next.enrolments.findIndex((x) => x.employeeId === en.employeeId);
  next.enrolments = i >= 0 ? next.enrolments.map((x, j) => (j === i ? en : x)) : [...next.enrolments, en];
  if (next.reminders[en.employeeId]) { const r = { ...next.reminders }; delete r[en.employeeId]; next.reminders = r; }
  liveBenefits = next;
  setPhase('ok');
}

function applyWindow(w: BenefitsWindow): void {
  const next = current();
  next.window = w;
  liveBenefits = next;
  setPhase('ok');
}

function applyReminders(map: Record<Id, ISODate>): void {
  const next = current();
  next.reminders = map;
  liveBenefits = next;
  setPhase('ok');
}

function applyClaim(claim: Claim): void {
  if (!claim.id) return;
  const next = current();
  next.claims = next.claims.some((c) => c.id === claim.id) ? next.claims.map((c) => (c.id === claim.id ? claim : c)) : [...next.claims, claim];
  liveBenefits = next;
  setPhase('ok');
}

function applySent(month: Month, entry: { on: ISODate; rows: number; total: number; by: string }): void {
  const next = current();
  next.sent = { ...next.sent, [month]: entry };
  liveBenefits = next;
  setPhase('ok');
}

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

async function loadBenefits(): Promise<void> {
  setPhase('loading');
  try {
    const data = await benefitsApi.bootstrap();
    liveBenefits = { plans: data.plans, window: data.window, enrolments: data.enrolments, reminders: data.reminders, claims: data.claims, sent: data.sent };
    setPhase('ok');
  } catch (e) {
    const err = asError(e);
    liveBenefits = null;
    setPhase(err.notReady ? 'not_ready' : 'error', err.message);
  }
}

function maybeLoad(force = false): void {
  const st = getStatus();
  if (st.source !== 'live' || st.phase !== 'ready') return;
  if (!force && (loading || loadedInputsVersion === st.inputsVersion)) return;
  loadedInputsVersion = st.inputsVersion;
  loading = true;
  void loadBenefits().finally(() => { loading = false; });
}

/** Called by the Benefits page on mount (and when the core source / readiness changes). Idempotent. */
export const ensureBenefitsLoaded = (): void => maybeLoad();
/** The Benefits page's "Try again" after a not-ready or error. */
export const reloadBenefits = (): void => maybeLoad(true);

// The core live source drives the benefits slice: a load when it becomes ready, a reload on every refresh, a reset to sample.
subscribeLive(() => {
  const st = getStatus();
  if (st.source !== 'live') {
    if (liveBenefits !== null || phase !== 'idle') { liveBenefits = null; loadedInputsVersion = -1; setPhase('idle'); }
    else { refreshStatusSnapshot(); emit(); }
    return;
  }
  refreshStatusSnapshot();
  maybeLoad();
});

// ───────────────────────────── commands ─────────────────────────────
function blocked(): string | null {
  if (!isLiveReady()) return 'The HRMS data has not loaded from the server.';
  if (phase !== 'ok') return message || 'The benefits data has not loaded from the server.';
  return null;
}

/** Empty-state seed: create the standard plan catalogue on the server and open a fresh enrolment window (the sample seed's
 * plans and window). A type already present is left alone; a new org starts from empty. New ids are UUIDs. */
export async function liveAddStandardBenefits(): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  if (liveBenefits && liveBenefits.plans.length) return fail('The standard benefit plans are already there.');
  const seed = makeRewardsSeed().benefits;
  try {
    for (const p of seed.plans) appendPlan(await benefitsApi.createPlan(planCreateBody(p, randomUuid())));
    applyWindow(await benefitsApi.setWindow(setWindowBody(seed.window.opensOn, seed.window.closesOn)));
    return { ok: true };
  } catch (e) { return fail(asError(e).message); }
}

export async function liveSubmitEnrolment(i: EnrolInput): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyEnrolment(await benefitsApi.submitEnrolment(enrolmentBody(i))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveExtendWindow(days: number, reason: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyWindow(await benefitsApi.extendWindow(extendWindowBody(days, reason))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveLogReminders(ids: Id[]): Promise<Result<{ count: number }>> {
  const b = blocked(); if (b) return fail(b);
  if (!ids.length) return fail('Nobody is waiting to enrol.');
  try { applyReminders(await benefitsApi.logReminders(remindersBody(ids))); return { ok: true, count: ids.length }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveRegisterClaim(i: NewClaimInput): Promise<Result<{ id: Id; ref: string }>> {
  const b = blocked(); if (b) return fail(b);
  try { const c = await benefitsApi.registerClaim(claimCreateBody(i, randomUuid())); applyClaim(c); return { ok: true, id: c.id, ref: c.ref }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveMoveClaim(id: Id, to: ClaimStatus, o: { note?: string; approved?: number; reason?: string } = {}): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyClaim(await benefitsApi.moveClaim(id, moveClaimBody(to, o))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSendToPayroll(month: Month): Promise<Result<{ removed: number; added: number; total: number }>> {
  const b = blocked(); if (b) return fail(b);
  try {
    const res = await benefitsApi.sendToPayroll(sendToPayrollBody(month));
    applySent(month, { on: PREVIEW_TODAY, rows: res.added, total: res.total, by: ACTOR });
    return { ok: true, removed: res.removed, added: res.added, total: res.total };
  } catch (e) { return fail(asError(e).message); }
}
