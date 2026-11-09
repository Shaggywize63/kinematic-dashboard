'use client';
// The control store and every change that is made to it. Pages read `controlStore.use()` (null until mounted) and change data only
// through the actions below, so the later move to API calls touches this file. Changes to the core database (a compliance task, a
// filing) go through lib/hrms/actions.ts, never around it.

import { createAreaStore } from '../areaStore';
import { ACTOR, markFiled, upsert } from '../actions';
import { reopenCompliance } from '../statutoryActions';
import { PREVIEW_TODAY } from '../seed';
import { uid } from '../types';
import type { ComplianceTask, HrmsDb, Id, ISODate } from '../types';
import { buildComplianceTask, type Impact, type RadarItem } from './radar';
import { retentionText } from './monitoring';
import { seedControl } from './seed';
import type { ControlState, MonitoringLogEntry, RadarStatus, SavedScenario, ScenarioInput } from './types';

export const controlStore = createAreaStore<ControlState>('control', 1, seedControl);

/** Date from the preview's today, time from the clock: keeps log order without showing a real-world date next to sample data. */
const stamp = (): string => `${PREVIEW_TODAY}T${new Date().toISOString().slice(11)}`;

// ───────────────────────────── simulator ─────────────────────────────
export function saveScenario(name: string, input: ScenarioInput, note?: string): SavedScenario {
  const item: SavedScenario = { id: uid('scn'), name: name.trim(), note: note?.trim() || undefined, input, savedAt: stamp(), savedBy: ACTOR };
  controlStore.mutate((d) => { d.scenarios.unshift(item); });
  return item;
}
export function renameScenario(id: Id, name: string): void {
  controlStore.mutate((d) => { const s = d.scenarios.find((x) => x.id === id); if (s && name.trim()) s.name = name.trim(); });
}
export function deleteScenario(id: Id): void {
  controlStore.mutate((d) => { d.scenarios = d.scenarios.filter((x) => x.id !== id); });
}

// ───────────────────────────── rule radar ─────────────────────────────
export function setRadarStatus(itemId: string, status: RadarStatus, note: string): void {
  controlStore.mutate((d) => {
    const prev = d.radar[itemId];
    d.radar[itemId] = { status, note: note.trim(), by: ACTOR, at: stamp(), taskId: prev?.taskId };
  });
}
export function acknowledgeRadar(itemId: string): void {
  controlStore.mutate((d) => {
    const prev = d.radar[itemId];
    d.radar[itemId] = { status: 'acknowledged', note: prev?.note ?? '', by: ACTOR, at: stamp(), taskId: prev?.taskId };
  });
}
/** Add a task to the core compliance calendar, and remember it against the radar item. */
export function createRadarTask(db: HrmsDb, item: RadarItem, impact: Impact, dueOn: ISODate): ComplianceTask {
  const task: ComplianceTask = { ...buildComplianceTask(db, item, impact, dueOn), id: uid('cmp') };
  upsert('compliance', task);
  controlStore.mutate((d) => {
    const prev = d.radar[item.id];
    d.radar[item.id] = { status: prev && prev.status !== 'new' ? prev.status : 'acknowledged', note: prev?.note ?? '', by: ACTOR, at: stamp(), taskId: task.id };
  });
  return task;
}

// ───────────────────────────── autopilot ─────────────────────────────
export function setManualCheck(taskId: Id, checkId: string, value: boolean): void {
  controlStore.mutate((d) => { d.autopilot.manual[`${taskId}|${checkId}`] = value; });
}
/** Record a filing: the core task is marked filed (reference and date), and the evidence is kept here. */
export function recordFiling(taskId: Id, reference: string, attachments: string[], note?: string): void {
  markFiled(taskId, reference.trim());
  controlStore.mutate((d) => { d.autopilot.evidence[taskId] = { by: ACTOR, at: stamp(), attachments, note: note?.trim() || undefined }; });
}
export function reopenFiling(taskId: Id): void {
  reopenCompliance(taskId);
  controlStore.mutate((d) => { delete d.autopilot.evidence[taskId]; });
}

