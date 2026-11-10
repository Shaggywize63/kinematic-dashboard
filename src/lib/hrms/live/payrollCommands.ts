'use client';
// Payroll commands for live data. A command is a call to the server that does something the browser must not decide for
// itself: create a pay run, compute it, freeze it, unfreeze it, mark it paid, approve or pay a settlement, build the bank file.
// Each one first lets any queued edits reach the server (so it acts on what the person just typed), then asks, and then the
// server's answer replaces the run (or settlement) held here. When the server refuses, the result carries its plain reason
// and nothing changes locally.
//
// Nothing here computes a payslip. Nothing here writes to browser storage: runs, payslips and bank files live in memory only.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FnfCase, HrmsDb, Id, Month, PayRun } from '../types';
import { buildEcr, computeFnf, preRunChecks, type FnfResult, type PreRunCheck } from '../engine';
import { HrmsApiError, hrmsApi, type RunCommand } from './client';
import { getLiveDb, getStatus, noteRunChanged, patchLive, settle, useLiveStatus } from './store';
import type { BankFileData, EcrData } from './payrollWire';

export type CommandResult = { ok: true } | { ok: false; error: string };
const OK: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });
const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));

/** Commands run one after another, so a second click cannot start a freeze while a compute is still on its way. */
let commandTail: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = commandTail.then(fn, fn);
  commandTail = run.catch(() => undefined);
  return run;
}

/** Why a command cannot even be sent, or null when it can. */
function notReady(): string | null {
  const st = getStatus();
  if (st.phase !== 'ready') return 'The HRMS data has not loaded from the server.';
  if (st.payrollPhase !== 'ok') return `Payroll has not loaded from the server.${st.payrollMessage ? ` ${st.payrollMessage}.` : ''}`;
  return null;
}

// ───────────────────────────── pay runs ─────────────────────────────
function applyRun(run: PayRun, command: RunCommand | 'create', before?: PayRun): void {
  noteRunChanged();
  patchLive((db) => {
    const i = db.payRuns.findIndex((r) => r.id === run.id);
    if (i >= 0) db.payRuns[i] = run; else db.payRuns.push(run);
    // A freeze locks attendance and recovers loan EMIs on the server; the answer says exactly which. Show the same here, so the
    // inputs screens are right without another load. An unfreeze gives back what the frozen run had recorded.
    if (command === 'freeze') {
      for (const empId of run.attendanceLockedFor ?? []) {
        const a = db.attendance.find((x) => x.employeeId === empId && x.month === run.month);
        if (a) a.locked = true;
      }
      for (const [loanId, amount] of Object.entries(run.loanRecoveries ?? {})) {
        const l = db.loans.find((x) => x.id === loanId);
        if (l) l.recovered = Math.min(l.principal, l.recovered + amount);
      }
    }
    if (command === 'unfreeze' && before) {
      for (const empId of before.attendanceLockedFor ?? []) {
        const a = db.attendance.find((x) => x.employeeId === empId && x.month === run.month);
        if (a) a.locked = false;
      }
      for (const [loanId, amount] of Object.entries(before.loanRecoveries ?? {})) {
        const l = db.loans.find((x) => x.id === loanId);
        if (l) l.recovered = Math.max(0, l.recovered - amount);
      }
    }
  });
}

async function runCommand(runId: Id, command: RunCommand, body?: Record<string, unknown>): Promise<CommandResult> {
  const blocked = notReady();
  if (blocked) return fail(blocked);
  return serial(async () => {
    try {
      await settle();
      const before = getLiveDb().payRuns.find((r) => r.id === runId);
      const run = await hrmsApi.payroll.runCommand(runId, command, body);
      applyRun(run, command, before);
      return OK;
    } catch (e) { return fail(asError(e).message); }
  });
}

