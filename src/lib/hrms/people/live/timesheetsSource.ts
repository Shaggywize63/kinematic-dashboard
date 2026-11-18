'use client';
// Live data source for the TIMESHEETS slice of the people area (phase 9). Sample mode never touches this file: the people
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch, read through
// live/store.ts). Learning, talent and engagement stay in the local people store.
//
// In live mode the timesheet data is loaded from GET /timesheets/bootstrap and held in memory only — never in browser
// storage. The actions become server calls:
//  - projects / limits / who tracks time are simple records: the call returns the record, which replaces the one here;
//  - a week's hours are typed cell by cell, so they are applied here at once and saved as the whole week after a short
//    pause (one PUT, not one per keystroke). Adding or removing a row saves straight away. A refused save puts the week
//    back to the server's copy and says why. Submit waits for any pending save first;
//  - submit / approve / return are commands whose answer (the week) replaces the one here.
// The first load shows the page's loading state; a reload while the data is on screen runs in the background, and never
// overwrites a newer answer or an unsaved edit.

import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { getStatus, isLiveReady, randomUuid, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { sheetId } from '../timesheetEngine';
import { timesheetsApi } from './timesheetsClient';
import { decideBody, linesBody, policyBody, projectCreateBody, projectUpdateBody, trackedBody, type ProjectInput } from './timesheetsWire';
import type { Id, ISODate } from '../../types';
import type { Project, Sheet, SheetLine, TimesheetPolicy, TimesheetState } from '../types';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ───────────────────────────── status and state ─────────────────────────────
export type TimesheetsPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface TimesheetsLiveStatus { source: Source; phase: TimesheetsPhase; message: string }

const EMPTY_TS: TimesheetState = { policy: { maxPerDay: 12, weeklyCap: 60, standardWeek: 40 }, projects: [], trackedIds: [], sheets: [], log: [] };
const SAMPLE_STATUS: TimesheetsLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let liveTs: TimesheetState | null = null;
let liveToday: ISODate | null = null;
let phase: TimesheetsPhase = 'idle';
let message = '';
let statusSnap: TimesheetsLiveStatus = SAMPLE_STATUS;
/** The last copy of each week the server confirmed, to put a week back when a save is refused. */
const serverSheets = new Map<string, Sheet>();

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refreshStatusSnapshot(): void {
  const source = getStatus().source;
  if (statusSnap.source !== source || statusSnap.phase !== phase || statusSnap.message !== message) statusSnap = { source, phase, message };
}
function setPhase(next: TimesheetsPhase, msg = ''): void { phase = next; message = msg; refreshStatusSnapshot(); emit(); }

// ───────────────────────────── reads ─────────────────────────────
export const getLiveTimesheets = (): TimesheetState => liveTs ?? EMPTY_TS;
/** The server's today (India) in live mode; null before the first load. */
export const getLiveTimesheetsToday = (): ISODate | null => liveToday;
function getStatusSnapshot(): TimesheetsLiveStatus { refreshStatusSnapshot(); return statusSnap; }

export function useLiveTimesheetsSnapshot(): TimesheetState {
  return useSyncExternalStore(subscribe, getLiveTimesheets, () => EMPTY_TS);
}
export function useLiveTimesheetsStatus(): TimesheetsLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}

// ───────────────────────────── applying answers ─────────────────────────────
let writeSeq = 0;
const current = (): TimesheetState => (liveTs ? { ...liveTs } : { ...EMPTY_TS, projects: [], trackedIds: [], sheets: [], log: [] });
function commit(next: TimesheetState): void { liveTs = next; writeSeq += 1; setPhase('ok'); }

function putSheet(s: Sheet): void {
  const next = current();
  next.sheets = next.sheets.some((x) => x.id === s.id) ? next.sheets.map((x) => (x.id === s.id ? s : x)) : [...next.sheets, s];
  commit(next);
}
function applyServerSheet(s: Sheet): void { serverSheets.set(s.id, s); putSheet(s); }
function applyProject(p: Project): void {
  if (!p.id) return;
  const next = current();
  next.projects = (next.projects.some((x) => x.id === p.id) ? next.projects.map((x) => (x.id === p.id ? p : x)) : [...next.projects, p])
    .sort((a, b) => a.name.localeCompare(b.name));
  commit(next);
}
function applyConfig(c: { policy: TimesheetPolicy; trackedIds: Id[] }): void { const next = current(); next.policy = c.policy; next.trackedIds = c.trackedIds; commit(next); }

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

async function loadTimesheets(): Promise<void> {
  const background = phase === 'ok' && liveTs !== null;
  if (!background) setPhase('loading');
  const seq = writeSeq;
  try {
    const data = await timesheetsApi.bootstrap();
    if (getStatus().source !== 'live') return;
    // an answer or an unsaved edit since this read started is newer: keep it
    if (background && (seq !== writeSeq || pendingSaves.size > 0)) return;
    serverSheets.clear();
    for (const s of data.sheets) serverSheets.set(s.id, s);
    liveToday = data.today ?? null;
    liveTs = { policy: data.policy, projects: data.projects, trackedIds: data.trackedIds, sheets: data.sheets, log: [] };
    setPhase('ok');
  } catch (e) {
    if (background) return;
    const err = asError(e);
    liveTs = null;
    setPhase(err.notReady ? 'not_ready' : 'error', err.message);
  }
}

