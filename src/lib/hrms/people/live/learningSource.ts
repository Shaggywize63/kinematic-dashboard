'use client';
// Live data source for the LEARNING slice of the people area (phase 10). Sample mode never touches this file: the people
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch, read through
// live/store.ts). Talent and engagement stay in the local people store.
//
// In live mode the learning data is loaded from GET /learning/bootstrap and held in memory only, never in browser
// storage. Every action is a server call whose answer (the course, the new assignments, the marked quiz and its
// certificate, the reminder) is applied here. The server also writes the activity log, so after a change the data is
// re-read in the background to pick it up. The first load shows the page's loading state; a reload while the data is on
// screen runs in the background and never overwrites a newer answer.

import { useSyncExternalStore } from 'react';
import { getStatus, isLiveReady, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { learningApi } from './learningClient';
import { assignBody, lessonBody, quizBody, rulesBody } from './learningWire';
import type { ISODate } from '../../types';
import type { Assignment, Audience, Certificate, Course, LearningState, ReminderEntry } from '../types';
import type { QuizResult } from '../learningEngine';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ───────────────────────────── status and state ─────────────────────────────
export type LearningPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface LearningLiveStatus { source: Source; phase: LearningPhase; message: string }

const EMPTY: LearningState = { courses: [], assignments: [], certificates: [], reminders: [], certSeq: 0, log: [] };
const SAMPLE_STATUS: LearningLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let live: LearningState | null = null;
let liveToday: ISODate | null = null;
let phase: LearningPhase = 'idle';
let message = '';
let statusSnap: LearningLiveStatus = SAMPLE_STATUS;

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refreshStatusSnapshot(): void {
  const source = getStatus().source;
  if (statusSnap.source !== source || statusSnap.phase !== phase || statusSnap.message !== message) statusSnap = { source, phase, message };
}
function setPhase(next: LearningPhase, msg = ''): void { phase = next; message = msg; refreshStatusSnapshot(); emit(); }

// ───────────────────────────── reads ─────────────────────────────
export const getLiveLearning = (): LearningState => live ?? EMPTY;
/** The server's today (India) in live mode; null before the first load. */
export const getLiveLearningToday = (): ISODate | null => liveToday;
function getStatusSnapshot(): LearningLiveStatus { refreshStatusSnapshot(); return statusSnap; }

export function useLiveLearningSnapshot(): LearningState {
  return useSyncExternalStore(subscribe, getLiveLearning, () => EMPTY);
}
export function useLiveLearningStatus(): LearningLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}

// ───────────────────────────── applying answers ─────────────────────────────
let writeSeq = 0;
const current = (): LearningState => (live ? { ...live } : { ...EMPTY, courses: [], assignments: [], certificates: [], reminders: [], log: [] });
function commit(next: LearningState): void { live = next; writeSeq += 1; setPhase('ok'); scheduleRefresh(); }

const upsert = <T extends { id: string }>(list: T[], items: T[]): T[] => {
  const byId = new Map(items.map((x) => [x.id, x]));
  const kept = list.map((x) => byId.get(x.id) ?? x);
  const known = new Set(list.map((x) => x.id));
  return [...kept, ...items.filter((x) => !known.has(x.id))];
};
function applyCourses(courses: Course[], replaceAll = false): void { const n = current(); n.courses = replaceAll ? courses : upsert(n.courses, courses); commit(n); }
function applyAssignments(rows: Assignment[]): void { if (!rows.length) return; const n = current(); n.assignments = upsert(n.assignments, rows); commit(n); }
function applyCertificate(c: Certificate): void { const n = current(); n.certificates = upsert(n.certificates, [c]); commit(n); }
function applyReminder(r: ReminderEntry): void { const n = current(); n.reminders = [r, ...n.reminders.filter((x) => x.id !== r.id)]; commit(n); }

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

async function loadLearning(): Promise<void> {
  const background = phase === 'ok' && live !== null;
  if (!background) setPhase('loading');
  const seq = writeSeq;
  try {
    const data = await learningApi.bootstrap();
    if (getStatus().source !== 'live') return;
    if (background && seq !== writeSeq) return;   // an answer since this read started is newer: keep it
    liveToday = data.today ?? null;
    live = { courses: data.courses, assignments: data.assignments, certificates: data.certificates, reminders: data.reminders, certSeq: data.certificates.length, log: data.log };
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
  void loadLearning().finally(() => { loading = false; });
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
    void loadLearning().finally(() => { loading = false; });
  }, REFRESH_DELAY_MS);
}

/** Called by the Learning page on mount (and when the core source / readiness changes). Idempotent. */
export const ensureLearningLoaded = (): void => maybeLoad();
/** The page's "Try again" after a not-ready or error. */
export const reloadLearning = (): void => maybeLoad(true);

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
  if (phase !== 'ok') return message || 'The learning data has not loaded from the server.';
  return null;
}

export async function liveLoadLibrary(): Promise<Result<{ added: number }>> {
  const b = blocked(); if (b) return fail(b);
  try { const r = await learningApi.loadLibrary(); applyCourses(r.courses, true); return { ok: true, added: r.added }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSetRules(courseId: string, patch: { mandatory: boolean; audience: Audience; refresherMonths: number }): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyCourses([await learningApi.setRules(courseId, rulesBody(patch))]); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveAssign(courseId: string, employeeIds: string[], dueOn?: ISODate): Promise<Result<{ created: number; skipped: number }>> {
  const b = blocked(); if (b) return fail(b);
  try { const r = await learningApi.assign(courseId, assignBody(employeeIds, dueOn)); applyAssignments(r.assignments); return { ok: true, created: r.created, skipped: r.skipped }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveApplyRules(): Promise<Result<{ created: number }>> {
  const b = blocked(); if (b) return fail(b);
  try { const r = await learningApi.applyRules(); applyAssignments(r.assignments); return { ok: true, created: r.created }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveCompleteLesson(assignmentId: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  const a = getLiveLearning().assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('That assignment is not on record.');
  try { applyAssignments([await learningApi.lesson(assignmentId, lessonBody(a.stepsDone))]); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSubmitQuiz(assignmentId: string, answers: (number | undefined)[]): Promise<Result<{ result: QuizResult; certificateId?: string }>> {
  const b = blocked(); if (b) return fail(b);
  try {
    const r = await learningApi.quiz(assignmentId, quizBody(answers));
    if (r.certificate) applyCertificate(r.certificate);
    applyAssignments([r.assignment]);
    return { ok: true, result: r.result, ...(r.certificate ? { certificateId: r.certificate.id } : {}) };
  } catch (e) { return fail(asError(e).message); }
}

export async function liveRemind(assignmentId: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyReminder(await learningApi.remind(assignmentId)); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveRefresher(certificateNumber: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyAssignments([await learningApi.refresher(certificateNumber)]); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}