// ───────────────────────────── monitoring ledger ─────────────────────────────
function log(d: ControlState, rowId: Id, action: string, detail?: string): void {
  const row = d.monitoring.rows.find((r) => r.id === rowId);
  const entry: MonitoringLogEntry = { id: uid('ml'), at: stamp(), by: ACTOR, rowId, rowName: row?.name ?? rowId, action, detail };
  d.monitoring.log.unshift(entry);
}
export function turnOnMonitoring(rowId: Id, input: { purpose: string; retentionDays: number; reviewer: string }): void {
  controlStore.mutate((d) => {
    const row = d.monitoring.rows.find((r) => r.id === rowId);
    if (!row || (row.status !== 'off' && row.status !== 'considering')) return; // blocked rows can never be switched on from here
    row.status = 'on';
    row.purpose = input.purpose.trim();
    row.retentionDays = input.retentionDays;
    row.reviewer = input.reviewer.trim();
    row.reviewedOn = PREVIEW_TODAY;
    log(d, rowId, 'Turned on', `Purpose: ${row.purpose} Kept for ${retentionText(row.retentionDays)}. Reviewer: ${row.reviewer}.`);
  });
}
export function turnOffMonitoring(rowId: Id): void {
  controlStore.mutate((d) => {
    const row = d.monitoring.rows.find((r) => r.id === rowId);
    if (!row || row.status !== 'on') return;
    row.status = 'off';
    row.reviewedOn = PREVIEW_TODAY;
    log(d, rowId, 'Turned off');
  });
}
export function dropConsidering(rowId: Id): void {
  controlStore.mutate((d) => {
    const row = d.monitoring.rows.find((r) => r.id === rowId);
    if (!row || row.status !== 'considering') return;
    row.status = 'off';
    row.reviewedOn = PREVIEW_TODAY;
    log(d, rowId, 'Decided not to use', 'The proposal was dropped.');
  });
}
export function shortenRetention(rowId: Id, days: number): void {
  controlStore.mutate((d) => {
    const row = d.monitoring.rows.find((r) => r.id === rowId);
    if (!row) return;
    const before = row.retentionDays;
    row.retentionDays = days;
    row.retentionReason = undefined;
    row.reviewedOn = PREVIEW_TODAY;
    log(d, rowId, 'Retention shortened', `From ${retentionText(before)} to ${retentionText(days)}.`);
  });
}
export function keepWithReason(rowId: Id, reason: string): void {
  controlStore.mutate((d) => {
    const row = d.monitoring.rows.find((r) => r.id === rowId);
    if (!row) return;
    row.retentionReason = reason.trim();
    row.reviewedOn = PREVIEW_TODAY;
    log(d, rowId, 'Longer retention justified', `${retentionText(row.retentionDays)}: ${row.retentionReason}`);
  });
}
export function markReviewed(rowId: Id): void {
  controlStore.mutate((d) => {
    const row = d.monitoring.rows.find((r) => r.id === rowId);
    if (!row) return;
    row.reviewedOn = PREVIEW_TODAY;
    log(d, rowId, 'Reviewed', 'Purpose, coverage and retention checked.');
  });
}
/** SIMULATION: records that a consent request would be sent. Nothing is sent from the preview. */
export function requestConsent(rowId: Id, employeeId: Id, employeeName: string): void {
  controlStore.mutate((d) => {
    if (d.monitoring.consentRequests.some((r) => r.rowId === rowId && r.employeeId === employeeId)) return;
    d.monitoring.consentRequests.push({ id: uid('cr'), rowId, employeeId, requestedOn: PREVIEW_TODAY });
    log(d, rowId, 'Consent request recorded (simulation)', `For ${employeeName}. Nothing was sent.`);
  });
}
