'use client';
// Live data source for the COMPENSATION slice of the Rewards area (phase 8). Sample mode never touches this file: the rewards
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch the rest of the module
// uses, read through live/store.ts). It completes the phase-6 assets and phase-7 benefits sources: with it, all three
// Rewards slices are on the server in live mode.
//
// In live mode the compensation data is loaded from GET /compensation/bootstrap and held in memory only — it is never
// written to browser storage. The actions become server calls:
//  - pay bands are simple records keyed by grade: the call returns the saved band, which replaces the one held here;
//  - the performance band and the employee's reply are saved per field and return the person's row;
//  - every merit-cycle call (setters, submit, decide, reopen, record an issued increment) is a command that answers the
//    whole cycle, which replaces the one held here. The server re-checks the cycle state and the submit / approve blockers.
// A refusal carries the server's plain reason and nothing changes locally.

import { useSyncExternalStore } from 'react';
import { getStatus, isLiveReady, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { DEFAULT_GUIDELINES } from '../seed';
import { compensationApi } from './compensationClient';
import {
  appliedBody, bandSaveBody, cycleUpdateBody, decideBody, guidelineBody, perfBody, perfReplyBody, proposalBody, publishBody, sortBands,
  type PerfResult,
} from './compensationWire';
import type { Id, ISODate } from '../../types';
import type { Band, CompaZone, CompState, MeritCycle, PerfBand } from '../types';
import type { Result } from '../store';

// ───────────────────────────── status and state ─────────────────────────────
export type CompensationPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface CompensationLiveStatus { source: Source; phase: CompensationPhase; message: string }

const EMPTY_COMP: CompState = {
  bands: [], perf: {}, perfNotes: {},
  cycle: { id: '', name: 'Merit cycle', effectiveOn: '', budgetPct: 0, status: 'draft', guidelines: DEFAULT_GUIDELINES(), proposals: {}, applied: {} },
};
const SAMPLE_STATUS: CompensationLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let liveComp: CompState | null = null;
let phase: CompensationPhase = 'idle';
let message = '';
let statusSnap: CompensationLiveStatus = SAMPLE_STATUS;

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
function setPhase(next: CompensationPhase, msg = ''): void {
  phase = next; message = msg;
  refreshStatusSnapshot();
  emit();
}

// ───────────────────────────── reads ─────────────────────────────
/** The live compensation data, or an empty one before it has loaded. Held in memory only. */
export const getLiveCompensation = (): CompState => liveComp ?? EMPTY_COMP;

function getStatusSnapshot(): CompensationLiveStatus { refreshStatusSnapshot(); return statusSnap; }

/** The live compensation slice as a stable snapshot (for the merged rewards store). Empty during server render and first paint. */
export function useLiveCompensationSnapshot(): CompState {
  return useSyncExternalStore(subscribe, getLiveCompensation, () => EMPTY_COMP);
}
/** The compensation source and its load phase, for the Compensation page's own loading / not-ready / error / empty states. */
export function useLiveCompensationStatus(): CompensationLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}

// ───────────────────────────── applying the server's answer ─────────────────────────────
const current = (): CompState => (liveComp ? { ...liveComp } : { ...EMPTY_COMP, bands: [], perf: {}, perfNotes: {} });

/** Goes up with every server answer applied here, so a reload that started earlier never overwrites a newer answer. */
let writeSeq = 0;
function commit(next: CompState): void { liveComp = next; writeSeq += 1; setPhase('ok'); }

function applyBands(bands: Band[]): void { const next = current(); next.bands = sortBands(bands); commit(next); }

function applyBand(band: Band): void {
  if (!band.grade) return;
  const next = current();
  next.bands = sortBands(next.bands.some((b) => b.grade === band.grade) ? next.bands.map((b) => (b.grade === band.grade ? band : b)) : [...next.bands, band]);
  commit(next);
}

/** One person's performance row: the band and the note are set from the server's answer, or cleared when it has none. */
function applyPerf(id: Id, r: PerfResult): void {
  const next = current();
  const perf = { ...next.perf }; const notes = { ...next.perfNotes };
  if (r.band) perf[id] = r.band; else delete perf[id];
  if (r.note) notes[id] = r.note; else delete notes[id];
  next.perf = perf; next.perfNotes = notes;
  commit(next);
}

function applyCycle(cycle: MeritCycle): void { const next = current(); next.cycle = cycle; commit(next); }

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

/**
 * The first load shows the page's loading state. A reload while the data is on screen (the core source refreshes, or a core
 * write such as an issued increment bumps its inputs) runs in the background: the page stays usable, commands keep working,
 * and a failed background reload keeps the data already shown.
 */
