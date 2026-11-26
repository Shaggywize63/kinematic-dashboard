'use client';
// Live data source for the ENGAGEMENT slice of the people area (phase 11). Sample mode never touches this file: the people
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch, read through
// live/store.ts). Talent stays in the local people store.
//
// In live mode the engagement data is loaded from GET /engagement/bootstrap and held in memory only, never in browser
// storage. Every action is a server call whose answer (the pulse, the response, the kudos, the exit interview) is applied
// here. The server also writes the activity log, so after a change the data is re-read in the background to pick it up. The
// first load shows the page's loading state; a reload while the data is on screen runs in the background and never
// overwrites a newer answer.

import { useSyncExternalStore } from 'react';
import { getStatus, isLiveReady, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { engagementApi } from './engagementClient';
import { exitBody, kudosBody, openExitBody, pulseBody, responseBody, type ExitBody } from './engagementWire';
import type { ISODate } from '../../types';
import type { AnswerValue, CompanyValue, EngagementState, ExitInterview, Kudos, QType, Survey, SurveyResponse } from '../types';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ───────────────────────────── status and state ─────────────────────────────
export type EngagementPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface EngagementLiveStatus { source: Source; phase: EngagementPhase; message: string }

const EMPTY: EngagementState = { surveys: [], responses: [], values: [], kudos: [], exitInterviews: [], log: [] };
const SAMPLE_STATUS: EngagementLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let live: EngagementState | null = null;
let liveToday: ISODate | null = null;
let phase: EngagementPhase = 'idle';
let message = '';
let statusSnap: EngagementLiveStatus = SAMPLE_STATUS;

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refreshStatusSnapshot(): void {
  const source = getStatus().source;
  if (statusSnap.source !== source || statusSnap.phase !== phase || statusSnap.message !== message) statusSnap = { source, phase, message };
}
function setPhase(next: EngagementPhase, msg = ''): void { phase = next; message = msg; refreshStatusSnapshot(); emit(); }

// ───────────────────────────── reads ─────────────────────────────
export const getLiveEngagement = (): EngagementState => live ?? EMPTY;
/** The server's today (India) in live mode; null before the first load. */
export const getLiveEngagementToday = (): ISODate | null => liveToday;
function getStatusSnapshot(): EngagementLiveStatus { refreshStatusSnapshot(); return statusSnap; }

export function useLiveEngagementSnapshot(): EngagementState {
  return useSyncExternalStore(subscribe, getLiveEngagement, () => EMPTY);
}
export function useLiveEngagementStatus(): EngagementLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}

// ───────────────────────────── applying answers ─────────────────────────────
let writeSeq = 0;
const current = (): EngagementState => (live ? { ...live } : { ...EMPTY, surveys: [], responses: [], values: [], kudos: [], exitInterviews: [], log: [] });
function commit(next: EngagementState): void { live = next; writeSeq += 1; setPhase('ok'); scheduleRefresh(); }

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice(); copy[i] = item; return copy;
};
const prepend = <T extends { id: string }>(list: T[], item: T): T[] => [item, ...list.filter((x) => x.id !== item.id)];

function applySurvey(sv: Survey): void { const n = current(); n.surveys = upsert(n.surveys, sv); commit(n); }
function applyResponse(r: SurveyResponse): void { const n = current(); n.responses = upsert(n.responses, r); commit(n); }
function applyKudos(k: Kudos): void { const n = current(); n.kudos = prepend(n.kudos, k); commit(n); }
function applyExit(e: ExitInterview): void { const n = current(); n.exitInterviews = upsert(n.exitInterviews, e); commit(n); }

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

async function loadEngagement(): Promise<void> {
  const background = phase === 'ok' && live !== null;
  if (!background) setPhase('loading');
  const seq = writeSeq;
  try {
    const data = await engagementApi.bootstrap();
    if (getStatus().source !== 'live') return;
    if (background && seq !== writeSeq) return;   // an answer since this read started is newer: keep it
    liveToday = data.today ?? null;
    live = { surveys: data.surveys, responses: data.responses, values: data.values, kudos: data.kudos, exitInterviews: data.exitInterviews, log: data.log };
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
  void loadEngagement().finally(() => { loading = false; });
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
    void loadEngagement().finally(() => { loading = false; });
  }, REFRESH_DELAY_MS);
}

/** Called by the Engagement page on mount (and when the core source / readiness changes). Idempotent. */
export const ensureEngagementLoaded = (): void => maybeLoad();
/** The page's "Try again" after a not-ready or error. */
export const reloadEngagement = (): void => maybeLoad(true);

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
  if (phase !== 'ok') return message || 'The engagement data has not loaded from the server.';
  return null;
}

/** The recognition values catalogue the server seeded; a pulse can be sent only once the data has loaded. */
export const getLiveValues = (): CompanyValue[] => getLiveEngagement().values;

export async function liveSendPulse(title: string, questions: { text: string; type: QType }[]): Promise<Result<{ survey: Survey }>> {
  const b = blocked(); if (b) return fail(b);
  try { const survey = await engagementApi.sendPulse(pulseBody(title, questions)); applySurvey(survey); return { ok: true, survey }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveCloseSurvey(surveyId: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applySurvey(await engagementApi.closeSurvey(surveyId)); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSubmitResponse(surveyId: string, teamId: string, answers: Record<string, AnswerValue | undefined>): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyResponse(await engagementApi.submitResponse(surveyId, responseBody(teamId, answers))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveGiveKudos(toId: string, valueId: string, message: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyKudos(await engagementApi.giveKudos(kudosBody(toId, valueId, message))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveCompleteExit(input: ExitBody): Promise<Result<{ interview: ExitInterview }>> {
  const b = blocked(); if (b) return fail(b);
  try { const interview = await engagementApi.completeExit(exitBody(input)); applyExit(interview); return { ok: true, interview }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveOpenExit(employeeId?: string): Promise<void> {
  if (blocked()) return;
  try { const entry = await engagementApi.openExit(openExitBody(employeeId)); if (entry) { const n = current(); n.log = prepend(n.log, entry); commit(n); } }
  catch { /* opening an exit record is an audit note; never block the reader on it */ }
}
