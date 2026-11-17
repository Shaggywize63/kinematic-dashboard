// The one place where the dashboard's Compensation shapes (camelCase, optional fields) meet the HRMS compensation API's
// (snake_case top-level keys, null for "nothing"; the cycle's jsonb maps — guidelines, proposals, applied, decision — pass
// through in the dashboard's camelCase shape). Mirrors the phase-6 assetsWire.ts and the phase-7 benefitsWire.ts: nothing
// else in the app knows the wire names, dates are YYYY-MM-DD, and `undefined` is "none" on the way in.
//
// Phase 8: the Compensation slice of the Rewards store moves to the server — the pay bands, the per-person performance band
// and the employee's reply to it, and the merit cycle (budget, effective date, guidelines, proposals, HR's decision and the
// increments issued from it).

import { isObj, num, str, type Row } from '../../live/wire';
import type { Id, ISODate } from '../../types';
import { DEFAULT_GUIDELINES } from '../seed';
import type { Band, CompaZone, CompState, Guidelines, MeritCycle, PerfBand, PerfNote, Proposal } from '../types';

export type { Row };

// ───────────────────────────── enum guards ─────────────────────────────
export const PERF_BANDS: readonly PerfBand[] = ['exceeds', 'meets', 'partial', 'below', 'unrated'];
const ZONES: readonly CompaZone[] = ['low', 'mid', 'high'];
const STATUSES = new Set<MeritCycle['status']>(['draft', 'submitted', 'approved', 'returned']);

const asPerfBand = (v: unknown): PerfBand | undefined => (PERF_BANDS.includes(v as PerfBand) ? (v as PerfBand) : undefined);
const asStatus = (v: unknown): MeritCycle['status'] => (STATUSES.has(v as MeritCycle['status']) ? (v as MeritCycle['status']) : 'draft');

// ───────────────────────────── bands ─────────────────────────────
export function bandFromWire(r: Row): Band {
  return {
    grade: String(r.grade ?? ''), min: num(r.min) ?? 0, mid: num(r.mid) ?? 0, max: num(r.max) ?? 0, market: num(r.market) ?? 0,
    published: r.published === true,
  };
}
/** The bands in a stable order (by grade), the order the server lists them in. */
export const sortBands = (bands: Band[]): Band[] => [...bands].sort((a, b) => a.grade.localeCompare(b.grade));

// ───────────────────────────── performance ─────────────────────────────
export function perfMapFromWire(v: unknown): Record<Id, PerfBand> {
  const out: Record<Id, PerfBand> = {};
  if (isObj(v)) for (const [id, x] of Object.entries(v)) { const b = asPerfBand(x); if (b) out[id] = b; }
  return out;
}

const perfNoteFromWire = (x: Row): PerfNote => {
  const n: PerfNote = { evidence: String(x.evidence ?? '') || 'No evidence recorded.' };
  const reply = str(x.reply); if (reply) n.reply = reply;
  return n;
};
export function perfNotesFromWire(v: unknown): Record<Id, PerfNote> {
  const out: Record<Id, PerfNote> = {};
  if (isObj(v)) for (const [id, x] of Object.entries(v)) if (isObj(x)) out[id] = perfNoteFromWire(x);
  return out;
}

/** The answer to a perf band / reply save: one person's row. */
export interface PerfResult { employeeId: Id; band?: PerfBand; note?: PerfNote }
export function perfResultFromWire(r: Row): PerfResult {
  const out: PerfResult = { employeeId: String(r.employee_id ?? '') };
  const band = asPerfBand(r.band); if (band) out.band = band;
  const evidence = str(r.evidence); const reply = str(r.reply);
  if (evidence || reply) { out.note = { evidence: evidence ?? 'No evidence recorded.' }; if (reply) out.note.reply = reply; }
  return out;
}

// ───────────────────────────── the merit cycle ─────────────────────────────
/** The guideline matrix: every perf band × zone, with the defaults filling any cell the server did not send. */
export function guidelinesFromWire(v: unknown): Guidelines {
  const g = DEFAULT_GUIDELINES();
  if (!isObj(v)) return g;
  for (const p of PERF_BANDS) {
    const row = v[p];
    if (!isObj(row)) continue;
    for (const z of ZONES) {
      const cell = row[z];
      if (!isObj(cell)) continue;
      const min = num(cell.min); const max = num(cell.max);
      if (min !== undefined && max !== undefined) g[p][z] = { min, max };
    }
  }
  return g;
}