function maybeLoad(force = false): void {
  const st = getStatus();
  if (st.source !== 'live' || st.phase !== 'ready') return;
  if (!force && (loading || loadedInputsVersion === st.inputsVersion)) return;
  loadedInputsVersion = st.inputsVersion;
  loading = true;
  void loadTimesheets().finally(() => { loading = false; });
}

/** Called by the Timesheets page on mount (and when the core source / readiness changes). Idempotent. */
export const ensureTimesheetsLoaded = (): void => maybeLoad();
/** The page's "Try again" after a not-ready or error. */
export const reloadTimesheets = (): void => maybeLoad(true);

subscribeLive(() => {
  const st = getStatus();
  if (st.source !== 'live') {
    if (liveTs !== null || phase !== 'idle') {
      liveTs = null; liveToday = null; serverSheets.clear(); loadedInputsVersion = -1;
      for (const p of pendingSaves.values()) clearTimeout(p.timer);
      pendingSaves.clear();
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
  if (phase !== 'ok') return message || 'The timesheet data has not loaded from the server.';
  return null;
}

// A week's lines: applied here at once, saved as the whole week after a pause (or straight away).
const SAVE_DELAY_MS = 600;
interface PendingSave { timer: ReturnType<typeof setTimeout>; employeeId: Id; weekStart: ISODate; done: Promise<Result>; resolve: (r: Result) => void }
const pendingSaves = new Map<string, PendingSave>();

async function saveNow(employeeId: Id, weekStart: ISODate): Promise<Result> {
  const id = sheetId(employeeId, weekStart);
  const sheet = getLiveTimesheets().sheets.find((s) => s.id === id);
  try {
    applyServerSheet(await timesheetsApi.saveLines(employeeId, weekStart, linesBody(sheet?.lines ?? [])));
    return { ok: true };
  } catch (e) {
    const err = asError(e);
    // put the week back to what the server holds (or drop a week it never had)
    const back = serverSheets.get(id);
    const next = current();
    next.sheets = back ? next.sheets.map((s) => (s.id === id ? back : s)) : next.sheets.filter((s) => s.id !== id);
    commit(next);
    return fail(err.message);
  }
}

function settleSave(id: string, r: Result): void {
  const p = pendingSaves.get(id);
  if (!p) return;
  pendingSaves.delete(id);
  p.resolve(r);
}

/** Save the week now if a save is waiting; resolves when the server has answered (ok when nothing was waiting). */
export async function flushTimesheetSave(employeeId: Id, weekStart: ISODate): Promise<Result> {
  const id = sheetId(employeeId, weekStart);
  const p = pendingSaves.get(id);
  if (!p) return { ok: true };
  clearTimeout(p.timer);
  pendingSaves.delete(id);
  const r = await saveNow(employeeId, weekStart);
  p.resolve(r);
  return r;
}

/**
 * Set a week's lines in live mode. They show at once; the save follows after a short pause (`immediate` saves now, for
 * adding / removing a row). A refused save puts the week back and shows the server's reason.
 */
export function liveSetLines(employeeId: Id, weekStart: ISODate, lines: SheetLine[], immediate = false): Promise<Result> {
  const b = blocked(); if (b) return Promise.resolve(fail(b));
  const id = sheetId(employeeId, weekStart);
  const existing = getLiveTimesheets().sheets.find((s) => s.id === id);
  putSheet(existing ? { ...existing, lines } : { id, employeeId, weekStart, lines, status: 'draft', trail: [] });

  const prev = pendingSaves.get(id);
  if (prev) clearTimeout(prev.timer);
  let resolve!: (r: Result) => void;
  const done = prev?.done ?? new Promise<Result>((r) => { resolve = r; });
  const entry: PendingSave = {
    employeeId, weekStart, done, resolve: prev?.resolve ?? resolve,
    timer: setTimeout(() => {
      void saveNow(employeeId, weekStart).then((r) => { if (!r.ok && !immediate) toast.error(r.error); settleSave(id, r); });
    }, immediate ? 0 : SAVE_DELAY_MS),
  };
  pendingSaves.set(id, entry);
  return immediate ? done : Promise.resolve({ ok: true });
}

export async function liveSubmitSheet(employeeId: Id, weekStart: ISODate): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  const saved = await flushTimesheetSave(employeeId, weekStart);
  if (!saved.ok) return saved;
  try { applyServerSheet(await timesheetsApi.submit(employeeId, weekStart)); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveDecideSheet(employeeId: Id, weekStart: ISODate, decision: 'approved' | 'returned', comment: string): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyServerSheet(await timesheetsApi.decide(employeeId, weekStart, decideBody(decision, comment))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSetPolicy(policy: TimesheetPolicy): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyConfig(await timesheetsApi.setPolicy(policyBody(policy))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveSetTracked(ids: Id[]): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyConfig(await timesheetsApi.setTracked(trackedBody(ids))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveCreateProject(input: ProjectInput): Promise<Result<{ id: Id }>> {
  const b = blocked(); if (b) return fail(b);
  try { const p = await timesheetsApi.createProject(projectCreateBody(input, randomUuid())); applyProject(p); return { ok: true, id: p.id }; }
  catch (e) { return fail(asError(e).message); }
}

export async function liveUpdateProject(id: Id, input: ProjectInput): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try { applyProject(await timesheetsApi.updateProject(id, projectUpdateBody(input))); return { ok: true }; }
  catch (e) { return fail(asError(e).message); }
}
