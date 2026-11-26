'use client';
// Changes to talent data: skill ratings, the succession bench and 9-box placements. Each is the local sample flow in
// sample mode and a server call in live mode (phase 12, live/talentSource.ts). They return a promise so the screens can
// await the server; sample mode resolves at once. The checks that need no server run first in both modes, with the same
// words the server uses. Reads use peopleStore.get(), which is the live talent data in live mode.

import { ACTOR, employeeName } from '../actions';
import { PREVIEW_TODAY } from '../seed';
import { isLive } from '../live/store';
import type { Id } from '../types';
import { uid } from '../types';
import { peopleStore, logRow } from './store';
import { LEVEL_LABEL, READINESS_LABEL, ratingKey, validateRating } from './talentEngine';
import {
  liveAddSuccessor, liveClearPlacement, liveLogReviewOpened, livePlaceEmployee, liveRemoveSuccessor, liveSetRating, liveSetReadiness,
} from './live/talentSource';
import type { NineLevel, Readiness, SkillLevel } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });

// ───────────────────────────── skills ─────────────────────────────
export async function setRating(employeeId: Id, skillId: Id, level: SkillLevel, note: string, assessor: string = ACTOR): Promise<ActionResult> {
  const problem = validateRating(level, note);
  if (problem) return fail(problem);
  const t = peopleStore.get().talent;
  const skill = t.skills.find((s) => s.id === skillId);
  if (!skill) return fail('Unknown skill.');
  if (isLive()) return liveSetRating(employeeId, skillId, level, note, assessor === ACTOR ? undefined : assessor);
  const before = t.ratings[ratingKey(employeeId, skillId)]?.level ?? 0;
  peopleStore.mutate((d) => {
    const key = ratingKey(employeeId, skillId);
    if (level === 0) delete d.talent.ratings[key];
    else d.talent.ratings[key] = { level, note: note.trim(), by: assessor.trim() || ACTOR, on: PREVIEW_TODAY };
    d.talent.log.unshift(logRow(ACTOR, 'Skill level changed', `${employeeName(employeeId)}: ${skill.name}, ${LEVEL_LABEL[before]} to ${LEVEL_LABEL[level]}`));
  });
  return { ok: true };
}

// ───────────────────────────── succession ─────────────────────────────
const needReason = (reason: string) => (reason.trim().length < 5 ? 'Give a short reason (at least 5 characters). It is kept in the log.' : null);

export async function addSuccessor(roleId: Id, employeeId: Id, readiness: Readiness, actions: string[], reason: string): Promise<ActionResult> {
  const r = needReason(reason); if (r) return fail(r);
  const role = peopleStore.get().talent.roles.find((x) => x.id === roleId);
  if (!role) return fail('Unknown role.');
  if (role.incumbentId === employeeId) return fail('The current holder cannot be their own successor.');
  if (role.successors.some((s) => s.employeeId === employeeId)) return fail('This person is already on the bench for this role.');
  if (isLive()) { const res = await liveAddSuccessor(roleId, employeeId, readiness, actions, reason); return res.ok ? { ok: true } : fail(res.error); }
  peopleStore.mutate((d) => {
    const x = d.talent.roles.find((y) => y.id === roleId)!;
    x.successors.push({ employeeId, readiness, actions: actions.map((a) => a.trim()).filter(Boolean), addedOn: PREVIEW_TODAY });
    x.history.unshift({ id: uid('sc'), on: PREVIEW_TODAY, by: ACTOR, kind: 'added', employeeId, to: readiness, reason: reason.trim() });
    d.talent.log.unshift(logRow(ACTOR, 'Successor added', `${employeeName(employeeId)} for ${x.title}`));
  });
  return { ok: true };
}

export async function removeSuccessor(roleId: Id, employeeId: Id, reason: string): Promise<ActionResult> {
  const r = needReason(reason); if (r) return fail(r);
  const role = peopleStore.get().talent.roles.find((x) => x.id === roleId);
  const s = role?.successors.find((y) => y.employeeId === employeeId);
  if (!role || !s) return fail('This person is not on the bench.');
  if (isLive()) return liveRemoveSuccessor(roleId, employeeId, reason);
  peopleStore.mutate((d) => {
    const x = d.talent.roles.find((y) => y.id === roleId)!;
    x.successors = x.successors.filter((y) => y.employeeId !== employeeId);
    x.history.unshift({ id: uid('sc'), on: PREVIEW_TODAY, by: ACTOR, kind: 'removed', employeeId, from: s.readiness, reason: reason.trim() });
    d.talent.log.unshift(logRow(ACTOR, 'Successor removed', `${employeeName(employeeId)} from ${x.title}`));
  });
  return { ok: true };
}

export async function setReadiness(roleId: Id, employeeId: Id, readiness: Readiness, reason: string): Promise<ActionResult> {
  const r = needReason(reason); if (r) return fail(r);
  const role = peopleStore.get().talent.roles.find((x) => x.id === roleId);
  const s = role?.successors.find((y) => y.employeeId === employeeId);
  if (!role || !s) return fail('This person is not on the bench.');
  if (s.readiness === readiness) return fail('That is already the readiness shown.');
  if (isLive()) return liveSetReadiness(roleId, employeeId, readiness, reason);
  peopleStore.mutate((d) => {
    const x = d.talent.roles.find((y) => y.id === roleId)!;
    x.successors.find((y) => y.employeeId === employeeId)!.readiness = readiness;
    x.history.unshift({ id: uid('sc'), on: PREVIEW_TODAY, by: ACTOR, kind: 'readiness', employeeId, from: s.readiness, to: readiness, reason: reason.trim() });
    d.talent.log.unshift(logRow(ACTOR, 'Readiness changed', `${employeeName(employeeId)}: ${READINESS_LABEL[s.readiness]} to ${READINESS_LABEL[readiness]}`));
  });
  return { ok: true };
}

// ───────────────────────────── 9-box ─────────────────────────────
export async function placeEmployee(employeeId: Id, performance: NineLevel, potential: NineLevel, rationale: string): Promise<ActionResult> {
  if (rationale.trim().length < 10) return fail('Write a rationale of at least 10 characters. The 9-box is a conversation, and the reason is the point.');
  if (isLive()) return livePlaceEmployee(employeeId, performance, potential, rationale);
  peopleStore.mutate((d) => {
    d.talent.placements[employeeId] = { employeeId, performance, potential, rationale: rationale.trim(), by: ACTOR, on: PREVIEW_TODAY };
    d.talent.log.unshift(logRow(ACTOR, '9-box placement saved', employeeName(employeeId)));
  });
  return { ok: true };
}

export async function clearPlacement(employeeId: Id): Promise<void> {
  if (isLive()) { await liveClearPlacement(employeeId); return; }
  peopleStore.mutate((d) => {
    if (!d.talent.placements[employeeId]) return;
    delete d.talent.placements[employeeId];
    d.talent.log.unshift(logRow(ACTOR, '9-box placement removed', employeeName(employeeId)));
  });
}

/** Opening the named view is itself recorded, like other sensitive views in the module. */
export function logReviewOpened(groupName: string): void {
  if (isLive()) { void liveLogReviewOpened(groupName); return; }
  peopleStore.mutate((d) => { d.talent.log.unshift(logRow(ACTOR, 'Talent review (names) opened', groupName)); });
}