function proposalsFromWire(v: unknown): Record<Id, Proposal> {
  const out: Record<Id, Proposal> = {};
  if (!isObj(v)) return out;
  for (const [id, x] of Object.entries(v)) {
    if (!isObj(x)) continue;
    const pct = num(x.pct);
    if (pct === undefined) continue;
    const p: Proposal = { pct, by: String(x.by ?? ''), on: str(x.on) ?? '' };
    const reason = str(x.reason); if (reason) p.reason = reason;
    out[id] = p;
  }
  return out;
}

function appliedFromWire(v: unknown): MeritCycle['applied'] {
  const out: MeritCycle['applied'] = {};
  if (!isObj(v)) return out;
  for (const [id, x] of Object.entries(v)) {
    if (!isObj(x)) continue;
    out[id] = { on: str(x.on) ?? '', from: num(x.from) ?? 0, to: num(x.to) ?? 0, letterId: String(x.letterId ?? x.letter_id ?? ''), by: String(x.by ?? '') };
  }
  return out;
}

export function cycleFromWire(r: Row): MeritCycle {
  const c: MeritCycle = {
    id: str(r.id) ?? '', name: str(r.name) ?? 'Merit cycle', effectiveOn: str(r.effective_on) ?? '', budgetPct: num(r.budget_pct) ?? 0,
    status: asStatus(r.status), guidelines: guidelinesFromWire(r.guidelines), proposals: proposalsFromWire(r.proposals), applied: appliedFromWire(r.applied),
  };
  if (isObj(r.decision)) {
    const d: NonNullable<MeritCycle['decision']> = { by: String(r.decision.by ?? ''), on: str(r.decision.on) ?? '' };
    const note = str(r.decision.note); if (note) d.note = note;
    c.decision = d;
  }
  return c;
}
/** The answer to every cycle command: the whole cycle (a wrapper key is tolerated). */
export const cycleResultFromWire = (data: Row): MeritCycle => cycleFromWire(isObj(data.cycle) ? data.cycle : data);

// ───────────────────────────── bootstrap and seed ─────────────────────────────
export interface CompensationBootstrap extends CompState { serverTime?: string }
export function compensationBootstrapFromWire(data: Row): CompensationBootstrap {
  return {
    bands: sortBands((Array.isArray(data.bands) ? data.bands.filter(isObj) : []).map(bandFromWire)),
    perf: perfMapFromWire(data.perf),
    perfNotes: perfNotesFromWire(data.perf_notes),
    cycle: cycleFromWire(isObj(data.cycle) ? data.cycle : {}),
    serverTime: str(data.server_time),
  };
}

export interface SeedResult { bands: Band[]; created: number }
export const seedResultFromWire = (data: Row): SeedResult => ({
  bands: sortBands((Array.isArray(data.bands) ? data.bands.filter(isObj) : []).map(bandFromWire)), created: num(data.created) ?? 0,
});

// ───────────────────────────── to the wire ─────────────────────────────
const trimOrNull = (s: string | undefined): string | null => { const t = (s ?? '').trim(); return t || null; };

/** Body for PUT /compensation/bands/:grade. Rupees are whole numbers. */
export const bandSaveBody = (p: Pick<Band, 'min' | 'mid' | 'max' | 'market'>): Row => ({
  min: Math.round(p.min), mid: Math.round(p.mid), max: Math.round(p.max), market: Math.round(p.market),
});
export const publishBody = (published: boolean): Row => ({ published });
export const perfBody = (band: PerfBand): Row => ({ band });
export const perfReplyBody = (reply: string): Row => ({ reply: reply.trim() });

/** Body for PUT /compensation/cycle: only the fields being changed. */
export function cycleUpdateBody(p: { name?: string; effectiveOn?: ISODate; budgetPct?: number }): Row {
  const body: Row = {};
  if (p.name !== undefined) body.name = p.name.trim();
  if (p.effectiveOn !== undefined) body.effective_on = p.effectiveOn;
  if (p.budgetPct !== undefined) body.budget_pct = Math.round(p.budgetPct * 100) / 100;
  return body;
}
export const guidelineBody = (perf: PerfBand, zone: CompaZone, min: number, max: number): Row => ({ perf, zone, min, max });
/** Body for PUT /compensation/cycle/proposals/:employeeId. A null pct clears the proposal; a blank reason is sent as null. */
export const proposalBody = (pct: number | null, reason?: string): Row => ({ pct, reason: pct == null ? null : trimOrNull(reason) });
export const decideBody = (decision: 'approve' | 'return', text: string, overBudget: boolean): Row => ({ decision, note: trimOrNull(text), over_budget: overBudget });
export const appliedBody = (info: { from: number; to: number; letterId: Id }): Row => ({ from: Math.round(info.from), to: Math.round(info.to), letter_id: info.letterId });
