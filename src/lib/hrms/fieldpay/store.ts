'use client';
// The few things the field-pay screens remember on their own: outlets handed to another person, and rest-day notes.
// Disputes, holds and run approvals live in the shared field store (lib/hrms/field/store.ts); the evidence is read-only.
// Pages read `fieldPayStore.use()` and change it only through the actions below.

import { createAreaStore } from '../areaStore';
import { ACTOR } from '../actions';
import { PREVIEW_TODAY } from '../seed';
import { uid } from '../types';
import type { Id, ISODate } from '../types';
import { getFieldEvidence } from '../field/evidence';
import type { FieldPayState } from './types';

export const fieldPayStore = createAreaStore<FieldPayState>('fieldpay', 1, () => ({ version: 1, moves: {}, restNotes: [], log: [] }));

const nowISO = () => new Date().toISOString();
const addLog = (d: FieldPayState, action: string) => { d.log.unshift({ at: nowISO(), by: ACTOR, action }); };

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Hand an outlet to another person. Handing it back to its original owner removes the reassignment. */
export function reassignOutlet(outletId: Id, toRepId: Id): ActionResult {
  const ev = getFieldEvidence();
  const outlet = ev.outlets.find((o) => o.id === outletId);
  if (!outlet) return { ok: false, error: 'That outlet does not exist.' };
  if (!ev.reps.some((r) => r.employeeId === toRepId)) return { ok: false, error: 'Choose someone from the field team.' };
  const current = fieldPayStore.get().moves[outletId]?.toRepId ?? outlet.repId;
  if (current === toRepId) return { ok: false, error: 'The outlet already belongs to that person.' };
  fieldPayStore.mutate((d) => {
    if (toRepId === outlet.repId) delete d.moves[outletId];
    else d.moves[outletId] = { toRepId, fromRepId: outlet.repId, at: nowISO(), by: ACTOR };
    addLog(d, `Outlet ${outlet.name} moved to ${toRepId}`);
  });
  return { ok: true };
}

export function undoReassignment(outletId: Id): void {
  fieldPayStore.mutate((d) => { if (d.moves[outletId]) { delete d.moves[outletId]; addLog(d, `Outlet move undone: ${outletId}`); } });
}

/** Record that a rest day should be given after a long run of working days. A note only: it does not change any roster. */
export function scheduleRestDay(x: { employeeId: Id; date: ISODate; streakFrom: ISODate; streakTo: ISODate; note: string }): ActionResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return { ok: false, error: 'Choose a date.' };
  if (x.date <= PREVIEW_TODAY) return { ok: false, error: 'Choose a date after today.' };
  if (fieldPayStore.get().restNotes.some((n) => n.employeeId === x.employeeId && n.date === x.date)) return { ok: false, error: 'A note for that day already exists.' };
  fieldPayStore.mutate((d) => {
    d.restNotes.unshift({ id: uid('rest'), employeeId: x.employeeId, date: x.date, streakFrom: x.streakFrom, streakTo: x.streakTo, note: x.note.trim(), at: nowISO(), by: ACTOR });
    addLog(d, `Rest day noted for ${x.employeeId} on ${x.date}`);
  });
  return { ok: true };
}

export function cancelRestNote(id: Id): void {
  fieldPayStore.mutate((d) => { d.restNotes = d.restNotes.filter((n) => n.id !== id); addLog(d, `Rest-day note removed: ${id}`); });
}