/** Start the run for a month and legal entity, or open the one that exists (the server answers the same either way). Throws with the server's reason. */
export async function liveCreateRun(month: Month, entityId: Id, type: PayRun['type'] = 'regular'): Promise<PayRun> {
  const blocked = notReady();
  if (blocked) throw new Error(blocked);
  return serial(async () => {
    try {
      await settle();
      let run = await hrmsApi.payroll.createRun({ entity_id: entityId, month, type });
      // An existing run that has been computed might come back without its payslips; fetch them so the screens do not show an empty run.
      if (run.status !== 'draft' && run.payslips.length === 0) run = await hrmsApi.payroll.run(run.id);
      applyRun(run, 'create');
      return run;
    } catch (e) { throw asError(e); }
  });
}

export const liveComputeRun = (runId: Id): Promise<CommandResult> => runCommand(runId, 'compute');
export const liveFreezeRun = (runId: Id): Promise<CommandResult> => runCommand(runId, 'freeze');
export const liveMarkRunPaid = (runId: Id): Promise<CommandResult> => runCommand(runId, 'mark-paid');
export const liveUnfreezeRun = (runId: Id, reason: string): Promise<CommandResult> => runCommand(runId, 'unfreeze', { reason: reason.trim() });

/** A run opened from a link that is not in the recent months the load brought in: fetch that one run. */
const runLookups = new Map<string, Promise<boolean>>();
export function ensureRunLoaded(runId: Id): Promise<boolean> {
  if (getLiveDb().payRuns.some((r) => r.id === runId)) return Promise.resolve(true);
  if (notReady()) return Promise.resolve(false);
  // One lookup per run at a time (a page that mounts twice, as in development, asks once).
  const pending = runLookups.get(runId);
  if (pending) return pending;
  const lookup = (async () => {
    try {
      const run = await hrmsApi.payroll.run(runId);
      patchLive((db) => { if (!db.payRuns.some((r) => r.id === run.id)) db.payRuns.push(run); });
      return true;
    } catch { return false; } finally { runLookups.delete(runId); }
  })();
  runLookups.set(runId, lookup);
  return lookup;
}

// ───────────────────────────── full and final ─────────────────────────────
export function liveFnfCommand(id: Id, command: 'approve' | 'mark-paid'): Promise<CommandResult> {
  const blocked = notReady();
  if (blocked) return Promise.resolve(fail(blocked));
  return serial(async () => {
    try {
      await settle();
      const c = await hrmsApi.payroll.fnfCommand(id, command);
      patchLive((db) => {
        const i = db.fnfCases.findIndex((x) => x.id === id);
        if (i >= 0) db.fnfCases[i] = c; else db.fnfCases.push(c);
      });
      return OK;
    } catch (e) { return fail(asError(e).message); }
  });
}

// ───────────────────────────── files ─────────────────────────────
/**
 * The bank file with full account numbers, built on the server. The server records each call in its access log, so this is
 * called when the file is wanted (the download button), never to draw a screen. The numbers are returned to the caller only.
 */
export async function liveBankFile(runId: Id): Promise<BankFileData> {
  const blocked = notReady();
  if (blocked) throw new Error(blocked);
  try { return await hrmsApi.payroll.bankFile(runId); } catch (e) { throw asError(e); }
}

/** One bank file out of several runs (Reports, bank advice): the rows of every run, one header, every skipped person. */
export async function liveBankFiles(runIds: Id[]): Promise<BankFileData> {
  const files: BankFileData[] = [];
  for (const id of runIds) files.push(await liveBankFile(id));
  return { header: files[0]?.header ?? [], rows: files.flatMap((f) => f.rows), skipped: files.flatMap((f) => f.skipped) };
}

// ───────────────────────────── hooks the pay run screens use ─────────────────────────────
export interface ChecksState { checks: PreRunCheck[] | null; loading: boolean; error: string | null; reload: () => void }

/**
 * The pre-run checks of a run. Sample: worked out in the browser from the sample data, as always. Live: the server's
 * GET /runs/:id/checks, so what is shown is what compute will act on; asked again whenever saved inputs change.
 */