async function loadCompensation(): Promise<void> {
  const background = phase === 'ok' && liveComp !== null;
  if (!background) setPhase('loading');
  const seq = writeSeq;
  try {
    const data = await compensationApi.bootstrap();
    if (getStatus().source !== 'live') return;
    if (background && seq !== writeSeq) return;   // a command answered meanwhile: its answer is newer than this read
    liveComp = { bands: data.bands, perf: data.perf, perfNotes: data.perfNotes, cycle: data.cycle };
    setPhase('ok');
  } catch (e) {
    if (background) return;
    const err = asError(e);
    liveComp = null;
    setPhase(err.notReady ? 'not_ready' : 'error', err.message);
  }
}

function maybeLoad(force = false): void {
  const st = getStatus();
  if (st.source !== 'live' || st.phase !== 'ready') return;
  if (!force && (loading || loadedInputsVersion === st.inputsVersion)) return;
  loadedInputsVersion = st.inputsVersion;
  loading = true;
  void loadCompensation().finally(() => { loading = false; });
}

/** Called by the Compensation page on mount (and when the core source / readiness changes). Idempotent. */
export const ensureCompensationLoaded = (): void => maybeLoad();
/** The Compensation page's "Try again" after a not-ready or error. */
export const reloadCompensation = (): void => maybeLoad(true);

// The core live source drives the compensation slice: a load when it becomes ready, a reload on every refresh, a reset to sample.
subscribeLive(() => {
  const st = getStatus();
  if (st.source !== 'live') {
    if (liveComp !== null || phase !== 'idle') { liveComp = null; loadedInputsVersion = -1; setPhase('idle'); }
    else { refreshStatusSnapshot(); emit(); }
    return;
  }
  refreshStatusSnapshot();
  maybeLoad();
});

// ───────────────────────────── commands ─────────────────────────────
function blocked(): string | null {
  if (!isLiveReady()) return 'The HRMS data has not loaded from the server.';
  if (phase !== 'ok') return message || 'The compensation data has not loaded from the server.';
  return null;
}

async function run(fn: () => Promise<void>): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { await fn(); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

/** Empty-state seed: the standard pay bands (W1, E1, E2, E3, M1, M3), created on the server. Idempotent there: a grade that
 * already has a band is left alone. */
export async function liveAddStandardBands(): Promise<Result<{ created: number }>> {
  const b = blocked(); if (b) return fail(b);
  try { const r = await compensationApi.seedBands(); applyBands(r.bands); return { ok: true, created: r.created }; }
  catch (e) { return fail(asError(e).message); }
}

export const liveSaveBand = (grade: string, patch: Pick<Band, 'min' | 'mid' | 'max' | 'market'>): Promise<Result> =>
  run(async () => applyBand(await compensationApi.saveBand(grade, bandSaveBody(patch))));

export const liveSetPublished = (grade: string, published: boolean): Promise<Result> =>
  run(async () => applyBand(await compensationApi.setPublished(grade, publishBody(published))));

export const liveSetPerf = (employeeId: Id, band: PerfBand): Promise<Result> =>
  run(async () => applyPerf(employeeId, await compensationApi.setPerf(employeeId, perfBody(band))));

export const liveSetPerfReply = (employeeId: Id, reply: string): Promise<Result> =>
  run(async () => applyPerf(employeeId, await compensationApi.setPerfReply(employeeId, perfReplyBody(reply))));

export const liveSetBudgetPct = (pct: number): Promise<Result> =>
  run(async () => applyCycle(await compensationApi.updateCycle(cycleUpdateBody({ budgetPct: pct }))));

export const liveSetEffectiveOn = (date: ISODate): Promise<Result> =>
  run(async () => applyCycle(await compensationApi.updateCycle(cycleUpdateBody({ effectiveOn: date }))));

export const liveSetGuideline = (perf: PerfBand, zone: CompaZone, min: number, max: number): Promise<Result> =>
  run(async () => applyCycle(await compensationApi.setGuideline(guidelineBody(perf, zone, min, max))));

export const liveSetProposal = (employeeId: Id, pct: number | null, reason?: string): Promise<Result> =>
  run(async () => applyCycle(await compensationApi.setProposal(employeeId, proposalBody(pct, reason))));

export const liveSubmitCycle = (): Promise<Result> => run(async () => applyCycle(await compensationApi.submit()));

export const liveDecideCycle = (decision: 'approve' | 'return', text: string, overBudget: boolean): Promise<Result> =>
  run(async () => applyCycle(await compensationApi.decide(decideBody(decision, text, overBudget))));

export const liveReopenCycle = (): Promise<Result> => run(async () => applyCycle(await compensationApi.reopen()));

/** Records one issued increment against the approved cycle. The server does it atomically and only once per person. */
export const liveRecordIncrementApplied = (employeeId: Id, info: { from: number; to: number; letterId: Id }): Promise<Result> =>
  run(async () => applyCycle(await compensationApi.recordApplied(employeeId, appliedBody(info))));
