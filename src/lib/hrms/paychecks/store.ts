'use client';
// What people decide about pay-run checks, kept in this browser (area store 'paychecks'), plus the one action that
// touches the core database: preparing a draft run. The findings themselves are never stored; they are worked out again
// from the run every time, so they always match the payslips on screen.

import { createAreaStore } from '../areaStore';
import { getDb } from '../db';
import { createPayRun, computeRun, ACTOR } from '../actions';
import { PREVIEW_TODAY, makeSeed } from '../seed';
import type { Id, Month } from '../types';
import { draftTarget, reviewKey, runPayChecks, type StoredReview } from './engine';

export interface PayChecksState {
  version: 1;
  /** Keyed `${entityId}|${month}|${findingId}`, so a review survives the run being recomputed or recreated. */
  reviews: Record<string, StoredReview>;
  log: { at: string; by: string; action: string }[];
}

function seedState(): PayChecksState {
  const state: PayChecksState = { version: 1, reviews: {}, log: [] };
  // One finding is already reviewed, so the page shows what a reviewed finding looks like on first load.
  const db = makeSeed();
  const run = db.payRuns.find((r) => r.id === 'run_2026-10_ent_retail');
  const f = run ? runPayChecks(db, run).findings.find((x) => x.id === 'net_swing:emp_6') : undefined;
  if (run && f) {
    state.reviews[reviewKey(run.entityId, run.month, f.id)] = {
      by: 'Neha Bansal', at: '2026-10-27T11:05:00.000Z', signature: f.signature,
      note: 'The 9,500 is the Q2 sales incentive, approved by the sales head. Matches the adjustment.',
    };
    state.log.push({ at: '2026-10-27T11:05:00.000Z', by: 'Neha Bansal', action: `Reviewed ${f.id} for 2026-10` });
  }
  return state;
}

export const payChecksStore = createAreaStore<PayChecksState>('paychecks', 1, seedState);

/** The preview's "now": today's preview date with the real time of day, so audit lines sit on the same date as the sample data. */
const stamp = (): string => `${PREVIEW_TODAY}T${new Date().toISOString().slice(11)}`;

export type PayCheckAction = { ok: true } | { ok: false; error: string };

export function markReviewed(key: string, signature: string, note: string): PayCheckAction {
  const text = note.trim();
  if (text.length < 3) return { ok: false, error: 'Add a short note so the next person knows what you decided.' };
  if (text.length > 400) return { ok: false, error: 'Keep the note under 400 characters.' };
  payChecksStore.mutate((d) => {
    d.reviews[key] = { by: ACTOR, at: stamp(), note: text, signature };
    d.log.unshift({ at: stamp(), by: ACTOR, action: `Reviewed ${key.split('|').slice(1).join(' ')}` });
  });
  return { ok: true };
}

export function reopenFinding(key: string): void {
  payChecksStore.mutate((d) => {
    delete d.reviews[key];
    d.log.unshift({ at: stamp(), by: ACTOR, action: `Reopened ${key.split('|').slice(1).join(' ')}` });
  });
}

/**
 * Create the next month's draft run for the entity (or reuse the one that exists) and compute it, so the checks can
 * compare it with the last closed run. Uses the same actions as the payroll screen. A frozen or paid run is left alone.
 */
export function prepareDraft(entityId: Id): { ok: true; month: Month; runId: Id; created: boolean } | { ok: false; error: string } {
  const db = getDb();
  const target = draftTarget(db, entityId, PREVIEW_TODAY.slice(0, 7));
  if (target.existing && (target.existing.status === 'frozen' || target.existing.status === 'paid')) {
    return { ok: false, error: `The ${target.month} run is already ${target.existing.status}, so it cannot be recomputed here.` };
  }
  const created = !target.existing;
  const run = createPayRun(target.month, entityId);
  computeRun(run.id);
  payChecksStore.mutate((d) => { d.log.unshift({ at: stamp(), by: ACTOR, action: `${created ? 'Prepared' : 'Recomputed'} the ${target.month} draft for ${entityId}` }); });
  return { ok: true, month: target.month, runId: run.id, created };
}
