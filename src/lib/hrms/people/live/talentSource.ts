'use client';
// Live data source for the TALENT slice of the people area (phase 12). Sample mode never touches this file: the people
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch, read through
// live/store.ts). It is the last People-area slice to move to the server.
//
// In live mode the talent data is loaded from GET /talent/bootstrap (the server seeds a populated demo on first load) and
// held in memory only, never in browser storage. Every action is a server call whose answer (a rating, a role with its
// bench, a placement) is applied here. The server also writes the activity log, so after a change the data is re-read in
// the background. The first load shows the page's loading state; a reload while the data is on screen runs in the
// background and never overwrites a newer answer.

import { useSyncExternalStore } from 'react';
import { getStatus, isLiveReady, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { talentApi } from './talentClient';
import {
  addSuccessorBody, clearPlacementBody, placementBody, ratingBody, readinessBody, reviewOpenedBody, successorRefBody, type RatingResult,
} from './talentWire';
import type { ISODate } from '../../types';
import type { CriticalRole, NineLevel, Placement, Readiness, SkillLevel, TalentState } from '../types';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type TalentPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface TalentLiveStatus { source: Source; phase: TalentPhase; message: string }

const EMPTY: TalentState = { skills: [], requirements: {}, ratings: {}, roles: [], placements: {}, cycle: '', log: [] };
const SAMPLE_STATUS: TalentLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let live: TalentState | null = null;
let liveToday: ISODate | null = null;
let phase: TalentPhase = 'idle';
let message = '';
let statusSnap: TalentLiveStatus = SAMPLE_STATUS;

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refreshStatusSnapshot(): void {
  const source = getStatus().source;
  if (statusSnap.source !== source || statusSnap.phase !== phase || statusSnap.message !== message) statusSnap = { source, phase, message };
}
function setPhase(next: TalentPhase, msg = ''): void { phase = next; message = msg; refreshStatusSnapshot(); emit(); }

// ───────────────────────────── reads ─────────────────────────────
export const getLiveTalent = (): TalentState => live ?? EMPTY;
/** The server's today (India) in live mode; null before the first load. */
export const getLiveTalentToday = (): ISODate | null => liveToday;
function getStatusSnapshot(): TalentLiveStatus { refreshStatusSnapshot(); return statusSnap; }

export function useLiveTalentSnapshot(): TalentState {
  return useSyncExternalStore(subscribe, getLiveTalent, () => EMPTY);
}
export function useLiveTalentStatus(): TalentLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}

// ───────────────────────────── applying answers ─────────────────────────────
let writeSeq = 0;
const current = (): TalentState => (live ? { ...live, ratings: { ...live.ratings }, placements: { ...live.placements }, roles: live.roles.slice() } : { ...EMPTY, ratings: {}, placements: {}, roles: [] });
function commit(next: TalentState): void { live = next; writeSeq += 1; setPhase('ok'); scheduleRefresh(); }

function applyRating(res: RatingResult): void {
  const n = current();
  const key = `${res.employeeId}|${res.skillId}`;
  if (res.rating) n.ratings[key] = res.rating; else delete n.ratings[key];
  commit(n);
}
function applyRole(role: CriticalRole): void {
  const n = current();
  const i = n.roles.findIndex((r) => r.id === role.id);
  if (i === -1) n.roles = [...n.roles, role]; else { n.roles = n.roles.slice(); n.roles[i] = role; }
  commit(n);
}
function applyPlacement(p: Placement): void { const n = current(); n.placements[p.employeeId] = p; commit(n); }
function applyClearPlacement(employeeId: string): void { const n = current(); delete n.placements[employeeId]; commit(n); }

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