export function usePreRunChecks(db: HrmsDb, run: PayRun): ChecksState {
  const st = useLiveStatus();
  const live = st.source === 'live';
  const [nonce, setNonce] = useState(0);
  const [got, setGot] = useState<{ key: string; checks: PreRunCheck[] | null; error: string | null }>({ key: '', checks: null, error: null });
  const key = `${run.id}:${st.inputsVersion}:${nonce}`;
  const local = useMemo(() => (live ? null : preRunChecks(db, run.month, run.entityId)), [live, db, run.month, run.entityId]);

  useEffect(() => {
    if (!live) return undefined;
    let cancelled = false;
    void (async () => {
      await settle();
      try {
        const checks = await hrmsApi.payroll.checks(run.id);
        if (!cancelled) setGot({ key, checks, error: null });
      } catch (e) { if (!cancelled) setGot({ key, checks: null, error: asError(e).message }); }
    })();
    return () => { cancelled = true; };
  }, [live, key, run.id]);

  if (!live) return { checks: local, loading: false, error: null, reload: () => undefined };
  const fresh = got.key === key;
  return { checks: got.checks, loading: !fresh, error: fresh ? got.error : null, reload: () => setNonce((n) => n + 1) };
}

export interface EcrState { ecr: (EcrData | ReturnType<typeof buildEcr>) | null; loading: boolean; error: string | null }

/** The EPFO ECR of a frozen or paid run. Sample: built in the browser. Live: the server's GET /runs/:id/ecr. `enabled` is false until the run is frozen. */
export function useRunEcr(db: HrmsDb, run: PayRun, enabled: boolean): EcrState {
  const st = useLiveStatus();
  const live = st.source === 'live';
  const local = useMemo(() => (!live && enabled ? buildEcr(db, run) : null), [live, enabled, db, run]);
  const [got, setGot] = useState<{ key: string; ecr: EcrData | null; error: string | null }>({ key: '', ecr: null, error: null });
  const key = `${run.id}:${run.status}:${run.frozenAt ?? ''}:${st.inputsVersion}`;
  useEffect(() => {
    if (!live || !enabled) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const ecr = await hrmsApi.payroll.ecr(run.id);
        if (!cancelled) setGot({ key, ecr, error: null });
      } catch (e) { if (!cancelled) setGot({ key, ecr: null, error: asError(e).message }); }
    })();
    return () => { cancelled = true; };
  }, [live, enabled, key, run.id]);
  if (!live) return { ecr: local, loading: false, error: null };
  if (!enabled) return { ecr: null, loading: false, error: null };
  const fresh = got.key === key;
  return { ecr: fresh ? got.ecr : null, loading: !fresh, error: fresh ? got.error : null };
}

const fnfSignature = (c: FnfCase): string =>
  [c.id, c.employeeId, c.lastWorkingDate, c.resignationDate ?? '', c.noticeDaysServed, c.leaveEncashDays, c.otherRecoveries, c.otherPayments, c.status].join('|');

/**
 * Settlement sheets. Sample: computed in the browser. Live: the server's GET /fnf/:id/compute for each saved case, asked after
 * queued edits have been saved. `undefined` means the answer has not arrived yet; `null` means the settlement cannot be computed.
 */
export function useFnfResults(db: HrmsDb, cases: FnfCase[]): Map<string, FnfResult | null | undefined> {
  const st = useLiveStatus();
  const live = st.source === 'live';
  const keys = cases.map((c) => `${fnfSignature(c)}|${st.inputsVersion}`);
  const joined = keys.join('~');
  const cache = useRef(new Map<string, FnfResult | null>());
  const [, tick] = useState(0);

  const local = useMemo(
    () => (live ? null : new Map<string, FnfResult | null | undefined>(cases.map((c) => [c.id, computeFnf(db, c)]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, db, joined],
  );

  useEffect(() => {
    if (!live) return undefined;
    let cancelled = false;
    void (async () => {
      await settle();
      for (let i = 0; i < cases.length; i++) {
        const k = keys[i]!;
        if (cache.current.has(k)) continue;
        let r: FnfResult | null = null;
        try { r = await hrmsApi.payroll.fnfCompute(cases[i]!.id); } catch { r = null; }
        cache.current.set(k, r);
        if (!cancelled) tick((n) => n + 1);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, joined]);

  if (!live) return local!;
  return new Map<string, FnfResult | null | undefined>(cases.map((c, i) => [c.id, cache.current.get(keys[i]!)]));
}
