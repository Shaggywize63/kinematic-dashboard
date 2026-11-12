'use client';
// Actions for the Statutory, Reports and Privacy pages. Kept out of actions.ts on purpose (that file belongs to the
// shared layer). Everything goes through mutate() so subscribers re-render and the change is persisted.

import { getDb, mutate, newId } from './db';
import { markFiled, remove, upsert } from './actions';
import { PREVIEW_TODAY, makeSeed } from './seed';
import { uid } from './types';
import type { ComplianceTask, ConsentRecord, Id, ISODate, RetentionRule } from './types';

/**
 * Mark a compliance task as filed. markFiled() in actions.ts stamps the real clock, which would put "filed on" in
 * the real today instead of the preview's today, so the filing date is set explicitly afterwards.
 */
export function fileCompliance(id: Id, reference: string, filedOn: ISODate = PREVIEW_TODAY): void {
  markFiled(id, reference);
  mutate((db) => {
    const t = db.compliance.find((x) => x.id === id);
    if (t) t.filedOn = filedOn;
  });
}

/** Undo a filing recorded by mistake. The calendar derives the real status from the due date again. */
export function reopenCompliance(id: Id): void {
  mutate((db) => {
    const t = db.compliance.find((x) => x.id === id);
    if (!t) return;
    t.status = 'upcoming';
    t.filedOn = undefined;
    t.reference = undefined;
  });
}

/** Add a due date (from the suggested list) to the calendar. */
export function addComplianceTask(task: Omit<ComplianceTask, 'id' | 'status'>): ComplianceTask {
  const item: ComplianceTask = { ...task, id: uid('cmp'), status: 'upcoming' };
  upsert('compliance', item);
  return item;
}

/** Withdraw a consent. The record stays in the ledger with a withdrawn date: the ledger is evidence, not a setting. */
export function withdrawConsent(id: Id): void {
  mutate((db) => {
    const c = db.consents.find((x) => x.id === id);
    if (!c || c.withdrawnAt) return;
    c.withdrawnAt = `${PREVIEW_TODAY}T${new Date().toISOString().slice(11)}`;
  });
}

export function updateRetentionRule(id: Id, patch: Pick<RetentionRule, 'keepYears' | 'action'>): void {
  mutate((db) => {
    const r = db.retention.find((x) => x.id === id);
    if (!r) return;
    r.keepYears = patch.keepYears;
    r.action = patch.action;
  });
}

/** Record a new consent on the ledger. The grant time uses the preview's today with the real clock's time, like withdrawConsent. */
export function addConsent(input: Pick<ConsentRecord, 'employeeId' | 'purpose' | 'noticeVersion'>): ConsentRecord {
  // newId() gives a UUID in live mode (the server only accepts those) and the usual short id in sample mode.
  const item: ConsentRecord = { ...input, id: newId('cs'), grantedAt: `${PREVIEW_TODAY}T${new Date().toISOString().slice(11)}` };
  upsert('consents', item);
  return item;
}

/** Add a retention rule. keepYears and action come validated from the form; the dataset and basis describe it. */
export function addRetentionRule(input: Pick<RetentionRule, 'dataset' | 'keepYears' | 'basis' | 'action'>): RetentionRule {
  const item: RetentionRule = { ...input, id: newId('rt') };
  upsert('retention', item);
  return item;
}

/** Remove a retention rule. (Retention rules are policy records; nothing is deleted on their basis.) */
export function removeRetentionRule(id: Id): void {
  remove('retention', id);
}

export type StandardSetResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * The sample company's retention rules, added as new rows with fresh ids. A new organisation (live mode) starts with none;
 * this is an editable start, mirroring lifecycle's "Add the standard letter templates" and time's "Add the standard set".
 */
export function addStandardRetentionRules(): StandardSetResult {
  const db = getDb();
  if (db.retention.length) return { ok: false, error: 'The standard retention rules are already there.' };
  const toAdd: RetentionRule[] = makeSeed().retention.map((r) => ({ ...r, id: newId('rt') }));
  mutate((d) => { for (const r of toAdd) d.retention.push(r); });
  return { ok: true, count: toAdd.length };
}

/**
 * The sample company's compliance calendar, re-pointed at this organisation's own legal entities (the sample keys its tasks
 * to sample entities; they are mapped onto the org's entities in order). New rows with fresh ids. ComplianceTask.status is
 * derived, so only the stored fields (due date, filed-on, reference) travel to the server.
 */
export function addStandardComplianceCalendar(): StandardSetResult {
  const db = getDb();
  if (!db.entities.length) return { ok: false, error: 'Add a legal entity before building the compliance calendar.' };
  if (db.compliance.length) return { ok: false, error: 'The compliance calendar already has tasks.' };
  const seedTasks = makeSeed().compliance;
  const seedEntities = [...new Set(seedTasks.map((t) => t.entityId))];
  const map = new Map<string, string>();
  seedEntities.forEach((sid, i) => map.set(sid, db.entities[Math.min(i, db.entities.length - 1)]!.id));
  const toAdd: ComplianceTask[] = seedTasks.map((t) => ({ ...t, id: newId('cmp'), entityId: map.get(t.entityId) ?? db.entities[0]!.id }));
  mutate((d) => { for (const t of toAdd) d.compliance.push(t); });
  return { ok: true, count: toAdd.length };
}