async function loadTalent(): Promise<void> {
  const background = phase === 'ok' && live !== null;
  if (!background) setPhase('loading');
  const seq = writeSeq;
  try {
    const data = await talentApi.bootstrap();
    if (getStatus().source !== 'live') return;
    if (background && seq !== writeSeq) return;   // an answer since this read started is newer: keep it
    liveToday = data.today ?? null;
    live = { skills: data.skills, requirements: data.requirements, ratings: data.ratings, roles: data.roles, placements: data.placements, cycle: data.cycle, log: data.log };
    setPhase('ok');
  } catch (e) {
    if (background) return;
    const err = asError(e);
    live = null;
    setPhase(err.notReady ? 'not_ready' : 'error', err.message);
  }
}

function maybeLoad(force = false): void {
  const st = getStatus();
  if (st.source !== 'live' || st.phase !== 'ready') return;
  if (!force && (loading || loadedInputsVersion === st.inputsVersion)) return;
  loadedInputsVersion = st.inputsVersion;
  loading = true;
  void loadTalent().finally(() => { loading = false; });
}

/** After a change, re-read in the background (once things settle) to pick up the server's activity log. */
const REFRESH_DELAY_MS = 800;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (getStatus().source !== 'live' || phase !== 'ok' || loading) return;
    loading = true;
    void loadTalent().finally(() => { loading = false; });
  }, REFRESH_DELAY_MS);
}

/** Called by the Talent page on mount (and when the core source / readiness changes). Idempotent. */
export const ensureTalentLoaded = (): void => maybeLoad();
/** The page's "Try again" after a not-ready or error. */
export const reloadTalent = (): void => maybeLoad(true);

subscribeLive(() => {
  const st = getStatus();
  if (st.source !== 'live') {
    if (live !== null || phase !== 'idle') {
      live = null; liveToday = null; loadedInputsVersion = -1;
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      setPhase('idle');
    } else { refreshStatusSnapshot(); emit(); }
    return;
  }
  refreshStatusSnapshot();
  maybeLoad();
});

// ───────────────────────────── commands ─────────────────────────────
function blocked(): string | null {
  if (!isLiveReady()) return 'The HRMS data has not loaded from the server.';
  if (phase !== 'ok') return message || 'The talent data has not loaded from the server.';
  return null;
}

export async function liveSetRating(employeeId: string, skillId: string, level: SkillLevel, note: string, assessor?: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyRating(await talentApi.setRating(ratingBody(employeeId, skillId, level, note, assessor))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveAddSuccessor(roleId: string, employeeId: string, readiness: Readiness, actions: string[], reason: string): Promise<Result<{ role: CriticalRole }>> {
  const b = blocked(); if (b) return fail(b);
  try { const role = await talentApi.addSuccessor(roleId, addSuccessorBody(employeeId, readiness, actions, reason)); applyRole(role); return { ok: true, role }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveRemoveSuccessor(roleId: string, employeeId: string, reason: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyRole(await talentApi.removeSuccessor(roleId, successorRefBody(employeeId, reason))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSetReadiness(roleId: string, employeeId: string, readiness: Readiness, reason: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyRole(await talentApi.setReadiness(roleId, readinessBody(employeeId, readiness, reason))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function livePlaceEmployee(employeeId: string, performance: NineLevel, potential: NineLevel, rationale: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyPlacement(await talentApi.placeEmployee(placementBody(employeeId, performance, potential, rationale))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveClearPlacement(employeeId: string): Promise<void> {
  if (blocked()) return;
  try { const r = await talentApi.clearPlacement(clearPlacementBody(employeeId)); if (r.cleared) applyClearPlacement(employeeId); }
  catch { /* clearing a placement is best-effort; never block the reader on it */ }
}

export async function liveLogReviewOpened(group: string): Promise<void> {
  if (blocked()) return;
  try { const entry = await talentApi.reviewOpened(reviewOpenedBody(group)); if (entry) { const n = current(); n.log = [entry, ...n.log.filter((x) => x.id !== entry.id)]; commit(n); } }
  catch { /* opening the review is an audit note; never block the reader on it */ }
}
